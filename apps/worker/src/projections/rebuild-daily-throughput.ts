// Re-export shared query functions from packages/db so worker-internal code can
// import from a stable local path while sharing the same implementation as the
// web API routes.
export {
  queryDailyThroughput,
  formatDateInTimezone,
  DailyThroughputRow,
  DEFAULT_THROUGHPUT_WINDOW_DAYS,
} from '@agile-tools/db';

/**
 * @deprecated Import queryDailyThroughput from @agile-tools/db directly.
 * This alias exists for backward compatibility only.
 */
export { queryDailyThroughput as rebuildDailyThroughput } from '@agile-tools/db';
