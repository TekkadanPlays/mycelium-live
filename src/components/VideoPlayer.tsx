import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button, Slider, Tooltip, ToggleGroup, ToggleGroupItem } from 'blazecn';

interface VideoPlayerProps {
  online: boolean;
  title: string;
}

interface VideoPlayerState {
  playing: boolean;
  muted: boolean;
  volume: number;
  prevVolume: number;
  fullscreen: boolean;
  showControls: boolean;
  playerMode: 'llhls' | 'webrtc';
  error: string | null;
}

// OME stream URLs — configured for default vhost/app/stream
const LLHLS_URL = '/app/stream/llhls.m3u8';
const WEBRTC_WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/app/stream`;

export class VideoPlayer extends Component<VideoPlayerProps, VideoPlayerState> {
  private videoRef: HTMLVideoElement | null = null;
  private containerRef: HTMLDivElement | null = null;
  private hlsInstance: any = null;
  private peerConnection: RTCPeerConnection | null = null;
  private wsConnection: WebSocket | null = null;
  private controlsTimer: ReturnType<typeof setTimeout> | null = null;

  state: VideoPlayerState = {
    playing: false,
    muted: true,
    volume: 80,
    prevVolume: 80,
    fullscreen: false,
    showControls: true,
    playerMode: 'llhls',
    error: null,
  };

  componentDidMount() {
    this.startPlayer();
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  componentDidUpdate(prevProps: VideoPlayerProps) {
    if (prevProps.online !== this.props.online) {
      if (this.props.online) {
        this.startPlayer();
      } else {
        this.stopPlayer();
      }
    }
  }

  componentWillUnmount() {
    this.stopPlayer();
    if (this.controlsTimer) clearTimeout(this.controlsTimer);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  private onFullscreenChange = () => {
    this.setState({ fullscreen: !!document.fullscreenElement });
  };

  private async startPlayer() {
    if (!this.props.online || !this.videoRef) return;

    if (this.state.playerMode === 'llhls') {
      await this.startLLHLS();
    } else {
      await this.startWebRTC();
    }
  }

  private async startLLHLS() {
    const video = this.videoRef;
    if (!video) return;

    try {
      const Hls = (await import('hls.js')).default;
      if (Hls.isSupported()) {
        this.hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          maxBufferLength: 4,
          maxMaxBufferLength: 8,
        });
        this.hlsInstance.loadSource(LLHLS_URL);
        this.hlsInstance.attachMedia(video);
        this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          this.setState({ playing: true, error: null });
        });
        this.hlsInstance.on(Hls.Events.ERROR, (_: any, data: any) => {
          console.error('[HLS error]', data.type, data.details, data.fatal, {
            url: data.url || data.frag?.url,
            response: data.response,
            reason: data.reason,
            err: data.err,
          });
          if (data.fatal) {
            this.setState({ error: `HLS error: ${data.details || data.type}` });
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = LLHLS_URL;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
          this.setState({ playing: true, error: null });
        });
      }
    } catch (err) {
      this.setState({ error: `Failed to load player: ${err}` });
    }
  }

  private async startWebRTC() {
    const video = this.videoRef;
    if (!video) return;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      this.peerConnection = pc;

      pc.ontrack = (event) => {
        video.srcObject = event.streams[0];
        video.play().catch(() => {});
        this.setState({ playing: true, error: null });
      };

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // OME WebRTC signaling via WebSocket
      const ws = new WebSocket(WEBRTC_WS_URL);
      this.wsConnection = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          command: 'request_offer',
          id: Date.now(),
        }));
      };
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          if (msg.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({
              command: 'answer',
              id: msg.id,
              sdp: answer,
            }));
          }
        }
        if (msg.candidates) {
          for (const c of msg.candidates) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
        }
      };
      ws.onerror = () => {
        this.setState({ error: 'WebRTC signaling failed' });
      };
    } catch (err) {
      this.setState({ error: `WebRTC error: ${err}` });
    }
  }

  private stopPlayer() {
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.videoRef) {
      this.videoRef.srcObject = null;
      this.videoRef.src = '';
    }
    this.setState({ playing: false });
  }

  private togglePlay = () => {
    const video = this.videoRef;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      this.setState({ playing: true });
    } else {
      video.pause();
      this.setState({ playing: false });
    }
  };

  private toggleMute = () => {
    const video = this.videoRef;
    if (!video) return;
    if (video.muted || this.state.volume === 0) {
      const restoreVol = this.state.prevVolume > 0 ? this.state.prevVolume : 80;
      video.muted = false;
      video.volume = restoreVol / 100;
      this.setState({ muted: false, volume: restoreVol });
    } else {
      video.muted = true;
      this.setState({ muted: true, prevVolume: this.state.volume });
    }
  };

  private handleVolumeChange = (value: number) => {
    const video = this.videoRef;
    if (!video) return;
    video.volume = value / 100;
    video.muted = value === 0;
    this.setState({ volume: value, muted: value === 0 });
  };

  private toggleFullscreen = () => {
    if (!this.containerRef) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.containerRef.requestFullscreen();
    }
  };

  private switchMode = (mode: 'llhls' | 'webrtc') => {
    if (mode === this.state.playerMode) return;
    this.stopPlayer();
    this.setState({ playerMode: mode }, () => {
      this.startPlayer();
    });
  };

  private handleMouseMove = () => {
    this.setState({ showControls: true });
    if (this.controlsTimer) clearTimeout(this.controlsTimer);
    this.controlsTimer = setTimeout(() => {
      if (this.state.playing) this.setState({ showControls: false });
    }, 3000);
  };

  private handleVideoClick = () => {
    this.togglePlay();
  };

  render() {
    const { title } = this.props;
    const { playing, muted, volume, showControls, playerMode, fullscreen, error } = this.state;

    // Volume icon: muted, low, medium, high
    const volumeIcon = muted || volume === 0
      ? <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
      : volume < 50
        ? <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
        : <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>;

    return (
      <div
        ref={(el: HTMLDivElement | null) => { this.containerRef = el; }}
        class="relative bg-black aspect-video w-full group"
        onMouseMove={this.handleMouseMove}
        onMouseLeave={() => { if (playing) this.setState({ showControls: false }); }}
      >
        <video
          ref={(el: HTMLVideoElement | null) => { this.videoRef = el; }}
          class="w-full h-full object-contain cursor-pointer"
          muted={muted}
          autoPlay
          playsInline
          onClick={this.handleVideoClick}
        />

        {/* Click-to-play overlay when paused */}
        {!playing && !error && (
          <div class="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={this.handleVideoClick}>
            <div class="size-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
              <svg class="size-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}

        {error && (
          <div class="absolute inset-0 flex items-center justify-center bg-black/80">
            <div class="text-center text-white space-y-3">
              <svg class="size-10 text-destructive mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p class="text-sm text-red-400">{error}</p>
              <Button variant="outline" size="sm" onClick={() => { this.setState({ error: null }); this.startPlayer(); }}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Controls bar */}
        <div
          class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-10 pb-3 px-4 transition-opacity duration-300"
          style={{ opacity: showControls ? 1 : 0, 'pointer-events': showControls ? 'auto' : 'none' }}
        >
          <div class="flex items-center gap-2">
            {/* Play/Pause */}
            <Tooltip content={playing ? 'Pause' : 'Play'} side="top">
              <Button variant="ghost" size="icon-sm" onClick={this.togglePlay} className="text-white hover:text-white hover:bg-white/20">
                {playing ? (
                  <svg class="size-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                ) : (
                  <svg class="size-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </Button>
            </Tooltip>

            {/* Volume: mute button + slider */}
            <div class="flex items-center gap-1.5 group/vol">
              <Tooltip content={muted ? 'Unmute' : 'Mute'} side="top">
                <Button variant="ghost" size="icon-sm" onClick={this.toggleMute} className="text-white hover:text-white hover:bg-white/20">
                  {volumeIcon}
                </Button>
              </Tooltip>
              <div class="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200">
                <Slider
                  value={muted ? 0 : volume}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={this.handleVolumeChange}
                  className="w-20"
                />
              </div>
            </div>

            {/* Stream title */}
            <span class="text-white/80 text-xs truncate flex-1 ml-1">{title}</span>

            {/* Protocol mode switcher */}
            <ToggleGroup
              type="single"
              value={playerMode}
              onValueChange={(val: string | string[]) => { const v = Array.isArray(val) ? val[0] : val; if (v) this.switchMode(v as 'llhls' | 'webrtc'); }}
              className="gap-0"
            >
              <Tooltip content="Low-Latency HLS (~2-3s delay)" side="top">
                <ToggleGroupItem value="llhls" className="text-[10px] h-6 px-2 text-white/70 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-r-none border-r-0">
                  LLHLS
                </ToggleGroupItem>
              </Tooltip>
              <Tooltip content="WebRTC (sub-second delay)" side="top">
                <ToggleGroupItem value="webrtc" className="text-[10px] h-6 px-2 text-white/70 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-l-none">
                  WebRTC
                </ToggleGroupItem>
              </Tooltip>
            </ToggleGroup>

            {/* Fullscreen */}
            <Tooltip content={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} side="top">
              <Button variant="ghost" size="icon-sm" onClick={this.toggleFullscreen} className="text-white hover:text-white hover:bg-white/20">
                {fullscreen ? (
                  <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                  </svg>
                ) : (
                  <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                )}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    );
  }
}
