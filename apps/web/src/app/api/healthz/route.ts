import { getPrismaClient } from '@agile-tools/db';
import { NextResponse } from 'next/server';

function createResponse(status: 'ok' | 'degraded', httpStatus: number) {
  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function GET() {
  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return createResponse('ok', 200);
  } catch {
    return createResponse('degraded', 503);
  }
}