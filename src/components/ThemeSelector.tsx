import { Component } from 'inferno';
import { createElement } from 'inferno-create-element';
import { Button } from 'blazecn';
import { getBaseTheme, setBaseTheme, isDarkMode, toggleDarkMode, subscribeTheme } from '../stores/theme';
import type { BaseTheme } from '../stores/theme';

const THEMES: { name: BaseTheme; color: string }[] = [
  { name: 'neutral', color: '#737373' },
  { name: 'blue', color: '#3b82f6' },
  { name: 'violet', color: '#8b5cf6' },
  { name: 'emerald', color: '#10b981' },
  { name: 'rose', color: '#f43f5e' },
  { name: 'orange', color: '#f97316' },
  { name: 'amber', color: '#f59e0b' },
  { name: 'cyan', color: '#06b6d4' },
  { name: 'green', color: '#22c55e' },
  { name: 'red', color: '#ef4444' },
];

interface ThemeSelectorState {
  open: boolean;
  current: BaseTheme;
  dark: boolean;
}

export class ThemeSelector extends Component<{}, ThemeSelectorState> {
  private unsub: (() => void) | null = null;

  state: ThemeSelectorState = {
    open: false,
    current: getBaseTheme(),
    dark: isDarkMode(),
  };

  componentDidMount() {
    this.unsub = subscribeTheme(() => {
      this.setState({ current: getBaseTheme(), dark: isDarkMode() });
    });
  }

  componentWillUnmount() {
    this.unsub?.();
  }

  private toggle = () => this.setState({ open: !this.state.open });

  render() {
    const { open, current, dark } = this.state;

    return (
      <div class="relative">
        <Button variant="ghost" size="sm" onClick={this.toggle} className="gap-1.5">
          {dark ? (
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          ) : (
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          )}
        </Button>

        {open && (
          <div class="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 w-[220px]">
            {/* Dark mode toggle */}
            <button
              class="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent text-sm mb-2"
              onClick={() => toggleDarkMode()}
            >
              <span>Dark mode</span>
              <div class={`w-8 h-4 rounded-full transition-colors ${dark ? 'bg-primary' : 'bg-muted'} relative`}>
                <div class={`absolute top-0.5 size-3 rounded-full bg-white transition-transform ${dark ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            <div class="section-divider my-2" />

            {/* Color themes */}
            <div class="grid grid-cols-5 gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.name}
                  class={`size-7 rounded-full border-2 transition-all hover:scale-110 ${current === t.name ? 'border-foreground ring-2 ring-ring/30' : 'border-transparent'}`}
                  style={{ background: t.color }}
                  onClick={() => { setBaseTheme(t.name); }}
                  title={t.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
}
