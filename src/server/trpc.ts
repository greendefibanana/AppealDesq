import { TRPCError, initTRPC } from '@trpc/server';
import { transformer } from '../shared/transformer';
import { Context } from './context';
import { context, reddit } from '@devvit/web/server';
import { z } from 'zod';
import {
  DEFAULT_SETTINGS,
  detectLowEffort,
  getMissingFields,
  isAppealLikeMessage,
  scoreAppeal,
  statusFromAppealText,
  summarizeAppeal,
  type AppealSettings,
} from '../shared/appeals';
import {
  getSettings,
  getUserAppealHistory,
  listCases,
  saveSettings,
  updateCaseStatus,
} from './core/store';
import { runAppealAction, type AppealAction } from './core/modmail';

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  transformer,
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

async function assertCurrentUserIsModerator() {
  const user = await reddit.getCurrentUser();
  const permissions = user ? await user.getModPermissionsForSubreddit(context.subredditName) : [];

  if (!user || permissions.length === 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'AppealDesq is only available to moderators of this subreddit.',
    });
  }
}

const moderatorProcedure = publicProcedure.use(async ({ next }) => {
  await assertCurrentUserIsModerator();
  return next();
});

const actionSchema = z.enum([
  'ask_followup',
  'deny',
  'approve_unban',
  'temp_ban_reduce',
  'mute_72h',
  'archive',
  'mark_resolved',
] satisfies AppealAction[]);

const settingsSchema = z.object({
  appealTemplate: z.string().min(1).max(4000),
  denialTemplate: z.string().min(1).max(2000),
  followupTemplate: z.string().min(1).max(2000),
  maxFollowups: z.number().int().min(0).max(5),
  lowEffortKeywords: z.array(z.string().min(1).max(80)).max(50),
  autoArchiveLowEffort: z.boolean(),
  dataRetentionDays: z.number().int().min(1).max(90),
}) satisfies z.ZodType<AppealSettings>;

export const appRouter = t.router({
  init: t.router({
    get: publicProcedure.query(async () => {
      const username = await reddit.getCurrentUsername().catch(() => context.username);

      return {
        postId: context.postId,
        subredditId: context.subredditId,
        subredditName: context.subredditName,
        username,
      };
    }),
  }),
  appeals: t.router({
    dashboard: moderatorProcedure.query(async () => {
      const [cases, settings] = await Promise.all([listCases(), getSettings()]);
      const stats = cases.reduce(
        (totals, appealCase) => {
          totals[appealCase.status] += 1;
          return totals;
        },
        {
          awaiting_user: 0,
          ready_for_review: 0,
          incomplete: 0,
          low_effort: 0,
          resolved: 0,
          archived: 0,
        }
      );

      const casesWithHistory = await Promise.all(
        cases.map(async (appealCase) => ({
          ...appealCase,
          userHistory: appealCase.userName
            ? await getUserAppealHistory(appealCase.subredditId, appealCase.userName)
            : undefined,
        }))
      );

      return {
        cases: casesWithHistory,
        stats,
        settings,
        context: {
          subredditId: context.subredditId,
          subredditName: context.subredditName,
          username: context.username,
        },
      };
    }),
    action: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          action: actionSchema,
        })
      )
      .mutation(async ({ input }) => {
        await assertCurrentUserIsModerator();
        return await runAppealAction(input.id, input.action);
      }),
    markResolved: moderatorProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
      return await updateCaseStatus(input, 'resolved');
    }),
  }),
  settings: t.router({
    get: moderatorProcedure.query(async () => {
      return await getSettings();
    }),
    update: moderatorProcedure.input(settingsSchema).mutation(async ({ input }) => {
      return await saveSettings(input);
    }),
    reset: moderatorProcedure.mutation(async () => {
      return await saveSettings(DEFAULT_SETTINGS);
    }),
  }),
  parser: t.router({
    inspect: publicProcedure.input(z.string()).query(({ input }) => {
      return {
        appealLike: isAppealLikeMessage(input),
        score: scoreAppeal(input),
        lowEffort: detectLowEffort(input),
        missingFields: getMissingFields(input),
        status: statusFromAppealText(input),
        summary: summarizeAppeal(input),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
