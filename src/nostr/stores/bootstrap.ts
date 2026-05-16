// Bootstrap Store — discovers user profile and relay list from indexers
// Migrated to Preact Signals
import { signal, effect } from '@preact/signals-core';
import { Relay } from '../relay';
import { Kind } from '../event';
import type { NostrEvent } from '../event';
import { getIndexerUrls, discoverIndexers, indexerState, subscribeIndexers } from './indexers';
import { getPool } from './relay';
import { addRelayToProfile, removeRelayFromProfile, getRelayManagerState } from './relaymanager';
import { signWithExtension } from '../nip07';
import { authPubkey } from './auth';

export interface BootstrapProfile {
  name: string;
  displayName: string;
  picture: string;
  banner: string;
  about: string;
  nip05: string;
  lud16: string;
}

export interface RelayListEntry {
  url: string;
  read: boolean;
  write: boolean;
}

export type BootstrapPhase =
  | 'idle' | 'discovering_indexers' | 'querying_indexers'
  | 'connecting_relays' | 'ready' | 'error';

export interface BootstrapState {
  phase: BootstrapPhase;
  profile: BootstrapProfile | null;
  profileEvent: NostrEvent | null;
  relayList: RelayListEntry[];
  relayListEvent: NostrEvent | null;
  contactsEvent: NostrEvent | null;
  followingCount: number;
  indexersQueried: number;
  indexersResponded: number;
  outboxConnected: number;
  inboxConnected: number;
  error: string | null;
}

const INITIAL: BootstrapState = {
  phase: 'idle', profile: null, profileEvent: null,
  relayList: [], relayListEvent: null, contactsEvent: null,
  followingCount: 0, indexersQueried: 0, indexersResponded: 0,
  outboxConnected: 0, inboxConnected: 0, error: null,
};

// ─── Signal ───

export const bootstrapState = signal<BootstrapState>({ ...INITIAL });

let ephemeralRelays: Relay[] = [];
let bootstrappedPubkey: string | null = null;
let activeBootstrap: Promise<void> | null = null;

// ─── Actions ───

export function getBootstrapState(): BootstrapState {
  return bootstrapState.value;
}

export function resetBootstrap(): void {
  cleanupEphemeral();
  bootstrappedPubkey = null;
  activeBootstrap = null;
  bootstrapState.value = { ...INITIAL };
}

export async function bootstrapUser(pubkey: string): Promise<void> {
  const s = bootstrapState.value;
  if (bootstrappedPubkey === pubkey && s.phase === 'ready') return;
  if (bootstrappedPubkey === pubkey && activeBootstrap) return activeBootstrap;

  bootstrappedPubkey = pubkey;
  activeBootstrap = doBootstrap(pubkey).finally(() => { activeBootstrap = null; });
  return activeBootstrap;
}

async function doBootstrap(pubkey: string): Promise<void> {
  bootstrapState.value = {
    ...INITIAL,
    phase: 'discovering_indexers',
  };

  const is = indexerState.value;
  if (is.urls.length === 0) await discoverIndexers(10);

  const indexerUrls = getIndexerUrls();
  if (indexerUrls.length === 0) {
    bootstrapState.value = { ...bootstrapState.value, phase: 'error', error: 'No indexer relays found' };
    return;
  }

  syncIndexersToManager(indexerUrls);

  subscribeIndexers(() => {
    const upgraded = getIndexerUrls();
    if (upgraded.length > 0) syncIndexersToManager(upgraded);
  });

  bootstrapState.value = { ...bootstrapState.value, phase: 'querying_indexers', indexersQueried: indexerUrls.length };
  await queryIndexers(pubkey, indexerUrls);

  bootstrapState.value = { ...bootstrapState.value, phase: 'ready' };
  cleanupEphemeral();
}

function queryIndexers(pubkey: string, indexerUrls: string[]): Promise<void> {
  return new Promise<void>((resolve) => {
    let responded = 0;
    const total = indexerUrls.length;
    const timeout = setTimeout(() => finish(), 15000);

    function finish() { clearTimeout(timeout); resolve(); }

    function onIndexerDone() {
      responded++;
      bootstrapState.value = { ...bootstrapState.value, indexersResponded: responded };
      if (responded >= total) finish();
    }

    for (const url of indexerUrls) {
      const relay = new Relay(url);
      ephemeralRelays.push(relay);

      relay.connect()
        .then(() => {
          if (relay.status !== 'connected') { onIndexerDone(); return; }

          const subId = relay.subscribe(
            [
              { kinds: [Kind.Metadata], authors: [pubkey], limit: 1 },
              { kinds: [Kind.RelayList], authors: [pubkey], limit: 1 },
              { kinds: [Kind.Contacts], authors: [pubkey], limit: 1 },
            ],
            (event: NostrEvent) => {
              const s = bootstrapState.value;
              if (event.kind === Kind.Metadata) {
                if (!s.profileEvent || event.created_at > s.profileEvent.created_at) {
                  bootstrapState.value = { ...s, profileEvent: event, profile: parseProfile(event) };
                }
              } else if (event.kind === Kind.RelayList) {
                if (!s.relayListEvent || event.created_at > s.relayListEvent.created_at) {
                  bootstrapState.value = { ...s, relayListEvent: event, relayList: parseRelayList(event) };
                }
              } else if (event.kind === Kind.Contacts) {
                if (!s.contactsEvent || event.created_at > s.contactsEvent.created_at) {
                  const count = event.tags.filter((t) => t[0] === 'p' && t[1]).length;
                  bootstrapState.value = { ...s, contactsEvent: event, followingCount: count };
                }
              }
            },
            () => { relay.unsubscribe(subId); onIndexerDone(); },
          );
        })
        .catch(() => onIndexerDone());
    }
  });
}

async function connectUserRelays(relayList: RelayListEntry[]): Promise<void> {
  const pool = getPool();
  const mgr = getRelayManagerState();

  const writeRelays = relayList.filter((r) => r.write).map((r) => r.url);
  const readRelays = relayList.filter((r) => r.read).map((r) => r.url);

  const outbox = mgr.profiles.find((p) => p.id === 'outbox');
  const inbox = mgr.profiles.find((p) => p.id === 'inbox');

  for (const url of writeRelays) {
    if (outbox && !outbox.relays.includes(url)) addRelayToProfile('outbox', url);
  }
  for (const url of readRelays) {
    if (inbox && !inbox.relays.includes(url)) addRelayToProfile('inbox', url);
  }

  const allUrls = new Set([...writeRelays, ...readRelays]);
  const connectPromises: Promise<void>[] = [];

  for (const url of allUrls) {
    const existing = pool.getRelay(url);
    if (!existing) {
      const relay = pool.addRelayWithAuth(url);
      connectPromises.push(
        relay.connect()
          .then(() => {
            const s = bootstrapState.value;
            if (writeRelays.includes(url)) {
              bootstrapState.value = { ...s, outboxConnected: s.outboxConnected + 1 };
            }
            if (readRelays.includes(url)) {
              bootstrapState.value = { ...bootstrapState.value, inboxConnected: bootstrapState.value.inboxConnected + 1 };
            }
          })
          .catch((err) => console.warn(`[bootstrap] Failed to connect to ${url}:`, err)),
      );
    }
  }

  await Promise.allSettled(connectPromises);
}

function syncIndexersToManager(indexerUrls: string[]) {
  const mgr = getRelayManagerState();
  const indexers = mgr.profiles.find((p) => p.id === 'indexers');
  if (!indexers) return;

  for (const url of indexers.relays) {
    if (!indexerUrls.includes(url)) removeRelayFromProfile('indexers', url);
  }
  for (const url of indexerUrls) {
    if (!indexers.relays.includes(url)) addRelayToProfile('indexers', url);
  }
}

function cleanupEphemeral() {
  for (const relay of ephemeralRelays) {
    const pool = getPool();
    if (!pool.getRelay(relay.url)) relay.disconnect();
  }
  ephemeralRelays = [];
}

function parseProfile(event: NostrEvent): BootstrapProfile {
  let meta: Record<string, string> = {};
  try { meta = JSON.parse(event.content); } catch {}

  return {
    name: meta.name || '', displayName: meta.display_name || meta.displayName || '',
    picture: meta.picture || '', banner: meta.banner || '',
    about: meta.about || '', nip05: meta.nip05 || '', lud16: meta.lud16 || '',
  };
}

function parseRelayList(event: NostrEvent): RelayListEntry[] {
  const relays: RelayListEntry[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'r' || !tag[1]) continue;
    const url = tag[1].replace(/\/+$/, '');
    const marker = tag[2];
    relays.push({
      url,
      read: !marker || marker === 'read',
      write: !marker || marker === 'write',
    });
  }
  return relays;
}

export function getOutboxUrls(): string[] {
  return bootstrapState.value.relayList.filter((r) => r.write).map((r) => r.url);
}

export function getInboxUrls(): string[] {
  return bootstrapState.value.relayList.filter((r) => r.read).map((r) => r.url);
}

// ─── Legacy compat ───

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeBootstrap(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      bootstrapState.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
