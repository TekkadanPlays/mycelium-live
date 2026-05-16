import { signal, effect } from '@preact/signals-core';
import { RelayPool } from '../pool';
import type { RelayStatus } from '../relay';

// ─── Signals ───

export const relayStatuses = signal<Map<string, RelayStatus>>(new Map());
export const relayConnecting = signal(false);

// ─── Pool singleton ───

let pool: RelayPool | null = null;

export function getPool(): RelayPool {
  if (!pool) pool = new RelayPool();
  return pool;
}

// ─── Actions ───

export async function connectRelays(): Promise<void> {
  const p = getPool();
  relayConnecting.value = true;
  await p.connectAll();
  relayStatuses.value = p.getStatus();
  relayConnecting.value = false;
}

export function addRelay(url: string) {
  const p = getPool();
  const relay = p.addRelay(url);
  relay.onStatusChange(() => {
    relayStatuses.value = p.getStatus();
  });
  relay.connect().catch(() => {});
  relayStatuses.value = p.getStatus();
}

export function removeRelay(url: string) {
  const p = getPool();
  p.removeRelay(url);
  relayStatuses.value = p.getStatus();
}

// ─── Legacy compat ───

export interface RelayState {
  statuses: Map<string, RelayStatus>;
  isConnecting: boolean;
}

export function getRelayState(): RelayState {
  return { statuses: relayStatuses.value, isConnecting: relayConnecting.value };
}

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeRelay(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      relayStatuses.value; relayConnecting.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
