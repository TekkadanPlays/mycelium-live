import { Component, render } from 'inferno';
import { createElement } from 'inferno-create-element';
import { initTheme } from './stores/theme';
import { restoreSession } from './nostr/stores/auth';
import { loadLiveEventsEnabled } from './nostr/stores/liveevents';
import { fetchStreamers } from './stores/streamers';
import { loadBroadcastConfig } from './stores/broadcastconfig';
import { Header } from './components/Header';
import { WatchPage } from './components/WatchPage';
import { AdminPage } from './components/admin/AdminPage';

interface AppState {
  page: string;
}

class App extends Component<{}, AppState> {
  state: AppState = {
    page: 'watch',
  };

  componentDidMount() {
    // Restore hash-based routing
    const hash = window.location.hash.replace('#', '') || 'watch';
    this.setState({ page: hash });

    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#', '') || 'watch';
      this.setState({ page: h });
    });
  }

  private navigate = (page: string) => {
    window.location.hash = page;
    this.setState({ page });
  };

  render() {
    const { page } = this.state;

    return (
      <div class="min-h-screen bg-background text-foreground">
        <Header currentPage={page} onNavigate={this.navigate} />
        {page === 'watch' && <WatchPage />}
        {page === 'admin' && <AdminPage />}
      </div>
    );
  }
}

// Initialize stores
initTheme();
restoreSession();
loadLiveEventsEnabled();
loadBroadcastConfig();
fetchStreamers();

// Mount
const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
