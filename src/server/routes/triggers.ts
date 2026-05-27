import { Hono } from 'hono';
import type { OnAppInstallRequest, OnModMailRequest, TriggerResponse } from '@devvit/web/shared';

import { handleModmailEvent } from '../core/modmail';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `AppealDesq installed. Trigger: ${input.type}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error handling install trigger: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to initialize AppealDesq',
      },
      400
    );
  }
});

triggers.post('/on-modmail', async (c) => {
  try {
    const input = await c.req.json<OnModMailRequest>();
    const result = await handleModmailEvent(input);

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: result.message,
      },
      200
    );
  } catch (error) {
    console.error(`Error handling modmail trigger: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'AppealDesq could not process this modmail event.',
      },
      400
    );
  }
});
