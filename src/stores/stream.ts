// Stream state store — polls OME API for stream status

type Listener = () => void;

export interface StreamInfo {
  online: boolean;
  name: string;
  viewerCount: number;
  tracks: {
    video?: { codec: string; width: number; height: number; bitrate: string; framerate: number };
    audio?: { codec: string; samplerate: number; channel: number; bitrate: string };
  };
  createdTime: string | null;
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
    viewerCount: 0,
    tracks: {},
    createdTime: null,
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

// OME API config
const OME_API_BASE = '/api/ome';
const VHOST = 'default';
const APP = 'app';
const STREAM = 'stream';

export async function pollStreamStatus(): Promise<void> {
  try {
    const res = await fetch(`${OME_API_BASE}/v1/vhosts/${VHOST}/apps/${APP}/streams/${STREAM}`);
    if (res.status === 404) {
      // Stream doesn't exist = offline
      state = {
        ...state,
        info: { ...state.info, online: false, viewerCount: 0, tracks: {}, createdTime: null },
        isLoading: false,
        error: null,
      };
      notify();
      return;
    }
    if (!res.ok) throw new Error(`OME API ${res.status}`);

    const data = await res.json();
    const stream = data.response;

    // Parse tracks
    const tracks: StreamInfo['tracks'] = {};
    if (stream?.input?.tracks) {
      for (const t of stream.input.tracks) {
        if (t.type === 'Video' && t.video) tracks.video = t.video;
        if (t.type === 'Audio' && t.audio) tracks.audio = t.audio;
      }
    }

    // Get viewer count from stats
    let viewerCount = 0;
    try {
      const statsRes = await fetch(`${OME_API_BASE}/v1/stats/current/vhosts/${VHOST}/apps/${APP}/streams/${STREAM}`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const conn = statsData.response?.connections;
        if (conn) {
          viewerCount = (conn.webrtc || 0) + (conn.llhls || 0) + (conn.hls || 0);
        }
      }
    } catch { /* stats optional */ }

    state = {
      info: {
        online: true,
        name: stream?.name || STREAM,
        viewerCount,
        tracks,
        createdTime: stream?.input?.createdTime || null,
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
    info: { online: false, name: '', viewerCount: 0, tracks: {}, createdTime: null },
    isLoading: false,
    error: null,
  };
  notify();
}
