// NIP-53 Live Chat Store (kind:1311)
// Migrated to Preact Signals
import { signal, batch, effect } from '@preact/signals-core';
import type { NostrEvent } from '../event';
import { createEvent } from '../event';
import { Relay } from '../relay';
import { authPubkey } from './auth';
import { signWithExtension } from '../nip07';

export interface LiveChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
}

// ─── Signals ───

export const liveChatMessages = signal<LiveChatMessage[]>([]);
export const liveChatConnected = signal(false);
export const liveChatSending = signal(false);

let chatRelays: Relay[] = [];
let activeEventTag: string | null = null;

// ─── Actions ───

export function startLiveChatSubscription(eventATag: string, relayUrls: string[]): void {
  stopLiveChatSubscription();
  activeEventTag = eventATag;

  batch(() => { liveChatMessages.value = []; liveChatConnected.value = false; });

  for (const url of relayUrls) {
    const relay = new Relay(url);
    chatRelays.push(relay);

    relay.connect()
      .then(() => {
        if (relay.status !== 'connected') return;
        liveChatConnected.value = true;

        relay.subscribe(
          [{ kinds: [1311], '#a': [eventATag], limit: 50 }],
          (event: NostrEvent) => {
            const msgs = liveChatMessages.value;
            if (msgs.some((m) => m.id === event.id)) return;

            const msg: LiveChatMessage = {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
            };

            const updated = [...msgs, msg].sort((a, b) => a.created_at - b.created_at);
            if (updated.length > 200) updated.splice(0, updated.length - 200);
            liveChatMessages.value = updated;
          },
        );
      })
      .catch((err) => console.warn('[livechat] Failed to connect to', url, err));
  }
}

export function stopLiveChatSubscription(): void {
  for (const relay of chatRelays) relay.disconnect();
  chatRelays = [];
  activeEventTag = null;
  batch(() => {
    liveChatMessages.value = [];
    liveChatConnected.value = false;
    liveChatSending.value = false;
  });
}

export async function sendLiveChatMessage(content: string): Promise<boolean> {
  const pubkey = authPubkey.value;
  if (!pubkey || !activeEventTag) return false;

  liveChatSending.value = true;

  try {
    const unsigned = createEvent(1311, content, [
      ['a', activeEventTag, '', 'root'],
    ]);

    const signed = await signWithExtension(unsigned);
    if (!signed) { liveChatSending.value = false; return false; }

    let published = false;
    for (const relay of chatRelays) {
      if (relay.status === 'connected') {
        try {
          const result = await relay.publish(signed);
          if (result.accepted) published = true;
        } catch {}
      }
    }

    liveChatSending.value = false;
    return published;
  } catch (err) {
    console.error('[livechat] Error sending message:', err);
    liveChatSending.value = false;
    return false;
  }
}

export function resetLiveChat(): void {
  stopLiveChatSubscription();
}

// ─── Legacy compat ───

export interface LiveChatState {
  messages: LiveChatMessage[];
  connected: boolean;
  sending: boolean;
}

export function getLiveChatState(): LiveChatState {
  return {
    messages: liveChatMessages.value,
    connected: liveChatConnected.value,
    sending: liveChatSending.value,
  };
}

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeLiveChat(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      liveChatMessages.value; liveChatConnected.value; liveChatSending.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
