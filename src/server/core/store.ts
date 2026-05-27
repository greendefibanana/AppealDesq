import { context, redis } from '@devvit/web/server';

import {
  DEFAULT_SETTINGS,
  type AppealCase,
  type AppealPattern,
  type AppealSettings,
  type AppealStatus,
  type AppealUserHistory,
} from '../../shared/appeals';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

const caseKey = (subredditId: string, id: string) => `appealdesk:case:${subredditId}:${id}`;
const conversationKey = (subredditId: string, conversationId: string) =>
  `appealdesk:conversation:${subredditId}:${conversationId}`;
const userAppealHistoryKey = (subredditId: string, username: string) =>
  `appeals:user:${subredditId}:${username.toLowerCase()}`;
const indexKey = (subredditId: string) => `appealdesk:index:${subredditId}`;
const settingsKey = (subredditId: string) => `appealdesk:settings:${subredditId}`;
const dashboardPostKey = (subredditId: string) => `appealdesk:dashboard-post:${subredditId}`;

const safeJsonParse = <T>(value: string | undefined): T | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

export function getCurrentSubreddit() {
  return {
    subredditId: context.subredditId,
    subredditName: context.subredditName,
  };
}

export async function getSettings(subredditId: string = context.subredditId): Promise<AppealSettings> {
  const raw = await redis.get(settingsKey(subredditId));
  const stored = safeJsonParse<Partial<AppealSettings>>(raw);

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    lowEffortKeywords:
      stored?.lowEffortKeywords && stored.lowEffortKeywords.length > 0
        ? stored.lowEffortKeywords
        : DEFAULT_SETTINGS.lowEffortKeywords,
    maxFollowups: Math.max(0, Number(stored?.maxFollowups ?? DEFAULT_SETTINGS.maxFollowups)),
    dataRetentionDays: Math.max(
      1,
      Number(stored?.dataRetentionDays ?? DEFAULT_SETTINGS.dataRetentionDays)
    ),
  };
}

export async function saveSettings(
  settings: AppealSettings,
  subredditId: string = context.subredditId
): Promise<AppealSettings> {
  const normalized: AppealSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    maxFollowups: Math.max(0, Math.floor(settings.maxFollowups)),
    dataRetentionDays: Math.max(1, Math.floor(settings.dataRetentionDays)),
    lowEffortKeywords: settings.lowEffortKeywords
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 50),
  };

  await redis.set(settingsKey(subredditId), JSON.stringify(normalized));
  return normalized;
}

export async function getDashboardPostId(subredditId: string = context.subredditId) {
  return await redis.get(dashboardPostKey(subredditId));
}

export async function saveDashboardPostId(postId: string, subredditId: string = context.subredditId) {
  await redis.set(dashboardPostKey(subredditId), postId);
}

export async function getCaseById(id: string, subredditId: string = context.subredditId) {
  return safeJsonParse<AppealCase>(await redis.get(caseKey(subredditId, id)));
}

export async function getCaseByConversation(
  conversationId: string,
  subredditId: string = context.subredditId
) {
  const id = await redis.get(conversationKey(subredditId, conversationId));
  return id ? await getCaseById(id, subredditId) : undefined;
}

export async function saveCase(
  appealCase: AppealCase,
  settings?: AppealSettings
): Promise<AppealCase> {
  const retentionDays = settings?.dataRetentionDays ?? DEFAULT_SETTINGS.dataRetentionDays;
  const expiration = new Date(Date.now() + retentionDays * DAY_MS);
  const retentionSeconds = retentionDays * 24 * 60 * 60;

  await redis.set(caseKey(appealCase.subredditId, appealCase.id), JSON.stringify(appealCase), {
    expiration,
  });
  await redis.set(conversationKey(appealCase.subredditId, appealCase.conversationId), appealCase.id, {
    expiration,
  });
  await redis.zAdd(indexKey(appealCase.subredditId), {
    member: appealCase.id,
    score: appealCase.updatedAt,
  });
  await redis.expire(indexKey(appealCase.subredditId), retentionSeconds + 7 * 24 * 60 * 60);

  if (appealCase.userName) {
    const historyKey = userAppealHistoryKey(appealCase.subredditId, appealCase.userName);
    await redis.zAdd(historyKey, {
      member: appealCase.id,
      score: appealCase.createdAt,
    });
    await redis.expire(historyKey, retentionSeconds + 7 * 24 * 60 * 60);
  }

  return appealCase;
}

function getSuggestedPattern({
  totalAppeals,
  readyAppeals,
  lowEffortAppeals,
}: {
  totalAppeals: number;
  readyAppeals: number;
  lowEffortAppeals: number;
}): AppealPattern {
  if (totalAppeals <= 1) return 'First appeal';
  if (lowEffortAppeals >= 2) return 'Repeat low-effort';
  if (readyAppeals >= 1 && lowEffortAppeals === 0) return 'Good-faith history';
  if (totalAppeals >= 3) return 'Repeat appeal';
  return 'Normal';
}

export async function getUserAppealHistory(
  subredditId: string,
  username: string
): Promise<AppealUserHistory> {
  const ids = await redis.zRange(userAppealHistoryKey(subredditId, username), 0, 100, {
    by: 'rank',
  });
  const cases = await Promise.all(ids.map(({ member }) => getCaseById(member, subredditId)));
  const userCases = cases.filter((appealCase): appealCase is AppealCase => Boolean(appealCase));

  const readyAppeals = userCases.filter(
    (appealCase) => appealCase.status === 'ready_for_review'
  ).length;
  const incompleteAppeals = userCases.filter(
    (appealCase) => appealCase.status === 'incomplete'
  ).length;
  const lowEffortAppeals = userCases.filter(
    (appealCase) => appealCase.status === 'low_effort'
  ).length;
  const resolvedAppeals = userCases.filter((appealCase) => appealCase.status === 'resolved').length;
  const archivedAppeals = userCases.filter((appealCase) => appealCase.status === 'archived').length;
  const createdTimes = userCases.map((appealCase) => appealCase.createdAt);
  const updatedTimes = userCases.map((appealCase) => appealCase.updatedAt);
  const totalAppeals = userCases.length;

  return {
    totalAppeals,
    readyAppeals,
    incompleteAppeals,
    lowEffortAppeals,
    resolvedAppeals,
    archivedAppeals,
    firstAppealAt: createdTimes.length ? Math.min(...createdTimes) : undefined,
    lastAppealAt: updatedTimes.length ? Math.max(...updatedTimes) : undefined,
    suggestedPattern: getSuggestedPattern({ totalAppeals, readyAppeals, lowEffortAppeals }),
  };
}

export async function listCases(subredditId: string = context.subredditId): Promise<AppealCase[]> {
  const settings = await getSettings(subredditId);
  const cutoff = Date.now() - settings.dataRetentionDays * DAY_MS;
  await redis.zRemRangeByScore(indexKey(subredditId), 0, cutoff);

  const ids = await redis.zRange(indexKey(subredditId), 0, 100, {
    by: 'rank',
    reverse: true,
  });
  const cases = await Promise.all(ids.map(({ member }) => getCaseById(member, subredditId)));

  return cases
    .filter((appealCase): appealCase is AppealCase => Boolean(appealCase))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateCaseStatus(
  id: string,
  status: AppealStatus,
  subredditId: string = context.subredditId
) {
  const settings = await getSettings(subredditId);
  const existing = await getCaseById(id, subredditId);
  if (!existing) {
    throw new Error('Appeal case not found');
  }

  const updated: AppealCase = {
    ...existing,
    status,
    updatedAt: Date.now(),
    resolvedAt: status === 'resolved' || status === 'archived' ? Date.now() : existing.resolvedAt,
  };

  return await saveCase(updated, settings);
}

export function createCaseId(conversationId: string, now = Date.now()) {
  return `${conversationId.replace(/[^a-zA-Z0-9_-]/g, '')}-${now.toString(36)}`;
}

export { DEFAULT_RETENTION_SECONDS };
