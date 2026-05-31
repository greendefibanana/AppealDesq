import { context, reddit } from '@devvit/web/server';

const isDemoSubreddit = () => context.subredditName.toLowerCase() === 'appealdesq_dev';

export const createDashboardPost = async () => {
  const demoNotice = isDemoSubreddit()
    ? ' Public demo note: this test subreddit allows read-only dashboard viewing for judges. Production installs are moderator-gated.'
    : '';

  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: isDemoSubreddit()
      ? 'AppealDesq moderation dashboard - public demo'
      : 'AppealDesq moderation dashboard',
    textFallback: {
      text: `AppealDesq is a Devvit Web moderation dashboard for structured appeal review.${demoNotice}`,
    },
  });
};

export const createMobileDashboardPost = async () => {
  const demoNotice = isDemoSubreddit()
    ? ' Public demo note: this test subreddit allows read-only dashboard viewing for judges. Production installs are moderator-gated.'
    : '';

  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: isDemoSubreddit()
      ? 'AppealDesq mobile appeal queue - public demo'
      : 'AppealDesq mobile appeal queue',
    entry: 'mobile',
    textFallback: {
      text: `AppealDesq mobile queue is a compact Devvit Web view for reviewing structured appeal packets.${demoNotice}`,
    },
  });
};
