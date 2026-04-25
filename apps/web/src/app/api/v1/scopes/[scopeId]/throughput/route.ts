import { type NextRequest } from 'next/server';
import { InvalidTimeZoneError, logger } from '@agile-tools/shared';
import {
  getPrismaClient,
  getFlowScope,
  getLastSucceededSyncRun,
  getSyncRunByDataVersion,
  queryDailyThroughput,
} from '@agile-tools/db';
import type { ThroughputResponse, Warning } from '@agile-tools/shared/contracts/api';
import { requireWorkspaceContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { getForecastSampleSize } from '@/server/views/throughput-sample';
import { buildInvalidScopeTimezoneProblem } from '../../_problems';

const DEFAULT_HISTORICAL_WINDOW = 90;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  let requestedScopeId: string | undefined;

  try {
    const ctx = await requireWorkspaceContext();
    const { scopeId } = await params;
    requestedScopeId = scopeId;
    const db = getPrismaClient();

    const scope = await getFlowScope(db, ctx.workspaceId, scopeId);
    if (!scope) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Flow scope not found.' },
        { status: 404 },
      );
    }

    const url = new URL(req.url);
    const rawWindow = parseInt(
      url.searchParams.get('historicalWindowDays') ?? String(DEFAULT_HISTORICAL_WINDOW),
      10,
    );
    const historicalWindowDays =
      isNaN(rawWindow) || rawWindow < 30 || rawWindow > 730
        ? DEFAULT_HISTORICAL_WINDOW
        : rawWindow;
    const requestedDataVersion = url.searchParams.get('dataVersion') ?? undefined;

    // Resolve the effective data snapshot and its syncedAt timestamp.
    let effectiveDataVersion: string | undefined;
    let syncedAt: Date | undefined;

    if (requestedDataVersion) {
      const syncRun = await getSyncRunByDataVersion(
        db,
        ctx.workspaceId,
        scopeId,
        requestedDataVersion,
      );
      if (syncRun?.dataVersion && syncRun.finishedAt) {
        effectiveDataVersion = syncRun.dataVersion;
        syncedAt = syncRun.finishedAt;
      }
    }

    if (!effectiveDataVersion) {
      const lastSucceeded = await getLastSucceededSyncRun(db, ctx.workspaceId, scopeId);
      effectiveDataVersion = lastSucceeded?.dataVersion ?? undefined;
      syncedAt = lastSucceeded?.finishedAt ?? undefined;
    }

    if (!effectiveDataVersion || !syncedAt) {
      return Response.json({
        scopeId,
        dataVersion: '',
        syncedAt: new Date(0).toISOString(),
        historicalWindowDays,
        sampleSize: 0,
        warnings: [
          { code: 'NO_DATA', message: 'No synchronized data available yet.' },
        ] satisfies Warning[],
        days: [],
      } satisfies ThroughputResponse);
    }

    const days = await queryDailyThroughput(db, scopeId, scope.timezone, {
      windowDays: historicalWindowDays,
      dataVersion: effectiveDataVersion,
    });

    const sampleSize = getForecastSampleSize(days);

    return Response.json({
      scopeId,
      dataVersion: effectiveDataVersion,
      syncedAt: syncedAt.toISOString(),
      historicalWindowDays,
      sampleSize,
      warnings: [] satisfies Warning[],
      days,
    } satisfies ThroughputResponse);
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    if (err instanceof InvalidTimeZoneError) {
      logger.warn('Throughput request blocked by invalid scope timezone', {
        scopeId: requestedScopeId,
        timezone: err.timezone,
      });
      return Response.json(buildInvalidScopeTimezoneProblem(err.timezone), {
        status: 409,
      });
    }
    logger.error('Failed to fetch throughput', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
