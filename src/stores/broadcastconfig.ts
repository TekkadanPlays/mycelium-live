// Broadcast Config Store — persists pre-broadcast NIP-53 live event metadata
// Migrated to Preact Signals

import { signal, effect } from '@preact/signals-core';

export interface BroadcastConfig {
  title: string;
  summary: string;
  image: string;
  tags: string[];
  streamingUrl: string;
  recordingUrl: string;
}

const STORAGE_KEY = 'mycelium_broadcast_config';

const DEFAULT_CONFIG: BroadcastConfig = {
  title: '', summary: '', image: '', tags: [],
  streamingUrl: '', recordingUrl: '',
};

// ─── Signal ───

export const broadcastConfig = signal<BroadcastConfig>({ ...DEFAULT_CONFIG });

// ─── Actions ───

function persist() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(broadcastConfig.value));
  }
}

export function loadBroadcastConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      broadcastConfig.value = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
}

export function getBroadcastConfig(): BroadcastConfig {
  return broadcastConfig.value;
}

export function setBroadcastConfigField<K extends keyof BroadcastConfig>(
  key: K,
  value: BroadcastConfig[K],
) {
  broadcastConfig.value = { ...broadcastConfig.value, [key]: value };
  persist();
}

export function setBroadcastConfig(partial: Partial<BroadcastConfig>) {
  broadcastConfig.value = { ...broadcastConfig.value, ...partial };
  persist();
}

export function resetBroadcastConfig() {
  broadcastConfig.value = { ...DEFAULT_CONFIG };
  persist();
}

export function addTag(tag: string) {
  const t = tag.trim().toLowerCase().replace(/^#/, '');
  if (!t || broadcastConfig.value.tags.includes(t)) return;
  broadcastConfig.value = { ...broadcastConfig.value, tags: [...broadcastConfig.value.tags, t] };
  persist();
}

export function removeTag(tag: string) {
  broadcastConfig.value = { ...broadcastConfig.value, tags: broadcastConfig.value.tags.filter((t) => t !== tag) };
  persist();
}

// ─── Legacy compat ───

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeBroadcastConfig(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      broadcastConfig.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
