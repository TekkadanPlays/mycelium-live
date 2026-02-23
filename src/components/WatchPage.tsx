import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button, Badge, Spinner } from 'blazecn';

interface WatchPageState {
  online: boolean;
  checking: boolean;
  error: string | null;
}

export class WatchPage extends Component<{}, WatchPageState> {
  private videoRef: HTMLVideoElement | null = null;
  private hls: any = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  state: WatchPageState = {
    online: false,
    checking: true,
    error: null,
  };

  componentDidMount() {
    this.checkStatus();
    this.pollTimer = setInterval(() => this.checkStatus(), 15000);
  }

  componentWillUnmount() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.destroyPlayer();
  }

  private async checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const wasOnline = this.state.online;
      this.setState({ online: data.online, checking: false, error: null });

      if (data.online && !wasOnline) {
        this.initPlayer();
      } else if (!data.online && wasOnline) {
        this.destroyPlayer();
      }
    } catch {
      this.setState({ checking: false, error: 'Failed to check stream status' });
    }
  }

  private async initPlayer() {
    if (!this.videoRef) return;

    const src = '/app/stream/llhls.m3u8';

    // Try native HLS first (Safari)
    if (this.videoRef.canPlayType('application/vnd.apple.mpegurl')) {
      this.videoRef.src = src;
      this.videoRef.play().catch(() => {});
      return;
    }

    // Use hls.js for other browsers
    try {
      const Hls = (await import('hls.js')).default;
      if (Hls.isSupported()) {
        this.hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        this.hls.loadSource(src);
        this.hls.attachMedia(this.videoRef);
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          this.videoRef?.play().catch(() => {});
        });
      }
    } catch (err) {
      this.setState({ error: 'Failed to load HLS player' });
    }
  }

  private destroyPlayer() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.videoRef) {
      this.videoRef.src = '';
    }
  }

  render() {
    const { online, checking, error } = this.state;

    return (
      <div class="max-w-5xl mx-auto px-4 py-6">
        {/* Player area */}
        <div class="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
          {online ? (
            <video
              ref={(el: HTMLVideoElement | null) => { this.videoRef = el; }}
              class="w-full h-full object-contain"
              controls
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div class="absolute inset-0 flex flex-col items-center justify-center text-white/70">
              {checking ? (
                <div class="flex items-center gap-3">
                  <Spinner size="sm" />
                  <span class="text-sm">Checking stream status...</span>
                </div>
              ) : (
                <div class="text-center">
                  <div class="text-4xl mb-3">🍄</div>
                  <p class="text-lg font-medium mb-1">Stream Offline</p>
                  <p class="text-sm text-white/50">The broadcaster is not currently live.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 text-white/70 border-white/20 hover:bg-white/10"
                    onClick={() => {
                      this.setState({ checking: true });
                      this.checkStatus();
                    }}
                  >
                    Check Again
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div class="flex items-center gap-3 mb-6">
          <Badge variant={online ? 'default' : 'outline'} className="text-xs">
            {online ? '🔴 LIVE' : 'Offline'}
          </Badge>
          {error && (
            <span class="text-xs text-destructive">{error}</span>
          )}
        </div>

        {/* Info */}
        <div class="text-sm text-muted-foreground space-y-2">
          <p>
            This stream is powered by <strong>OvenMediaEngine</strong> with sub-second LLHLS latency.
          </p>
          <p>
            Stream discovery is available via <strong>NIP-53</strong> — Nostr clients that support live activities can find this stream automatically.
          </p>
        </div>
      </div>
    );
  }
}
