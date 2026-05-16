// Relay Manager Store — manages relay profiles
// Migrated to Preact Signals
import { signal, effect } from '@preact/signals-core';
import { getPool } from './relay';
import { addRelay, removeRelay } from './relay';

export interface RelayProfile {
  id: string;
  name: string;
  relays: string[];
  builtin?: boolean;
  enabled?: boolean;
  relayEnabled?: Record<string, boolean>;
}

export interface RelayManagerState {
  profiles: RelayProfile[];
  activeProfileId: string;
}

const STORAGE_KEY = 'mycelium_live_relay_profiles';

const DEFAULT_PROFILES: RelayProfile[] = [
  { id: 'outbox', name: 'Outbox', relays: [], builtin: true, enabled: true, relayEnabled: {} },
  { id: 'inbox', name: 'Inbox', relays: [], builtin: true, enabled: true, relayEnabled: {} },
  { id: 'indexers', name: 'Indexers', relays: [], builtin: true, enabled: true, relayEnabled: {} },
];

// ─── Signal ───

export const relayManagerState = signal<RelayManagerState>({
  profiles: [...DEFAULT_PROFILES],
  activeProfileId: 'outbox',
});

// ─── Internal ───

function persist() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(relayManagerState.value));
  }
}

// ─── Actions ───

export function loadRelayManager() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as RelayManagerState;
      const builtinIds = new Set(DEFAULT_PROFILES.map((p) => p.id));
      const merged: RelayProfile[] = [];
      for (const def of DEFAULT_PROFILES) {
        const saved_profile = saved.profiles.find((p) => p.id === def.id);
        merged.push(saved_profile
          ? { ...saved_profile, builtin: true, enabled: saved_profile.enabled !== false, relayEnabled: saved_profile.relayEnabled || {} }
          : { ...def });
      }
      for (const p of saved.profiles) {
        if (!builtinIds.has(p.id)) {
          merged.push({ ...p, builtin: false, enabled: p.enabled !== false, relayEnabled: p.relayEnabled || {} });
        }
      }
      relayManagerState.value = {
        profiles: merged,
        activeProfileId: saved.activeProfileId || 'outbox',
      };
    }
  } catch {}
}

export function getRelayManagerState(): RelayManagerState {
  return relayManagerState.value;
}

export function getActiveProfile(): RelayProfile {
  const s = relayManagerState.value;
  return s.profiles.find((p) => p.id === s.activeProfileId) || s.profiles[0];
}

export function setActiveProfile(profileId: string) {
  relayManagerState.value = { ...relayManagerState.value, activeProfileId: profileId };
  persist();
  syncPoolToActiveProfile();
}

export function addRelayToProfile(profileId: string, url: string) {
  let normalized = url.trim();
  if (!normalized.startsWith('wss://') && !normalized.startsWith('ws://')) normalized = 'wss://' + normalized;
  normalized = normalized.replace(/\/+$/, '');

  const s = relayManagerState.value;
  relayManagerState.value = {
    ...s,
    profiles: s.profiles.map((p) =>
      p.id === profileId && !p.relays.includes(normalized)
        ? { ...p, relays: [...p.relays, normalized] }
        : p,
    ),
  };
  persist();

  if (profileId === relayManagerState.value.activeProfileId) addRelay(normalized);
}

export function removeRelayFromProfile(profileId: string, url: string) {
  const s = relayManagerState.value;
  relayManagerState.value = {
    ...s,
    profiles: s.profiles.map((p) =>
      p.id === profileId ? { ...p, relays: p.relays.filter((r) => r !== url) } : p,
    ),
  };
  persist();

  if (profileId === relayManagerState.value.activeProfileId) removeRelay(url);
}

export function createProfile(name: string): string {
  const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const s = relayManagerState.value;
  relayManagerState.value = {
    ...s,
    profiles: [...s.profiles, { id, name, relays: [], builtin: false, enabled: true, relayEnabled: {} }],
  };
  persist();
  return id;
}

export function toggleProfileEnabled(profileId: string) {
  const s = relayManagerState.value;
  relayManagerState.value = {
    ...s,
    profiles: s.profiles.map((p) => p.id === profileId ? { ...p, enabled: !p.enabled } : p),
  };
  persist();
}

export function setRelayEnabled(profileId: string, url: string, enabled: boolean) {
  const s = relayManagerState.value;
  relayManagerState.value = {
    ...s,
    profiles: s.profiles.map((p) => {
      if (p.id !== profileId) return p;
      const relayEnabled = { ...(p.relayEnabled || {}) };
      relayEnabled[url] = enabled;
      return { ...p, relayEnabled };
    }),
  };
  persist();
}

export function isRelayEnabled(profile: RelayProfile, url: string): boolean {
  if (!profile.relayEnabled) return true;
  return profile.relayEnabled[url] !== false;
}

export function getEnabledRelayCount(profile: RelayProfile): number {
  if (!profile.enabled) return 0;
  return profile.relays.filter((url) => isRelayEnabled(profile, url)).length;
}

export function renameProfile(profileId: string, name: string) {
  const s = relayManagerState.value;
  relayManagerState.value = {
    ...s,
    profiles: s.profiles.map((p) => p.id === profileId && !p.builtin ? { ...p, name } : p),
  };
  persist();
}

export function deleteProfile(profileId: string) {
  const s = relayManagerState.value;
  const profile = s.profiles.find((p) => p.id === profileId);
  if (!profile || profile.builtin) return;

  relayManagerState.value = {
    ...s,
    profiles: s.profiles.filter((p) => p.id !== profileId),
    activeProfileId: s.activeProfileId === profileId ? 'outbox' : s.activeProfileId,
  };
  persist();
}

export function syncPoolToActiveProfile() {
  const pool = getPool();
  const active = getActiveProfile();
  const currentUrls = new Set(pool.allRelays.map((r) => r.url));
  const targetUrls = new Set(active.relays);

  for (const url of currentUrls) {
    if (!targetUrls.has(url)) pool.removeRelay(url);
  }
  for (const url of targetUrls) {
    if (!currentUrls.has(url)) addRelay(url);
  }
}

export function resetRelayManager() {
  relayManagerState.value = {
    profiles: [...DEFAULT_PROFILES],
    activeProfileId: 'outbox',
  };
  persist();
}

// ─── Legacy compat ───

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeRelayManager(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      relayManagerState.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
