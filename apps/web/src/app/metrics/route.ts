import { logger } from '@agile-tools/shared';

import { collectPrometheusMetrics, PROMETHEUS_CONTENT_TYPE } from '@/server/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function metricErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(): Promise<Response> {
  try {
    const { body, errors } = await collectPrometheusMetrics();
    if (errors.length > 0) {
      logger.warn('OpenTelemetry metric collection returned non-fatal errors', {
        errors: errors.map(metricErrorMessage),
      });
    }

    return new Response(body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': PROMETHEUS_CONTENT_TYPE,
      },
    });
  } catch (error) {
    const message = metricErrorMessage(error);
    logger.error('Failed to export OpenTelemetry metrics', { error: message });
    return new Response('# failed to export metrics\n', {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': PROMETHEUS_CONTENT_TYPE,
      },
    });
  }
}