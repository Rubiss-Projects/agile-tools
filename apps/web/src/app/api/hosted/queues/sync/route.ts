import { handleCallback } from '@vercel/queue';

import { processHostedScopeSyncMessage } from '@/server/hosted-sync';

export const maxDuration = 30;

export const POST = handleCallback(
  async (message) => {
    await processHostedScopeSyncMessage(message);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: () => ({ afterSeconds: 60 }),
  },
);
