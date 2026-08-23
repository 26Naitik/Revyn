import { z } from "zod";
import type {
  RecoveryFactor,
  RecoveryScoreBand,
  RecoveryScoreResult,
} from "@/lib/types";

/**
 * Deterministic recovery scoring.
 *
 * The score (0-100) estimates how recoverable a revenue-at-risk case is.
 * Every factor produces a normalised value in [0, 1] (higher = better for
 * recovery) and contributes `value * weight * 100` points to the total.
 *
 * Weights (sum = 1.0) - tune here, behaviour stays explainable:
 *   payment_history     0.25  captured-vs-total lifetime payments
 *   recent_failures     0.20  failures in the trailing 30 days
 *   overdue_duration    0.15  how stale the case is
 *   recovery_history    0.15  outcome of earlier recovery workflows
 *   amount_fit          0.15  smaller ticket sizes recover more easily
 *   customer_tenure     0.10  older, established customers churn back less
 */

export const RECOVERY_SCORE_WEIGHTS = {
  payment_history: 0.25,
  recent_failures: 0.2,
  overdue_duration: 0.15,
  recovery_history: 0.15,
  amount_fit: 0.15,
  customer_tenure: 0.1,
} as const;

/** Cases scoring below this are considered poor candidates for automation. */
export const LOW_SCORE_ESCALATION_THRESHOLD = 35;

/** Age (in hours) beyond which a case starts losing freshness credit. */
const FRESHNESS_GRACE_HOURS = 24;
/** Age (in hours) at which freshness credit reaches its floor (~14 days). */
const FRESHNESS_FLOOR_HOURS = 336;
/** Window (in days) for counting recent payment failures. */
const RECENT_FAILURE_WINDOW_DAYS = 30;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Everything the scorer needs. All fields are plain data so the scorer is
 * pure, deterministic and directly testable without a database.
 */
export interface RecoveryContextInput {
  riskType: string;
  amountPaise: number;
  riskCreatedAt: Date;
  customerCreatedAt: Date;
  totalPayments: number;
  successfulPayments: number;
  recentFailedPayments: number;
  recoveryAttempts: number;
  recoverySuccesses: number;
}

type FactorComputation = Pick<RecoveryFactor, "value" | "detail">;

function paymentHistoryFactor(
  totalPayments: number,
  successfulPayments: number
): FactorComputation {
  if (totalPayments <= 0) {
    return {
      value: 0.5,
      detail: "No payment history yet - scored neutral",
    };
  }
  const successes = Math.min(Math.max(successfulPayments, 0), totalPayments);
  const ratio = successes / totalPayments;
  return {
    value: clamp01(ratio),
    detail: `${successes}/${totalPayments} past payments captured`,
  };
}

function recentFailuresFactor(recentFailedPayments: number): FactorComputation {
  const failures = Math.max(recentFailedPayments, 0);
  // Each failure in the window costs 28 points of factor credit, floored at 0.1.
  const value =
    failures === 0 ? 1 : Math.max(0.1, clamp01(1 - 0.28 * failures));
  return {
    value,
    detail:
      failures === 0
        ? `No failures in the last ${RECENT_FAILURE_WINDOW_DAYS} days`
        : `${failures} failed payment${failures > 1 ? "s" : ""} in the last ${RECENT_FAILURE_WINDOW_DAYS} days`,
  };
}

function overdueDurationFactor(
  riskCreatedAt: Date,
  now: Date
): FactorComputation {
  const ageHours = Math.max(
    0,
    (now.getTime() - riskCreatedAt.getTime()) / 3_600_000
  );

  if (!Number.isFinite(ageHours)) {
    return { value: 0.5, detail: "Case age unknown - scored neutral" };
  }

  if (ageHours <= FRESHNESS_GRACE_HOURS) {
    return { value: 1, detail: "Case is fresh (under 24h old)" };
  }

  const decayed =
    1 - (ageHours - FRESHNESS_GRACE_HOURS) / (FRESHNESS_FLOOR_HOURS - FRESHNESS_GRACE_HOURS);
  const value = Math.max(0.05, clamp01(decayed));
  const ageDays = Math.floor(ageHours / 24);
  return {
    value,
    detail: `Case is ${ageDays} day${ageDays === 1 ? "" : "s"} old`,
  };
}

function recoveryHistoryFactor(
  recoveryAttempts: number,
  recoverySuccesses: number
): FactorComputation {
  if (recoveryAttempts <= 0) {
    return {
      value: 0.5,
      detail: "No prior recovery attempts for this customer",
    };
  }
  const successes = Math.min(Math.max(recoverySuccesses, 0), recoveryAttempts);
  const ratio = successes / recoveryAttempts;
  return {
    value: clamp01(ratio),
    detail: `${successes}/${recoveryAttempts} prior recoveries succeeded`,
  };
}

function amountFitFactor(amountPaise: number): FactorComputation {
  // Ticket-size fit: tiny amounts are often not worth chasing, huge ones
  // rarely recover through self-serve links. Mid-market sizes score best.
  const tiers: Array<{ limit: number; value: number; label: string }> = [
    { limit: 50_000, value: 0.85, label: "under \u20B9500" },
    { limit: 1_000_000, value: 1, label: "\u20B9500-\u20B910,000" },
    { limit: 5_000_000, value: 0.8, label: "\u20B910,000-\u20B950,000" },
    { limit: 20_000_000, value: 0.55, label: "\u20B950,000-\u20B92,00,000" },
  ];

  for (const tier of tiers) {
    if (amountPaise <= tier.limit) {
      return { value: tier.value, detail: `Amount ${tier.label}` };
    }
  }

  return { value: 0.35, detail: "High-ticket amount (above \u20B92,00,000)" };
}

function customerTenureFactor(
  customerCreatedAt: Date,
  now: Date
): FactorComputation {
  const ageDays = (now.getTime() - customerCreatedAt.getTime()) / 86_400_000;

  if (!Number.isFinite(ageDays)) {
    return { value: 0.5, detail: "Account age unknown - scored neutral" };
  }

  // Floor of 0.2 for brand-new accounts, full credit after ~a year.
  const value = clamp01(0.2 + Math.max(0, ageDays) / 365);
  const days = Math.floor(Math.max(0, ageDays));
  return {
    value,
    detail: `Customer for ${days} day${days === 1 ? "" : "s"}`,
  };
}

export function computeRecoveryScore(
  input: RecoveryContextInput,
  now: Date = new Date()
): RecoveryScoreResult {
  const computations: Record<keyof typeof RECOVERY_SCORE_WEIGHTS, FactorComputation> = {
    payment_history: paymentHistoryFactor(
      input.totalPayments,
      input.successfulPayments
    ),
    recent_failures: recentFailuresFactor(input.recentFailedPayments),
    overdue_duration: overdueDurationFactor(input.riskCreatedAt, now),
    recovery_history: recoveryHistoryFactor(
      input.recoveryAttempts,
      input.recoverySuccesses
    ),
    amount_fit: amountFitFactor(input.amountPaise),
    customer_tenure: customerTenureFactor(input.customerCreatedAt, now),
  };

  const factors: RecoveryFactor[] = (
    Object.keys(RECOVERY_SCORE_WEIGHTS) as Array<keyof typeof RECOVERY_SCORE_WEIGHTS>
  ).map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    weight: RECOVERY_SCORE_WEIGHTS[key],
    value: round2(computations[key].value),
    contribution: round2(computations[key].value * RECOVERY_SCORE_WEIGHTS[key] * 100),
    detail: computations[key].detail,
  }));

  const score =
    Math.round(
      factors.reduce((sum, factor) => sum + factor.contribution, 0) * 10
    ) / 10;

  return {
    score,
    band: scoreBandFor(score),
    factors,
  };
}

export function scoreBandFor(score: number): RecoveryScoreBand {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

const FACTOR_LABELS: Record<keyof typeof RECOVERY_SCORE_WEIGHTS, string> = {
  payment_history: "Payment history",
  recent_failures: "Recent failures",
  overdue_duration: "Case freshness",
  recovery_history: "Past recovery outcomes",
  amount_fit: "Amount profile",
  customer_tenure: "Customer tenure",
};

/**
 * Runtime validator for factors persisted in the `factors` JSON column.
 * Used when reading decisions back for the dashboard.
 */
export const recoveryFactorSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  weight: z.number(),
  contribution: z.number(),
  detail: z.string(),
});

export const storedFactorsSchema = z.array(recoveryFactorSchema);

export function parseStoredFactors(raw: unknown): RecoveryFactor[] {
  const parsed = storedFactorsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
