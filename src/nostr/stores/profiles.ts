// Profile fetching store — resolves kind-0 metadata for any pubkey
// Migrated to Preact Signals
import { signal, effect } from '@preact/signals-core';
import { Relay } from '../relay';
import { Kind } from '../event';
import type { NostrEvent } from '../event';
import { getIndexerUrls } from './indexers';
import { npubEncode, shortenHex } from '../utils';

export interface NostrProfile {
  pubkey: string;
  name: string;
  displayName: string;
  picture: string;
  banner: string;
  about: string;
  nip05: string;
  lud16: string;
  fetched: boolean;
}

// ─── Signals ───

// Bumped every time the profile cache changes — components read this to track updates
export const profileVersion = signal(0);

const cache: Map<string, NostrProfile> = new Map();
const pending: Set<string> = new Set();

function notifyProfileChange() {
  profileVersion.value++;
}

// ─── Reads ───

export function getProfile(pubkey: string): NostrProfile {
  const cached = cache.get(pubkey);
  if (cached) return cached;

  return {
    pubkey, name: '', displayName: '', picture: '',
    banner: '', about: '', nip05: '', lud16: '', fetched: false,
  };
}

export function getDisplayName(pubkey: string): string {
  const profile = getProfile(pubkey);
  if (profile.displayName) return profile.displayName;
  if (profile.name) return profile.name;
  try {
    const npub = npubEncode(pubkey);
    return npub.slice(0, 12) + '...' + npub.slice(-4);
  } catch {
    return shortenHex(pubkey, 8);
  }
}

export function getAvatar(pubkey: string): string {
  return getProfile(pubkey).picture;
}

// ─── Actions ───

export function fetchProfile(pubkey: string): void {
  if (cache.has(pubkey) && cache.get(pubkey)!.fetched) return;
  if (pending.has(pubkey)) return;
  pending.add(pubkey);

  const indexerUrls = getIndexerUrls();
  if (indexerUrls.length === 0) { pending.delete(pubkey); return; }

  const urls = indexerUrls.slice(0, 3);
  let bestEvent: NostrEvent | null = null;
  let responded = 0;

  function finish() {
    pending.delete(pubkey);
    if (bestEvent) {
      cache.set(pubkey, parseProfileEvent(pubkey, bestEvent));
    } else {
      cache.set(pubkey, {
        pubkey, name: '', displayName: '', picture: '',
        banner: '', about: '', nip05: '', lud16: '', fetched: true,
      });
    }
    notifyProfileChange();
  }

  const timeout = setTimeout(() => finish(), 6000);

  for (const url of urls) {
    const relay = new Relay(url);
    relay.connect()
      .then(() => {
        if (relay.status !== 'connected') {
          responded++;
          if (responded >= urls.length) { clearTimeout(timeout); finish(); }
          return;
        }

        const subId = relay.subscribe(
          [{ kinds: [Kind.Metadata], authors: [pubkey], limit: 1 }],
          (event: NostrEvent) => {
            if (!bestEvent || event.created_at > bestEvent.created_at) bestEvent = event;
          },
          () => {
            relay.unsubscribe(subId);
            relay.disconnect();
            responded++;
            if (responded >= urls.length) { clearTimeout(timeout); finish(); }
          },
        );
      })
      .catch(() => {
        responded++;
        if (responded >= urls.length) { clearTimeout(timeout); finish(); }
      });
  }
}

export function fetchProfiles(pubkeys: string[]): void {
  for (const pk of pubkeys) fetchProfile(pk);
}

function parseProfileEvent(pubkey: string, event: NostrEvent): NostrProfile {
  let meta: Record<string, string> = {};
  try { meta = JSON.parse(event.content); } catch {}

  return {
    pubkey, name: meta.name || '', displayName: meta.display_name || meta.displayName || '',
    picture: meta.picture || '', banner: meta.banner || '', about: meta.about || '',
    nip05: meta.nip05 || '', lud16: meta.lud16 || '', fetched: true,
  };
}

export function resetProfiles(): void {
  cache.clear();
  pending.clear();
  notifyProfileChange();
}

// ─── Legacy compat ───

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeProfiles(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      profileVersion.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
