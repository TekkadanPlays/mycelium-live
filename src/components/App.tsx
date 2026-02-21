import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Spinner, Button, Card, CardContent, Toaster } from 'blazecn';
import { Header } from './Header';
import { VideoPlayer } from './VideoPlayer';
import { StreamInfoPanel } from './StreamInfoPanel';
import { OfflineBanner } from './OfflineBanner';
import { ChatContainer } from './ChatContainer';
import { getAuthState, subscribeAuth, restoreSession, resetAllStores } from '../nostr/stores/auth';
import { bootstrapUser } from '../nostr/stores/bootstrap';
import { discoverIndexers } from '../nostr/stores/indexers';
import { loadLiveEventsEnabled } from '../nostr/stores/liveevents';
import { initTheme } from '../stores/theme';
import { getStreamState, subscribeStream, startPolling, stopPolling } from '../stores/stream';
import type { StreamInfo } from '../stores/stream';

interface AppState {
  loading: boolean;
  error: string | null;
  stream: StreamInfo;
  chatVisible: boolean;
  isMobile: boolean;
}

export class App extends Component<{}, AppState> {
  private unsubAuth: (() => void) | null = null;
  private unsubStream: (() => void) | null = null;
  private lastPubkey: string | null = null;

  state: AppState = {
    loading: true,
    error: null,
    stream: getStreamState().info,
    chatVisible: true,
    isMobile: window.innerWidth <= 768,
  };

  private onAuthChange() {
    const auth = getAuthState();

    if (auth.pubkey && this.lastPubkey && auth.pubkey !== this.lastPubkey) {
      resetAllStores();
    }
    this.lastPubkey = auth.pubkey;

    if (auth.pubkey) {
      // Only fetch profile metadata from indexers — do NOT connect to
      // outbox/inbox relays here. Those connections trigger NIP-42 AUTH
      // challenges which cause unwanted signer extension popups.
      // Relay connections for NIP-53 publishing happen on-demand when
      // the user clicks "Broadcast to Nostr".
      bootstrapUser(auth.pubkey).catch((err) =>
        console.warn('[live] Bootstrap error:', err)
      );
    }
  }

  componentDidMount() {
    initTheme();

    // Initialize Nostr identity system (lightweight — no relay connections)
    this.unsubAuth = subscribeAuth(() => this.onAuthChange());
    loadLiveEventsEnabled();

    discoverIndexers(10).catch((err) =>
      console.warn('[live] Indexer discovery error:', err)
    );

    restoreSession();
    this.onAuthChange();

    // Start polling OME for stream status
    this.unsubStream = subscribeStream(() => {
      const s = getStreamState();
      this.setState({
        loading: s.isLoading && !s.info.online,
        error: s.error,
        stream: s.info,
      });
    });
    startPolling(5000);

    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    this.unsubAuth?.();
    this.unsubStream?.();
    stopPolling();
    window.removeEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    this.setState({ isMobile: window.innerWidth <= 768 });
  };

  private toggleChat = () => {
    this.setState({ chatVisible: !this.state.chatVisible });
  };

  render() {
    const { loading, error, stream, chatVisible, isMobile } = this.state;

    if (error && !stream.online) {
      return (
        <div class="flex items-center justify-center min-h-screen bg-background">
          <Card className="max-w-sm w-full mx-4 text-center">
            <CardContent className="pt-6">
              <div class="size-12 rounded-lg bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <svg class="size-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h2 class="text-lg font-semibold mb-2">Unable to connect</h2>
              <p class="text-sm text-muted-foreground mb-6">{error}</p>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    const showChat = chatVisible && !isMobile;

    return (
      <div class="flex flex-col h-screen bg-background">
        <Header
          online={stream.online}
          viewerCount={0}
          streamName={stream.name}
          chatVisible={chatVisible}
          onToggleChat={this.toggleChat}
        />
        <div class="flex flex-1 min-h-0">
          {/* Main content column */}
          <div class="flex flex-col flex-1 overflow-y-auto">
            {stream.online ? (
              <VideoPlayer online={stream.online} title={stream.name} />
            ) : (
              <OfflineBanner />
            )}
            <StreamInfoPanel
              online={stream.online}
              streamName={stream.name}
              viewerCount={0}
            />
            <div class="flex-1" />
          </div>
          {/* Chat sidebar */}
          {showChat && (
            <div class="w-[340px] shrink-0 border-l border-border bg-card">
              <ChatContainer />
            </div>
          )}
        </div>
        <Toaster />
      </div>
    );
  }
}
