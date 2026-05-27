import { createDevvitTest } from '@devvit/test/server/vitest';
import { describe, expect } from 'vitest';

import { DEFAULT_SETTINGS } from '../../shared/appeals';
import {
  getSettings,
  getUserAppealHistory,
  listCases,
  saveCase,
  saveSettings,
  updateCaseStatus,
} from './store';

const subredditId = 't5_appealdesq';
const subredditName = 'appealdesq_dev';

function testCase(overrides: Parameters<typeof saveCase>[0]) {
  return saveCase(overrides);
}

async function seedTestCases() {
  const now = Date.now();
  await Promise.all([
    testCase({
      id: 'ready-case',
      subredditId,
      subredditName,
      conversationId: 'ready-conversation',
      userName: 'rule-reader',
      subject: 'Ban appeal',
      status: 'ready_for_review',
      score: 5,
      missingFields: [],
      summary: 'Complete appeal packet.',
      lastMessagePreview: 'I understand the rule now.',
      followupCount: 0,
      createdAt: now - 80_000,
      updatedAt: now - 20_000,
    }),
    testCase({
      id: 'ready-prior',
      subredditId,
      subredditName,
      conversationId: 'ready-prior-conversation',
      userName: 'rule-reader',
      subject: 'Previous appeal',
      status: 'resolved',
      score: 5,
      missingFields: [],
      summary: 'Prior complete appeal packet resolved by moderators.',
      lastMessagePreview: 'I will report instead of escalating.',
      followupCount: 0,
      createdAt: now - 2_200_000,
      updatedAt: now - 2_000_000,
      resolvedAt: now - 2_000_000,
    }),
    testCase({
      id: 'incomplete-case',
      subredditId,
      subredditName,
      conversationId: 'incomplete-conversation',
      userName: 'confused-user',
      subject: 'why was i banned',
      status: 'incomplete',
      score: 1,
      missingFields: ['Reason for reconsideration'],
      summary: 'why was i banned this is unfair',
      lastMessagePreview: 'why was i banned this is unfair',
      followupCount: 1,
      createdAt: now - 160_000,
      updatedAt: now - 65_000,
    }),
    testCase({
      id: 'low-effort-case',
      subredditId,
      subredditName,
      conversationId: 'low-effort-conversation',
      userName: 'driveby-appeal',
      subject: 'unban',
      status: 'low_effort',
      score: 1,
      missingFields: ['Reason for reconsideration'],
      summary: 'unban me',
      lastMessagePreview: 'unban me',
      followupCount: 0,
      createdAt: now - 240_000,
      updatedAt: now - 120_000,
    }),
    testCase({
      id: 'low-effort-prior',
      subredditId,
      subredditName,
      conversationId: 'low-effort-prior-conversation',
      userName: 'driveby-appeal',
      subject: 'previous unban request',
      status: 'low_effort',
      score: 1,
      missingFields: ['Reason for reconsideration'],
      summary: 'unban me',
      lastMessagePreview: 'unban me',
      followupCount: 0,
      createdAt: now - 3_000_000,
      updatedAt: now - 2_900_000,
    }),
  ]);
}

describe('AppealDesq Redis storage', () => {
  const test = createDevvitTest({
    subredditName,
    subredditId,
    username: 'mod-tester',
  });

  test('creates, lists, updates, and resolves cases per subreddit', async ({ mocks }) => {
    await mocks.redis.clear();

    await seedTestCases();
    const cases = await listCases();

    expect(cases).toHaveLength(5);
    expect(cases.map((appealCase) => appealCase.id)).toContain('ready-case');
    expect(cases.map((appealCase) => appealCase.status)).toContain('ready_for_review');
    expect(cases.map((appealCase) => appealCase.status)).toContain('incomplete');
    expect(cases.map((appealCase) => appealCase.status)).toContain('low_effort');

    const resolved = await updateCaseStatus('ready-case', 'resolved');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toEqual(expect.any(Number));

    const updatedCases = await listCases();
    expect(updatedCases.find((appealCase) => appealCase.id === 'ready-case')?.status).toBe(
      'resolved'
    );
  });

  test('tracks per-subreddit user appeal history and recomputes status stats', async ({ mocks }) => {
    await mocks.redis.clear();
    await seedTestCases();

    const goodFaithHistory = await getUserAppealHistory(subredditId, 'rule-reader');
    expect(goodFaithHistory.totalAppeals).toBe(2);
    expect(goodFaithHistory.readyAppeals).toBe(1);
    expect(goodFaithHistory.lowEffortAppeals).toBe(0);
    expect(goodFaithHistory.resolvedAppeals).toBe(1);
    expect(goodFaithHistory.suggestedPattern).toBe('Good-faith history');

    const lowEffortHistory = await getUserAppealHistory(subredditId, 'driveby-appeal');
    expect(lowEffortHistory.totalAppeals).toBe(2);
    expect(lowEffortHistory.lowEffortAppeals).toBe(2);
    expect(lowEffortHistory.suggestedPattern).toBe('Repeat low-effort');

    await updateCaseStatus('ready-case', 'archived');
    const updatedHistory = await getUserAppealHistory(subredditId, 'rule-reader');
    expect(updatedHistory.readyAppeals).toBe(0);
    expect(updatedHistory.archivedAppeals).toBe(1);
    expect(updatedHistory.suggestedPattern).toBe('Normal');
  });

  test('persists subreddit settings with safe normalization', async ({ mocks }) => {
    await mocks.redis.clear();

    await saveSettings({
      ...DEFAULT_SETTINGS,
      appealTemplate: 'Custom appeal template',
      denialTemplate: 'Custom denial template',
      followupTemplate: 'Missing: {{missing_fields}}',
      maxFollowups: 3,
      lowEffortKeywords: ['rude', 'spam'],
      autoArchiveLowEffort: true,
      dataRetentionDays: 45,
    });

    const settings = await getSettings();

    expect(settings.appealTemplate).toBe('Custom appeal template');
    expect(settings.denialTemplate).toBe('Custom denial template');
    expect(settings.followupTemplate).toBe('Missing: {{missing_fields}}');
    expect(settings.maxFollowups).toBe(3);
    expect(settings.lowEffortKeywords).toEqual(['rude', 'spam']);
    expect(settings.autoArchiveLowEffort).toBe(true);
    expect(settings.dataRetentionDays).toBe(45);
  });
});
