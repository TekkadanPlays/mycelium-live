// Streamer Profile Cache Store — fetches cached profile from /api/profile
// Migrated to Preact Signals

import { signal, effect } from '@preact/signals-core';

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
  pubkey: null, name: '', displayName: '', picture: '',
  banner: '', nip05: '', lud16: '',
};

// ─── Signal ───

export const streamerProfile = signal<StreamerProfile>({ ...EMPTY });

// ─── Actions ───

export function getStreamerProfile(): StreamerProfile {
  return streamerProfile.value;
}

export async function fetchStreamerProfile(): Promise<void> {
  try {
    const res = await fetch('/api/profile');
    if (!res.ok) return;
    const data = await res.json();
    if (data.pubkey) {
      streamerProfile.value = {
        pubkey: data.pubkey,
        name: data.name || '',
        displayName: data.displayName || '',
        picture: data.picture || '',
        banner: data.banner || '',
        nip05: data.nip05 || '',
        lud16: data.lud16 || '',
      };
    }
  } catch {
    // Server unavailable — no-op
  }
}

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
    const prev = streamerProfile.value;
    streamerProfile.value = {
      pubkey,
      name: profile.name || prev.name,
      displayName: profile.displayName || profile.display_name || prev.displayName,
      picture: profile.picture || prev.picture,
      banner: profile.banner || prev.banner,
      nip05: profile.nip05 || prev.nip05,
      lud16: profile.lud16 || prev.lud16,
    };
  } catch {
    // Server unavailable — no-op
  }
}

// ─── Legacy compat ───

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeStreamerProfile(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      streamerProfile.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
