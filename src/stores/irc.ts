// IRC store — connects to Ergo via Hyphae WebSocket bridge at chat.mycelium.social/ws
// Protocol: JSON commands/events matching Hyphae's shared/types.ts

type Listener = () => void;

export interface IrcMessage {
  id: string;
  time: number;
  type: string;
  from?: string;
  text: string;
  self?: boolean;
}

export interface IrcState {
  connected: boolean;
  connecting: boolean;
  networkId: string | null;
  nick: string;
  channel: string | null;
  messages: IrcMessage[];
  users: Record<string, { nick: string; modes: string[] }>;
  sending: boolean;
}

const HYPHAE_WS_URL = 'wss://chat.mycelium.social/ws';
const IRC_HOST = '127.0.0.1';
const IRC_PORT = 6667;
const MAX_MESSAGES = 500;

let state: IrcState = {
  connected: false,
  connecting: false,
  networkId: null,
  nick: '',
  channel: null,
  messages: [],
  users: {},
  sending: false,
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeChannel: string | null = null;

const listeners: Set<Listener> = new Set();

function notify() {
  for (const fn of listeners) fn();
}

export function getIrcState(): IrcState {
  return state;
}

export function subscribeIrc(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function send(data: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleServerEvent(event: any) {
  switch (event.type) {
    case 'network:new':
      state = { ...state, networkId: event.network.id };
      notify();
      break;

    case 'network:status':
      if (event.connected) {
        state = { ...state, connected: true, connecting: false };
        // Auto-join the target channel once connected
        if (activeChannel && state.networkId) {
          send({ type: 'join', networkId: state.networkId, channel: activeChannel });
        }
      } else {
        state = { ...state, connected: false };
      }
      notify();
      break;

    case 'network:remove':
      state = {
        ...state,
        connected: false,
        connecting: false,
        networkId: null,
        channel: null,
        messages: [],
        users: {},
      };
      notify();
      break;

    case 'channel:new':
      if (event.channel.name === activeChannel) {
        state = { ...state, channel: event.channel.name };
        notify();
      }
      break;

    case 'channel:remove':
      if (event.channelName === activeChannel) {
        state = { ...state, channel: null, messages: [], users: {} };
        notify();
      }
      break;

    case 'channel:users':
      if (event.channelName === activeChannel) {
        state = { ...state, users: event.users };
        notify();
      }
      break;

    case 'channel:user_join':
      if (event.channelName === activeChannel && event.user) {
        state = {
          ...state,
          users: { ...state.users, [event.user.nick]: event.user },
        };
        notify();
      }
      break;

    case 'channel:user_part':
      if (event.channelName === activeChannel) {
        const { [event.nick]: _, ...rest } = state.users;
        state = { ...state, users: rest };
        notify();
      }
      break;

    case 'channel:user_quit': {
      const { [event.nick]: _, ...rest } = state.users;
      state = { ...state, users: rest };
      notify();
      break;
    }

    case 'channel:user_nick':
      if (state.users[event.oldNick]) {
        const user = state.users[event.oldNick];
        const { [event.oldNick]: _, ...rest } = state.users;
        state = {
          ...state,
          users: { ...rest, [event.newNick]: { ...user, nick: event.newNick } },
        };
        if (state.nick === event.oldNick) {
          state = { ...state, nick: event.newNick };
        }
        notify();
      }
      break;

    case 'channel:topic':
      // Could display topic changes as messages
      break;

    case 'message':
      // Only show messages for our active channel or lobby
      if (event.channelName === activeChannel) {
        const msgs = [...state.messages, event.message];
        if (msgs.length > MAX_MESSAGES) msgs.splice(0, msgs.length - MAX_MESSAGES);
        state = { ...state, messages: msgs, sending: false };
        notify();
      }
      break;

    case 'error':
      console.warn('[irc] Error:', event.text);
      break;
  }
}

/**
 * Connect to IRC via Hyphae bridge.
 * @param nick - IRC nickname (e.g. npub short form or display name)
 * @param channel - Channel to auto-join (e.g. '#lobby' or '#live-stream')
 */
export function connectIrc(nick: string, channel: string = '#lobby') {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    // Already connected — just switch channel if needed
    if (activeChannel !== channel && state.networkId) {
      if (activeChannel) {
        send({ type: 'part', networkId: state.networkId, channel: activeChannel });
      }
      activeChannel = channel;
      send({ type: 'join', networkId: state.networkId, channel });
      state = { ...state, messages: [], users: {} };
      notify();
    }
    return;
  }

  activeChannel = channel;
  state = { ...state, connecting: true, nick, messages: [], users: {} };
  notify();

  ws = new WebSocket(HYPHAE_WS_URL);

  ws.onopen = () => {
    // Send connect command to Hyphae bridge
    send({
      type: 'connect',
      network: {
        name: 'Mycelium',
        host: IRC_HOST,
        port: IRC_PORT,
        tls: false,
        nick,
        username: nick,
        realname: nick,
        autojoin: [channel],
      },
    });
  };

  ws.onmessage = (ev: MessageEvent) => {
    try {
      const event = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      handleServerEvent(event);
    } catch {}
  };

  ws.onclose = () => {
    state = { ...state, connected: false, connecting: false, networkId: null };
    notify();
    ws = null;
    // Auto-reconnect after 5s if we were connected
    if (activeChannel) {
      reconnectTimer = setTimeout(() => {
        if (activeChannel) connectIrc(nick, activeChannel);
      }, 5000);
    }
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

export function disconnectIrc() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  activeChannel = null;

  if (state.networkId && ws) {
    send({ type: 'disconnect', networkId: state.networkId });
  }
  if (ws) {
    ws.close();
    ws = null;
  }

  state = {
    connected: false,
    connecting: false,
    networkId: null,
    nick: '',
    channel: null,
    messages: [],
    users: {},
    sending: false,
  };
  notify();
}

export function sendIrcMessage(text: string) {
  if (!state.networkId || !activeChannel || !text.trim()) return;

  state = { ...state, sending: true };
  notify();

  send({
    type: 'message',
    networkId: state.networkId,
    target: activeChannel,
    text: text.trim(),
  });

  // Optimistic: add our own message immediately
  const msg: IrcMessage = {
    id: `self_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    time: Date.now(),
    type: 'message',
    from: state.nick,
    text: text.trim(),
    self: true,
  };
  const msgs = [...state.messages, msg];
  if (msgs.length > MAX_MESSAGES) msgs.splice(0, msgs.length - MAX_MESSAGES);
  state = { ...state, messages: msgs, sending: false };
  notify();
}

/**
 * Switch to a different IRC channel (e.g. when broadcast starts, switch to #live-stream)
 */
export function switchIrcChannel(channel: string) {
  if (!state.networkId || activeChannel === channel) return;

  if (activeChannel) {
    send({ type: 'part', networkId: state.networkId, channel: activeChannel });
  }
  activeChannel = channel;
  state = { ...state, channel: null, messages: [], users: {} };
  notify();
  send({ type: 'join', networkId: state.networkId, channel });
}
