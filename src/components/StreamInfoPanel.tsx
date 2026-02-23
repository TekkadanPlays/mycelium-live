import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Badge, Button } from 'blazecn';
import { getBootstrapState, subscribeBootstrap } from '../nostr/stores/bootstrap';
import type { BootstrapProfile } from '../nostr/stores/bootstrap';
import { getStreamerProfile, subscribeStreamerProfile } from '../stores/streamerprofile';

interface StreamInfoProps {
  online: boolean;
  streamName: string;
  viewerCount: number;
}

interface StreamInfoState {
  profile: BootstrapProfile | null;
  cachedPicture: string;
  cachedName: string;
  cachedNip05: string;
  expanded: boolean;
}

export class StreamInfoPanel extends Component<StreamInfoProps, StreamInfoState> {
  private unsubBootstrap: (() => void) | null = null;

  private unsubStreamer: (() => void) | null = null;

  state: StreamInfoState = {
    profile: getBootstrapState().profile,
    cachedPicture: getStreamerProfile().picture,
    cachedName: getStreamerProfile().displayName || getStreamerProfile().name,
    cachedNip05: getStreamerProfile().nip05,
    expanded: false,
  };

  componentDidMount() {
    this.unsubBootstrap = subscribeBootstrap(() => {
      const bs = getBootstrapState();
      this.setState({ profile: bs.profile });
    });
    this.unsubStreamer = subscribeStreamerProfile(() => {
      const sp = getStreamerProfile();
      this.setState({
        cachedPicture: sp.picture,
        cachedName: sp.displayName || sp.name,
        cachedNip05: sp.nip05,
      });
    });
  }

  componentWillUnmount() {
    this.unsubBootstrap?.();
    this.unsubStreamer?.();
  }

  render() {
    const { online, streamName, viewerCount } = this.props;
    const { profile, cachedPicture, cachedName, cachedNip05 } = this.state;

    if (!online) return null;

    // Bootstrap profile (signed-in streamer) takes priority, cached server profile is fallback
    const picture = profile?.picture || cachedPicture;
    const hostName = profile?.displayName || profile?.name || cachedName;
    const nip05 = profile?.nip05 || cachedNip05;

    return (
      <div class="border-b border-border bg-card px-4 py-3">
        <div class="flex items-start gap-3">
          {/* Host avatar */}
          <div class="shrink-0">
            {picture ? (
              <img
                src={picture}
                alt={hostName || 'Host'}
                class="size-10 rounded-full object-cover ring-2 ring-primary/20"
              />
            ) : (
              <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <svg class="size-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </div>
            )}
          </div>

          {/* Stream info */}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold truncate">{streamName || 'Live Stream'}</h2>
              <Badge variant="default" className="shrink-0 gap-1 text-[10px] uppercase tracking-wider font-bold">
                <span class="size-1.5 rounded-full bg-current live-dot" />
                Live
              </Badge>
            </div>

            {/* Host name */}
            {hostName && (
              <p class="text-xs text-muted-foreground mt-0.5">
                {hostName}
                {nip05 && (
                  <span class="text-muted-foreground/50 ml-1.5">{nip05}</span>
                )}
              </p>
            )}

            {/* Stats row */}
            <div class="flex items-center gap-3 mt-1.5">
              {viewerCount > 0 && (
                <div class="flex items-center gap-1 text-xs text-muted-foreground">
                  <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                  <span>{viewerCount} watching</span>
                </div>
              )}
              <div class="flex items-center gap-1 text-xs text-muted-foreground">
                <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788" />
                </svg>
                <span>LLHLS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
