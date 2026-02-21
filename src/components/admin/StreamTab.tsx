import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input } from 'blazecn';
import { getStreamState, subscribeStream } from '../../stores/stream';
import type { StreamInfo } from '../../stores/stream';

interface StreamTabState {
  stream: StreamInfo;
  streamKey: string;
}

export class StreamTab extends Component<{}, StreamTabState> {
  private unsubStream: (() => void) | null = null;

  state: StreamTabState = {
    stream: getStreamState().info,
    streamKey: localStorage.getItem('mycelium_stream_key') || '',
  };

  componentDidMount() {
    this.unsubStream = subscribeStream(() => {
      this.setState({ stream: getStreamState().info });
    });
  }

  componentWillUnmount() {
    this.unsubStream?.();
  }

  render() {
    const { stream, streamKey } = this.state;

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
