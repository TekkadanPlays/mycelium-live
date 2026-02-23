import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Spinner, Toaster } from 'blazecn';
import { getAuthState, subscribeAuth, login, logout, restoreSession, resetAllStores } from '../../nostr/stores/auth';
import { loadRelayManager, syncPoolToActiveProfile } from '../../nostr/stores/relaymanager';
import { discoverIndexers } from '../../nostr/stores/indexers';
import { connectRelays, getPool } from '../../nostr/stores/relay';
import { bootstrapUser } from '../../nostr/stores/bootstrap';
import { signWithExtension, hasNip07 } from '../../nostr/nip07';
import { loadLiveEventsEnabled } from '../../nostr/stores/liveevents';
import { discoverBroadcastRelays } from '../../nostr/stores/broadcast';
import { initTheme } from '../../stores/theme';
import { fetchAllowedStreamers, isAllowedStreamer, subscribeStreamers } from '../../stores/streamers';
import { shortenNpub, npubEncode } from '../../nostr/utils';
import { ThemeSelector } from '../ThemeSelector';
import { DashboardTab } from './DashboardTab';
import { StreamTab } from './StreamTab';
import { NostrSettingsTab } from './NostrSettingsTab';
import { BroadcastConfigTab } from './BroadcastConfigTab';
import { loadBroadcastConfig } from '../../stores/broadcastconfig';
import { startPolling, stopPolling } from '../../stores/stream';
import { pushProfileToServer } from '../../stores/streamerprofile';
import { getBootstrapState, subscribeBootstrap } from '../../nostr/stores/bootstrap';

type AdminTab = 'dashboard' | 'stream' | 'broadcast' | 'nostr';

const TAB_META: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25' },
  { id: 'broadcast', label: 'NIP-53 Event', icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10' },
  { id: 'stream', label: 'Stream Config', icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75' },
  { id: 'nostr', label: 'Nostr Identity', icon: 'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z' },
];

function getInitialTab(): AdminTab {
  const hash = window.location.hash.replace('#', '') as AdminTab;
  if (TAB_META.some((t) => t.id === hash)) return hash;
  return 'dashboard';
}

interface AdminPageState {
  activeTab: AdminTab;
  authenticated: boolean;
  authChecking: boolean;
  streamKeyInput: string;
  streamKey: string;
}

export class AdminPage extends Component<{}, AdminPageState> {
  private unsubAuth: (() => void) | null = null;
  private unsubStreamers: (() => void) | null = null;
  private lastPubkey: string | null = null;

  state: AdminPageState = {
    activeTab: getInitialTab(),
    authenticated: false,
    authChecking: true,
    streamKeyInput: '',
    streamKey: localStorage.getItem('mycelium_stream_key') || '',
  };

  componentDidMount() {
    initTheme();

    // Initialize Nostr identity system
    loadRelayManager();
    syncPoolToActiveProfile();
    loadLiveEventsEnabled();
    loadBroadcastConfig();
    startPolling(5000);

    discoverIndexers(10).catch((err) =>
      console.warn('[live-admin] Indexer discovery error:', err)
    );
    discoverBroadcastRelays(20);

    restoreSession();
    this.updateAuthSigner();
    this.unsubAuth = subscribeAuth(() => this.onAuthChange());
    this.unsubStreamers = subscribeStreamers(() => this.onAuthChange());
    fetchAllowedStreamers();
    connectRelays().then(() => {
      this.onAuthChange();
    }).catch((err) => console.warn('[live-admin] Relay connect error:', err));

    // Check if we have a stored stream key
    if (this.state.streamKey) {
      this.setState({ authenticated: true, authChecking: false });
    } else {
      this.setState({ authChecking: false });
    }
  }

  componentWillUnmount() {
    this.unsubAuth?.();
    this.unsubStreamers?.();
    stopPolling();
  }

  private updateAuthSigner() {
    const auth = getAuthState();
    const pool = getPool();
    if (auth.pubkey) {
      pool.setAuthSigner((unsigned) => signWithExtension(unsigned));
    } else {
      pool.setAuthSigner(null);
    }
  }

  private onAuthChange() {
    const auth = getAuthState();
    this.updateAuthSigner();

    if (auth.pubkey && this.lastPubkey && auth.pubkey !== this.lastPubkey) {
      resetAllStores();
    }
    this.lastPubkey = auth.pubkey;

    if (auth.pubkey) {
      bootstrapUser(auth.pubkey)
        .then(() => {
          // Push profile to server cache so viewers see the streamer's pfp
          const bs = getBootstrapState();
          if (bs.profile && isAllowedStreamer(auth.pubkey!)) {
            pushProfileToServer(auth.pubkey!, bs.profile);
          }
        })
        .catch((err) =>
          console.warn('[live-admin] Bootstrap error:', err)
        );
      // Only authenticate if this pubkey is an allowed streamer
      if (isAllowedStreamer(auth.pubkey)) {
        this.setState({ authenticated: true, authChecking: false });
      } else {
        this.setState({ authenticated: false, authChecking: false });
      }
    }
  }

  private handleStreamKeyLogin = () => {
    const key = this.state.streamKeyInput.trim();
    if (!key) return;
    localStorage.setItem('mycelium_stream_key', key);
    this.setState({ streamKey: key, authenticated: true, streamKeyInput: '' });
  };

  private handleNostrLogin = () => {
    if (hasNip07()) login();
  };

  render() {
    const { activeTab, authenticated, authChecking, streamKeyInput } = this.state;
    const auth = getAuthState();
    const npub = auth.pubkey ? shortenNpub(npubEncode(auth.pubkey)) : null;

    // Auth gate
    if (authChecking) {
      return (
        <div class="flex items-center justify-center min-h-screen bg-background">
          <Spinner />
        </div>
      );
    }

    if (!authenticated) {
      return (
        <div class="flex items-center justify-center min-h-screen bg-background">
          <Card className="max-w-sm w-full mx-4">
            <CardHeader>
              <CardTitle>Mycelium Live Admin</CardTitle>
              <CardDescription>Sign in to manage your stream</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nostr login */}
              <Button className="w-full" onClick={this.handleNostrLogin} disabled={!hasNip07()}>
                <svg class="size-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                </svg>
                Sign in with Nostr
              </Button>

              <div class="section-divider" />

              {/* Stream key login */}
              <div class="space-y-2">
                <label class="text-sm text-muted-foreground">Or enter stream key:</label>
                <div class="flex gap-2">
                  <Input
                    type="password"
                    value={streamKeyInput}
                    onInput={(e: Event) => this.setState({ streamKeyInput: (e.target as HTMLInputElement).value })}
                    onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') this.handleStreamKeyLogin(); }}
                    placeholder="Stream key"
                    className="flex-1"
                  />
                  <Button onClick={this.handleStreamKeyLogin} disabled={!streamKeyInput.trim()}>Go</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    const setTab = (tab: AdminTab | string) => {
      const t = tab as AdminTab;
      window.location.hash = t;
      this.setState({ activeTab: t });
    };

    // Authenticated admin UI
    return (
      <div class="flex flex-col h-screen bg-background">
        {/* Admin header */}
        <header class="h-14 shrink-0 border-b border-border bg-card flex items-center px-4 gap-3">
          <a href="/" target="_self" class="flex items-center gap-2 no-underline">
            <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg class="size-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            </div>
            <span class="text-sm font-semibold tracking-tight">Mycelium Live</span>
          </a>
          <Badge variant="secondary" className="text-[10px]">Admin</Badge>

          <div class="flex-1" />

          {npub && <span class="text-xs text-muted-foreground font-mono hidden md:inline">{npub}</span>}
          <ThemeSelector />
          <Button variant="ghost" size="sm" onClick={() => { logout(); localStorage.removeItem('mycelium_stream_key'); this.setState({ authenticated: false }); }}>
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </Button>
        </header>

        {/* Mobile tab bar */}
        <div class="md:hidden border-b border-border bg-card px-2 shrink-0 overflow-x-auto">
          <div class="flex gap-0.5">
            {TAB_META.map((tab) => (
              <button
                key={tab.id}
                class={`px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground'
                }`}
                onClick={() => setTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div class="flex flex-1 min-h-0">
          {/* Sidebar — desktop */}
          <nav class="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card py-3 px-2 gap-0.5">
            {TAB_META.map((tab) => (
              <button
                key={tab.id}
                class={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                onClick={() => setTab(tab.id)}
              >
                <svg class="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}

            <div class="flex-1" />
            <a href="/" target="_self" class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 no-underline">
              <svg class="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              Back to Stream
            </a>
          </nav>

          {/* Tab content */}
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-4xl mx-auto">
              {activeTab === 'dashboard' && <DashboardTab onNavigate={setTab} />}
              {activeTab === 'stream' && <StreamTab />}
              {activeTab === 'broadcast' && <BroadcastConfigTab />}
              {activeTab === 'nostr' && <NostrSettingsTab />}
            </div>
          </div>
        </div>

        <Toaster />
      </div>
    );
  }
}
