import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button, Badge } from 'blazecn';
import { getAuthState, subscribeAuth, login, logout } from '../nostr/stores/auth';
import { hasNip07 } from '../nostr/nip07';
import { shortenNpub, npubEncode } from '../nostr/utils';
import { ThemeSelector } from './ThemeSelector';
import { onStreamStart, onStreamEnd, getLiveEventState, subscribeLiveEvents } from '../nostr/stores/liveevents';

interface HeaderProps {
  online: boolean;
  viewerCount: number;
  streamName: string;
  chatVisible: boolean;
  onToggleChat: () => void;
}

interface HeaderState {
  pubkey: string | null;
  authLoading: boolean;
  liveEventActive: boolean;
  liveEventPublishing: boolean;
}

export class Header extends Component<HeaderProps, HeaderState> {
  private unsubAuth: (() => void) | null = null;
  private unsubLive: (() => void) | null = null;

  state: HeaderState = {
    pubkey: getAuthState().pubkey,
    authLoading: getAuthState().isLoading,
    liveEventActive: !!getLiveEventState().currentEvent,
    liveEventPublishing: getLiveEventState().isPublishing,
  };

  componentDidMount() {
    this.unsubAuth = subscribeAuth(() => {
      const auth = getAuthState();
      this.setState({ pubkey: auth.pubkey, authLoading: auth.isLoading });
    });
    this.unsubLive = subscribeLiveEvents(() => {
      const le = getLiveEventState();
      this.setState({ liveEventActive: !!le.currentEvent, liveEventPublishing: le.isPublishing });
    });
  }

  componentWillUnmount() {
    this.unsubAuth?.();
    this.unsubLive?.();
  }

  private handleLogin = () => {
    if (hasNip07()) {
      login();
    }
  };

  private handleLogout = () => {
    logout();
  };

  private handleBroadcast = () => {
    const le = getLiveEventState();
    if (le.currentEvent) {
      onStreamEnd();
    } else {
      onStreamStart(this.props.streamName || 'Live Stream', 0);
    }
  };

  render() {
    const { online, viewerCount, streamName, chatVisible, onToggleChat } = this.props;
    const { pubkey, authLoading, liveEventActive, liveEventPublishing } = this.state;
    const npub = pubkey ? shortenNpub(npubEncode(pubkey)) : null;

    return (
      <header class="h-14 shrink-0 border-b border-border bg-card flex items-center px-4 gap-3">
        {/* Logo / Brand */}
        <a href="/" class="flex items-center gap-2 no-underline" target="_self">
          <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg class="size-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
          </div>
          <span class="text-sm font-semibold tracking-tight hidden sm:inline">Mycelium Live</span>
        </a>

        {/* Stream status */}
        <div class="flex items-center gap-2 ml-2">
          {online ? (
            <Badge variant="default" className="gap-1.5 text-[10px] uppercase tracking-wider font-bold">
              <span class="size-1.5 rounded-full bg-current live-dot" />
              Live
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Offline</Badge>
          )}
          {online && streamName && (
            <span class="text-xs text-muted-foreground hidden md:inline truncate max-w-[200px]">{streamName}</span>
          )}
        </div>

        {/* Viewer count */}
        {online && viewerCount > 0 && (
          <div class="flex items-center gap-1 text-xs text-muted-foreground">
            <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 0 1 3.24 17.6a4.125 4.125 0 0 1 7.533-2.493M15 19.128a9.38 9.38 0 0 1-2.625.372m0 0a9.337 9.337 0 0 1-4.121-.952" />
            </svg>
            {viewerCount}
          </div>
        )}

        <div class="flex-1" />

        {/* Broadcast to Nostr button */}
        {online && pubkey && (
          <Button
            variant={liveEventActive ? 'destructive' : 'default'}
            size="sm"
            onClick={this.handleBroadcast}
            disabled={liveEventPublishing}
            className="gap-1.5 text-xs"
          >
            {liveEventPublishing ? (
              <span>Publishing...</span>
            ) : liveEventActive ? (
              <span class="flex items-center gap-1.5"><svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 0 1 12.728 12.728M5.636 5.636 18.364 18.364" /></svg>End Broadcast</span>
            ) : (
              <span class="flex items-center gap-1.5"><svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788" /></svg>Broadcast to Nostr</span>
            )}
          </Button>
        )}

        {/* Theme selector */}
        <ThemeSelector />

        {/* Chat toggle */}
        <Button variant="ghost" size="sm" onClick={onToggleChat} className="hidden md:flex gap-1.5">
          <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          <span class="text-xs">{chatVisible ? 'Hide' : 'Chat'}</span>
        </Button>

        {/* Auth */}
        {pubkey ? (
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground font-mono hidden lg:inline">{npub}</span>
            <Button variant="ghost" size="sm" onClick={this.handleLogout}>
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={this.handleLogin} disabled={authLoading}>
            {authLoading ? 'Connecting...' : 'Sign In'}
          </Button>
        )}

        {/* Admin link */}
        <a href="/admin" target="_self">
          <Button variant="ghost" size="sm">
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </Button>
        </a>
      </header>
    );
  }
}
