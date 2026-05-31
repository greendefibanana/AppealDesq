import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createDashboardPost, createMobileDashboardPost } from '../core/post';
import {
  getDashboardPostId,
  getMobileDashboardPostId,
  saveDashboardPostId,
  saveMobileDashboardPostId,
} from '../core/store';

export const menu = new Hono();

function dashboardPostUrl(postTarget: string) {
  if (postTarget.startsWith('http')) {
    return postTarget;
  }

  if (postTarget.startsWith('/')) {
    return `https://www.reddit.com${postTarget}`;
  }

  return `https://www.reddit.com/r/${context.subredditName}/comments/${postTarget.replace(/^t3_/, '')}`;
}

menu.post('/open-dashboard', async (c) => {
  try {
    const existingPostId = await getDashboardPostId();
    if (existingPostId) {
      return c.json<UiResponse>(
        {
          navigateTo: dashboardPostUrl(existingPostId),
        },
        200
      );
    }

    const post = await createDashboardPost();
    await saveDashboardPostId(post.permalink || post.id);

    return c.json<UiResponse>(
      {
        navigateTo: dashboardPostUrl(post.permalink || post.id),
      },
      200
    );
  } catch (error) {
    console.error(`Error opening AppealDesq dashboard: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open AppealDesq',
      },
      400
    );
  }
});

menu.post('/open-mobile-dashboard', async (c) => {
  try {
    const existingPostId = await getMobileDashboardPostId();
    if (existingPostId) {
      return c.json<UiResponse>(
        {
          navigateTo: dashboardPostUrl(existingPostId),
        },
        200
      );
    }

    const post = await createMobileDashboardPost();
    await saveMobileDashboardPostId(post.permalink || post.id);

    return c.json<UiResponse>(
      {
        navigateTo: dashboardPostUrl(post.permalink || post.id),
      },
      200
    );
  } catch (error) {
    console.error(`Error opening AppealDesq mobile dashboard: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open mobile AppealDesq',
      },
      400
    );
  }
});
