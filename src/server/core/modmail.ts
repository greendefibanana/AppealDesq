import { reddit } from '@devvit/web/server';
import type { OnModMailRequest } from '@devvit/web/shared';
import type { ConversationData, ConversationUserData, MessageData } from '@devvit/web/server';

import {
  LOW_EFFORT_INTERNAL_NOTE,
  analyzeAppeal,
  applyMissingFieldsToTemplate,
  detectLowEffort,
  formatMissingFieldsForScore,
  getLowEffortReasons,
  isAppealLikeMessage,
  isJoinRequestWithoutAppeal,
  missingFieldsForScore,
  previewText,
  type AppealCase,
} from '../../shared/appeals';
import {
  createCaseId,
  getCaseById,
  getCaseByConversation,
  getCurrentSubreddit,
  getSettings,
  saveCase,
  updateCaseStatus,
} from './store';

export type AppealAction =
  | 'ask_followup'
  | 'deny'
  | 'approve_unban'
  | 'temp_ban_reduce'
  | 'mute_72h'
  | 'archive'
  | 'mark_resolved';

export type ActionResult = {
  ok: boolean;
  case: AppealCase;
  message: string;
  usedFallback: boolean;
};

const byDate = (a: MessageData, b: MessageData) =>
  new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime();

function bodyOf(message: MessageData | undefined) {
  return message?.bodyMarkdown || message?.body || '';
}

function getUserMessages(conversation: ConversationData): MessageData[] {
  return Object.values(conversation.messages ?? {})
    .filter((message) => !message.isInternal && !message.author?.isMod)
    .sort(byDate);
}

function getLatestUserMessage(conversation: ConversationData) {
  return getUserMessages(conversation).at(-1);
}

function inferUserName(conversation: ConversationData, message?: MessageData, userName?: string) {
  return userName || conversation.participant?.name || message?.author?.name;
}

function getPauseReason(conversation: ConversationData, user?: ConversationUserData) {
  if (user?.muteStatus?.isMuted) {
    return 'User is currently muted in modmail.';
  }

  if ('isRepliable' in conversation && conversation.isRepliable === false) {
    return 'Modmail conversation is not currently repliable.';
  }

  return undefined;
}

function isClosedStatus(status: AppealCase['status']) {
  return status === 'resolved' || status === 'archived';
}

export function buildInternalNote(appealCase: AppealCase, lowEffortReasons: string[] = []) {
  const missingFields = missingFieldsForScore(appealCase.score, appealCase.missingFields);
  const missingFieldsBlock =
    missingFields.length > 0
      ? `\n${formatMissingFieldsForScore(appealCase.score, appealCase.missingFields)}`
      : ' None';
  const recommendation =
    appealCase.status === 'ready_for_review'
      ? 'Review packet is complete enough for a moderator decision.'
      : appealCase.status === 'paused_muted'
        ? 'Wait for mute to expire or review manually.'
      : appealCase.status === 'low_effort'
        ? 'Do not take automatic enforcement. Human moderator should review if needed.'
        : 'Ask for the missing fields before spending review time.';

  const lowEffortLine =
    lowEffortReasons.length > 0 ? `\nLow-effort signals: ${lowEffortReasons.join(', ')}` : '';

  return `AppealDesq status: ${appealCase.status}
Completeness score: ${appealCase.score}/5
Missing fields:${missingFieldsBlock}
Extracted summary: ${appealCase.summary}${lowEffortLine}
Recommended next action: ${recommendation}`;
}

async function replyToConversation(conversationId: string, body: string, isInternal = false) {
  return await reddit.modMail.reply({
    conversationId,
    body,
    isInternal,
    isAuthorHidden: false,
  });
}

export async function handleModmailEvent(input: OnModMailRequest) {
  const conversationId = input.conversationId;
  const settings = await getSettings();
  const existing = await getCaseByConversation(conversationId);
  const data = await reddit.modMail.getConversation({ conversationId, markRead: false });
  const conversation = data.conversation;

  if (!conversation) {
    return {
      status: 'ignored',
      message: `Conversation ${conversationId} was not available to AppealDesq.`,
    };
  }

  const latestUserMessage = getLatestUserMessage(conversation);
  const latestBody = bodyOf(latestUserMessage);
  const subject = conversation.subject ?? 'Modmail conversation';
  const combinedTriggerText = `${subject}\n${latestBody}`;
  const pauseReason = getPauseReason(conversation, data.user);

  if (!existing && isJoinRequestWithoutAppeal(subject, latestBody)) {
    return {
      status: 'ignored',
      message: `Conversation ${conversationId} was a join request, not an appeal.`,
    };
  }

  if (!existing && !isAppealLikeMessage(combinedTriggerText) && !detectLowEffort(latestBody)) {
    return {
      status: 'ignored',
      message: `Conversation ${conversationId} did not look like an appeal.`,
    };
  }

  const now = Date.now();
  const { subredditId, subredditName } = getCurrentSubreddit();

  if (!existing) {
    const analysis = analyzeAppeal(latestBody, settings.lowEffortKeywords);
    const appealCase: AppealCase = {
      id: createCaseId(conversationId, now),
      subredditId,
      subredditName,
      conversationId,
      userName: inferUserName(conversation, latestUserMessage, data.user?.name),
      subject,
      status: pauseReason ? 'paused_muted' : analysis.status,
      score: analysis.score,
      missingFields: missingFieldsForScore(analysis.score, analysis.missingFields),
      summary: pauseReason
        ? `Appeal paused: user may be muted. ${pauseReason}`
        : 'Appeal template sent. Waiting for structured details.',
      lastMessagePreview: previewText(latestBody || subject),
      followupCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await saveCase(appealCase, settings);
    if (!pauseReason) {
      await replyToConversation(conversationId, settings.appealTemplate);
    }
    await replyToConversation(conversationId, buildInternalNote(appealCase), true);

    return {
      status: 'created',
      case: appealCase,
      message: `AppealDesq created case ${appealCase.id}.`,
    };
  }

  const latestPreview = previewText(latestBody || subject);
  if (pauseReason && !isClosedStatus(existing.status)) {
    const analysis = analyzeAppeal(latestBody, settings.lowEffortKeywords);
    const paused: AppealCase = {
      ...existing,
      status: 'paused_muted',
      score: analysis.score,
      missingFields: missingFieldsForScore(analysis.score, analysis.missingFields),
      summary: `Appeal paused: user may be muted. ${pauseReason}`,
      lastMessagePreview: latestPreview,
      updatedAt: now,
    };

    await saveCase(paused, settings);
    await replyToConversation(conversationId, buildInternalNote(paused), true);

    return {
      status: 'updated',
      case: paused,
      message: `AppealDesq paused case ${paused.id} because the user may be muted.`,
    };
  }

  if (!latestBody || latestPreview === existing.lastMessagePreview) {
    return {
      status: 'unchanged',
      case: existing,
      message: `AppealDesq already handled conversation ${conversationId}.`,
    };
  }

  const analysis = analyzeAppeal(latestBody, settings.lowEffortKeywords);
  const lowEffortReasons = getLowEffortReasons(latestBody, settings.lowEffortKeywords);
  const updated: AppealCase = {
    ...existing,
    status: analysis.status,
    score: analysis.score,
    missingFields: analysis.missingFields,
    summary: analysis.summary,
    lastMessagePreview: latestPreview,
    updatedAt: now,
  };

  await saveCase(updated, settings);
  await replyToConversation(conversationId, buildInternalNote(updated, lowEffortReasons), true);

  if (analysis.status === 'low_effort') {
    await replyToConversation(conversationId, LOW_EFFORT_INTERNAL_NOTE, true);
  }

  return {
    status: 'updated',
    case: updated,
    message: `AppealDesq updated case ${updated.id}.`,
  };
}

export async function runAppealAction(id: string, action: AppealAction): Promise<ActionResult> {
  const existing = await getCaseById(id);
  if (!existing) {
    throw new Error('Appeal case not found');
  }

  const settings = await getSettings(existing.subredditId);

  try {
    if (action === 'ask_followup') {
      const data = await reddit.modMail.getConversation({
        conversationId: existing.conversationId,
        markRead: false,
      });
      if (data.conversation) {
        const pauseReason = getPauseReason(data.conversation, data.user);
        if (pauseReason) {
          const latestUserMessage = getLatestUserMessage(data.conversation);
          const latestBody = bodyOf(latestUserMessage);
          const analysis = analyzeAppeal(latestBody, settings.lowEffortKeywords);
          const paused: AppealCase = {
            ...existing,
            status: 'paused_muted',
            score: analysis.score,
            missingFields: missingFieldsForScore(analysis.score, analysis.missingFields),
            summary: `Appeal paused: user may be muted. ${pauseReason}`,
            lastMessagePreview: previewText(latestBody || existing.lastMessagePreview),
            updatedAt: Date.now(),
          };

          return {
            ok: false,
            case: await saveCase(paused, settings),
            message: 'Follow-up disabled. Appeal paused: user may be muted.',
            usedFallback: false,
          };
        }
      }

      if (existing.followupCount >= settings.maxFollowups) {
        return {
          ok: false,
          case: existing,
          message: `Max follow-ups reached for this case (${settings.maxFollowups}).`,
          usedFallback: false,
        };
      }

      const latestUserMessage = data.conversation
        ? getLatestUserMessage(data.conversation)
        : undefined;
      const latestBody = bodyOf(latestUserMessage);
      const analysis = analyzeAppeal(latestBody, settings.lowEffortKeywords);
      const missingFields = missingFieldsForScore(analysis.score, analysis.missingFields);

      await replyToConversation(
        existing.conversationId,
        applyMissingFieldsToTemplate(settings.followupTemplate, analysis.score, missingFields)
      );

      const updated: AppealCase = {
        ...existing,
        status: 'awaiting_user',
        score: analysis.score,
        missingFields,
        summary: analysis.summary,
        lastMessagePreview: previewText(latestBody || existing.lastMessagePreview),
        followupCount: existing.followupCount + 1,
        updatedAt: Date.now(),
      };
      return {
        ok: true,
        case: await saveCase(updated, settings),
        message: 'Follow-up template sent.',
        usedFallback: false,
      };
    }

    if (action === 'deny') {
      let usedFallback = false;
      try {
        await replyToConversation(existing.conversationId, settings.denialTemplate);
      } catch {
        usedFallback = true;
      }

      return {
        ok: true,
        case: await updateCaseStatus(id, 'resolved', existing.subredditId),
        message: usedFallback
          ? 'Denial could not be sent in this playtest context, so the case was moved to Resolved locally.'
          : 'Denial template sent and case moved to Resolved.',
        usedFallback,
      };
    }

    if (action === 'approve_unban') {
      await reddit.modMail.unbanConversation(existing.conversationId);
      return {
        ok: true,
        case: await updateCaseStatus(id, 'resolved', existing.subredditId),
        message: 'User unbanned through Reddit modmail and case marked resolved.',
        usedFallback: false,
      };
    }

    if (action === 'temp_ban_reduce') {
      await reddit.modMail.tempBanConversation({
        conversationId: existing.conversationId,
        duration: 7,
      });
      return {
        ok: true,
        case: await updateCaseStatus(id, 'resolved', existing.subredditId),
        message: 'Permanent ban reduced to 7 days through Reddit modmail.',
        usedFallback: false,
      };
    }

    if (action === 'mute_72h') {
      await reddit.modMail.muteConversation({
        conversationId: existing.conversationId,
        numHours: 72,
      });
      return {
        ok: true,
        case: await saveCase({ ...existing, updatedAt: Date.now() }, settings),
        message: 'Conversation muted for 72 hours through Reddit modmail.',
        usedFallback: false,
      };
    }

    if (action === 'archive') {
      await reddit.modMail.archiveConversation(existing.conversationId);
      return {
        ok: true,
        case: await updateCaseStatus(id, 'archived', existing.subredditId),
        message: 'Conversation archived and case archived.',
        usedFallback: false,
      };
    }

    return {
      ok: true,
      case: await updateCaseStatus(id, 'resolved', existing.subredditId),
      message: 'Case marked resolved locally.',
      usedFallback: true,
    };
  } catch (error) {
    return {
      ok: false,
      case: existing,
      message:
        error instanceof Error
          ? `Reddit action failed: ${error.message}`
          : 'Reddit action failed in the current SDK/playtest environment.',
      usedFallback: false,
    };
  }
}
