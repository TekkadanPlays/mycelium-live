// Streamer whitelist store
// Fetches allowed pubkeys from /api/streamers endpoint

type Listener = () => void;

interface StreamerState {
  pubkeys: string[];
  loaded: boolean;
}

let state: StreamerState = { pubkeys: [], loaded: false };
const listeners: Set<Listener> = new Set();

function notify() {
  for (const fn of listeners) fn();
}

export function getStreamerState(): StreamerState {
  return state;
}

export function subscribeStreamers(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isAllowedStreamer(pubkey: string | null): boolean {
  if (!pubkey) return false;
  // Empty list = everyone allowed
  if (state.pubkeys.length === 0) return true;
  return state.pubkeys.includes(pubkey);
}

let fetched = false;

export async function fetchStreamers(): Promise<void> {
  if (fetched) return;
  fetched = true;
  try {
    const res = await fetch('/api/streamers');
    if (!res.ok) return;
    const data = await res.json();
    state = { pubkeys: data.pubkeys || [], loaded: true };
    notify();
  } catch {
    state = { ...state, loaded: true };
    notify();
  }
}
