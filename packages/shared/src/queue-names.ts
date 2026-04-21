export const QUEUE_NAMES = {
  SCOPE_SYNC: 'scope-sync',
  PROJECTION_REBUILD: 'scope-rebuild-projections',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];