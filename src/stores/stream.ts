// Stream state store — polls /api/status (LLHLS manifest probe) for stream status
// Migrated to Preact Signals — consumers read .value inside S() wrappers
// Legacy getStreamState()/subscribeStream() preserved for class component compat

import { signal, batch, effect } from '@preact/signals-core';

export interface StreamInfo {
  online: boolean;
  name: string;
}

// ─── Signals ───

export const streamInfo = signal<StreamInfo>({ online: false, name: '' });
export const streamLoading = signal(false);
export const streamError = signal<string | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Actions ───

export async function pollStreamStatus(): Promise<void> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`Status API ${res.status}`);
    const data = await res.json();

    batch(() => {
      streamInfo.value = { online: !!data.online, name: data.stream || '' };
      streamLoading.value = false;
      streamError.value = null;
    });
  } catch (err) {
    batch(() => {
      streamLoading.value = false;
      streamError.value = String(err);
    });
  }
}

export function startPolling(intervalMs: number = 5000): void {
  if (pollTimer) return;
  streamLoading.value = true;
  pollStreamStatus();
  pollTimer = setInterval(pollStreamStatus, intervalMs);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function resetStream(): void {
  stopPolling();
  batch(() => {
    streamInfo.value = { online: false, name: '' };
    streamLoading.value = false;
    streamError.value = null;
  });
}

// ─── Legacy compat (bridge for class components) ───

export interface StreamState {
  info: StreamInfo;
  isLoading: boolean;
  error: string | null;
}

export function getStreamState(): StreamState {
  return { info: streamInfo.value, isLoading: streamLoading.value, error: streamError.value };
}

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeStream(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      // Read all signals to establish tracking
      streamInfo.value; streamLoading.value; streamError.value;
      // Notify legacy listeners
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
