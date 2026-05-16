// IRC store — connects to Ergo via Hyphae WebSocket bridge at chat.mycelium.social/ws
// Migrated to Preact Signals

import { signal, batch, effect } from '@preact/signals-core';

export interface IrcMessage {
  id: string;
  time: number;
  type: string;
  from?: string;
  text: string;
  self?: boolean;
}

// ─── Signals ───

export const ircConnected = signal(false);
export const ircConnecting = signal(false);
export const ircNetworkId = signal<string | null>(null);
export const ircNick = signal('');
export const ircChannel = signal<string | null>(null);
export const ircMessages = signal<IrcMessage[]>([]);
export const ircUsers = signal<Record<string, { nick: string; modes: string[] }>>({});
export const ircSending = signal(false);

// ─── Internal state ───

const HYPHAE_WS_URL = 'wss://chat.mycelium.social/ws';
const IRC_HOST = '127.0.0.1';
const IRC_PORT = 6667;
const MAX_MESSAGES = 500;
const RECONNECT_DELAY = 5000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeChannel: string | null = null;
let storedNick: string = '';
let intentionalDisconnect = false;

// ─── WebSocket send ───

function send(data: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Server event handler ───

function handleServerEvent(event: any) {
  switch (event.type) {
    case 'network:new':
      ircNetworkId.value = event.network.id;
      break;

    case 'network:status':
      if (event.connected) {
        batch(() => { ircConnected.value = true; ircConnecting.value = false; });
      } else {
        batch(() => { ircConnected.value = false; ircConnecting.value = false; });
      }
      break;

    case 'network:remove':
      batch(() => {
        ircConnected.value = false;
        ircConnecting.value = false;
        ircNetworkId.value = null;
        ircChannel.value = null;
        ircUsers.value = {};
      });
      break;

    case 'channel:new':
      if (event.channel.name === activeChannel) {
        ircChannel.value = event.channel.name;
      }
      break;

    case 'channel:remove':
      if (event.channelName === activeChannel) {
        batch(() => {
          ircChannel.value = null;
          ircMessages.value = [];
          ircUsers.value = {};
        });
      }
      break;

    case 'channel:users':
      if (event.channelName === activeChannel) {
        ircUsers.value = event.users;
      }
      break;

    case 'channel:user_join':
      if (event.channelName === activeChannel && event.user) {
        ircUsers.value = { ...ircUsers.value, [event.user.nick]: event.user };
      }
      break;

    case 'channel:user_part':
      if (event.channelName === activeChannel) {
        const { [event.nick]: _, ...rest } = ircUsers.value;
        ircUsers.value = rest;
      }
      break;

    case 'channel:user_quit': {
      const { [event.nick]: _, ...rest } = ircUsers.value;
      ircUsers.value = rest;
      break;
    }

    case 'channel:user_nick':
      if (ircUsers.value[event.oldNick]) {
        const user = ircUsers.value[event.oldNick];
        const { [event.oldNick]: _, ...rest } = ircUsers.value;
        ircUsers.value = { ...rest, [event.newNick]: { ...user, nick: event.newNick } };
        if (ircNick.value === event.oldNick) {
          ircNick.value = event.newNick;
        }
      }
      break;

    case 'channel:topic':
      break;

    case 'message':
      if (event.channelName === activeChannel) {
        const msgs = [...ircMessages.value, event.message];
        if (msgs.length > MAX_MESSAGES) msgs.splice(0, msgs.length - MAX_MESSAGES);
        batch(() => {
          ircMessages.value = msgs;
          ircSending.value = false;
        });
      }
      break;

    case 'error':
      console.warn('[irc] Error:', event.text);
      break;
  }
}

// ─── Public actions ───

export function connectIrc(nick: string, channel: string = '#mycelium-hub') {
  storedNick = nick;
  intentionalDisconnect = false;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    if (activeChannel !== channel && ircNetworkId.value) {
      if (activeChannel) {
        send({ type: 'part', networkId: ircNetworkId.value, channel: activeChannel });
      }
      activeChannel = channel;
      send({ type: 'join', networkId: ircNetworkId.value, channel });
      batch(() => {
        ircMessages.value = [];
        ircUsers.value = {};
      });
    }
    return;
  }

  if (ircConnecting.value) return;

  activeChannel = channel;
  const isReconnect = ircMessages.value.length > 0;
  batch(() => {
    ircConnecting.value = true;
    ircNick.value = nick;
    ircUsers.value = {};
    if (!isReconnect) ircMessages.value = [];
  });

  ws = new WebSocket(HYPHAE_WS_URL);

  ws.onopen = () => {
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
    batch(() => {
      ircConnected.value = false;
      ircConnecting.value = false;
      ircNetworkId.value = null;
    });
    ws = null;
    if (activeChannel && !intentionalDisconnect) {
      reconnectTimer = setTimeout(() => {
        if (activeChannel && !intentionalDisconnect) {
          connectIrc(storedNick, activeChannel);
        }
      }, RECONNECT_DELAY);
    }
  };

  ws.onerror = () => {};
}

export function disconnectIrc() {
  intentionalDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  activeChannel = null;

  if (ircNetworkId.value && ws) {
    send({ type: 'disconnect', networkId: ircNetworkId.value });
  }
  if (ws) {
    ws.close();
    ws = null;
  }

  batch(() => {
    ircConnected.value = false;
    ircConnecting.value = false;
    ircNetworkId.value = null;
    ircNick.value = '';
    ircChannel.value = null;
    ircMessages.value = [];
    ircUsers.value = {};
    ircSending.value = false;
  });
  storedNick = '';
}

export function sendIrcMessage(text: string) {
  if (!ircNetworkId.value || !activeChannel || !text.trim()) return;
  send({
    type: 'message',
    networkId: ircNetworkId.value,
    target: activeChannel,
    text: text.trim(),
  });
}

export function switchIrcChannel(channel: string) {
  if (!ircNetworkId.value || activeChannel === channel) return;

  if (activeChannel) {
    send({ type: 'part', networkId: ircNetworkId.value, channel: activeChannel });
  }
  activeChannel = channel;
  batch(() => {
    ircChannel.value = null;
    ircMessages.value = [];
    ircUsers.value = {};
  });
  send({ type: 'join', networkId: ircNetworkId.value, channel });
}

// ─── Legacy compat ───

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

export function getIrcState(): IrcState {
  return {
    connected: ircConnected.value,
    connecting: ircConnecting.value,
    networkId: ircNetworkId.value,
    nick: ircNick.value,
    channel: ircChannel.value,
    messages: ircMessages.value,
    users: ircUsers.value,
    sending: ircSending.value,
  };
}

const _legacyListeners: Set<() => void> = new Set();
let _bridgeActive = false;

export function subscribeIrc(listener: () => void): () => void {
  _legacyListeners.add(listener);
  if (!_bridgeActive) {
    _bridgeActive = true;
    effect(() => {
      ircConnected.value; ircConnecting.value; ircNetworkId.value;
      ircNick.value; ircChannel.value; ircMessages.value;
      ircUsers.value; ircSending.value;
      for (const fn of _legacyListeners) fn();
    });
  }
  return () => _legacyListeners.delete(listener);
}
