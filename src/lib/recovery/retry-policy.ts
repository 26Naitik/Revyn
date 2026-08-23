import type { FailureCategory } from "./failure-classification";

/**
 * Retry policy for recovery execution.
 *
 * Rules:
 *   - At most MAX_EXECUTION_ATTEMPTS total execution attempts per workflow
 *     (first attempt + retries). No infinite retry loops, ever.
 *   - Only temporary failures may be retried; permanent failures go straight
 *     to a terminal state (operators can still escalate or retry manually).
 *   - Delay between attempts comes from the recovery decision's retryDelay
 *     when available ("24h", "48h"), otherwise it doubles per attempt with a
 *     cap, so repeated failures back off instead of hammering customers.
 */

export const RETRY_POLICY = {
  maxAttempts: 3,
  defaultDelayHours: 24,
  maxDelayHours: 72,
} as const;

/** Minimum time an execution claim may sit in `executing` before it is considered abandoned (crash recovery). */
export const STALE_EXECUTION_MINUTES = 10;

/**
 * Parses decision delays like "48h" or "30m". Returns null for anything
 * unparseable so callers can fall back to the default schedule.
 */
export function parseRetryDelayHours(delay: string | null | undefined): number | null {
  if (!delay) return null;
  const match = delay.trim().match(/^(\d+(?:\.\d+)?)\s*(h|hour|hours|m|min|mins|minutes|d|day|days)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2].toLowerCase();
  if (unit.startsWith("m")) return value / 60;
  if (unit.startsWith("d")) return value * 24;
  return value;
}

export function computeRetryDelayHours(
  attemptCount: number,
  decisionDelay: string | null | undefined
): number {
  // Prefer the deterministic decision's recommendation on the first retry.
  if (attemptCount <= 1) {
    const fromDecision = parseRetryDelayHours(decisionDelay);
    if (fromDecision !== null) {
      return Math.min(fromDecision, RETRY_POLICY.maxDelayHours);
    }
  }

  const backoff = RETRY_POLICY.defaultDelayHours * Math.pow(2, attemptCount - 1);
  return Math.min(backoff, RETRY_POLICY.maxDelayHours);
}

export function nextRetryDate(attemptCount: number, decisionDelay: string | null | undefined, now: Date = new Date()): Date {
  const hours = computeRetryDelayHours(attemptCount, decisionDelay);
  return new Date(now.getTime() + hours * 3_600_000);
}

export function hasAttemptsLeft(attemptCount: number): boolean {
  return attemptCount < RETRY_POLICY.maxAttempts;
}

/**
 * Central decision: should this failed execution be retried?
 */
export function shouldRetry(input: {
  category: FailureCategory;
  attemptCount: number;
}): boolean {
  return input.category === "temporary" && hasAttemptsLeft(input.attemptCount);
}

export function retryExhaustedReason(attemptCount: number): string {
  return `Maximum execution attempts reached (${attemptCount}/${RETRY_POLICY.maxAttempts}); automated retries exhausted.`;
}
