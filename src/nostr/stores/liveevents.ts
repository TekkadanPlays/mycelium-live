// NIP-53 Live Events Store
// Monitors stream status and auto-publishes/updates live activity events
import type { NostrEvent } from '../event';
import { createLiveEvent, publishLiveEvent, updateLiveEvent } from '../nip53';
import { getAuthState } from './auth';
import { getBootstrapState } from './bootstrap';
import { getSelectedBroadcastUrls } from './broadcast';
import { startLiveChatSubscription, stopLiveChatSubscription } from './livechat';
import { getBroadcastConfig } from '../../stores/broadcastconfig';

type Listener = () => void;

export interface LiveEventState {
  currentEvent: NostrEvent | null;
  isPublishing: boolean;
  lastPublished: string | null;
  error: string | null;
  enabled: boolean;
}

let state: LiveEventState = {
  currentEvent: null,
  isPublishing: false,
  lastPublished: null,
  error: null,
  enabled: false,
};

const listeners: Set<Listener> = new Set();
let updateInterval: ReturnType<typeof setInterval> | null = null;

// NIP-53 replaceable events expire from relay caches. Re-publish every 45 min
// to keep the event alive while the stream is running.
const REPUBLISH_INTERVAL_MS = 45 * 60 * 1000;

function notify() {
  for (const fn of listeners) fn();
}

export function getLiveEventState(): LiveEventState {
  return state;
}

export function subscribeLiveEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLiveEventsEnabled(enabled: boolean) {
  state = { ...state, enabled };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mycelium_live_events_enabled', enabled ? '1' : '0');
  }
  notify();
}

export function loadLiveEventsEnabled() {
  if (typeof localStorage === 'undefined') return;
  const saved = localStorage.getItem('mycelium_live_events_enabled');
  if (saved !== null) {
    state = { ...state, enabled: saved === '1' };
    notify();
  }
}

/**
 * Get the relay URLs to publish live events to.
 * Merges the user's outbox relays with any selected broadcast relays.
 */
function getPublishRelays(): string[] {
  const bs = getBootstrapState();
  const allOutbox = bs.relayList.filter((r) => r.write).map((r) => r.url);
  const broadcast = getSelectedBroadcastUrls();

  // Check if user has explicitly selected outbox relays
  let outbox = allOutbox;
  try {
    const raw = localStorage.getItem('mycelium_live_outbox_relays_selected');
    if (raw) {
      const selected = new Set(JSON.parse(raw) as string[]);
      if (selected.size > 0) {
        outbox = allOutbox.filter((url) => selected.has(url));
      }
    }
  } catch { /* ignore */ }

  // Merge and deduplicate
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of [...outbox, ...broadcast]) {
    const normalized = url.replace(/\/+$/, '');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  if (result.length > 0) return result;

  // Fallback to well-known relays
  return [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
  ];
}

/**
 * Called when stream goes live. Creates and publishes a NIP-53 live event.
 */
export async function onStreamStart(streamTitle: string, viewerCount: number): Promise<void> {
  const auth = getAuthState();
  if (!auth.pubkey) return;

  state = { ...state, isPublishing: true, error: null };
  notify();

  try {
    const relays = getPublishRelays();
    const config = getBroadcastConfig();
    const streamingUrl = config.streamingUrl || `${window.location.origin}/app/stream/llhls.m3u8`;
    const event = await createLiveEvent(auth.pubkey, {
      identifier: `mycelium-live-${Date.now()}`,
      title: config.title || streamTitle || 'Live Stream',
      summary: config.summary || undefined,
      image: config.image || undefined,
      status: 'live',
      streamingUrl,
      starts: Math.floor(Date.now() / 1000),
      currentParticipants: viewerCount,
      tags: config.tags.length > 0 ? config.tags : undefined,
      participants: [{ pubkey: auth.pubkey, role: 'Host' }],
      relays,
    });

    if (event) {
      const { published } = await publishLiveEvent(event, relays);
      if (published) {
        console.log('[liveevents] Published live event:', event.id);
        state = {
          ...state,
          currentEvent: event,
          isPublishing: false,
          lastPublished: new Date().toISOString(),
        };

        // Start live chat subscription for this event
        const dTag = event.tags.find((t) => t[0] === 'd')?.[1] || '';
        const eventATag = `30311:${auth.pubkey}:${dTag}`;
        startLiveChatSubscription(eventATag, relays);

        // Re-publish the live event periodically to keep it alive on relays
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
          periodicRepublish();
        }, REPUBLISH_INTERVAL_MS);
      } else {
        state = { ...state, isPublishing: false, error: 'Failed to publish to any relay' };
      }
    } else {
      state = { ...state, isPublishing: false, error: 'Failed to create event (signer rejected?)' };
    }
  } catch (err) {
    state = { ...state, isPublishing: false, error: String(err) };
  }
  notify();
}

/**
 * Called when stream goes offline. Updates the live event status to 'ended'.
 */
export async function onStreamEnd(): Promise<void> {
  const auth = getAuthState();
  if (!auth.pubkey || !state.currentEvent) return;

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  try {
    const relays = getPublishRelays();
    const endedEvent = await updateLiveEvent(auth.pubkey, state.currentEvent, {
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

  // Stop live chat subscription
  stopLiveChatSubscription();

  state = { ...state, currentEvent: null };
  notify();
}

/**
 * Re-sign and re-publish the live event with current broadcastconfig values.
 * NIP-53 replaceable events (kind 30311) can expire from relay caches,
 * so we re-publish every ~45 minutes to keep the event discoverable.
 * Reads fresh config each time so title/summary/tag edits are picked up.
 */
async function periodicRepublish(): Promise<void> {
  const auth = getAuthState();
  if (!auth.pubkey || !state.currentEvent) return;

  try {
    const relays = getPublishRelays();
    const config = getBroadcastConfig();
    const updated = await updateLiveEvent(auth.pubkey, state.currentEvent, {
      title: config.title || 'Live Stream',
      summary: config.summary || undefined,
      image: config.image || undefined,
      tags: config.tags.length > 0 ? config.tags : undefined,
      status: 'live',
    });

    if (updated) {
      state = { ...state, currentEvent: updated, lastPublished: new Date().toISOString() };
      await publishLiveEvent(updated, relays);
      console.log('[liveevents] Re-published live event to keep alive');
      notify();
    }
  } catch (err) {
    console.error('[liveevents] Error re-publishing live event:', err);
  }
}

export function resetLiveEvents() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  state = {
    currentEvent: null,
    isPublishing: false,
    lastPublished: null,
    error: null,
    enabled: state.enabled, // preserve enabled setting
  };
  notify();
}
