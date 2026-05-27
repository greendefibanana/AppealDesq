import './index.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '../server/trpc';
import type {
  AppealCase,
  AppealPattern,
  AppealSettings,
  AppealStatus,
  AppealUserHistory,
} from '../shared/appeals';
import { trpc } from './trpc';

type DashboardData = inferRouterOutputs<AppRouter>['appeals']['dashboard'];
type DashboardCase = DashboardData['cases'][number];
type Tab = 'ready' | 'waiting' | 'incomplete' | 'low_effort' | 'resolved' | 'settings';
type Theme = 'light' | 'dark';
type AppealAction =
  | 'ask_followup'
  | 'deny'
  | 'approve_unban'
  | 'temp_ban_reduce'
  | 'mute_72h'
  | 'archive'
  | 'mark_resolved';
type BusyAction = { id: string; action: AppealAction } | null;
type PendingAction = { appealCase: AppealCase; action: AppealAction } | null;
type SettingsErrorKey =
  | 'appealTemplate'
  | 'denialTemplate'
  | 'followupTemplate'
  | 'maxFollowups'
  | 'dataRetentionDays'
  | 'lowEffortKeywords';
type SettingsErrors = Partial<Record<SettingsErrorKey, string>>;
type SettingsDraft = AppealSettings & {
  lowEffortKeywordsText: string;
};

const TABS: Array<{ id: Tab; label: string; statuses?: AppealStatus[] }> = [
  { id: 'ready', label: 'Ready', statuses: ['ready_for_review'] },
  { id: 'waiting', label: 'Waiting', statuses: ['awaiting_user'] },
  { id: 'incomplete', label: 'Incomplete', statuses: ['incomplete'] },
  { id: 'low_effort', label: 'Low effort', statuses: ['low_effort'] },
  { id: 'resolved', label: 'Resolved', statuses: ['resolved', 'archived'] },
  { id: 'settings', label: 'Settings' },
];

const statusLabel: Record<AppealStatus, string> = {
  awaiting_user: 'Awaiting user',
  ready_for_review: 'Ready for review',
  incomplete: 'Incomplete',
  low_effort: 'Low effort',
  resolved: 'Resolved',
  archived: 'Archived',
};

const statusClass: Record<AppealStatus, string> = {
  awaiting_user: 'chip chip-waiting',
  ready_for_review: 'chip chip-ready',
  incomplete: 'chip chip-incomplete',
  low_effort: 'chip chip-low',
  resolved: 'chip chip-resolved',
  archived: 'chip chip-archived',
};

const patternClass: Record<AppealPattern, string> = {
  'First appeal': 'pattern-badge pattern-first',
  'Good-faith history': 'pattern-badge pattern-good',
  'Repeat appeal': 'pattern-badge pattern-repeat',
  'Repeat low-effort': 'pattern-badge pattern-low',
  Normal: 'pattern-badge pattern-normal',
};

const actionLabels: Record<AppealAction, string> = {
  ask_followup: 'Ask follow-up',
  deny: 'Deny + close',
  approve_unban: 'Approve / unban',
  temp_ban_reduce: 'Reduce temp-ban',
  mute_72h: 'Mute 72h',
  archive: 'Archive',
  mark_resolved: 'Mark resolved',
};

const actionDescriptions: Record<AppealAction, string> = {
  ask_followup: 'Send the follow-up template with the missing fields.',
  deny: 'Send the denial template when possible and move this case to Resolved.',
  approve_unban: 'Attempt the Reddit modmail unban action and resolve the case after success.',
  temp_ban_reduce: 'Attempt to reduce the ban to seven days through Reddit modmail.',
  mute_72h: 'Attempt to mute this modmail conversation for 72 hours.',
  archive: 'Attempt to archive the conversation and remove it from the active queue.',
  mark_resolved: 'Mark the local AppealDesq case as resolved without sending a message.',
};

const tabCopy: Record<Exclude<Tab, 'settings'>, { title: string; description: string }> = {
  ready: {
    title: 'Ready for review',
    description: 'Complete packets that are ready for a moderator decision.',
  },
  waiting: {
    title: 'Awaiting user',
    description: 'Template sent. Waiting for the user to provide structured details.',
  },
  incomplete: {
    title: 'Needs follow-up',
    description: 'Missing fields that usually matter for a fair appeal review.',
  },
  low_effort: {
    title: 'Low-effort or abusive',
    description: 'Flagged for awareness only. No enforcement action is automatic.',
  },
  resolved: {
    title: 'Resolved',
    description: 'Cases that were closed locally or archived after review.',
  },
};

function formatRelativeTime(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isSensitiveAction(action: AppealAction) {
  return (
    action === 'deny' ||
    action === 'approve_unban' ||
    action === 'temp_ban_reduce' ||
    action === 'mute_72h' ||
    action === 'archive'
  );
}

function getPrimaryAction(appealCase: AppealCase): AppealAction {
  if (appealCase.status === 'incomplete' || appealCase.status === 'awaiting_user') {
    return 'ask_followup';
  }
  return 'mark_resolved';
}

function getSecondaryActions(appealCase: AppealCase): AppealAction[] {
  const actions: AppealAction[] = ['deny', 'archive'];
  if (appealCase.status === 'ready_for_review') {
    actions.splice(1, 0, 'approve_unban', 'temp_ban_reduce');
  }
  if (appealCase.status === 'low_effort') {
    actions.splice(1, 0, 'mute_72h');
  }
  if (appealCase.status !== 'resolved' && appealCase.status !== 'archived') {
    actions.push('mark_resolved');
  }
  return actions.filter((action) => action !== getPrimaryAction(appealCase));
}

function getCasePriority(appealCase: AppealCase) {
  if (appealCase.status === 'low_effort') return 'Sensitive';
  if (appealCase.status === 'ready_for_review') return 'Decision-ready';
  if (appealCase.status === 'incomplete') return 'Needs info';
  if (appealCase.status === 'awaiting_user') return 'Pending';
  return 'Closed';
}

function formatHistoryTime(timestamp: number | undefined) {
  return timestamp ? formatRelativeTime(timestamp) : 'No prior appeals';
}

function countForTab(data: DashboardData, tab: Tab) {
  if (tab === 'settings') return undefined;
  const statuses = TABS.find((item) => item.id === tab)?.statuses ?? [];
  return data.cases.filter((appealCase) => statuses.includes(appealCase.status)).length;
}

function validateSettingsDraft(draft: SettingsDraft): SettingsErrors {
  const errors: SettingsErrors = {};
  const lowEffortKeywords = draft.lowEffortKeywordsText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!draft.appealTemplate.trim()) {
    errors.appealTemplate = 'Appeal template is required.';
  }
  if (!draft.denialTemplate.trim()) {
    errors.denialTemplate = 'Denial template is required.';
  }
  if (!draft.followupTemplate.trim()) {
    errors.followupTemplate = 'Follow-up template is required.';
  } else if (!draft.followupTemplate.includes('{{missing_fields}}')) {
    errors.followupTemplate = 'Include {{missing_fields}} so users know what to add.';
  }
  if (!Number.isInteger(Number(draft.maxFollowups)) || draft.maxFollowups < 0 || draft.maxFollowups > 5) {
    errors.maxFollowups = 'Use a whole number from 0 to 5.';
  }
  if (
    !Number.isInteger(Number(draft.dataRetentionDays)) ||
    draft.dataRetentionDays < 1 ||
    draft.dataRetentionDays > 90
  ) {
    errors.dataRetentionDays = 'Use a whole number from 1 to 90.';
  }
  if (lowEffortKeywords.length > 50) {
    errors.lowEffortKeywords = 'Keep the keyword list to 50 entries or fewer.';
  }

  return errors;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ready' | 'waiting' | 'incomplete' | 'low' | 'resolved';
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="score-meter" aria-label={`Completeness score ${score} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < score ? 'filled' : ''} />
      ))}
    </div>
  );
}

function ConfirmationModal({
  pendingAction,
  busy,
  onCancel,
  onConfirm,
}: {
  pendingAction: PendingAction;
  busy: BusyAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!pendingAction) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, pendingAction]);

  if (!pendingAction) return null;

  const isBusy = busy?.id === pendingAction.appealCase.id && busy.action === pendingAction.action;
  const actionLabel = actionLabels[pendingAction.action];

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <p className="eyebrow">Moderator confirmation</p>
        <h2 id="confirm-title">{actionLabel}</h2>
        <p id="confirm-description">{actionDescriptions[pendingAction.action]}</p>
        <div className="confirm-case">
          <span>{pendingAction.appealCase.userName || 'Unknown user'}</span>
          <strong>{pendingAction.appealCase.subject || pendingAction.appealCase.conversationId}</strong>
        </div>
        <div className="confirm-safety">
          AppealDesq will not take this action unless you confirm it here.
        </div>
        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            className={pendingAction.action === 'archive' ? 'button' : 'button danger solid'}
            onClick={onConfirm}
            disabled={isBusy}
            aria-busy={isBusy}
          >
            {isBusy ? 'Working...' : `Confirm ${actionLabel}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function CaseCard({
  appealCase,
  onAction,
  onRequestConfirm,
  busy,
  error,
}: {
  appealCase: DashboardCase;
  onAction: (id: string, action: AppealAction) => void;
  onRequestConfirm: (appealCase: AppealCase, action: AppealAction) => void;
  busy: BusyAction;
  error: string | undefined;
}) {
  const primaryAction = getPrimaryAction(appealCase);
  const secondaryActions = getSecondaryActions(appealCase);
  const primaryBusy = busy?.id === appealCase.id && busy.action === primaryAction;

  return (
    <article className={`case-card status-${appealCase.status}`} aria-busy={busy?.id === appealCase.id}>
      <div className="case-card-top">
        <span className={statusClass[appealCase.status]}>{statusLabel[appealCase.status]}</span>
        <span className="priority-label">{getCasePriority(appealCase)}</span>
      </div>

      <div className="case-title-row">
        <div>
          <h2>{appealCase.userName ? `u/${appealCase.userName}` : 'Unknown user'}</h2>
          <p>{appealCase.subject || appealCase.conversationId}</p>
        </div>
        <time>{formatRelativeTime(appealCase.updatedAt)}</time>
      </div>

      <div className="case-summary-grid">
        <div className="score-row">
          <div>
            <span className="detail-label">Score</span>
            <strong>{appealCase.score}/5</strong>
          </div>
          <ScoreMeter score={appealCase.score} />
        </div>
        <div className="followup-pill">
          <span>Follow-ups</span>
          <strong>{appealCase.followupCount}</strong>
        </div>
      </div>

      <p className="summary">{appealCase.summary}</p>

      <div className="missing">
        <span className="detail-label">Missing fields</span>
        {appealCase.missingFields.length > 0 ? (
          <div className="missing-list">
            {appealCase.missingFields.map((field) => (
              <span key={field}>{field}</span>
            ))}
          </div>
        ) : (
          <span className="complete">Complete packet</span>
        )}
      </div>

      <div className="case-meta">
        <div>
          <span className="detail-label">Conversation</span>
          <span className="detail-value">{appealCase.conversationId}</span>
        </div>
        <div>
          <span className="detail-label">Latest reply</span>
          <span className="detail-value">{appealCase.lastMessagePreview}</span>
        </div>
      </div>

      <UserHistoryPanel history={appealCase.userHistory} />

      {error ? <div className="case-error">{error}</div> : null}

      <div className="actions">
        <button
          type="button"
          className="button primary"
          disabled={Boolean(busy)}
          onClick={() => onAction(appealCase.id, primaryAction)}
          aria-busy={primaryBusy}
        >
          {primaryBusy ? 'Working...' : actionLabels[primaryAction]}
        </button>
        <div className="secondary-actions" aria-label="Secondary moderator actions">
          {secondaryActions.map((action) => {
            const actionBusy = busy?.id === appealCase.id && busy.action === action;
            return (
              <button
                key={action}
                type="button"
                className={isSensitiveAction(action) ? 'button compact danger' : 'button compact'}
                disabled={Boolean(busy)}
                onClick={() =>
                  isSensitiveAction(action)
                    ? onRequestConfirm(appealCase, action)
                    : onAction(appealCase.id, action)
                }
                aria-busy={actionBusy}
              >
                {actionBusy ? 'Working...' : actionLabels[action]}
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function UserHistoryPanel({ history }: { history: AppealUserHistory | undefined }) {
  if (!history) {
    return (
      <section className="user-history">
        <div className="history-title-row">
          <span className="detail-label">User history</span>
          <span className="pattern-badge pattern-normal">Unknown</span>
        </div>
        <div className="history-grid">
          <div>
            <span>Total appeals</span>
            <strong>0</strong>
          </div>
          <div>
            <span>Low-effort</span>
            <strong>0</strong>
          </div>
          <div>
            <span>Last appeal</span>
            <strong>No username</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="user-history">
      <div className="history-title-row">
        <span className="detail-label">User history</span>
        <span className={patternClass[history.suggestedPattern]}>{history.suggestedPattern}</span>
      </div>
      <div className="history-grid">
        <div>
          <span>Total appeals</span>
          <strong>{history.totalAppeals}</strong>
        </div>
        <div>
          <span>Low-effort</span>
          <strong>{history.lowEffortAppeals}</strong>
        </div>
        <div>
          <span>Last appeal</span>
          <strong>{formatHistoryTime(history.lastAppealAt)}</strong>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <p className="eyebrow">Queue clear</p>
      <h2>No appeal packets here</h2>
      <p>When matching modmail arrives, AppealDesq will create structured packets for review.</p>
    </section>
  );
}

function AssuranceRow() {
  return (
    <section className="assurance-row" aria-label="Safety guarantees">
      <div>
        <strong>Human approval only</strong>
        <span>No automatic unbans, mutes, bans, or punishments.</span>
      </div>
      <div>
        <strong>Compact records</strong>
        <span>Stores appeal metadata, score, missing fields, and short previews.</span>
      </div>
      <div>
        <strong>Rule-based</strong>
        <span>No LLMs, no external APIs, no paid infrastructure.</span>
      </div>
    </section>
  );
}

function QueueHeader({
  tab,
  count,
  total,
  query,
  onQueryChange,
}: {
  tab: Exclude<Tab, 'settings'>;
  count: number;
  total: number;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const copy = tabCopy[tab];

  return (
    <section className="queue-header">
      <div>
        <p className="eyebrow">Review queue</p>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <div className="queue-tools">
        <span>
          Showing {count} of {total}
        </span>
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="User, subject, conversation..."
            autoComplete="off"
          />
        </label>
      </div>
    </section>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function SettingsPanel({
  settings,
  onSave,
  saving,
}: {
  settings: AppealSettings;
  onSave: (settings: AppealSettings) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<SettingsDraft>({
    ...settings,
    lowEffortKeywordsText: settings.lowEffortKeywords.join('\n'),
  });
  const [errors, setErrors] = useState<SettingsErrors>({});

  const submitSettings = () => {
    const nextErrors = validateSettingsDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSave({
      appealTemplate: draft.appealTemplate.trim(),
      denialTemplate: draft.denialTemplate.trim(),
      followupTemplate: draft.followupTemplate.trim(),
      maxFollowups: Number(draft.maxFollowups),
      dataRetentionDays: Number(draft.dataRetentionDays),
      autoArchiveLowEffort: draft.autoArchiveLowEffort,
      lowEffortKeywords: draft.lowEffortKeywordsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  return (
    <form
      className="settings-panel"
      onSubmit={(event) => {
        event.preventDefault();
        submitSettings();
      }}
    >
      <section className="settings-section">
        <div className="settings-section-heading">
          <p className="eyebrow">Templates</p>
          <h2>Modmail replies</h2>
          <p>These messages are sent only after AppealDesq detects an appeal or a moderator clicks an action.</p>
        </div>
        <label>
          Appeal template
          <textarea
            value={draft.appealTemplate}
            onChange={(event) => setDraft({ ...draft, appealTemplate: event.target.value })}
            rows={7}
            aria-invalid={Boolean(errors.appealTemplate)}
          />
          <FieldError message={errors.appealTemplate} />
        </label>
        <label>
          Denial template
          <textarea
            value={draft.denialTemplate}
            onChange={(event) => setDraft({ ...draft, denialTemplate: event.target.value })}
            rows={4}
            aria-invalid={Boolean(errors.denialTemplate)}
          />
          <FieldError message={errors.denialTemplate} />
        </label>
        <label>
          Follow-up template
          <textarea
            value={draft.followupTemplate}
            onChange={(event) => setDraft({ ...draft, followupTemplate: event.target.value })}
            rows={5}
            aria-invalid={Boolean(errors.followupTemplate)}
          />
          <FieldError message={errors.followupTemplate} />
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <p className="eyebrow">Safety</p>
          <h2>Review controls</h2>
          <p>Keep automation bounded so moderators stay in control of enforcement.</p>
        </div>
        <div className="settings-row">
          <label>
            Max follow-ups
            <input
              type="number"
              min="0"
              max="5"
              value={draft.maxFollowups}
              onChange={(event) => setDraft({ ...draft, maxFollowups: Number(event.target.value) })}
              aria-invalid={Boolean(errors.maxFollowups)}
            />
            <FieldError message={errors.maxFollowups} />
          </label>
          <label>
            Retention days
            <input
              type="number"
              min="1"
              max="90"
              value={draft.dataRetentionDays}
              onChange={(event) =>
                setDraft({ ...draft, dataRetentionDays: Number(event.target.value) })
              }
              aria-invalid={Boolean(errors.dataRetentionDays)}
            />
            <FieldError message={errors.dataRetentionDays} />
          </label>
        </div>
        <label>
          Low-effort keywords
          <textarea
            value={draft.lowEffortKeywordsText}
            onChange={(event) => setDraft({ ...draft, lowEffortKeywordsText: event.target.value })}
            rows={5}
            aria-invalid={Boolean(errors.lowEffortKeywords)}
          />
          <FieldError message={errors.lowEffortKeywords} />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.autoArchiveLowEffort}
            onChange={(event) => setDraft({ ...draft, autoArchiveLowEffort: event.target.checked })}
          />
          <span>
            Auto-archive low-effort cases after classification
            <small>Off by default. No muting or banning is automatic.</small>
          </span>
        </label>
      </section>

      <div className="settings-footer">
        <span>Settings are stored per subreddit in Devvit Redis.</span>
        <button type="submit" className="button primary" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}

export const App = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>('ready');
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('appealdesq-theme') === 'dark' ? 'dark' : 'light';
  });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = async () => {
    setError(null);
    const dashboard = await trpc.appeals.dashboard.query();
    setData(dashboard);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('appealdesq-theme', theme);
  }, [theme]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Unable to load AppealDesq.')
      )
      .finally(() => setLoading(false));
  }, []);

  const filteredCases = useMemo(() => {
    if (!data || tab === 'settings') return [];
    const statuses = TABS.find((item) => item.id === tab)?.statuses ?? [];
    return data.cases.filter((appealCase) => statuses.includes(appealCase.status));
  }, [data, tab]);

  const visibleCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return filteredCases;

    return filteredCases.filter((appealCase) =>
      [
        appealCase.userName,
        appealCase.subject,
        appealCase.conversationId,
        appealCase.summary,
        appealCase.lastMessagePreview,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [filteredCases, query]);

  const runAction = async (id: string, action: AppealAction) => {
    setBusyAction({ id, action });
    setNotice(null);
    setError(null);
    setCaseErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      const result = await trpc.appeals.action.mutate({ id, action });
      setNotice(result.message);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed.';
      setCaseErrors((current) => ({ ...current, [id]: message }));
    } finally {
      setBusyAction(null);
      setPendingAction(null);
    }
  };

  const saveSettings = async (settings: AppealSettings) => {
    setSavingSettings(true);
    setNotice(null);
    setError(null);
    try {
      await trpc.settings.update.mutate(settings);
      setNotice('Settings saved.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings could not be saved.');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <main className="app-shell">
        <section className="skeleton-hero" />
        <section className="skeleton-grid">
          <div />
          <div />
          <div />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-mark" src="/logo.png" alt="AppealDesq logo" />
          <div>
            <p className="eyebrow">Reddit modmail appeal triage</p>
            <h1>AppealDesq</h1>
            <p>Structured ban appeals for busy mod teams</p>
          </div>
        </div>
        <div className="topbar-actions">
          {data?.context.subredditName ? (
            <span className="workspace-pill">r/{data.context.subredditName}</span>
          ) : null}
          <button
            type="button"
            className="button compact"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" className="button compact" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}
      {notice ? <div className="banner success">{notice}</div> : null}

      {data ? (
        <>
          <section className="stats-row">
            <StatCard label="Ready for review" value={data.stats.ready_for_review} tone="ready" />
            <StatCard label="Awaiting user" value={data.stats.awaiting_user} tone="waiting" />
            <StatCard label="Incomplete" value={data.stats.incomplete} tone="incomplete" />
            <StatCard label="Low effort" value={data.stats.low_effort} tone="low" />
            <StatCard
              label="Resolved"
              value={data.stats.resolved + data.stats.archived}
              tone="resolved"
            />
          </section>

          <AssuranceRow />

          <section className="workbench">
            <nav className="tabs" aria-label="Appeal filters">
              {TABS.map((item) => {
                const count = countForTab(data, item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === tab ? 'active' : ''}
                    onClick={() => setTab(item.id)}
                    aria-current={item.id === tab ? 'page' : undefined}
                  >
                    <span>{item.label}</span>
                    {count === undefined ? null : <strong>{count}</strong>}
                  </button>
                );
              })}
            </nav>

            {tab === 'settings' ? (
              <SettingsPanel
                key={JSON.stringify(data.settings)}
                settings={data.settings}
                onSave={saveSettings}
                saving={savingSettings}
              />
            ) : (
              <>
                <QueueHeader
                  tab={tab}
                  count={visibleCases.length}
                  total={filteredCases.length}
                  query={query}
                  onQueryChange={setQuery}
                />
                {visibleCases.length > 0 ? (
                  <section className="case-grid">
                    {visibleCases.map((appealCase) => (
                      <CaseCard
                        key={appealCase.id}
                        appealCase={appealCase}
                        busy={busyAction}
                        error={caseErrors[appealCase.id]}
                        onAction={runAction}
                        onRequestConfirm={(selectedCase, action) =>
                          setPendingAction({ appealCase: selectedCase, action })
                        }
                      />
                    ))}
                  </section>
                ) : (
                  <EmptyState />
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <EmptyState />
      )}

      <ConfirmationModal
        pendingAction={pendingAction}
        busy={busyAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) {
            void runAction(pendingAction.appealCase.id, pendingAction.action);
          }
        }}
      />
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
