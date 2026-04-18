// Re-export shared query functions from packages/db so worker-internal code can
// import from a stable local path while sharing the same implementation as the
// web API routes.
export {
  queryCompletedStories,
  CompletedStoryRow,
  DEFAULT_COMPLETED_WINDOW_DAYS,
} from '@agile-tools/db';
