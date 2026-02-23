// Streamer Profile Cache Store
// Fetches the cached streamer profile from the server (/api/profile)
// so viewers can see the host's pfp/name without being signed in.
// The streamer's profile is pushed to the server on sign-in via pushProfileToServer().

type Listener = () => void;

export interface StreamerProfile {
  pubkey: string | null;
  name: string;
  displayName: string;
  picture: string;
  banner: string;
  nip05: string;
  lud16: string;
}

const EMPTY: StreamerProfile = {
  pubkey: null,
  name: '',
  displayName: '',
  picture: '',
  banner: '',
  nip05: '',
  lud16: '',
};

let state: StreamerProfile = { ...EMPTY };
const listeners: Set<Listener> = new Set();

function notify() {
  for (const fn of listeners) fn();
}

export function getStreamerProfile(): StreamerProfile {
  return state;
}

export function subscribeStreamerProfile(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fetch the cached streamer profile from the server.
 * Called on app init so viewers see the host's pfp immediately.
 */
export async function fetchStreamerProfile(): Promise<void> {
  try {
    const res = await fetch('/api/profile');
    if (!res.ok) return;
    const data = await res.json();
    if (data.pubkey) {
      state = {
        pubkey: data.pubkey,
        name: data.name || '',
        displayName: data.displayName || '',
        picture: data.picture || '',
        banner: data.banner || '',
        nip05: data.nip05 || '',
        lud16: data.lud16 || '',
      };
      notify();
    }
  } catch {
    // Server unavailable — no-op
  }
}

/**
 * Push the current user's profile to the server cache.
 * Called after bootstrap completes for allowed streamers.
 */
export async function pushProfileToServer(
  pubkey: string,
  profile: { name?: string; displayName?: string; display_name?: string; picture?: string; banner?: string; nip05?: string; lud16?: string },
): Promise<void> {
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey, profile }),
    });
    // Update local state too
    state = {
      pubkey,
      name: profile.name || state.name,
      displayName: profile.displayName || profile.display_name || state.displayName,
      picture: profile.picture || state.picture,
      banner: profile.banner || state.banner,
      nip05: profile.nip05 || state.nip05,
      lud16: profile.lud16 || state.lud16,
    };
    notify();
  } catch {
    // Server unavailable — no-op
  }
}
