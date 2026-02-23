import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { cn } from 'blazecn';
import { getAuthState, subscribeAuth } from '../nostr/stores/auth';
import { isAllowedStreamer, subscribeStreamers } from '../stores/streamers';
import { isDarkMode, toggleDarkMode, subscribeTheme } from '../stores/theme';

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface HeaderState {
  pubkey: string | null;
  allowed: boolean;
  dark: boolean;
}

export class Header extends Component<HeaderProps, HeaderState> {
  private unsubAuth: (() => void) | null = null;
  private unsubStreamers: (() => void) | null = null;
  private unsubTheme: (() => void) | null = null;

  state: HeaderState = {
    pubkey: getAuthState().pubkey,
    allowed: isAllowedStreamer(getAuthState().pubkey),
    dark: isDarkMode(),
  };

  componentDidMount() {
    this.unsubAuth = subscribeAuth(() => {
      const auth = getAuthState();
      this.setState({
        pubkey: auth.pubkey,
        allowed: isAllowedStreamer(auth.pubkey),
      });
    });
    this.unsubStreamers = subscribeStreamers(() => {
      this.setState({ allowed: isAllowedStreamer(this.state.pubkey) });
    });
    this.unsubTheme = subscribeTheme(() => {
      this.setState({ dark: isDarkMode() });
    });
  }

  componentWillUnmount() {
    this.unsubAuth?.();
    this.unsubStreamers?.();
    this.unsubTheme?.();
  }

  render() {
    const { currentPage, onNavigate } = this.props;
    const { allowed, dark } = this.state;

    return (
      <header class="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo / Home */}
          <button
            class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onNavigate('watch')}
          >
            <span class="text-lg">🍄</span>
            <span class="text-base font-bold text-foreground tracking-tight">Mycelium Live</span>
          </button>

          {/* Nav */}
          <nav class="flex items-center gap-1">
            <button
              class={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer',
                currentPage === 'watch'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
              onClick={() => onNavigate('watch')}
            >
              Watch
            </button>

            {allowed && (
              <button
                class={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer',
                  currentPage === 'admin'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
                onClick={() => onNavigate('admin')}
              >
                Broadcast
              </button>
            )}

            {/* Theme toggle */}
            <button
              class="ml-2 p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => toggleDarkMode()}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" /><path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" /><path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              )}
            </button>
          </nav>
        </div>
      </header>
    );
  }
}
