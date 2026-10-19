import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const JiraRateStateSchema = z.object({
  limit: z.number().positive().default(240),
  fillRate: z.number().positive().default(120),
  intervalSeconds: z.number().positive().default(60),
  remaining: z.number().nonnegative().default(240),
  observedRemaining: z.number().nonnegative().nullable().default(null),
  observedAt: z.number().default(0),
  updatedAt: z.number().default(0),
  nextAt: z.number().default(0),
  blockedUntil: z.number().default(0),
  leases: z.array(z.object({ id: z.string(), expiresAt: z.number() })).default([]),
});
export type JiraRateState = z.infer<typeof JiraRateStateSchema>;
export interface JiraRateStore {
  /** The callback and state write must be atomic across every process. */
  update<T>(change: (state: JiraRateState, now: number) => T): Promise<T>;
}
export interface JiraRateSettings {
  fraction: number;
  reserveFraction: number;
  maxConcurrency: number;
  requestBudgetPerMinute?: number | null;
}
export const DEFAULT_JIRA_RATE_SETTINGS: JiraRateSettings = {
  fraction: 0.5, reserveFraction: 0.2, maxConcurrency: 3,
};

export function parseJiraRateHeaders(headers: Headers, now = Date.now()) {
  function numeric(name: string, allowZero = false): number | undefined {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : undefined;
  }
  const retry = headers.get('Retry-After');
  const seconds = numeric('Retry-After');
  const date = retry && !Number.isFinite(Number(retry)) ? Date.parse(retry) : NaN;
  return {
    limit: numeric('X-RateLimit-Limit'),
    remaining: numeric('X-RateLimit-Remaining', true),
    fillRate: numeric('X-RateLimit-FillRate'),
    intervalSeconds: numeric('X-RateLimit-Interval-Seconds'),
    retryAfterMs: seconds !== undefined ? seconds * 1000 : Math.max(0, date - now) || 0,
  };
}

/** Continuous, burst-free pacing plus a conservative estimate of Jira's bucket. */
export class JiraRateLimiter {
  constructor(
    private readonly store: JiraRateStore,
    readonly settings: JiraRateSettings = DEFAULT_JIRA_RATE_SETTINGS,
  ) {}

  async acquire(onWait?: (milliseconds: number, rateLimited: boolean, state: JiraRateState) => Promise<void>): Promise<() => Promise<void>> {
    const id = randomUUID();
    for (;;) {
      const wait = await this.store.update((state, now) => {
        this.refill(state, now);
        state.leases = state.leases.filter((lease) => lease.expiresAt > now);
        const reserve = Math.min(state.limit - 1, state.limit * this.settings.reserveFraction);
        const tokenWait = Math.max(0, reserve + 1 - state.remaining) / this.refillRate(state) * 1000;
        const concurrencyWait = state.leases.length >= this.settings.maxConcurrency ? 100 : 0;
        const delay = Math.max(0, state.nextAt - now, state.blockedUntil - now, tokenWait, concurrencyWait);
        if (delay > 0) return {
          milliseconds: Math.min(5_000, Math.ceil(delay)),
          rateLimited: state.blockedUntil > now || tokenWait > 0,
          state: structuredClone(state),
        };
        // The lease outlives the client's 30-second HTTP timeout, including body consumption.
        state.leases.push({ id, expiresAt: now + 60_000 });
        state.remaining = Math.max(0, state.remaining - 1);
        state.nextAt = now + 1000 / this.pacingRate(state);
        return { milliseconds: 0, rateLimited: false };
      });
      if (wait.milliseconds === 0) break;
      if (wait.state) await onWait?.(wait.milliseconds, wait.rateLimited, wait.state);
      await new Promise((resolve) => setTimeout(resolve, wait.milliseconds));
    }
    return async () => {
      await this.store.update((state) => { state.leases = state.leases.filter((lease) => lease.id !== id); });
    };
  }

  async observe(headers: Headers, status: number, attempt: number): Promise<JiraRateState> {
    return this.store.update((state, now) => {
      this.refill(state, now);
      const parsed = parseJiraRateHeaders(headers, now);
      if (parsed.limit !== undefined) state.limit = parsed.limit;
      if (parsed.fillRate !== undefined) state.fillRate = parsed.fillRate;
      if (parsed.intervalSeconds !== undefined) state.intervalSeconds = parsed.intervalSeconds;
      if (parsed.remaining !== undefined) {
        // A higher reading from a different Jira node must not erase a recent low reading.
        state.remaining = Math.min(state.remaining, parsed.remaining, state.limit);
        state.observedRemaining = parsed.remaining;
        state.observedAt = now;
      }
      // Apply changed header rates to the very next request, too.
      state.nextAt = Math.max(state.nextAt, now + 1000 / this.pacingRate(state));
      if (status === 429) {
        state.remaining = 0;
        const refillMs = (state.limit * this.settings.reserveFraction + 1) / this.refillRate(state) * 1000;
        const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (1 + Math.random());
        state.blockedUntil = Math.max(state.blockedUntil, now + parsed.retryAfterMs, now + refillMs, now + backoffMs);
      } else if (parsed.retryAfterMs > 0) {
        state.blockedUntil = Math.max(state.blockedUntil, now + parsed.retryAfterMs);
      }
      return structuredClone(state);
    });
  }

  private refillRate(state: JiraRateState): number {
    return state.fillRate / state.intervalSeconds * this.settings.fraction;
  }

  private pacingRate(state: JiraRateState): number {
    return Math.min(this.refillRate(state),
      this.settings.requestBudgetPerMinute ? this.settings.requestBudgetPerMinute / 60 : Infinity);
  }

  private refill(state: JiraRateState, now: number): void {
    // Estimate refill at our allocated fraction, leaving the rest for other account users.
    state.remaining = Math.min(state.limit, state.remaining + Math.max(0, now - state.updatedAt) / 1000 * this.refillRate(state));
    state.updatedAt = now;
  }
}

export function createMemoryJiraRateStore(): JiraRateStore {
  const state = JiraRateStateSchema.parse({ updatedAt: Date.now() });
  return { update(change) { return Promise.resolve(change(state, Date.now())); } };
}
