import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';

export class OfflineBanner extends Component {
  render() {
    return (
      <div class="aspect-video w-full bg-muted/30 flex items-center justify-center">
        <div class="text-center animate-in">
          <div class="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <svg class="size-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-foreground/80 mb-1">Stream Offline</h2>
          <p class="text-sm text-muted-foreground">The stream will appear here when it goes live.</p>
        </div>
      </div>
    );
  }
}
