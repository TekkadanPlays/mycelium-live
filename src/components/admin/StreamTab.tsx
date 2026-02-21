import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input } from 'blazecn';
import { getStreamState, subscribeStream } from '../../stores/stream';
import { getLiveEventState, subscribeLiveEvents, onStreamStart, onStreamEnd } from '../../nostr/stores/liveevents';
import { getAuthState, subscribeAuth } from '../../nostr/stores/auth';
import type { StreamInfo } from '../../stores/stream';

interface StreamTabState {
  stream: StreamInfo;
  streamKey: string;
  liveEventActive: boolean;
  liveEventPublishing: boolean;
  pubkey: string | null;
}

export class StreamTab extends Component<{}, StreamTabState> {
  private unsubStream: (() => void) | null = null;
  private unsubLive: (() => void) | null = null;
  private unsubAuth: (() => void) | null = null;

  state: StreamTabState = {
    stream: getStreamState().info,
    streamKey: localStorage.getItem('mycelium_stream_key') || '',
    liveEventActive: !!getLiveEventState().currentEvent,
    liveEventPublishing: getLiveEventState().isPublishing,
    pubkey: getAuthState().pubkey,
  };

  componentDidMount() {
    this.unsubStream = subscribeStream(() => {
      this.setState({ stream: getStreamState().info });
    });
    this.unsubLive = subscribeLiveEvents(() => {
      const le = getLiveEventState();
      this.setState({ liveEventActive: !!le.currentEvent, liveEventPublishing: le.isPublishing });
    });
    this.unsubAuth = subscribeAuth(() => {
      this.setState({ pubkey: getAuthState().pubkey });
    });
  }

  componentWillUnmount() {
    this.unsubStream?.();
    this.unsubLive?.();
    this.unsubAuth?.();
  }

  private handleBroadcast = () => {
    const le = getLiveEventState();
    if (le.currentEvent) {
      onStreamEnd();
    } else {
      onStreamStart(this.state.stream.name || 'Live Stream', 0);
    }
  };

  render() {
    const { stream, streamKey, liveEventActive, liveEventPublishing, pubkey } = this.state;

    return (
      <div class="space-y-6">
        {/* Stream Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Stream Status
              {stream.online ? (
                <Badge variant="default" className="gap-1 text-[10px]">
                  <span class="size-1.5 rounded-full bg-current live-dot" />
                  Live
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Offline</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {stream.online
                ? `Streaming as "${stream.name}"`
                : 'No active stream. Start broadcasting to go live.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Broadcast to Nostr */}
            {pubkey && (
              <div class="flex items-center gap-3">
                <Button
                  variant={liveEventActive ? 'destructive' : stream.online ? 'default' : 'secondary'}
                  size="sm"
                  onClick={this.handleBroadcast}
                  disabled={liveEventPublishing || (!stream.online && !liveEventActive)}
                  className="gap-1.5"
                >
                  {liveEventPublishing ? (
                    <span>Publishing...</span>
                  ) : liveEventActive ? (
                    <span class="flex items-center gap-1.5">
                      <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 0 1 12.728 12.728M5.636 5.636 18.364 18.364" /></svg>
                      End Nostr Broadcast
                    </span>
                  ) : stream.online ? (
                    <span class="flex items-center gap-1.5">
                      <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788" /></svg>
                      Broadcast to Nostr
                    </span>
                  ) : (
                    <span class="flex items-center gap-1.5 text-muted-foreground">
                      <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788" /></svg>
                      Not Broadcasting
                    </span>
                  )}
                </Button>
                {liveEventActive && (
                  <Badge variant="default" className="gap-1 text-[10px]">
                    <span class="size-1.5 rounded-full bg-current live-dot" />
                    Nostr Live
                  </Badge>
                )}
                {!liveEventActive && stream.online && (
                  <span class="text-xs text-muted-foreground">Configure relays in the Nostr Identity tab before broadcasting</span>
                )}
              </div>
            )}
            {!pubkey && (
              <p class="text-xs text-muted-foreground">Sign in with Nostr in the Nostr Identity tab to broadcast live events.</p>
            )}
          </CardContent>
        </Card>

        {/* Stream Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Stream Configuration</CardTitle>
            <CardDescription>Configure your broadcasting software with these settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div class="space-y-2">
              <label class="text-sm font-medium">RTMP URL</label>
              <div class="flex gap-2">
                <Input value={`rtmp://${window.location.hostname}:1935/app`} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`rtmp://${window.location.hostname}:1935/app`)}>
                  Copy
                </Button>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium">SRT URL</label>
              <div class="flex gap-2">
                <Input value={`srt://${window.location.hostname}:9999?streamid=srt://default/app/stream`} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`srt://${window.location.hostname}:9999?streamid=srt://default/app/stream`)}>
                  Copy
                </Button>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium">Stream Key</label>
              <div class="flex gap-2">
                <Input value="stream" readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText('stream')}>
                  Copy
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                The stream key is the stream name in OvenMediaEngine. Default is "stream".
              </p>
            </div>

            <div class="section-divider" />

            <div class="space-y-2">
              <label class="text-sm font-medium">Playback URLs</label>
              <div class="grid gap-2 text-xs font-mono text-muted-foreground">
                <div class="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] shrink-0">LLHLS</Badge>
                  <span class="truncate">{window.location.origin}/app/stream/llhls.m3u8</span>
                </div>
                <div class="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] shrink-0">WebRTC</Badge>
                  <span class="truncate">wss://{window.location.host}/app/stream</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
