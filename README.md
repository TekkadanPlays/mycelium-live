# Mycelium Live

Sub-second latency live streaming platform powered by [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine) with a Nostr-native frontend.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              live.mycelium.social                │
├─────────────────────────────────────────────────┤
│                                                 │
│  OvenMediaEngine          Bun Middleware         │
│  ├─ RTMP ingest (:1935)   ├─ Serves Inferno SPA │
│  ├─ SRT ingest (:9999)    ├─ Proxies OME API    │
│  ├─ LLHLS out (:3333)     ├─ Admission webhook  │
│  ├─ WebRTC out (:3333)    ├─ NIP-53 live events │
│  └─ REST API (:8081)      └─ Stream key auth    │
│                                                 │
│  Inferno Frontend (Blazecn UI)                  │
│  ├─ Viewer: LLHLS/WebRTC player + chat sidebar  │
│  ├─ Admin: stream config, Nostr identity        │
│  └─ Nostr: relay manager, live event broadcast  │
│                                                 │
│  ergo IRC (future)                              │
│  └─ Public channel per stream → chat UI         │
└─────────────────────────────────────────────────┘
```

## Features

- **Sub-second latency** via WebRTC, ~2-3s via LLHLS
- **RTMP + SRT ingest** — works with OBS, ffmpeg, any encoder
- **Adaptive bitrate** — automatic ABR for LLHLS and WebRTC
- **NIP-53 live events** — broadcasts stream status to Nostr relays
- **Nostr identity** — NIP-07 browser extension login
- **Relay manager** — outbox/inbox/broadcast relay profiles with NIP-65 discovery
- **Theme system** — 20 color themes, dark/light mode, shared across Mycelium ecosystem
- **Chat placeholder** — UI ready, will connect to ergo IRC server

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) runtime
- [Docker](https://docker.com) (for OvenMediaEngine)

### Development

```bash
# Install dependencies
bun install

# Build frontend
bun run build

# Start dev server (serves SPA, proxies OME API)
bun run server.ts
```

### Production (Docker)

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Start OvenMediaEngine + web server
docker compose up -d
```

### Broadcasting

Configure your encoder (OBS, ffmpeg, etc.):

| Protocol | URL |
|----------|-----|
| **RTMP** | `rtmp://your-server:1935/app` |
| **SRT**  | `srt://your-server:9999?streamid=srt://default/app/stream` |
| **Stream Key** | `stream` |

### Viewing

| Protocol | URL |
|----------|-----|
| **Web Player** | `https://your-server:8080` |
| **LLHLS** | `https://your-server:3333/app/stream/llhls.m3u8` |
| **WebRTC** | `wss://your-server:3333/app/stream` |

## Project Structure

```
live/
├── src/
│   ├── main.tsx                 # Entry point (viewer vs admin routing)
│   ├── index.css                # Tailwind v4 + theme tokens
│   ├── components/
│   │   ├── App.tsx              # Viewer: player + chat + header
│   │   ├── Header.tsx           # Top bar: status, auth, theme
│   │   ├── VideoPlayer.tsx      # LLHLS/WebRTC player with controls
│   │   ├── OfflineBanner.tsx    # Shown when stream is offline
│   │   ├── ChatContainer.tsx    # Chat placeholder (future IRC)
│   │   ├── ThemeSelector.tsx    # Color theme + dark mode picker
│   │   └── admin/
│   │       ├── AdminPage.tsx    # Admin shell with auth gate
│   │       ├── StreamTab.tsx    # Stream status + config URLs
│   │       └── NostrSettingsTab.tsx  # Nostr identity + relay manager
│   ├── nostr/                   # Full Nostr library (shared with Mycelium)
│   │   ├── event.ts, filter.ts, relay.ts, pool.ts, ...
│   │   ├── nip07.ts, nip53.ts, nip55.ts
│   │   └── stores/             # Reactive stores
│   │       ├── auth.ts, bootstrap.ts, broadcast.ts
│   │       ├── indexers.ts, liveevents.ts, profiles.ts
│   │       ├── relay.ts, relaymanager.ts
│   │       └── index.ts
│   └── stores/
│       ├── theme.ts             # Theme persistence
│       └── stream.ts            # OME stream status polling
├── server.ts                    # Bun middleware server
├── build.ts                     # Bun build script
├── ome-conf/
│   ├── Server.xml               # OvenMediaEngine configuration
│   └── Logger.xml
├── docker-compose.yml           # OME + web containers
├── Dockerfile                   # Web server container
└── package.json
```

## Tech Stack

- **Media Server**: OvenMediaEngine (C++) — RTMP/SRT/WebRTC/LLHLS
- **Frontend**: InfernoJS + Blazecn UI + Tailwind CSS v4
- **Server**: Bun (TypeScript) — static files + API proxy
- **Identity**: Nostr (NIP-07, NIP-53, NIP-65)
- **Chat**: ergo IRC (planned)

## License

Part of the Mycelium ecosystem.
