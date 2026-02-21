// Allowed streamers store — fetches /api/streamers to determine who can broadcast / access admin
type Listener = () => void;

export interface StreamersState {
  allowedPubkeys: string[];
  loaded: boolean;
}

let state: StreamersState = {
  allowedPubkeys: [],
  loaded: false,
};

const listeners: Set<Listener> = new Set();

function notify() {
  for (const fn of listeners) fn();
}

export function getStreamersState(): StreamersState {
  return state;
}

export function subscribeStreamers(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Check if a hex pubkey is in the allowed streamers list.
 * If the list is empty (no ALLOWED_PUBKEYS configured), everyone is allowed.
 */
export function isAllowedStreamer(pubkey: string | null): boolean {
  if (!pubkey) return false;
  if (state.allowedPubkeys.length === 0) return true;
  return state.allowedPubkeys.includes(pubkey);
}

let fetched = false;

export async function fetchAllowedStreamers(): Promise<void> {
  if (fetched) return;
  fetched = true;

  try {
    const res = await fetch('/api/streamers');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.pubkeys)) {
      state = { allowedPubkeys: data.pubkeys, loaded: true };
      notify();
    }
  } catch (err) {
    console.warn('[streamers] Failed to fetch allowed streamers:', err);
  }
}
