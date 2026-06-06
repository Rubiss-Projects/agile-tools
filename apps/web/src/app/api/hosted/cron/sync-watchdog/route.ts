import { type NextRequest } from 'next/server';
import { getConfig, isHostedMode, logger } from '@agile-tools/shared';

import { scheduleHostedSyncTick, shouldReseedHostedSyncTick } from '@/server/hosted-sync';

function hasValidCronSecret(request: NextRequest): boolean {
  const configured = getConfig().CRON_SECRET;
  if (!configured) return false;

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const querySecret = request.nextUrl.searchParams.get('secret');
  return bearer === configured || querySecret === configured;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isHostedMode(getConfig())) {
    return Response.json(
      { code: 'NOT_FOUND', message: 'Hosted cron is only available in hosted mode.' },
      { status: 404 },
    );
  }

  if (!hasValidCronSecret(request)) {
    return Response.json({ code: 'FORBIDDEN', message: 'Invalid cron secret.' }, { status: 403 });
  }

  try {
    const reseeded = await shouldReseedHostedSyncTick();
    if (reseeded) {
      await scheduleHostedSyncTick(0);
    }
    return Response.json({ reseeded });
  } catch (err) {
    logger.error('Hosted sync watchdog failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
