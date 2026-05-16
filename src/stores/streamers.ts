// Allowed streamers store — fetches /api/streamers to determine who can broadcast / access admin
// Migrated to Preact Signals

import { signal, batch, effect } from '@preact/signals-core';

// ─── Signals ───

export const allowedPubkeys = signal<string[]>([]);
export const streamersLoaded = signal(false);

// ─── Actions ───

/**
 * Check if a hex pubkey is in the allowed streamers list.
 * If the list is empty (no ALLOWED_PUBKEYS configured), everyone is allowed.
 */
export function isAllowedStreamer(pubkey: string | null): boolean {
  if (!pubkey) return false;
  if (allowedPubkeys.value.length === 0) return true;
  return allowedPubkeys.value.includes(pubkey);
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
      batch(() => {
        allowedPubkeys.value = data.pubkeys;
        streamersLoaded.value = true;
      });
    }
  } catch (err) {
    console.warn('[streamers] Failed to fetch allowed streamers:', err);
  }
}

// ─── Legacy compat ───

export interface StreamersState {
  allowedPubkeys: string[];
  loaded: boolean;
}

export function getStreamersState(): StreamersState {
  return { allowedPubkeys: allowedPubkeys.value, loaded: streamersLoaded.value };
}

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeStreamers(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      allowedPubkeys.value; streamersLoaded.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
