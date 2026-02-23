import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import {
  Button, Badge, Card, CardHeader, CardTitle, CardDescription,
  CardContent, Alert, AlertDescription, Spinner, Switch,
} from 'blazecn';
import { getAuthState, subscribeAuth } from '../../nostr/stores/auth';
import { getStreamState, subscribeStream } from '../../stores/stream';
import {
  getLiveEventState, subscribeLiveEvents, setLiveEventsEnabled,
  onStreamStart, onStreamEnd,
} from '../../nostr/stores/liveevents';
import {
  getBroadcastState, subscribeBroadcast,
  type BroadcastState,
} from '../../nostr/stores/broadcast';
import { getBootstrapState, subscribeBootstrap } from '../../nostr/stores/bootstrap';
import { getBroadcastConfig } from '../../stores/broadcastconfig';
import type { StreamInfo } from '../../stores/stream';

interface DashboardTabProps {
  onNavigate: (tab: string) => void;
}

interface DashboardTabState {
  stream: StreamInfo;
  pubkey: string | null;
  liveEventActive: boolean;
  liveEventPublishing: boolean;
  liveEventError: string | null;
  lastPublished: string | null;
  liveEnabled: boolean;
  broadcast: BroadcastState;
  outboxCount: number;
  configTitle: string;
}

export class DashboardTab extends Component<DashboardTabProps, DashboardTabState> {
  private unsubStream: (() => void) | null = null;
  private unsubAuth: (() => void) | null = null;
  private unsubLive: (() => void) | null = null;
  private unsubBroadcast: (() => void) | null = null;
  private unsubBootstrap: (() => void) | null = null;

  state: DashboardTabState = {
    stream: getStreamState().info,
    pubkey: getAuthState().pubkey,
    liveEventActive: !!getLiveEventState().currentEvent,
    liveEventPublishing: getLiveEventState().isPublishing,
    liveEventError: getLiveEventState().error,
    lastPublished: getLiveEventState().lastPublished,
    liveEnabled: getLiveEventState().enabled,
    broadcast: getBroadcastState(),
    outboxCount: getBootstrapState().relayList.filter((r) => r.write).length,
    configTitle: getBroadcastConfig().title,
  };

  componentDidMount() {
    this.unsubStream = subscribeStream(() => {
      this.setState({ stream: getStreamState().info });
    });
    this.unsubAuth = subscribeAuth(() => {
      this.setState({ pubkey: getAuthState().pubkey });
    });
    this.unsubLive = subscribeLiveEvents(() => {
      const le = getLiveEventState();
      this.setState({
        liveEventActive: !!le.currentEvent,
        liveEventPublishing: le.isPublishing,
        liveEventError: le.error,
        lastPublished: le.lastPublished,
        liveEnabled: le.enabled,
      });
    });
    this.unsubBroadcast = subscribeBroadcast(() => {
      this.setState({ broadcast: getBroadcastState() });
    });
    this.unsubBootstrap = subscribeBootstrap(() => {
      this.setState({
        outboxCount: getBootstrapState().relayList.filter((r) => r.write).length,
      });
    });
  }

  componentWillUnmount() {
    this.unsubStream?.();
    this.unsubAuth?.();
    this.unsubLive?.();
    this.unsubBroadcast?.();
    this.unsubBootstrap?.();
  }

  private handleBroadcastToggle = () => {
    const le = getLiveEventState();
    if (le.currentEvent) {
      onStreamEnd();
    } else {
      const config = getBroadcastConfig();
      onStreamStart(config.title || this.state.stream.name || 'Live Stream', 0);
    }
  };

  render() {
    const {
      stream, pubkey, liveEventActive, liveEventPublishing,
      liveEventError, lastPublished, liveEnabled, broadcast,
      outboxCount, configTitle,
    } = this.state;
    const { onNavigate } = this.props;

    const broadcastRelayCount = broadcast.selectedUrls.size;
    const totalRelays = outboxCount + broadcastRelayCount;

    return (
      <div class="space-y-6">
        {/* Stream Status Hero */}
        <Card className={stream.online ? 'border-primary/30' : ''}>
          <CardContent className="pt-6">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class={`size-14 rounded-xl flex items-center justify-center ${
                  stream.online
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {stream.online ? (
                    <svg class="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  ) : (
                    <svg class="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h9M3.375 7.5l16.5 9" />
                    </svg>
                  )}
                </div>
                <div>
                  <div class="flex items-center gap-2.5">
                    <h2 class="text-lg font-semibold">
                      {stream.online ? stream.name || 'Live Stream' : 'Offline'}
                    </h2>
                    {stream.online ? (
                      <Badge variant="default" className="gap-1 text-[10px]">
                        <span class="size-1.5 rounded-full bg-current live-dot" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Offline</Badge>
                    )}
                  </div>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    {stream.online
                      ? 'RTMP stream connected to OvenMediaEngine'
                      : 'Start broadcasting from OBS to go live'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nostr Broadcast Controls */}
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Nostr Broadcast
                  {liveEventActive && (
                    <Badge variant="default" className="gap-1 text-[10px]">
                      <span class="size-1.5 rounded-full bg-current live-dot" />
                      Publishing
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {liveEventActive
                    ? 'Your NIP-53 live event is active. It will auto-republish every 45 minutes to stay discoverable.'
                    : 'Publish a NIP-53 live event so Nostr clients can discover your stream.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              {/* Go Live / End Broadcast button */}
              {pubkey ? (
                <div class="flex items-center gap-3 flex-wrap">
                  <Button
                    variant={liveEventActive ? 'destructive' : 'default'}
                    onClick={this.handleBroadcastToggle}
                    disabled={liveEventPublishing || (!stream.online && !liveEventActive)}
                    className="gap-2"
                  >
                    {liveEventPublishing ? (
                      <span class="flex items-center gap-2">
                        <Spinner size="sm" />
                        Publishing...
                      </span>
                    ) : liveEventActive ? (
                      <span class="flex items-center gap-2">
                        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 0 1 12.728 12.728M5.636 5.636 18.364 18.364" />
                        </svg>
                        End Nostr Broadcast
                      </span>
                    ) : (
                      <span class="flex items-center gap-2">
                        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788" />
                        </svg>
                        Go Live on Nostr
                      </span>
                    )}
                  </Button>

                  {!stream.online && !liveEventActive && (
                    <span class="text-xs text-muted-foreground">Start your RTMP stream first</span>
                  )}
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    Sign in with Nostr to broadcast live events.
                  </AlertDescription>
                </Alert>
              )}

              {liveEventError && (
                <Alert variant="destructive">
                  <AlertDescription>{liveEventError}</AlertDescription>
                </Alert>
              )}

              {lastPublished && !liveEventError && (
                <p class="text-xs text-muted-foreground">
                  Last published: {new Date(lastPublished).toLocaleString()}
                </p>
              )}

              {/* Auto-publish toggle */}
              <div class="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <p class="text-sm font-medium">Auto-publish on stream start</p>
                  <p class="text-xs text-muted-foreground">
                    Automatically broadcast when OBS connects
                  </p>
                </div>
                <Switch
                  checked={liveEnabled}
                  onChange={(checked: boolean) => setLiveEventsEnabled(checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Status Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Event Config Summary */}
          <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate('broadcast')}>
            <CardContent className="pt-5 pb-4">
              <div class="flex items-center gap-3">
                <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg class="size-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-xs text-muted-foreground">Event Config</p>
                  <p class="text-sm font-medium truncate">
                    {configTitle || <span class="text-muted-foreground italic">Not configured</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Relay Summary */}
          <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate('nostr')}>
            <CardContent className="pt-5 pb-4">
              <div class="flex items-center gap-3">
                <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg class="size-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-xs text-muted-foreground">Publish Relays</p>
                  <p class="text-sm font-medium">
                    {totalRelays > 0 ? (
                      <span>{outboxCount} outbox + {broadcastRelayCount} broadcast</span>
                    ) : (
                      <span class="text-muted-foreground italic">None selected</span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stream Config */}
          <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate('stream')}>
            <CardContent className="pt-5 pb-4">
              <div class="flex items-center gap-3">
                <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg class="size-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-xs text-muted-foreground">Stream Config</p>
                  <p class="text-sm font-medium">RTMP / SRT URLs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">How NIP-53 Broadcasting Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div class="space-y-1">
                <p class="font-medium text-foreground">1. Configure</p>
                <p>Set your stream title, summary, cover image, and hashtags in the <button class="text-primary underline" onClick={() => onNavigate('broadcast')}>Broadcast</button> tab.</p>
              </div>
              <div class="space-y-1">
                <p class="font-medium text-foreground">2. Go Live</p>
                <p>Start your RTMP stream from OBS, then click "Go Live on Nostr" above. The event auto-republishes every 45 min.</p>
              </div>
              <div class="space-y-1">
                <p class="font-medium text-foreground">3. End</p>
                <p>Click "End Nostr Broadcast" or stop your RTMP stream. A <code>status: ended</code> event is published automatically.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
