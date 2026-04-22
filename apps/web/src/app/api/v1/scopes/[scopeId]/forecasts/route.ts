import { type NextRequest } from 'next/server';
import { InvalidTimeZoneError, logger } from '@agile-tools/shared';
import {
  getPrismaClient,
  getFlowScope,
  getLastSucceededSyncRun,
  getSyncRunByDataVersion,
  queryDailyThroughput,
  computeForecastRequestHash,
  lookupForecastCache,
  storeForecastCache,
  formatDateInTimezone,
} from '@agile-tools/db';
import {
  ForecastRequestSchema,
  type ForecastResponse,
  type ForecastCachePayload,
} from '@agile-tools/shared/contracts/forecast';
import type { Warning } from '@agile-tools/shared/contracts/api';
import {
  runWhenForecast,
  runHowManyForecast,
  DEFAULT_MONTE_CARLO_ITERATIONS,
  FORECAST_CACHE_TTL_HOURS,
  type MonteCarloForecastResult,
} from '@agile-tools/analytics';
import { requireWorkspaceContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { shapeForecastResponse } from '@/server/views/forecast-response';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function buildInvalidScopeTimezoneProblem(timezone: string) {
  return {
    code: 'INVALID_SCOPE_TIMEZONE',
    message:
      `This scope uses an unsupported timezone identifier ("${timezone}"). ` +
      'Update the scope timezone to a valid value such as UTC or America/New_York.',
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  let requestedScopeId: string | undefined;

  try {
    const ctx = await requireWorkspaceContext();
    assertTrustedMutationRequest(req);
    enforceRateLimit(req, {
      bucket: 'scope-forecasts:run',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${(await params).scopeId}`,
      max: 30,
      windowMs: 5 * 60_000,
    });
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

    const body: unknown = await req.json().catch(() => null);
    const parsed = ForecastRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body.',
          details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400 },
      );
    }

    const request = parsed.data;
    const iterations = request.iterations ?? DEFAULT_MONTE_CARLO_ITERATIONS;

    // Validate how_many targetDate is in the future relative to the scope timezone.
    if (request.type === 'how_many') {
      const todayLocal = formatDateInTimezone(new Date(), scope.timezone);
      if (request.targetDate <= todayLocal) {
        return Response.json(
          {
            code: 'INVALID_REQUEST',
            message: `targetDate must be a future date (scope timezone today is ${todayLocal}).`,
          },
          { status: 400 },
        );
      }
    }

    // Resolve the effective data snapshot.
    let effectiveDataVersion: string | undefined;
    let syncedAt: Date | undefined;

    if (request.dataVersion) {
      const syncRun = await getSyncRunByDataVersion(
        db,
        ctx.workspaceId,
        scopeId,
        request.dataVersion,
      );
      if (!syncRun?.dataVersion || !syncRun.finishedAt) {
        return Response.json(
          {
            code: 'NOT_FOUND',
            message: 'The requested dataVersion does not exist or has not yet succeeded.',
          },
          { status: 404 },
        );
      }
      effectiveDataVersion = syncRun.dataVersion;
      syncedAt = syncRun.finishedAt;
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
        type: request.type,
        historicalWindowDays: request.historicalWindowDays,
        sampleSize: 0,
        iterations,
        warnings: [
          { code: 'NO_DATA', message: 'No synchronized data available yet.' },
        ] satisfies Warning[],
        results: [],
      } satisfies ForecastResponse);
    }

    // Check the forecast cache.
    const requestHash = computeForecastRequestHash({
      type: request.type,
      historicalWindowDays: request.historicalWindowDays,
      iterations,
      confidenceLevels: request.confidenceLevels,
      ...(request.type === 'when' && { remainingStoryCount: request.remainingStoryCount }),
      ...(request.type === 'how_many' && { targetDate: request.targetDate }),
    });

    const cached = await lookupForecastCache(db, scopeId, requestHash, effectiveDataVersion);
    if (cached) {
      return Response.json(
        shapeForecastResponse({
          scopeId,
          request,
          dataVersion: effectiveDataVersion,
          sampleSize: cached.sampleSize,
          iterations,
          monteCarlo: {
            results: cached.payload.results,
            warnings: cached.payload.warnings,
          },
        }) satisfies ForecastResponse,
      );
    }

    // Query daily throughput — use only fully-completed days for Monte Carlo sampling
    // to avoid biasing forecasts with the partial current day.
    const allDays = await queryDailyThroughput(db, scopeId, scope.timezone, {
      windowDays: request.historicalWindowDays,
      dataVersion: effectiveDataVersion,
    });
    const completeDays = allDays.filter((d) => d.complete);
    const historicalDailyThroughput = completeDays.map((d) => d.completedStoryCount);
    const sampleSize = historicalDailyThroughput.reduce((acc, v) => acc + v, 0);

    // Run Monte Carlo simulation.
    let monteCarlo: MonteCarloForecastResult;
    if (request.type === 'when') {
      monteCarlo = runWhenForecast({
        historicalDailyThroughput,
        sampleSize,
        remainingStoryCount: request.remainingStoryCount,
        confidenceLevels: request.confidenceLevels,
        iterations,
      });
    } else {
      // Compute calendar days from today (scope timezone) to the target date inclusive.
      const todayLocal = formatDateInTimezone(new Date(), scope.timezone);
      const fromMs = new Date(todayLocal + 'T12:00:00').getTime();
      const toMs = new Date(request.targetDate + 'T12:00:00').getTime();
      const targetDays = Math.round((toMs - fromMs) / MS_PER_DAY);

      monteCarlo = runHowManyForecast({
        historicalDailyThroughput,
        sampleSize,
        targetDays,
        confidenceLevels: request.confidenceLevels,
        iterations,
      });
    }

    // Persist result to cache with a TTL so entries are eventually reaped.
    const cacheExpiresAt = new Date(Date.now() + FORECAST_CACHE_TTL_HOURS * 60 * 60 * 1000);
    const cachePayload: ForecastCachePayload = {
      results: monteCarlo.results,
      warnings: monteCarlo.warnings,
    };
    await storeForecastCache(db, {
      scopeId,
      requestHash,
      historicalWindowDays: request.historicalWindowDays,
      iterations,
      confidenceLevels: request.confidenceLevels,
      sampleSize,
      dataVersion: effectiveDataVersion,
      payload: cachePayload,
      expiresAt: cacheExpiresAt,
    });

    // Opportunistically remove expired cache entries for this scope so the
    // ForecastResultCache table does not grow unbounded over time.
    db.forecastResultCache
      .deleteMany({
        where: { scopeId, expiresAt: { lt: new Date() } },
      })
      .catch((err: unknown) => {
        logger.debug('Opportunistic forecast cache cleanup failed (non-fatal)', {
          scopeId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return Response.json(
      shapeForecastResponse({
        scopeId,
        request,
        dataVersion: effectiveDataVersion,
        sampleSize,
        iterations,
        monteCarlo,
      }) satisfies ForecastResponse,
    );
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    if (err instanceof InvalidTimeZoneError) {
      logger.warn('Forecast request blocked by invalid scope timezone', {
        scopeId: requestedScopeId,
        timezone: err.timezone,
      });
      return Response.json(buildInvalidScopeTimezoneProblem(err.timezone), {
        status: 409,
      });
    }
    logger.error('Failed to run forecast', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
