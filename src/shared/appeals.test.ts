import { describe, expect, it } from 'vitest';

import {
  FOLLOWUP_TEMPLATE,
  REQUIRED_APPEAL_FIELDS,
  analyzeAppeal,
  applyMissingFieldsToTemplate,
  detectLowEffort,
  formatMissingFieldsForScore,
  getMissingFields,
  isAppealLikeMessage,
  isJoinRequestWithoutAppeal,
  scoreAppeal,
  statusFromAppealText,
  summarizeAppeal,
} from './appeals';

describe('AppealDesq parser', () => {
  it('returns all required fields for an empty message', () => {
    const analysis = analyzeAppeal('');

    expect(analysis.score).toBe(0);
    expect(analysis.missingFields).toEqual(REQUIRED_APPEAL_FIELDS);
    expect(analysis.status).toBe('awaiting_user');
    expect(analysis.isLowEffort).toBe(false);
  });

  it('keeps unban-me scoring and missing fields in agreement', () => {
    const analysis = analyzeAppeal('unban me');

    expect(analysis.score).toBe(1);
    expect(analysis.missingFields).toEqual([
      'Post/comment link, or clear statement that no link applies',
      'Rule or misunderstanding explanation',
      'What the user would do differently next time',
      'Reason the mod team should reconsider',
    ]);
    expect(analysis.status).toBe('low_effort');
    expect(analysis.isLowEffort).toBe(true);
  });

  it('keeps why-was-i-banned scoring and missing fields in agreement', () => {
    const analysis = analyzeAppeal('why was i banned');

    expect(analysis.score).toBe(1);
    expect(analysis.missingFields).toHaveLength(4);
    expect(analysis.missingFields).not.toContain('Action being appealed');
    expect(analysis.status).toBe('low_effort');
  });

  it('does not format a partial score as having no missing fields', () => {
    const body = formatMissingFieldsForScore(1, []);

    expect(body).not.toContain('No required fields are missing');
    for (const field of REQUIRED_APPEAL_FIELDS) {
      expect(body).toContain(`- ${field}`);
    }
  });

  it('does not send a no-missing-fields follow-up unless the score is complete', () => {
    const partialReply = applyMissingFieldsToTemplate(FOLLOWUP_TEMPLATE, 4, []);
    const completeReply = applyMissingFieldsToTemplate(FOLLOWUP_TEMPLATE, 5, []);

    expect(partialReply).not.toContain('No required fields are missing');
    expect(partialReply).toContain('- Action being appealed');
    expect(completeReply).toContain('No required fields are missing');
  });

  it('does not classify ordinary rules questions as appeals', () => {
    const text = 'hello mods, i have a question about posting rules';

    expect(isAppealLikeMessage(text)).toBe(false);
    expect(detectLowEffort(text)).toBe(false);
  });

  it('ignores private subreddit join requests unless they include appeal language', () => {
    expect(isJoinRequestWithoutAppeal('[join] Request to join', 'ddd')).toBe(true);
    expect(isJoinRequestWithoutAppeal('[join] Request to join', 'why was i banned')).toBe(false);
  });

  it('detects a vague ban appeal and scores it incomplete', () => {
    const text = 'why was i banned this is unfair';

    expect(isAppealLikeMessage(text)).toBe(true);
    expect(scoreAppeal(text).score).toBe(1);
    expect(statusFromAppealText(text)).toBe('incomplete');
    expect(getMissingFields(text)).toContain(
      'Post/comment link, or clear statement that no link applies'
    );
  });

  it('scores a complete good-faith appeal as ready for review', () => {
    const text =
      'I am appealing my ban. The comment was here: reddit.com/r/test/comments/abc. I think rule 2 was misunderstood because I was replying to someone attacking me. Next time I’ll report instead of escalating. Please reconsider because I’ve been active for years and understand the rule now.';

    expect(isAppealLikeMessage(text)).toBe(true);
    expect(scoreAppeal(text).score).toBe(5);
    expect(statusFromAppealText(text)).toBe('ready_for_review');
    expect(getMissingFields(text)).toEqual([]);
    expect(analyzeAppeal(text)).toMatchObject({
      score: 5,
      missingFields: [],
      status: 'ready_for_review',
      isLowEffort: false,
    });
  });

  it('marks repeated unban-me messages as low effort', () => {
    const text = 'unban me';

    expect(isAppealLikeMessage(text)).toBe(true);
    expect(scoreAppeal(text).score).toBeLessThan(4);
    expect(detectLowEffort(text)).toBe(true);
    expect(statusFromAppealText(text)).toBe('low_effort');
  });

  it('recommends more information for incomplete appeals', () => {
    const text = "I didn't do anything wrong. Unban me.";

    expect(isAppealLikeMessage(text)).toBe(true);
    expect(scoreAppeal(text).score).toBeLessThan(4);
    expect(getMissingFields(text).length).toBeGreaterThan(0);
    expect(statusFromAppealText(text)).toBe('incomplete');
  });

  it('marks abusive messages as low effort without treating them as an appeal trigger', () => {
    const text = 'fuck you mods';

    expect(isAppealLikeMessage(text)).toBe(false);
    expect(detectLowEffort(text)).toBe(true);
    expect(statusFromAppealText(text)).toBe('low_effort');
  });

  it('summarizes without storing full long message bodies', () => {
    const summary = summarizeAppeal('I am appealing my ban. '.repeat(30));
    expect(summary.length).toBeLessThanOrEqual(240);
  });
});
