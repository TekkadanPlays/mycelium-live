import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button, Input, Badge } from 'blazecn';
import { getLiveChatState, subscribeLiveChat, sendLiveChatMessage } from '../nostr/stores/livechat';
import { getLiveEventState, subscribeLiveEvents } from '../nostr/stores/liveevents';
import { getAuthState } from '../nostr/stores/auth';
import { shortenNpub, npubEncode } from '../nostr/utils';
import type { LiveChatMessage } from '../nostr/stores/livechat';

type ChatTab = 'nostr' | 'irc';

const USER_COLORS = [
  '#c084fc', '#f472b6', '#fb923c', '#facc15', '#4ade80',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f87171', '#34d399',
];

function pubkeyColor(pubkey: string): string {
  let hash = 0;
  for (let i = 0; i < pubkey.length; i++) {
    hash = ((hash << 5) - hash + pubkey.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

interface ChatState {
  activeTab: ChatTab;
  nostrMessages: LiveChatMessage[];
  nostrConnected: boolean;
  nostrSending: boolean;
  liveEventActive: boolean;
  input: string;
  pubkey: string | null;
}

export class ChatContainer extends Component<{}, ChatState> {
  private messagesEndRef: HTMLDivElement | null = null;
  private unsubChat: (() => void) | null = null;
  private unsubLive: (() => void) | null = null;

  state: ChatState = {
    activeTab: 'nostr',
    nostrMessages: getLiveChatState().messages,
    nostrConnected: getLiveChatState().connected,
    nostrSending: getLiveChatState().sending,
    liveEventActive: !!getLiveEventState().currentEvent,
    input: '',
    pubkey: getAuthState().pubkey,
  };

  componentDidMount() {
    this.unsubChat = subscribeLiveChat(() => {
      const cs = getLiveChatState();
      this.setState({
        nostrMessages: cs.messages,
        nostrConnected: cs.connected,
        nostrSending: cs.sending,
      });
    });
    this.unsubLive = subscribeLiveEvents(() => {
      this.setState({ liveEventActive: !!getLiveEventState().currentEvent });
    });
  }

  componentWillUnmount() {
    this.unsubChat?.();
    this.unsubLive?.();
  }

  componentDidUpdate(_prevProps: {}, prevState: ChatState) {
    if (prevState.nostrMessages.length !== this.state.nostrMessages.length) {
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    this.messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
  }

  private handleInput = (e: Event) => {
    this.setState({ input: (e.target as HTMLInputElement).value });
  };

  private handleSend = async () => {
    const body = this.state.input.trim();
    if (!body) return;

    if (this.state.activeTab === 'nostr') {
      this.setState({ input: '' });
      await sendLiveChatMessage(body);
    }
    // IRC send will be wired later
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  };

  private setTab = (tab: ChatTab) => {
    this.setState({ activeTab: tab });
  };

  private formatTime(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private renderNostrChat() {
    const { nostrMessages, nostrConnected, liveEventActive, pubkey } = this.state;

    if (!liveEventActive) {
      return (
        <div class="flex-1 flex items-center justify-center p-4">
          <div class="text-center space-y-2">
            <svg class="size-8 text-muted-foreground/30 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
            <p class="text-xs text-muted-foreground">No active broadcast</p>
            <p class="text-[10px] text-muted-foreground/50">Chat opens when the host broadcasts to Nostr</p>
          </div>
        </div>
      );
    }

    return (
      <div class="flex-1 overflow-y-auto">
        {nostrMessages.length === 0 && (
          <div class="px-3 py-6 text-center">
            <p class="text-xs text-muted-foreground/50">No messages yet. Be the first!</p>
          </div>
        )}
        {nostrMessages.map((msg) => (
          <div key={msg.id} class="px-3 py-1.5 hover:bg-accent/30 transition-colors">
            <div class="flex items-baseline gap-1.5">
              <span class="text-[12px] font-bold truncate max-w-[120px]" style={{ color: pubkeyColor(msg.pubkey) }}>
                {shortenNpub(npubEncode(msg.pubkey))}
              </span>
              <span class="text-[10px] text-muted-foreground/40 tabular-nums">{this.formatTime(msg.created_at)}</span>
            </div>
            <p class="text-[13px] text-foreground/90 leading-relaxed break-words mt-0.5">{msg.content}</p>
          </div>
        ))}
        <div ref={(el: HTMLDivElement | null) => { this.messagesEndRef = el; }} />
      </div>
    );
  }

  private renderIrcChat() {
    return (
      <div class="flex-1 flex items-center justify-center p-4">
        <div class="text-center space-y-2">
          <svg class="size-8 text-muted-foreground/30 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" />
          </svg>
          <p class="text-xs text-muted-foreground">IRC Chat</p>
          <p class="text-[10px] text-muted-foreground/50">Powered by Ergo — coming soon</p>
          <p class="text-[10px] text-muted-foreground/50">Connect via Hyphae at chat.mycelium.social</p>
        </div>
      </div>
    );
  }

  render() {
    const { activeTab, input, nostrSending, liveEventActive, nostrConnected, pubkey } = this.state;

    const canSend = activeTab === 'nostr' && liveEventActive && pubkey && input.trim() && !nostrSending;

    return (
      <div class="flex flex-col h-full">
        {/* Tab bar */}
        <div class="h-10 shrink-0 border-b border-border flex items-center px-1 gap-0.5">
          <button
            class={`flex-1 h-8 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'nostr'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
            onClick={() => this.setTab('nostr')}
          >
            <span class="flex items-center justify-center gap-1.5">
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12l2 2 4-4" />
              </svg>
              Nostr
              {liveEventActive && nostrConnected && (
                <span class="size-1.5 rounded-full bg-green-500" />
              )}
            </span>
          </button>
          <button
            class={`flex-1 h-8 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'irc'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
            onClick={() => this.setTab('irc')}
          >
            <span class="flex items-center justify-center gap-1.5">
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" />
              </svg>
              IRC
            </span>
          </button>
        </div>

        {/* Chat content */}
        {activeTab === 'nostr' ? this.renderNostrChat() : this.renderIrcChat()}

        {/* Input — only for nostr tab when broadcast is active */}
        {activeTab === 'nostr' && liveEventActive && pubkey && (
          <div class="shrink-0 border-t border-border p-2">
            <div class="flex gap-1.5">
              <Input
                value={input}
                onInput={this.handleInput}
                onKeyDown={this.handleKeyDown}
                placeholder="Send a message..."
                className="text-sm h-8"
                disabled={nostrSending}
              />
              <Button size="sm" onClick={this.handleSend} disabled={!canSend} className="h-8 px-3">
                {nostrSending ? (
                  <svg class="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Sign in prompt for nostr tab */}
        {activeTab === 'nostr' && liveEventActive && !pubkey && (
          <div class="shrink-0 border-t border-border p-2">
            <p class="text-[11px] text-muted-foreground text-center">Sign in to chat</p>
          </div>
        )}
      </div>
    );
  }
}
