import { context, reddit } from '@devvit/web/server';

export const createDashboardPost = async () => {
  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'AppealDesq moderation dashboard',
    textFallback: {
      text: 'AppealDesq is a Devvit Web moderation dashboard for structured appeal review.',
    },
  });
};
