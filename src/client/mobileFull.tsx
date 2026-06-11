import './mobile.css';

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
import { DEFAULT_SETTINGS } from '../shared/appeals';
import { trpc } from './trpc';

type DashboardData = inferRouterOutputs<AppRouter>['appeals']['dashboard'];
type DashboardCase = DashboardData['cases'][number];
type MobileTab =
  | 'ready'
  | 'waiting'
  | 'paused'
  | 'incomplete'
  | 'low_effort'
  | 'resolved'
  | 'archived'
  | 'settings';
type AppealAction =
  | 'ask_followup'
  | 'deny'
  | 'approve_unban'
  | 'temp_ban_reduce'
  | 'mute_72h'
  | 'archive'
  | 'mark_resolved';
type BusyAction = { id: string; action: AppealAction } | null;
type PendingAction = { appealCase: DashboardCase; action: AppealAction } | null;
type SettingsDraft = AppealSettings & {
  lowEffortKeywordsText: string;
};
type SettingsErrors = Partial<
  Record<
    | 'appealTemplate'
    | 'denialTemplate'
    | 'followupTemplate'
    | 'maxFollowups'
    | 'dataRetentionDays'
    | 'lowEffortKeywords',
    string
  >
>;

const tabs: Array<{ id: MobileTab; label: string; statuses?: AppealStatus[] }> = [
  { id: 'ready', label: 'Ready', statuses: ['ready_for_review'] },
  { id: 'waiting', label: 'Waiting', statuses: ['awaiting_user'] },
  { id: 'paused', label: 'Paused', statuses: ['paused_muted'] },
  { id: 'incomplete', label: 'Incomplete', statuses: ['incomplete'] },
  { id: 'low_effort', label: 'Low effort', statuses: ['low_effort'] },
  { id: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { id: 'archived', label: 'Archived', statuses: ['archived'] },
  { id: 'settings', label: 'Settings' },
];

const statusLabel: Record<AppealStatus, string> = {
  awaiting_user: 'Awaiting user',
  paused_muted: 'Appeal paused: user may be muted',
  ready_for_review: 'Ready for review',
  incomplete: 'Incomplete',
  low_effort: 'Low effort',
  resolved: 'Resolved',
  archived: 'Archived',
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
  ask_followup: 'Sends the follow-up template with the missing fields.',
  deny: 'Sends the denial template when supported and moves this case to Resolved.',
  approve_unban: 'Attempts the Reddit unban method and resolves the case after success.',
  temp_ban_reduce: 'Attempts to reduce the existing ban through Reddit modmail.',
  mute_72h: 'Attempts to mute this modmail conversation for 72 hours.',
  archive: 'Attempts to archive the conversation and marks the case Archived locally.',
  mark_resolved: 'Marks the local AppealDesq case as Resolved without sending a message.',
};

const patternClass: Record<AppealPattern, string> = {
  'First appeal': 'mobile-pattern mobile-pattern-first',
  'Good-faith history': 'mobile-pattern mobile-pattern-good',
  'Repeat appeal': 'mobile-pattern mobile-pattern-repeat',
  'Repeat low-effort': 'mobile-pattern mobile-pattern-low',
  Normal: 'mobile-pattern mobile-pattern-normal',
};

const isLocalPreview = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

function createPreviewDashboard(): DashboardData {
  const now = Date.now();
  const cases: DashboardData['cases'] = [
    {
      id: 'preview-ready',
      subredditId: 't5_preview',
      subredditName: 'appealdesq_dev',
      conversationId: 'ModmailConversation_ready_5',
      userName: 'Willing_Patient_2157',
      subject: 'Ban appeal',
      status: 'ready_for_review',
      score: 5,
      missingFields: [],
      summary:
        'User identified the ban, linked the comment, explained rule 2 confusion, committed to reporting instead of escalating, and gave a reconsideration reason.',
      lastMessagePreview:
        'I am appealing my ban. The comment was here: reddit.com/r/test/comments/abc...',
      followupCount: 0,
      createdAt: now - 1000 * 60 * 60 * 7,
      updatedAt: now - 1000 * 60 * 24,
      userHistory: {
        totalAppeals: 2,
        readyAppeals: 1,
        incompleteAppeals: 1,
        lowEffortAppeals: 0,
        resolvedAppeals: 0,
        archivedAppeals: 0,
        firstAppealAt: now - 1000 * 60 * 60 * 24 * 12,
        lastAppealAt: now - 1000 * 60 * 24,
        suggestedPattern: 'Good-faith history',
      },
    },
    {
      id: 'preview-paused',
      subredditId: 't5_preview',
      subredditName: 'appealdesq_dev',
      conversationId: 'ModmailConversation_paused_1',
      userName: 'MutedMember',
      subject: 'Ban appeal',
      status: 'paused_muted',
      score: 1,
      missingFields: [
        'Post/comment link, or clear statement that no link applies',
        'Rule or misunderstanding explanation',
        'What the user would do differently next time',
        'Reason the mod team should reconsider',
      ],
      summary: 'Appeal paused: user may be muted. User is currently muted in modmail.',
      lastMessagePreview: 'why was i banned',
      followupCount: 0,
      createdAt: now - 1000 * 60 * 35,
      updatedAt: now - 1000 * 60 * 12,
      userHistory: {
        totalAppeals: 1,
        readyAppeals: 0,
        incompleteAppeals: 0,
        lowEffortAppeals: 0,
        resolvedAppeals: 0,
        archivedAppeals: 0,
        firstAppealAt: now - 1000 * 60 * 35,
        lastAppealAt: now - 1000 * 60 * 12,
        suggestedPattern: 'First appeal',
      },
    },
    {
      id: 'preview-waiting',
      subredditId: 't5_preview',
      subredditName: 'appealdesq_dev',
      conversationId: 'ModmailConversation_waiting_0',
      userName: 'Relevant-Seat-5220',
      subject: 'why was i banned this is unfair',
      status: 'awaiting_user',
      score: 0,
      missingFields: [
        'Action being appealed',
        'Post/comment link or confirmation that no link applies',
        'Rule or misunderstanding explanation',
        'What would change next time',
        'Reason for reconsideration',
      ],
      summary: 'Appeal template sent. Waiting for structured details.',
      lastMessagePreview: 'why was i banned this is unfair',
      followupCount: 0,
      createdAt: now - 1000 * 60 * 18,
      updatedAt: now - 1000 * 60 * 8,
      userHistory: {
        totalAppeals: 1,
        readyAppeals: 0,
        incompleteAppeals: 0,
        lowEffortAppeals: 0,
        resolvedAppeals: 0,
        archivedAppeals: 0,
        firstAppealAt: now - 1000 * 60 * 18,
        lastAppealAt: now - 1000 * 60 * 8,
        suggestedPattern: 'First appeal',
      },
    },
    {
      id: 'preview-low',
      subredditId: 't5_preview',
      subredditName: 'appealdesq_dev',
      conversationId: 'ModmailConversation_low_0',
      userName: 'AngryAlt404',
      subject: 'unban me',
      status: 'low_effort',
      score: 0,
      missingFields: [
        'Action being appealed',
        'Post/comment link or confirmation that no link applies',
        'Rule or misunderstanding explanation',
        'What would change next time',
        'Reason for reconsideration',
      ],
      summary: 'Very short or abusive appeal with no reviewable information.',
      lastMessagePreview: 'fuck you mods',
      followupCount: 1,
      createdAt: now - 1000 * 60 * 60 * 28,
      updatedAt: now - 1000 * 60 * 60 * 3,
      userHistory: {
        totalAppeals: 4,
        readyAppeals: 0,
        incompleteAppeals: 1,
        lowEffortAppeals: 3,
        resolvedAppeals: 0,
        archivedAppeals: 0,
        firstAppealAt: now - 1000 * 60 * 60 * 24 * 20,
        lastAppealAt: now - 1000 * 60 * 60 * 3,
        suggestedPattern: 'Repeat low-effort',
      },
    },
    {
      id: 'preview-incomplete',
      subredditId: 't5_preview',
      subredditName: 'appealdesq_dev',
      conversationId: 'ModmailConversation_incomplete_2',
      userName: 'AlmostHelpful',
      subject: 'I did not mean to break the rule',
      status: 'incomplete',
      score: 2,
      missingFields: [
        'Post/comment link or confirmation that no link applies',
        'What would change next time',
        'Reason for reconsideration',
      ],
      summary: 'User gives some context but still needs the link, next-step commitment, and reconsideration reason.',
      lastMessagePreview: 'I think rule 4 was misunderstood, I was replying to a joke.',
      followupCount: 1,
      createdAt: now - 1000 * 60 * 60 * 2,
      updatedAt: now - 1000 * 60 * 44,
      userHistory: {
        totalAppeals: 2,
        readyAppeals: 0,
        incompleteAppeals: 2,
        lowEffortAppeals: 0,
        resolvedAppeals: 0,
        archivedAppeals: 0,
        firstAppealAt: now - 1000 * 60 * 60 * 24 * 4,
        lastAppealAt: now - 1000 * 60 * 44,
        suggestedPattern: 'Normal',
      },
    },
  ];

  return {
    cases,
    stats: {
      awaiting_user: cases.filter((appealCase) => appealCase.status === 'awaiting_user').length,
      paused_muted: cases.filter((appealCase) => appealCase.status === 'paused_muted').length,
      ready_for_review: cases.filter((appealCase) => appealCase.status === 'ready_for_review').length,
      incomplete: cases.filter((appealCase) => appealCase.status === 'incomplete').length,
      low_effort: cases.filter((appealCase) => appealCase.status === 'low_effort').length,
      resolved: cases.filter((appealCase) => appealCase.status === 'resolved').length,
      archived: cases.filter((appealCase) => appealCase.status === 'archived').length,
    },
    settings: DEFAULT_SETTINGS,
    context: {
      subredditId: 't5_preview',
      subredditName: 'appealdesq_dev',
      username: 'preview_mod',
      canModerate: true,
      demoReadOnly: false,
    },
  };
}

function formatRelativeTime(timestamp: number | undefined) {
  if (!timestamp) return 'No history';
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
  if (appealCase.status === 'paused_muted') {
    return 'mark_resolved';
  }
  if (appealCase.status === 'awaiting_user' || appealCase.status === 'incomplete') {
    return 'ask_followup';
  }
  if (appealCase.status === 'low_effort') {
    return 'deny';
  }
  if (appealCase.status === 'resolved') {
    return 'archive';
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

function countForTab(data: DashboardData, tab: MobileTab) {
  const statuses = tabs.find((item) => item.id === tab)?.statuses;
  if (!statuses) return undefined;
  return data.cases.filter((appealCase) => statuses.includes(appealCase.status)).length;
}

function validateSettings(draft: SettingsDraft): SettingsErrors {
  const errors: SettingsErrors = {};
  const keywords = draft.lowEffortKeywordsText
    .split('\n')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (!draft.appealTemplate.trim()) errors.appealTemplate = 'Appeal template is required.';
  if (!draft.denialTemplate.trim()) errors.denialTemplate = 'Denial template is required.';
  if (!draft.followupTemplate.trim()) {
    errors.followupTemplate = 'Follow-up template is required.';
  } else if (!draft.followupTemplate.includes('{{missing_fields}}')) {
    errors.followupTemplate = 'Include {{missing_fields}} in the follow-up template.';
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
  if (keywords.length > 50) errors.lowEffortKeywords = 'Keep this to 50 keywords or fewer.';

  return errors;
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="mobile-score-meter" aria-label={`Score ${score} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < score ? 'filled' : ''} />
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: AppealStatus }) {
  return <span className={`mobile-chip status-${status}`}>{statusLabel[status]}</span>;
}

function UserHistory({ history }: { history: AppealUserHistory | undefined }) {
  return (
    <section className="mobile-history">
      <div className="mobile-section-title">
        <span>User history</span>
        <span className={history ? patternClass[history.suggestedPattern] : patternClass.Normal}>
          {history?.suggestedPattern ?? 'Unknown'}
        </span>
      </div>
      <div className="mobile-history-grid">
        <div>
          <span>Total appeals</span>
          <strong>{history?.totalAppeals ?? 0}</strong>
        </div>
        <div>
          <span>Low-effort</span>
          <strong>{history?.lowEffortAppeals ?? 0}</strong>
        </div>
        <div>
          <span>Last appeal</span>
          <strong>{formatRelativeTime(history?.lastAppealAt)}</strong>
        </div>
      </div>
    </section>
  );
}

function CaseCard({
  appealCase,
  busy,
  error,
  readOnly,
  onAction,
  onConfirmAction,
}: {
  appealCase: DashboardCase;
  busy: BusyAction;
  error: string | undefined;
  readOnly: boolean;
  onAction: (id: string, action: AppealAction) => void;
  onConfirmAction: (appealCase: DashboardCase, action: AppealAction) => void;
}) {
  const primaryAction = getPrimaryAction(appealCase);
  const primaryBusy = busy?.id === appealCase.id && busy.action === primaryAction;
  const disabled = Boolean(busy);

  const triggerAction = (action: AppealAction) => {
    if (isSensitiveAction(action)) {
      onConfirmAction(appealCase, action);
      return;
    }
    onAction(appealCase.id, action);
  };

  return (
    <article className="mobile-case-card">
      <header className="mobile-case-head">
        <div>
          <p>{appealCase.userName ? `u/${appealCase.userName}` : 'Unknown user'}</p>
          <span>{formatRelativeTime(appealCase.updatedAt)}</span>
        </div>
        <StatusChip status={appealCase.status} />
      </header>

      <div className="mobile-case-subject">{appealCase.subject || appealCase.conversationId}</div>

      <section className="mobile-score-block">
        <div>
          <span>Appeal quality score</span>
          <strong>{appealCase.score}/5</strong>
        </div>
        <ScoreMeter score={appealCase.score} />
      </section>

      <p className="mobile-summary">{appealCase.summary}</p>

      <section className="mobile-missing">
        <span>Missing fields</span>
        {appealCase.missingFields.length > 0 ? (
          <div>
            {appealCase.missingFields.map((field) => (
              <em key={field}>{field}</em>
            ))}
          </div>
        ) : (
          <strong>Complete packet</strong>
        )}
      </section>

      <section className="mobile-meta-grid">
        <div>
          <span>Conversation</span>
          <strong>{appealCase.conversationId}</strong>
        </div>
        <div>
          <span>Latest reply</span>
          <strong>{appealCase.lastMessagePreview}</strong>
        </div>
        <div>
          <span>Follow-ups</span>
          <strong>{appealCase.followupCount}</strong>
        </div>
      </section>

      <UserHistory history={appealCase.userHistory} />

      {error ? <div className="mobile-inline-error">{error}</div> : null}
      {readOnly ? (
        <div className="mobile-inline-error">
          Demo read-only mode: production installs require moderator access for actions.
        </div>
      ) : null}

      <div className="mobile-card-actions">
        <button
          type="button"
          className="mobile-button mobile-button-primary"
          disabled={disabled || readOnly}
          onClick={() => triggerAction(primaryAction)}
          aria-busy={primaryBusy}
        >
          {primaryBusy ? 'Working...' : actionLabels[primaryAction]}
        </button>
        <div>
          {getSecondaryActions(appealCase).map((action) => {
            const actionBusy = busy?.id === appealCase.id && busy.action === action;
            return (
              <button
                key={action}
                type="button"
                className={isSensitiveAction(action) ? 'mobile-button mobile-button-danger' : 'mobile-button'}
                disabled={disabled || readOnly}
                onClick={() => triggerAction(action)}
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

function ConfirmModal({
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
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, pendingAction]);

  if (!pendingAction) return null;

  const isBusy =
    busy?.id === pendingAction.appealCase.id && busy.action === pendingAction.action;

  return (
    <div className="mobile-modal-backdrop" role="presentation">
      <section
        className="mobile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-confirm-title"
      >
        <div className="mobile-modal-alert">Moderator confirmation</div>
        <h2 id="mobile-confirm-title">{actionLabels[pendingAction.action]}</h2>
        <p>{actionDescriptions[pendingAction.action]}</p>
        <div className="mobile-confirm-target">
          <span>Target user</span>
          <strong>{pendingAction.appealCase.userName || 'Unknown user'}</strong>
        </div>
        <div className="mobile-safety-note">
          AppealDesq never performs enforcement automatically. A human mod must confirm.
        </div>
        <div className="mobile-modal-actions">
          <button type="button" className="mobile-button" onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="mobile-button mobile-button-danger mobile-button-solid"
            onClick={onConfirm}
            disabled={isBusy}
            aria-busy={isBusy}
          >
            {isBusy ? 'Working...' : 'Confirm'}
          </button>
        </div>
      </section>
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? <span className="mobile-field-error">{message}</span> : null;
}

function MobileSettings({
  settings,
  saving,
  readOnly,
  onSave,
}: {
  settings: AppealSettings;
  saving: boolean;
  readOnly: boolean;
  onSave: (settings: AppealSettings) => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>({
    ...settings,
    lowEffortKeywordsText: settings.lowEffortKeywords.join('\n'),
  });
  const [errors, setErrors] = useState<SettingsErrors>({});

  const submit = () => {
    const nextErrors = validateSettings(draft);
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
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    });
  };

  return (
    <form
      className="mobile-settings"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {readOnly ? (
        <div className="mobile-banner mobile-banner-error">
          Public demo mode is read-only. Production installs keep settings moderator-gated.
        </div>
      ) : null}
      <section className="mobile-settings-section">
        <h2>Templates</h2>
        <label>
          Appeal template
          <textarea
            value={draft.appealTemplate}
            onChange={(event) => setDraft({ ...draft, appealTemplate: event.target.value })}
            rows={8}
            aria-invalid={Boolean(errors.appealTemplate)}
          />
          <FieldError message={errors.appealTemplate} />
        </label>
        <label>
          Denial template
          <textarea
            value={draft.denialTemplate}
            onChange={(event) => setDraft({ ...draft, denialTemplate: event.target.value })}
            rows={5}
            aria-invalid={Boolean(errors.denialTemplate)}
          />
          <FieldError message={errors.denialTemplate} />
        </label>
        <label>
          Follow-up template
          <textarea
            value={draft.followupTemplate}
            onChange={(event) => setDraft({ ...draft, followupTemplate: event.target.value })}
            rows={6}
            aria-invalid={Boolean(errors.followupTemplate)}
          />
          <FieldError message={errors.followupTemplate} />
        </label>
      </section>

      <section className="mobile-settings-section">
        <h2>Safety and retention</h2>
        <div className="mobile-settings-row">
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
            onChange={(event) =>
              setDraft({ ...draft, lowEffortKeywordsText: event.target.value })
            }
            rows={5}
            aria-invalid={Boolean(errors.lowEffortKeywords)}
          />
          <FieldError message={errors.lowEffortKeywords} />
        </label>
        <label className="mobile-toggle">
          <input
            type="checkbox"
            checked={draft.autoArchiveLowEffort}
            onChange={(event) =>
              setDraft({ ...draft, autoArchiveLowEffort: event.target.checked })
            }
          />
          <span>
            Auto-archive low-effort cases
            <small>No muting, banning, or unbanning is automatic.</small>
          </span>
        </label>
      </section>

      <button type="submit" className="mobile-button mobile-button-primary" disabled={saving || readOnly}>
        {readOnly ? 'Read-only demo' : saving ? 'Saving...' : 'Save settings'}
      </button>
    </form>
  );
}

function EmptyState({ tab }: { tab: MobileTab }) {
  return (
    <section className="mobile-empty">
      <strong>No cases found</strong>
      <p>
        There are no appeals in {tabs.find((item) => item.id === tab)?.label.toLowerCase()} right now.
      </p>
    </section>
  );
}

export function MobileApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<MobileTab>('ready');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const dashboard = await trpc.appeals.dashboard.query();
      setData(dashboard);
    } catch (err) {
      if (isLocalPreview()) {
        setData(createPreviewDashboard());
        setNotice('Local preview data loaded. Reddit actions are disabled in this browser preview.');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load AppealDesq.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const visibleCases = useMemo(() => {
    if (!data || tab === 'settings') return [];
    const statuses = tabs.find((item) => item.id === tab)?.statuses ?? [];
    return data.cases.filter((appealCase) => statuses.includes(appealCase.status));
  }, [data, tab]);

  const runAction = async (id: string, action: AppealAction) => {
    setBusyAction({ id, action });
    setNotice(null);
    setCaseErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    if (isLocalPreview()) {
      setData((current) => {
        if (!current) return current;
        const nextCases = current.cases.map((appealCase) => {
          if (appealCase.id !== id) return appealCase;
          const nextStatus: AppealStatus =
            action === 'archive' ? 'archived' : action === 'ask_followup' ? appealCase.status : 'resolved';
          const nextCase = {
            ...appealCase,
            status: nextStatus,
            followupCount:
              action === 'ask_followup' ? appealCase.followupCount + 1 : appealCase.followupCount,
            updatedAt: Date.now(),
          };
          if (nextStatus === 'resolved' || nextStatus === 'archived') {
            return {
              ...nextCase,
              resolvedAt: Date.now(),
            };
          }
          return nextCase;
        });
        return {
          ...current,
          cases: nextCases,
          stats: {
            awaiting_user: nextCases.filter((appealCase) => appealCase.status === 'awaiting_user').length,
            paused_muted: nextCases.filter((appealCase) => appealCase.status === 'paused_muted').length,
            ready_for_review: nextCases.filter((appealCase) => appealCase.status === 'ready_for_review').length,
            incomplete: nextCases.filter((appealCase) => appealCase.status === 'incomplete').length,
            low_effort: nextCases.filter((appealCase) => appealCase.status === 'low_effort').length,
            resolved: nextCases.filter((appealCase) => appealCase.status === 'resolved').length,
            archived: nextCases.filter((appealCase) => appealCase.status === 'archived').length,
          },
        };
      });
      setNotice(`Preview: ${actionLabels[action]} completed.`);
      setBusyAction(null);
      setPendingAction(null);
      return;
    }

    try {
      const result = await trpc.appeals.action.mutate({ id, action });
      setNotice(result.message);
      await refresh();
    } catch (err) {
      setCaseErrors((current) => ({
        ...current,
        [id]: err instanceof Error ? err.message : 'Action failed.',
      }));
    } finally {
      setBusyAction(null);
      setPendingAction(null);
    }
  };

  const saveSettings = async (settings: AppealSettings) => {
    setSavingSettings(true);
    setNotice(null);
    setError(null);
    if (isLocalPreview()) {
      setData((current) => (current ? { ...current, settings } : current));
      setNotice('Preview: settings saved locally for this page view.');
      setSavingSettings(false);
      return;
    }

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
      <main className="mobile-shell">
        <section className="mobile-loading">
          <img src="/logo.png" alt="AppealDesq logo" />
          <strong>Loading AppealDesq</strong>
          <span>Fetching the mobile appeal queue...</span>
        </section>
      </main>
    );
  }

  return (
    <main className="mobile-shell">
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <img src="/logo.png" alt="AppealDesq logo" />
          <div>
            <h1>AppealDesq</h1>
            <p>Structured ban appeals for busy mod teams</p>
            {data?.context.subredditName ? <span>r/{data.context.subredditName}</span> : null}
          </div>
        </div>
        <button type="button" className="mobile-icon-button" onClick={() => void refresh()}>
          {refreshing ? '...' : 'Refresh'}
        </button>
      </header>

      {error ? (
        <div className="mobile-banner mobile-banner-error">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}
      {notice ? <div className="mobile-banner mobile-banner-success">{notice}</div> : null}

      {data ? (
        <>
          {data.context.demoReadOnly ? (
            <div className="mobile-banner mobile-banner-success">
              Public demo mode: judges can view this test dashboard. Production installs are
              moderator-gated and actions remain disabled for non-mods.
            </div>
          ) : null}
          <section className="mobile-stats" aria-label="Appeal queue summary">
            <div className="ready">
              <span>Ready</span>
              <strong>{data.stats.ready_for_review}</strong>
            </div>
            <div>
              <span>Waiting</span>
              <strong>{data.stats.awaiting_user}</strong>
            </div>
            <div className="paused">
              <span>Paused</span>
              <strong>{data.stats.paused_muted}</strong>
            </div>
            <div className="incomplete">
              <span>Incomplete</span>
              <strong>{data.stats.incomplete}</strong>
            </div>
            <div className="low">
              <span>Low effort</span>
              <strong>{data.stats.low_effort}</strong>
            </div>
            <div>
              <span>Resolved</span>
              <strong>{data.stats.resolved}</strong>
            </div>
            <div>
              <span>Archived</span>
              <strong>{data.stats.archived}</strong>
            </div>
          </section>

          <nav className="mobile-tabs" aria-label="Appeal filters">
            {tabs.map((item) => {
              const count = countForTab(data, item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? 'active' : ''}
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? 'page' : undefined}
                >
                  {item.label}
                  {count === undefined ? null : <strong>{count}</strong>}
                </button>
              );
            })}
          </nav>

          {tab === 'settings' ? (
            <MobileSettings
              settings={data.settings}
              saving={savingSettings}
              readOnly={data.context.demoReadOnly}
              onSave={saveSettings}
            />
          ) : (
            <section className="mobile-queue">
              <div className="mobile-queue-title">
                <div>
                  <span>Priority queue</span>
                  <h2>{tabs.find((item) => item.id === tab)?.label}</h2>
                </div>
                <strong>{visibleCases.length} cases</strong>
              </div>
              {visibleCases.length > 0 ? (
                visibleCases.map((appealCase) => (
                  <CaseCard
                    key={appealCase.id}
                    appealCase={appealCase}
                    busy={busyAction}
                    error={caseErrors[appealCase.id]}
                    readOnly={data.context.demoReadOnly}
                    onAction={runAction}
                    onConfirmAction={(selectedCase, action) =>
                      setPendingAction({ appealCase: selectedCase, action })
                    }
                  />
                ))
              ) : (
                <EmptyState tab={tab} />
              )}
            </section>
          )}

          <footer className="mobile-footer">
            Human mod approval required. No auto-unbans, bans, mutes, or punishments.
          </footer>
        </>
      ) : (
        <EmptyState tab={tab} />
      )}

      <ConfirmModal
        pendingAction={pendingAction}
        busy={busyAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) void runAction(pendingAction.appealCase.id, pendingAction.action);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>
);
