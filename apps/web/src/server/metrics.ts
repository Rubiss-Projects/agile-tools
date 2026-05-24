import { metrics, type Counter } from '@opentelemetry/api';
import { PrometheusExporter, PrometheusSerializer } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

type MetricsState = {
  exporter: PrometheusExporter;
  serializer: PrometheusSerializer;
  scrapeCounter: Counter;
  collectionErrorCounter: Counter;
};

const metricsGlobal = globalThis as typeof globalThis & {
  __agileToolsOtelMetrics?: MetricsState;
};

function createMetricsState(): MetricsState {
  const exporter = new PrometheusExporter({
    endpoint: '/metrics',
    preventServerStart: true,
    withoutScopeInfo: true,
  });
  const meterProvider = new MeterProvider({ readers: [exporter] });
  metrics.setGlobalMeterProvider(meterProvider);

  const serializer = new PrometheusSerializer(undefined, false, undefined, false, true);
  const meter = meterProvider.getMeter('agile-tools-web');

  const scrapeCounter = meter.createCounter('agile_tools_metrics_scrapes', {
    description: 'Number of Prometheus scrapes served by the web process.',
    unit: '1',
  });
  const collectionErrorCounter = meter.createCounter('agile_tools_metrics_collection_errors', {
    description: 'Number of non-fatal OpenTelemetry metric collection errors observed by the web process.',
    unit: '1',
  });

  meter
    .createObservableGauge('agile_tools_process_uptime_seconds', {
      description: 'Process uptime for the web process.',
      unit: 's',
    })
    .addCallback((observableResult) => {
      observableResult.observe(process.uptime());
    });

  meter
    .createObservableGauge('agile_tools_process_memory_bytes', {
      description: 'Memory usage reported by the web process.',
      unit: 'By',
    })
    .addCallback((observableResult) => {
      const memory = process.memoryUsage();
      observableResult.observe(memory.rss, { state: 'rss' });
      observableResult.observe(memory.heapTotal, { state: 'heap_total' });
      observableResult.observe(memory.heapUsed, { state: 'heap_used' });
      observableResult.observe(memory.external, { state: 'external' });
      observableResult.observe(memory.arrayBuffers, { state: 'array_buffers' });
    });

  return {
    exporter,
    serializer,
    scrapeCounter,
    collectionErrorCounter,
  };
}

function getMetricsState(): MetricsState {
  metricsGlobal.__agileToolsOtelMetrics ??= createMetricsState();
  return metricsGlobal.__agileToolsOtelMetrics;
}

export function initializeMetrics(): void {
  getMetricsState();
}

export async function collectPrometheusMetrics(): Promise<{ body: string; errors: unknown[] }> {
  const state = getMetricsState();
  state.scrapeCounter.add(1);

  const { resourceMetrics, errors } = await state.exporter.collect();
  if (errors.length > 0) {
    state.collectionErrorCounter.add(errors.length);
  }

  return {
    body: state.serializer.serialize(resourceMetrics),
    errors,
  };
}