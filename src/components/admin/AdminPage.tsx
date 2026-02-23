import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { cn } from 'blazecn';
import { getAuthState, subscribeAuth, login } from '../../nostr/stores/auth';
import { isAllowedStreamer, subscribeStreamers } from '../../stores/streamers';
import { BroadcastConfigTab } from './BroadcastConfigTab';
import { NostrSettingsTab } from './NostrSettingsTab';

interface AdminPageState {
  activeTab: 'broadcast' | 'nostr';
  pubkey: string | null;
  allowed: boolean;
}

export class AdminPage extends Component<{}, AdminPageState> {
  private unsubAuth: (() => void) | null = null;
  private unsubStreamers: (() => void) | null = null;

  state: AdminPageState = {
    activeTab: 'broadcast',
    pubkey: getAuthState().pubkey,
    allowed: isAllowedStreamer(getAuthState().pubkey),
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
  }

  componentWillUnmount() {
    this.unsubAuth?.();
    this.unsubStreamers?.();
  }

  render() {
    const { activeTab, pubkey, allowed } = this.state;

    // Gate: must be logged in and allowed
    if (!pubkey) {
      return (
        <div class="max-w-lg mx-auto px-4 py-16 text-center">
          <h1 class="text-2xl font-bold text-foreground mb-3">Broadcaster Settings</h1>
          <p class="text-sm text-muted-foreground mb-6">
            Sign in with your Nostr identity to access broadcast configuration.
          </p>
          <button
            class="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={() => login()}
          >
            Connect with Nostr
          </button>
          <p class="text-xs text-muted-foreground mt-3">
            Requires a NIP-07 browser extension (nos2x-fox, Alby, etc.) or Amber on Android.
          </p>
        </div>
      );
    }

    if (!allowed) {
      return (
        <div class="max-w-lg mx-auto px-4 py-16 text-center">
          <h1 class="text-2xl font-bold text-foreground mb-3">Access Denied</h1>
          <p class="text-sm text-muted-foreground">
            Your Nostr identity is not in the allowed streamers list for this server.
          </p>
        </div>
      );
    }

    const tabs = [
      { id: 'broadcast' as const, label: 'Broadcast' },
      { id: 'nostr' as const, label: 'Nostr Settings' },
    ];

    return (
      <div class="min-h-screen bg-background">
        {/* Tab bar */}
        <div class="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
          <div class="max-w-3xl mx-auto px-4">
            <div class="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  class={cn(
                    'relative px-4 py-3 text-sm font-medium transition-colors cursor-pointer',
                    'hover:text-foreground',
                    activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  onClick={() => this.setState({ activeTab: tab.id })}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div class="max-w-3xl mx-auto px-4 py-6">
          {activeTab === 'broadcast' && <BroadcastConfigTab />}
          {activeTab === 'nostr' && <NostrSettingsTab />}
        </div>
      </div>
    );
  }
}
