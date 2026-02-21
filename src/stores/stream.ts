// Stream state store — polls /api/status (LLHLS manifest probe) for stream status

type Listener = () => void;

export interface StreamInfo {
  online: boolean;
  name: string;
}

export interface StreamState {
  info: StreamInfo;
  isLoading: boolean;
  error: string | null;
}

let state: StreamState = {
  info: {
    online: false,
    name: '',
  },
  isLoading: false,
  error: null,
};

const listeners: Set<Listener> = new Set();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const fn of listeners) fn();
}

export function getStreamState(): StreamState {
  return state;
}

export function subscribeStream(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function pollStreamStatus(): Promise<void> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`Status API ${res.status}`);
    const data = await res.json();

    state = {
      info: {
        online: !!data.online,
        name: data.stream || '',
      },
      isLoading: false,
      error: null,
    };
    notify();
  } catch (err) {
    state = { ...state, isLoading: false, error: String(err) };
    notify();
  }
}

export function startPolling(intervalMs: number = 5000): void {
  if (pollTimer) return;
  state = { ...state, isLoading: true };
  notify();
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
  state = {
    info: { online: false, name: '' },
    isLoading: false,
    error: null,
  };
  notify();
}
