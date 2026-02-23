// Broadcast Config Store
// Persists pre-broadcast NIP-53 live event metadata to localStorage
// The streamer fills this in before going live; values are used when
// onStreamStart() fires to build the kind-30311 event.

type Listener = () => void;

export interface BroadcastConfig {
  title: string;
  summary: string;
  image: string;
  tags: string[];       // hashtags for the stream
  streamingUrl: string;  // override; empty = auto-detect from OME
  recordingUrl: string;
}

const STORAGE_KEY = 'mycelium_broadcast_config';

const DEFAULT_CONFIG: BroadcastConfig = {
  title: '',
  summary: '',
  image: '',
  tags: [],
  streamingUrl: '',
  recordingUrl: '',
};

let state: BroadcastConfig = { ...DEFAULT_CONFIG };
const listeners: Set<Listener> = new Set();

function notify() {
  for (const fn of listeners) fn();
}

function persist() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function loadBroadcastConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...DEFAULT_CONFIG, ...parsed };
      notify();
    }
  } catch { /* ignore */ }
}

export function getBroadcastConfig(): BroadcastConfig {
  return state;
}

export function subscribeBroadcastConfig(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setBroadcastConfigField<K extends keyof BroadcastConfig>(
  key: K,
  value: BroadcastConfig[K],
) {
  state = { ...state, [key]: value };
  persist();
  notify();
}

export function setBroadcastConfig(partial: Partial<BroadcastConfig>) {
  state = { ...state, ...partial };
  persist();
  notify();
}

export function resetBroadcastConfig() {
  state = { ...DEFAULT_CONFIG };
  persist();
  notify();
}

export function addTag(tag: string) {
  const t = tag.trim().toLowerCase().replace(/^#/, '');
  if (!t || state.tags.includes(t)) return;
  state = { ...state, tags: [...state.tags, t] };
  persist();
  notify();
}

export function removeTag(tag: string) {
  state = { ...state, tags: state.tags.filter((t) => t !== tag) };
  persist();
  notify();
}
