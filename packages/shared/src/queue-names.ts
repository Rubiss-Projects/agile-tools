export const QUEUE_NAMES = {
  SCOPE_SYNC: 'scope-sync',
  PROJECTION_REBUILD: 'scope-rebuild-projections',
  HOSTED_SYNC: 'hosted-sync',
  HOSTED_SYNC_TICK: 'hosted-sync-tick',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
