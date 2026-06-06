import { handleCallback } from '@vercel/queue';

import { processHostedTickMessage } from '@/server/hosted-sync';

export const maxDuration = 30;

export const POST = handleCallback(
  async (message) => {
    await processHostedTickMessage(message);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: () => ({ afterSeconds: 300 }),
  },
);
