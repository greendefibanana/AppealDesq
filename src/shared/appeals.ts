export type AppealStatus =
  | 'awaiting_user'
  | 'ready_for_review'
  | 'incomplete'
  | 'low_effort'
  | 'resolved'
  | 'archived';

export type AppealCase = {
  id: string;
  subredditId: string;
  subredditName?: string;
  conversationId: string;
  userName?: string;
  subject?: string;
  status: AppealStatus;
  score: number;
  missingFields: string[];
  summary: string;
  lastMessagePreview: string;
  followupCount: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
};

export type AppealPattern =
  | 'First appeal'
  | 'Repeat low-effort'
  | 'Good-faith history'
  | 'Repeat appeal'
  | 'Normal';

export type AppealUserHistory = {
  totalAppeals: number;
  readyAppeals: number;
  incompleteAppeals: number;
  lowEffortAppeals: number;
  resolvedAppeals: number;
  archivedAppeals: number;
  lastAppealAt?: number;
  firstAppealAt?: number;
  suggestedPattern: AppealPattern;
};

export type AppealSettings = {
  appealTemplate: string;
  denialTemplate: string;
  followupTemplate: string;
  maxFollowups: number;
  lowEffortKeywords: string[];
  autoArchiveLowEffort: boolean;
  dataRetentionDays: number;
};

export type AppealScore = {
  score: number;
  fields: {
    action: boolean;
    link: boolean;
    rule: boolean;
    nextTime: boolean;
    reconsideration: boolean;
  };
};

export const APPEAL_TEMPLATE = `Hi — this looks like an appeal or moderation dispute.

To help the mod team review it fairly, please reply with:

1. What action are you appealing?
2. Link to the post/comment if relevant.
3. Which subreddit rule do you think was misunderstood?
4. What would you do differently next time?
5. Why should the mod team reconsider?

Incomplete appeals may not be reviewed.`;

export const DENIAL_TEMPLATE = `Thanks for submitting an appeal.

After review, the mod team is not reversing the action at this time. Please review the subreddit rules before participating again.`;

export const FOLLOWUP_TEMPLATE = `Thanks. The appeal is still missing some required information:

{{missing_fields}}

Please reply with the missing details so the mod team can review it.`;

export const LOW_EFFORT_INTERNAL_NOTE =
  'AppealDesq marked this appeal as low-effort or abusive. No automatic action was taken.';

export const DEFAULT_LOW_EFFORT_KEYWORDS = [
  'fuck you',
  'fucking mods',
  'shit mods',
  'bitch',
  'asshole',
  'idiot mods',
  'kill yourself',
  'kys',
  'dox',
  'doxx',
  'threat',
];

export const DEFAULT_SETTINGS: AppealSettings = {
  appealTemplate: APPEAL_TEMPLATE,
  denialTemplate: DENIAL_TEMPLATE,
  followupTemplate: FOLLOWUP_TEMPLATE,
  maxFollowups: 1,
  lowEffortKeywords: DEFAULT_LOW_EFFORT_KEYWORDS,
  autoArchiveLowEffort: false,
  dataRetentionDays: 30,
};

export const MISSING_FIELD_LABELS = {
  action: 'Action being appealed',
  link: 'Post/comment link or confirmation that no link applies',
  rule: 'Rule or misunderstanding explanation',
  nextTime: 'What would change next time',
  reconsideration: 'Reason for reconsideration',
} as const;

const APPEAL_PATTERNS = [
  /\bappeal(?:ing)?\b/i,
  /\bunban(?:ned)?\b/i,
  /\bbanned?\b/i,
  /\bwhy was i banned\b/i,
  /\bwhy was my post removed\b/i,
  /\bwhy was my comment removed\b/i,
  /\bunfair\b/i,
  /\bmod abuse\b/i,
  /\bmuted?\b/i,
  /\bremoved\b/i,
];

const JOIN_REQUEST_PATTERNS = [
  /\[join\]/i,
  /\brequest to join\b/i,
  /\bjoin request\b/i,
  /\bapproved user\b/i,
  /\baccess request\b/i,
];

const URL_PATTERN =
  /\b(?:https?:\/\/)?(?:www\.)?(?:reddit\.com|redd\.it)\/\S+|\br\/[A-Za-z0-9_]+\/comments\/\S+/i;

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function isAppealLikeMessage(text: string): boolean {
  const body = normalize(text);
  return APPEAL_PATTERNS.some((pattern) => pattern.test(body));
}

export function isJoinRequestWithoutAppeal(subject: string, body: string): boolean {
  const subjectLooksLikeJoinRequest = JOIN_REQUEST_PATTERNS.some((pattern) => pattern.test(subject));
  return subjectLooksLikeJoinRequest && !isAppealLikeMessage(`${subject}\n${body}`);
}

export function scoreAppeal(text: string): AppealScore {
  const body = normalize(text);
  const fields = {
    action:
      /\b(appeal|appealing|ban|banned|unban|removed|removal|muted|post|comment|action)\b/.test(
        body
      ),
    link:
      URL_PATTERN.test(text) ||
      /\b(no link|no relevant link|no post|no comment|not applicable|n\/a)\b/.test(body),
    rule: /\brule\s*#?\d+\b|\brule\b|\bmisunderstood\b|\bcontext\b|\bpolicy\b/.test(body),
    nextTime:
      /\bnext time\b|\bi'?ll\b|\bi will\b|\bi would\b|\bwould do differently\b|\breport instead\b|\bavoid\b|\bwon'?t\b/.test(
        body
      ),
    reconsideration:
      /\bplease reconsider\b|\breconsider\b|\bbecause\b|\bsorry\b|\bapolog/i.test(body) ||
      /\bactive for\b|\bunderstand the rule\b|\bgood faith\b/.test(body),
  };

  return {
    score: Object.values(fields).filter(Boolean).length,
    fields,
  };
}

export function getMissingFields(text: string): string[] {
  const { fields } = scoreAppeal(text);
  return Object.entries(fields)
    .filter(([, present]) => !present)
    .map(([field]) => MISSING_FIELD_LABELS[field as keyof typeof MISSING_FIELD_LABELS]);
}

export function getLowEffortReasons(
  text: string,
  keywords: string[] = DEFAULT_LOW_EFFORT_KEYWORDS
): string[] {
  const body = normalize(text);
  const reasons: string[] = [];

  if (body.length > 0 && body.length < 20) {
    reasons.push('Very short message');
  }

  if (/^(?:please\s+)?unban\s+me[.!?\s]*$/i.test(body)) {
    reasons.push('Repeated unban-me style appeal');
  }

  const matchedKeyword = keywords.find((keyword) => body.includes(normalize(keyword)));
  if (matchedKeyword) {
    reasons.push(`Abusive keyword: ${matchedKeyword}`);
  }

  return reasons;
}

export function detectLowEffort(
  text: string,
  keywords: string[] = DEFAULT_LOW_EFFORT_KEYWORDS
): boolean {
  return getLowEffortReasons(text, keywords).length > 0;
}

export function summarizeAppeal(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'No appeal details provided yet.';
  }

  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  const summary = firstSentence.length >= 40 ? firstSentence : cleaned;
  return summary.length > 240 ? `${summary.slice(0, 237).trim()}...` : summary;
}

export function statusFromAppealText(
  text: string,
  keywords: string[] = DEFAULT_LOW_EFFORT_KEYWORDS
): AppealStatus {
  if (detectLowEffort(text, keywords)) {
    return 'low_effort';
  }

  return scoreAppeal(text).score >= 4 ? 'ready_for_review' : 'incomplete';
}

export function previewText(text: string, maxLength = 180): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3).trim()}...` : cleaned;
}

export function formatMissingFields(missingFields: string[]): string {
  if (missingFields.length === 0) {
    return 'No required fields are missing.';
  }

  return missingFields.map((field) => `- ${field}`).join('\n');
}
