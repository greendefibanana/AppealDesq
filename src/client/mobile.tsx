import './mobile.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '../server/trpc';
import { trpc } from './trpc';

type DashboardData = inferRouterOutputs<AppRouter>['appeals']['dashboard'];

const isLocalPreview = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

const previewStats: DashboardData['stats'] = {
  ready_for_review: 1,
  awaiting_user: 1,
  incomplete: 1,
  low_effort: 2,
  resolved: 2,
  archived: 0,
};

const emptyStats: DashboardData['stats'] = {
  ready_for_review: 0,
  awaiting_user: 0,
  incomplete: 0,
  low_effort: 0,
  resolved: 0,
  archived: 0,
};

export function MobileLauncher() {
  const [stats, setStats] = useState<DashboardData['stats'] | null>(null);
  const [subredditName, setSubredditName] = useState('appealdesq_dev');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoReadOnly, setDemoReadOnly] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await trpc.appeals.dashboard.query();
      setStats(dashboard.stats);
      setSubredditName(dashboard.context.subredditName);
      setDemoReadOnly(dashboard.context.demoReadOnly);
    } catch (err) {
      if (isLocalPreview()) {
        setStats(previewStats);
      } else {
        setStats(null);
        setError(err instanceof Error ? err.message : 'Unable to load AppealDesq mobile queue.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const currentStats = stats ?? emptyStats;

  return (
    <main className="mobile-launcher">
      <header className="mobile-launcher-head">
        <img src="/logo.png" alt="AppealDesq logo" />
        <div>
          <h1>AppealDesq</h1>
          <p>Mobile appeal queue</p>
          <span>r/{subredditName}</span>
        </div>
      </header>

      {error ? (
        <div className="mobile-launcher-error">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      <section className="mobile-launcher-stats" aria-label="Appeal queue summary">
        <div>
          <span>Ready</span>
          <strong>{currentStats.ready_for_review}</strong>
        </div>
        <div>
          <span>Waiting</span>
          <strong>{currentStats.awaiting_user}</strong>
        </div>
        <div>
          <span>Incomplete</span>
          <strong>{currentStats.incomplete}</strong>
        </div>
        <div>
          <span>Low effort</span>
          <strong>{currentStats.low_effort}</strong>
        </div>
      </section>

      <div className="mobile-launcher-actions">
        <button
          type="button"
          className="mobile-button mobile-button-primary"
          onClick={(event) => {
            if (isLocalPreview()) {
              window.location.href = '/mobile-full.html';
              return;
            }
            requestExpandedMode(event.nativeEvent, 'mobileFull');
          }}
        >
          Open full mobile dashboard
        </button>
        <button type="button" className="mobile-button" onClick={() => void refresh()}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <p className="mobile-launcher-note">
        {demoReadOnly
          ? 'Public demo mode: this test subreddit is viewable by judges. Production installs are moderator-gated.'
          : 'Opens in expanded mode for scrolling. Human mod approval is required for enforcement actions.'}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileLauncher />
  </StrictMode>
);
