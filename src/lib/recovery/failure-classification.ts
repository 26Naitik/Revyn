/**
 * Typed failure classification for recovery execution.
 *
 * Failures are split into two categories that drive the retry engine:
 *   temporary - transient conditions worth retrying (network blips, provider
 *               outages, expired links, insufficient funds)
 *   permanent - conditions that will not fix themselves (invalid customer
 *               data, unsupported configuration, rejected/cancelled setups)
 *
 * Classification is pattern-based but centralised here so the rest of the
 * system never does ad-hoc string matching.
 */

export type FailureCategory = "temporary" | "permanent";

export interface ClassifiedFailure {
  category: FailureCategory;
  /** Whether the retry engine may schedule another attempt. */
  retryable: boolean;
  reason: string;
}

const TEMPORARY_PATTERNS: readonly string[] = [
  "timeout",
  "timed out",
  "network",
  "econnrefused",
  "econnreset",
  "socket hang up",
  "temporarily",
  "temporary",
  "service unavailable",
  "internal error",
  "bad gateway",
  "gateway_timeout",
  "rate limit",
  "too many requests",
  "insufficient_funds",
  "payment_link_expired",
  // Infrastructure errors are treated as transient: the workflow rolls back
  // into a schedulable state instead of terminating.
  "db write failed",
  "database",
  "deadlock",
  "write conflict",
];

const PERMANENT_PATTERNS: readonly string[] = [
  "invalid",
  "not configured",
  "unsupported_currency",
  "unauthorized",
  "forbidden",
  "authentication",
  "bad_request",
  "cancelled",
  "canceled",
  "blocked",
  "revoked",
  "customer_not_resolvable",
  "amount_below_guardrail_minimum",
  "razorpaycredentials",
];

export function classifyFailure(rawReason: string): ClassifiedFailure {
  const normalized = rawReason.toLowerCase();

  if (PERMANENT_PATTERNS.some((p) => normalized.includes(p))) {
    return {
      category: "permanent",
      retryable: false,
      reason: rawReason,
    };
  }

  if (TEMPORARY_PATTERNS.some((p) => normalized.includes(p))) {
    return {
      category: "temporary",
      retryable: true,
      reason: rawReason,
    };
  }

  // Unknown failures are treated as permanent: never loop blindly on an
  // unrecognised error.
  return {
    category: "permanent",
    retryable: false,
    reason: rawReason,
  };
}

/** Canonical, typed reasons used by the recovery executor and webhooks. */
export const FAILURE_REASONS = {
  paymentLinkExpired: "payment_link_expired",
  providerCreationFailed: "provider_creation_failed",
  unexpectedProviderError: "unexpected_provider_error",
} as const;
