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
import { shortenNpub, npubEncode } from '../../nostr/utils';
import { ThemeSelector } from '../ThemeSelector';
import { StreamTab } from './StreamTab';
import { NostrSettingsTab } from './NostrSettingsTab';

type AdminTab = 'stream' | 'nostr';

interface AdminPageState {
  activeTab: AdminTab;
  authenticated: boolean;
  authChecking: boolean;
  streamKeyInput: string;
  streamKey: string;
}

export class AdminPage extends Component<{}, AdminPageState> {
  private unsubAuth: (() => void) | null = null;
  private lastPubkey: string | null = null;

  state: AdminPageState = {
    activeTab: 'stream',
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

    discoverIndexers(10).catch((err) =>
      console.warn('[live-admin] Indexer discovery error:', err)
    );
    discoverBroadcastRelays(20);

    restoreSession();
    this.updateAuthSigner();
    this.unsubAuth = subscribeAuth(() => this.onAuthChange());
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
      bootstrapUser(auth.pubkey).catch((err) =>
        console.warn('[live-admin] Bootstrap error:', err)
      );
      // Auto-authenticate if Nostr identity is present
      this.setState({ authenticated: true, authChecking: false });
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

        {/* Tab bar */}
        <div class="border-b border-border bg-card px-4">
          <div class="flex gap-1">
            {(['stream', 'nostr'] as AdminTab[]).map((tab) => (
              <button
                key={tab}
                class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => this.setState({ activeTab: tab })}
              >
                {tab === 'stream' ? 'Stream' : 'Nostr Identity'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div class="flex-1 overflow-y-auto p-6">
          <div class="max-w-4xl mx-auto">
            {activeTab === 'stream' && <StreamTab />}
            {activeTab === 'nostr' && <NostrSettingsTab />}
          </div>
        </div>

        <Toaster />
      </div>
    );
  }
}
