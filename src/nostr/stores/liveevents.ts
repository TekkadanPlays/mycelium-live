// NIP-53 Live Events Store — auto-publishes/updates live activity events
// Migrated to Preact Signals
import { signal, effect } from '@preact/signals-core';
import type { NostrEvent } from '../event';
import { createLiveEvent, publishLiveEvent, updateLiveEvent } from '../nip53';
import { authPubkey } from './auth';
import { bootstrapState } from './bootstrap';
import { getSelectedBroadcastUrls } from './broadcast';
import { startLiveChatSubscription, stopLiveChatSubscription } from './livechat';
import { broadcastConfig } from '../../stores/broadcastconfig';

export interface LiveEventState {
  currentEvent: NostrEvent | null;
  isPublishing: boolean;
  lastPublished: string | null;
  error: string | null;
  enabled: boolean;
}

// ─── Signal ───

export const liveEventState = signal<LiveEventState>({
  currentEvent: null,
  isPublishing: false,
  lastPublished: null,
  error: null,
  enabled: false,
});

let updateInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveOfflineChecks = 0;

const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const REPUBLISH_INTERVAL_MS = 45 * 60 * 1000;
const OFFLINE_THRESHOLD = 2;
let lastRepublishAt = 0;

// ─── Internal ───

async function checkStreamLive(): Promise<boolean> {
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json() as { online?: boolean };
    return !!data.online;
  } catch { return false; }
}

// ─── Actions ───

export function getLiveEventState(): LiveEventState {
  return liveEventState.value;
}

export function setLiveEventsEnabled(enabled: boolean) {
  liveEventState.value = { ...liveEventState.value, enabled };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mycelium_live_events_enabled', enabled ? '1' : '0');
  }
}

export function loadLiveEventsEnabled() {
  if (typeof localStorage === 'undefined') return;
  const saved = localStorage.getItem('mycelium_live_events_enabled');
  if (saved !== null) {
    liveEventState.value = { ...liveEventState.value, enabled: saved === '1' };
  }
}

function getPublishRelays(): string[] {
  const bs = bootstrapState.value;
  const allOutbox = bs.relayList.filter((r) => r.write).map((r) => r.url);
  const broadcast = getSelectedBroadcastUrls();

  let outbox = allOutbox;
  try {
    const raw = localStorage.getItem('mycelium_live_outbox_relays_selected');
    if (raw) {
      const selected = new Set(JSON.parse(raw) as string[]);
      if (selected.size > 0) outbox = allOutbox.filter((url) => selected.has(url));
    }
  } catch {}

  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of [...outbox, ...broadcast]) {
    const normalized = url.replace(/\/+$/, '');
    if (!seen.has(normalized)) { seen.add(normalized); result.push(normalized); }
  }

  if (result.length > 0) return result;
  return ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
}

export async function onStreamStart(streamTitle: string, viewerCount: number): Promise<void> {
  const pubkey = authPubkey.value;
  if (!pubkey) return;

  const streamIsLive = await checkStreamLive();
  if (!streamIsLive) {
    liveEventState.value = { ...liveEventState.value, isPublishing: false, error: 'Stream is not live on OME — start streaming first' };
    return;
  }

  liveEventState.value = { ...liveEventState.value, isPublishing: true, error: null };

  try {
    const relays = getPublishRelays();
    const config = broadcastConfig.value;
    const streamingUrl = config.streamingUrl || `${window.location.origin}/app/stream/llhls.m3u8`;
    const event = await createLiveEvent(pubkey, {
      identifier: `mycelium-live-${Date.now()}`,
      title: config.title || streamTitle || 'Live Stream',
      summary: config.summary || undefined,
      image: config.image || undefined,
      status: 'live',
      streamingUrl,
      starts: Math.floor(Date.now() / 1000),
      currentParticipants: viewerCount,
      tags: config.tags.length > 0 ? config.tags : undefined,
      participants: [{ pubkey, role: 'Host' }],
      relays,
    });

    if (event) {
      const { published } = await publishLiveEvent(event, relays);
      if (published) {
        console.log('[liveevents] Published live event:', event.id);
        liveEventState.value = {
          ...liveEventState.value,
          currentEvent: event,
          isPublishing: false,
          lastPublished: new Date().toISOString(),
        };

        const dTag = event.tags.find((t) => t[0] === 'd')?.[1] || '';
        const eventATag = `30311:${pubkey}:${dTag}`;
        startLiveChatSubscription(eventATag, relays);

        lastRepublishAt = Date.now();
        consecutiveOfflineChecks = 0;
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => periodicRepublish(), CHECK_INTERVAL_MS);
      } else {
        liveEventState.value = { ...liveEventState.value, isPublishing: false, error: 'Failed to publish to any relay' };
      }
    } else {
      liveEventState.value = { ...liveEventState.value, isPublishing: false, error: 'Failed to create event (signer rejected?)' };
    }
  } catch (err) {
    liveEventState.value = { ...liveEventState.value, isPublishing: false, error: String(err) };
  }
}

export async function onStreamEnd(): Promise<void> {
  const pubkey = authPubkey.value;
  const s = liveEventState.value;
  if (!pubkey || !s.currentEvent) return;

  if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
  consecutiveOfflineChecks = 0;
  lastRepublishAt = 0;

  try {
    const relays = getPublishRelays();
    const endedEvent = await updateLiveEvent(pubkey, s.currentEvent, {
      status: 'ended',
      ends: Math.floor(Date.now() / 1000),
    });

    if (endedEvent) {
      await publishLiveEvent(endedEvent, relays);
      console.log('[liveevents] Published stream ended event');
    }
  } catch (err) {
    console.error('[liveevents] Error ending live event:', err);
  }

  stopLiveChatSubscription();
  liveEventState.value = { ...liveEventState.value, currentEvent: null };
}

async function periodicRepublish(): Promise<void> {
  const pubkey = authPubkey.value;
  const s = liveEventState.value;
  if (!pubkey || !s.currentEvent) return;

  const isLive = await checkStreamLive();
  if (!isLive) {
    consecutiveOfflineChecks++;
    console.warn(`[liveevents] Stream offline check ${consecutiveOfflineChecks}/${OFFLINE_THRESHOLD}`);
    if (consecutiveOfflineChecks >= OFFLINE_THRESHOLD) {
      console.warn('[liveevents] Stream confirmed offline — auto-ending broadcast');
      await onStreamEnd();
      return;
    }
    return;
  }

  consecutiveOfflineChecks = 0;
  const elapsed = Date.now() - lastRepublishAt;
  if (elapsed < REPUBLISH_INTERVAL_MS) return;

  try {
    const relays = getPublishRelays();
    const config = broadcastConfig.value;
    const updated = await updateLiveEvent(pubkey, s.currentEvent, {
      title: config.title || 'Live Stream',
      summary: config.summary || undefined,
      image: config.image || undefined,
      tags: config.tags.length > 0 ? config.tags : undefined,
      status: 'live',
    });

    if (updated) {
      lastRepublishAt = Date.now();
      liveEventState.value = { ...liveEventState.value, currentEvent: updated, lastPublished: new Date().toISOString() };
      await publishLiveEvent(updated, relays);
      console.log('[liveevents] Re-published live event to keep alive');
    }
  } catch (err) {
    console.error('[liveevents] Error re-publishing live event:', err);
  }
}

export function resetLiveEvents() {
  if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
  const enabled = liveEventState.value.enabled;
  liveEventState.value = {
    currentEvent: null, isPublishing: false, lastPublished: null,
    error: null, enabled,
  };
}

// ─── Legacy compat ───

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeLiveEvents(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      liveEventState.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
