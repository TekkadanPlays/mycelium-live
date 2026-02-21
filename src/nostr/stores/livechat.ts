// NIP-53 Live Chat Store (kind:1311)
// Subscribes to live chat messages for the active live event
import type { NostrEvent } from '../event';
import { createEvent } from '../event';
import { Relay } from '../relay';
import { getAuthState } from './auth';
import { signWithExtension } from '../nip07';

type Listener = () => void;

export interface LiveChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
}

export interface LiveChatState {
  messages: LiveChatMessage[];
  connected: boolean;
  sending: boolean;
}

let state: LiveChatState = {
  messages: [],
  connected: false,
  sending: false,
};

const listeners: Set<Listener> = new Set();
let chatRelays: Relay[] = [];
let activeEventTag: string | null = null;

function notify() {
  for (const fn of listeners) fn();
}

export function getLiveChatState(): LiveChatState {
  return state;
}

export function subscribeLiveChat(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Start subscribing to kind:1311 messages for a live event.
 * @param eventATag - The `a` tag value: "30311:<pubkey>:<d-tag>"
 * @param relayUrls - Relays to subscribe on
 */
export function startLiveChatSubscription(eventATag: string, relayUrls: string[]): void {
  stopLiveChatSubscription();
  activeEventTag = eventATag;

  state = { ...state, messages: [], connected: false };
  notify();

  for (const url of relayUrls) {
    const relay = new Relay(url);
    chatRelays.push(relay);

    relay.connect()
      .then(() => {
        if (relay.status !== 'connected') return;

        state = { ...state, connected: true };
        notify();

        relay.subscribe(
          [{
            kinds: [1311],
            '#a': [eventATag],
            limit: 50,
          }],
          (event: NostrEvent) => {
            // Deduplicate by event id
            if (state.messages.some((m) => m.id === event.id)) return;

            const msg: LiveChatMessage = {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
            };

            // Insert sorted by created_at
            const msgs = [...state.messages, msg].sort((a, b) => a.created_at - b.created_at);
            // Keep last 200 messages
            if (msgs.length > 200) msgs.splice(0, msgs.length - 200);

            state = { ...state, messages: msgs };
            notify();
          },
        );
      })
      .catch((err) => {
        console.warn('[livechat] Failed to connect to', url, err);
      });
  }
}

export function stopLiveChatSubscription(): void {
  for (const relay of chatRelays) {
    relay.disconnect();
  }
  chatRelays = [];
  activeEventTag = null;
  state = { messages: [], connected: false, sending: false };
  notify();
}

/**
 * Send a kind:1311 live chat message.
 */
export async function sendLiveChatMessage(content: string): Promise<boolean> {
  const auth = getAuthState();
  if (!auth.pubkey || !activeEventTag) return false;

  state = { ...state, sending: true };
  notify();

  try {
    const unsigned = createEvent(1311, content, [
      ['a', activeEventTag, '', 'root'],
    ]);

    const signed = await signWithExtension(unsigned);
    if (!signed) {
      state = { ...state, sending: false };
      notify();
      return false;
    }

    // Publish to all connected chat relays
    let published = false;
    for (const relay of chatRelays) {
      if (relay.status === 'connected') {
        try {
          const result = await relay.publish(signed);
          if (result.accepted) published = true;
        } catch { /* ignore individual relay failures */ }
      }
    }

    state = { ...state, sending: false };
    notify();
    return published;
  } catch (err) {
    console.error('[livechat] Error sending message:', err);
    state = { ...state, sending: false };
    notify();
    return false;
  }
}

export function resetLiveChat(): void {
  stopLiveChatSubscription();
}
