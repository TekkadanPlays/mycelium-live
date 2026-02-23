import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import {
  Button, Badge, Input, Card, CardHeader, CardTitle, CardDescription,
  CardContent, Alert, AlertDescription, Spinner, Switch,
} from 'blazecn';
import { getAuthState, subscribeAuth } from '../../nostr/stores/auth';
import {
  getBroadcastConfig, subscribeBroadcastConfig, loadBroadcastConfig,
  setBroadcastConfigField, addTag, removeTag, resetBroadcastConfig,
  type BroadcastConfig,
} from '../../stores/broadcastconfig';
import {
  getLiveEventState, subscribeLiveEvents, setLiveEventsEnabled,
} from '../../nostr/stores/liveevents';
import { getSelectedBroadcastUrls } from '../../nostr/stores/broadcast';
import { getBootstrapState } from '../../nostr/stores/bootstrap';
import { createLiveEvent, publishLiveEvent } from '../../nostr/nip53';

interface BroadcastConfigTabState {
  config: BroadcastConfig;
  pubkey: string | null;
  liveEnabled: boolean;
  isPublishing: boolean;
  publishError: string | null;
  lastPublished: string | null;
  tagInput: string;
  previewOpen: boolean;
}

export class BroadcastConfigTab extends Component<{}, BroadcastConfigTabState> {
  private unsubConfig: (() => void) | null = null;
  private unsubAuth: (() => void) | null = null;
  private unsubLive: (() => void) | null = null;

  state: BroadcastConfigTabState = {
    config: getBroadcastConfig(),
    pubkey: getAuthState().pubkey,
    liveEnabled: getLiveEventState().enabled,
    isPublishing: getLiveEventState().isPublishing,
    publishError: getLiveEventState().error,
    lastPublished: getLiveEventState().lastPublished,
    tagInput: '',
    previewOpen: false,
  };

  componentDidMount() {
    loadBroadcastConfig();

    this.unsubConfig = subscribeBroadcastConfig(() => {
      this.setState({ config: getBroadcastConfig() });
    });
    this.unsubAuth = subscribeAuth(() => {
      this.setState({ pubkey: getAuthState().pubkey });
    });
    this.unsubLive = subscribeLiveEvents(() => {
      const le = getLiveEventState();
      this.setState({
        liveEnabled: le.enabled,
        isPublishing: le.isPublishing,
        publishError: le.error,
        lastPublished: le.lastPublished,
      });
    });
  }

  componentWillUnmount() {
    this.unsubConfig?.();
    this.unsubAuth?.();
    this.unsubLive?.();
  }

  private handleAddTag = () => {
    const { tagInput } = this.state;
    if (tagInput.trim()) {
      addTag(tagInput);
      this.setState({ tagInput: '' });
    }
  };

  private handlePublishNow = async () => {
    const { pubkey, config } = this.state;
    if (!pubkey) return;

    this.setState({ isPublishing: true, publishError: null });

    try {
      const bs = getBootstrapState();
      const allOutbox = bs.relayList.filter((r) => r.write).map((r) => r.url);
      const broadcast = getSelectedBroadcastUrls();
      const seen = new Set<string>();
      const relays: string[] = [];
      for (const url of [...allOutbox, ...broadcast]) {
        const n = url.replace(/\/+$/, '');
        if (!seen.has(n)) { seen.add(n); relays.push(n); }
      }
      if (relays.length === 0) {
        relays.push('wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band');
      }

      const streamingUrl = config.streamingUrl || `${window.location.origin}/app/stream/llhls.m3u8`;

      const event = await createLiveEvent(pubkey, {
        identifier: `mycelium-live-${Date.now()}`,
        title: config.title || 'Live Stream',
        summary: config.summary || undefined,
        image: config.image || undefined,
        status: 'live',
        streamingUrl,
        starts: Math.floor(Date.now() / 1000),
        tags: config.tags.length > 0 ? config.tags : undefined,
        participants: [{ pubkey, role: 'Host' }],
        relays,
      });

      if (!event) {
        this.setState({ isPublishing: false, publishError: 'Signer rejected or unavailable' });
        return;
      }

      const { published } = await publishLiveEvent(event, relays);

      if (published) {
        this.setState({
          isPublishing: false,
          publishError: null,
          lastPublished: new Date().toISOString(),
        });
      } else {
        this.setState({
          isPublishing: false,
          publishError: `Failed to publish (0/${relays.length} relays accepted)`,
        });
      }
    } catch (err) {
      this.setState({ isPublishing: false, publishError: String(err) });
    }
  };

  private renderPreview() {
    const { config, pubkey } = this.state;
    const streamingUrl = config.streamingUrl || `${window.location.origin}/app/stream/llhls.m3u8`;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Event Preview (kind 30311)</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-1 text-xs font-mono bg-background rounded-md p-3 overflow-x-auto">
            <p class="text-muted-foreground">{'{'}</p>
            <p class="pl-4"><span class="text-primary">"kind"</span>: 30311,</p>
            <p class="pl-4"><span class="text-primary">"tags"</span>: {'['}</p>
            <p class="pl-8">["d", "mycelium-live-..."],</p>
            {config.title && <p class="pl-8">["title", "{config.title}"],</p>}
            {config.summary && <p class="pl-8">["summary", "{config.summary}"],</p>}
            {config.image && <p class="pl-8">["image", "{config.image}"],</p>}
            <p class="pl-8">["streaming", "{streamingUrl}"],</p>
            <p class="pl-8">["status", "live"],</p>
            <p class="pl-8">["starts", "{Math.floor(Date.now() / 1000)}"],</p>
            {config.tags.map((t) => (
              <p class="pl-8" key={t}>["t", "{t}"],</p>
            ))}
            {pubkey && <p class="pl-8">["p", "{pubkey.slice(0, 8)}...", "Host"],</p>}
            <p class="pl-4">{']'}</p>
            <p class="text-muted-foreground">{'}'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  render() {
    const {
      config, pubkey, liveEnabled, isPublishing,
      publishError, lastPublished, tagInput, previewOpen,
    } = this.state;

    return (
      <div class="space-y-6">
        {!pubkey && (
          <Alert variant="destructive">
            <AlertDescription>
              Connect your Nostr identity in the <strong>Nostr Identity</strong> tab before configuring a broadcast.
            </AlertDescription>
          </Alert>
        )}

        {/* Stream Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>NIP-53 Live Event</CardTitle>
            <CardDescription>
              Configure the metadata that viewers will see when discovering your live stream on Nostr clients.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              {/* Title */}
              <div class="space-y-1.5">
                <label class="text-sm font-medium">
                  Title <span class="text-destructive">*</span>
                </label>
                <Input
                  className="h-9"
                  placeholder="My awesome live stream"
                  value={config.title}
                  onInput={(e: Event) =>
                    setBroadcastConfigField('title', (e.target as HTMLInputElement).value)
                  }
                />
                <p class="text-[11px] text-muted-foreground">
                  The main title shown in live event listings.
                </p>
              </div>

              {/* Summary */}
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Summary</label>
                <textarea
                  class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                  placeholder="What are you streaming today? Give viewers a reason to tune in..."
                  value={config.summary}
                  onInput={(e: Event) =>
                    setBroadcastConfigField('summary', (e.target as HTMLTextAreaElement).value)
                  }
                />
              </div>

              {/* Image URL */}
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Cover Image URL</label>
                <Input
                  className="h-9"
                  placeholder="https://example.com/stream-cover.jpg"
                  value={config.image}
                  onInput={(e: Event) =>
                    setBroadcastConfigField('image', (e.target as HTMLInputElement).value)
                  }
                />
                <p class="text-[11px] text-muted-foreground">
                  Optional thumbnail/cover image for the live event card.
                </p>
                {config.image && (
                  <div class="mt-2 rounded-md overflow-hidden border border-border max-w-[320px]">
                    <img
                      src={config.image}
                      alt="Cover preview"
                      class="w-full h-auto object-cover max-h-[180px]"
                      onError={(e: Event) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Tags */}
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Hashtags</label>
                <div class="flex gap-2">
                  <Input
                    className="flex-1 h-9"
                    placeholder="music, gaming, nostr..."
                    value={tagInput}
                    onInput={(e: Event) =>
                      this.setState({ tagInput: (e.target as HTMLInputElement).value })
                    }
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') this.handleAddTag();
                      if (e.key === ',' || e.key === ' ') {
                        e.preventDefault();
                        this.handleAddTag();
                      }
                    }}
                  />
                  <Button size="sm" className="h-9" onClick={this.handleAddTag}>
                    Add
                  </Button>
                </div>
                {config.tags.length > 0 && (
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    {config.tags.map((tag) => (
                      <span
                        key={tag}
                        class="cursor-pointer"
                        onClick={() => removeTag(tag)}
                      >
                        <Badge
                          variant="secondary"
                          className="text-xs pointer-events-none"
                        >
                          #{tag} &times;
                        </Badge>
                      </span>
                    ))}
                  </div>
                )}
                <p class="text-[11px] text-muted-foreground">
                  Press Enter, comma, or space to add. Click a tag to remove it.
                </p>
              </div>

              {/* Streaming URL override */}
              <div class="space-y-1.5">
                <label class="text-sm font-medium">
                  Streaming URL <Badge variant="outline" className="text-[10px] ml-1.5">optional</Badge>
                </label>
                <Input
                  className="h-9"
                  placeholder={`${window.location.origin}/app/stream/llhls.m3u8`}
                  value={config.streamingUrl}
                  onInput={(e: Event) =>
                    setBroadcastConfigField('streamingUrl', (e.target as HTMLInputElement).value)
                  }
                />
                <p class="text-[11px] text-muted-foreground">
                  Leave empty to auto-detect from OvenMediaEngine. Override only if using a custom HLS endpoint.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auto-publish toggle */}
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle>Auto-Publish on Stream Start</CardTitle>
                <CardDescription>
                  Automatically publish a NIP-53 live event when OBS connects and the stream goes live.
                </CardDescription>
              </div>
              <Switch
                checked={liveEnabled}
                onChange={(checked: boolean) => setLiveEventsEnabled(checked)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {liveEnabled && !pubkey && (
              <Alert variant="destructive" className="mb-2">
                <AlertDescription>Connect your Nostr identity first.</AlertDescription>
              </Alert>
            )}
            {liveEnabled && pubkey && (
              <p class="text-xs text-muted-foreground">
                When your RTMP stream connects to OvenMediaEngine, a kind 30311 event will be signed and published using the configuration above.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Manual publish */}
        <Card>
          <CardHeader>
            <CardTitle>Publish Now</CardTitle>
            <CardDescription>
              Manually sign and publish a NIP-53 live event with the current configuration. Use this to announce a stream before going live, or to test your setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-3">
              <Button
                onClick={this.handlePublishNow}
                disabled={!pubkey || isPublishing || !config.title.trim()}
              >
                {isPublishing ? (
                  <span class="flex items-center gap-2">
                    <Spinner size="sm" />
                    Publishing...
                  </span>
                ) : (
                  'Sign & Publish Live Event'
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => this.setState({ previewOpen: !previewOpen })}
              >
                {previewOpen ? 'Hide' : 'Preview'} Event
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => resetBroadcastConfig()}
              >
                Reset
              </Button>
            </div>

            {!config.title.trim() && (
              <p class="text-xs text-muted-foreground mt-2">Enter a title above to enable publishing.</p>
            )}

            {publishError && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{publishError}</AlertDescription>
              </Alert>
            )}

            {lastPublished && !publishError && (
              <p class="text-xs text-primary mt-2">
                Last published: {new Date(lastPublished).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Event preview */}
        {previewOpen && this.renderPreview()}

        {/* How NIP-53 works */}
        <Card>
          <CardHeader>
            <CardTitle>How NIP-53 Live Events Work</CardTitle>
          </CardHeader>
          <CardContent>
            <ul class="text-sm text-muted-foreground space-y-1.5">
              <li>A <strong>kind 30311</strong> addressable event is published to your selected relays.</li>
              <li>Nostr clients that support NIP-53 (Amethyst, Nostrudel, Zap.stream, Mycelium) display your stream in their live sections.</li>
              <li>The event includes your stream URL, title, summary, image, and hashtags.</li>
              <li>When you stop streaming, an updated event with <code>status: ended</code> is published.</li>
              <li>The <code>d</code> tag makes the event replaceable — only the latest version is shown.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }
}
