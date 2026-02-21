import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button, Input } from 'blazecn';

// Chat placeholder — will be wired to ergo IRC later

interface ChatMessage {
  id: string;
  user: string;
  body: string;
  timestamp: number;
  color: string;
}

const USER_COLORS = [
  '#c084fc', '#f472b6', '#fb923c', '#facc15', '#4ade80',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f87171', '#34d399',
];

interface ChatState {
  messages: ChatMessage[];
  input: string;
}

export class ChatContainer extends Component<{}, ChatState> {
  private messagesEndRef: HTMLDivElement | null = null;

  state: ChatState = {
    messages: [
      {
        id: '1',
        user: 'System',
        body: 'Chat will be powered by IRC (ergo). Not yet connected.',
        timestamp: Date.now(),
        color: '#a78bfa',
      },
    ],
    input: '',
  };

  private scrollToBottom() {
    this.messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
  }

  componentDidUpdate(_prevProps: {}, prevState: ChatState) {
    if (prevState.messages.length !== this.state.messages.length) {
      this.scrollToBottom();
    }
  }

  private handleInput = (e: Event) => {
    this.setState({ input: (e.target as HTMLInputElement).value });
  };

  private handleSend = () => {
    const body = this.state.input.trim();
    if (!body) return;
    // Placeholder: just echo locally until IRC is wired
    const msg: ChatMessage = {
      id: String(Date.now()),
      user: 'You',
      body,
      timestamp: Date.now(),
      color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
    };
    this.setState({
      messages: [...this.state.messages, msg],
      input: '',
    });
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  };

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    const { messages, input } = this.state;

    return (
      <div class="flex flex-col h-full">
        {/* Header */}
        <div class="h-10 shrink-0 border-b border-border flex items-center px-3 gap-2">
          <svg class="size-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          <span class="text-xs font-medium text-muted-foreground">Chat</span>
          <span class="text-[10px] text-muted-foreground/50 ml-auto">IRC (coming soon)</span>
        </div>

        {/* Messages */}
        <div class="flex-1 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} class="px-3 py-1.5 hover:bg-accent/30 transition-colors animate-msg-in">
              <div class="flex items-baseline gap-1.5">
                <span class="text-[12px] font-bold" style={{ color: msg.color }}>{msg.user}</span>
                <span class="text-[10px] text-muted-foreground/40 tabular-nums">{this.formatTime(msg.timestamp)}</span>
              </div>
              <p class="text-[13px] text-foreground/90 leading-relaxed break-words mt-0.5">{msg.body}</p>
            </div>
          ))}
          <div ref={(el: HTMLDivElement | null) => { this.messagesEndRef = el; }} />
        </div>

        {/* Input */}
        <div class="shrink-0 border-t border-border p-2">
          <div class="flex gap-1.5">
            <Input
              value={input}
              onInput={this.handleInput}
              onKeyDown={this.handleKeyDown}
              placeholder="Send a message..."
              className="text-sm h-8"
            />
            <Button size="sm" onClick={this.handleSend} disabled={!input.trim()} className="h-8 px-3">
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
