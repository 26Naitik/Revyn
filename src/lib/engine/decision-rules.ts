import type { DecisionPriority, RecoveryStrategy } from "@/lib/types";
import { LOW_SCORE_ESCALATION_THRESHOLD } from "./scoring";

/**
 * Deterministic strategy rules.
 *
 * Pure functions only - no database, no I/O - so the whole decision layer can
 * be unit-tested directly and stays explainable.
 */

export interface RootCauseDecision {
  strategy: RecoveryStrategy;
  reasoning: string;
  confidence: number;
  discountPercent: number;
  retryDelay: string | null;
}

export const RECOVERY_STRATEGIES: readonly RecoveryStrategy[] = [
  "retry_payment",
  "send_payment_link",
  "offer_discount",
  "schedule_retry",
  "escalate_human",
  "no_action",
];

export function isRecoveryStrategy(value: string): value is RecoveryStrategy {
  return (RECOVERY_STRATEGIES as readonly string[]).includes(value);
}

const ROOT_CAUSE_DECISIONS: Record<
  string,
  (amount: number, failCount: number) => RootCauseDecision
> = {
  expired_card: () => ({
    strategy: "send_payment_link",
    reasoning: "Customer has an expired card. Send payment link to prompt card update.",
    confidence: 0.9,
    discountPercent: 0,
    retryDelay: null,
  }),
  insufficient_funds: () => ({
    strategy: "schedule_retry",
    reasoning: "Insufficient funds. Schedule retry in 24-48 hours when funds may be available.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: "48h",
  }),
  card_declined: (_amount, failCount) => {
    if (failCount >= 2) {
      return {
        strategy: "escalate_human",
        reasoning: `Card declined ${failCount} times. Escalating to human for manual review.`,
        confidence: 0.6,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "retry_payment",
      reasoning: "Card declined (possibly transient). Retry payment immediately.",
      confidence: 0.7,
      discountPercent: 0,
      retryDelay: null,
    };
  },
  network_timeout: () => ({
    strategy: "retry_payment",
    reasoning: "Network timeout is likely transient. Retry payment immediately.",
    confidence: 0.85,
    discountPercent: 0,
    retryDelay: null,
  }),
  authentication_failure: () => ({
    strategy: "send_payment_link",
    reasoning: "Authentication failed. Send payment link for customer to retry with correct credentials.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: null,
  }),
  "3ds_authentication_failure": () => ({
    strategy: "send_payment_link",
    reasoning: "3DS authentication failed. Send payment link for retry.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: null,
  }),
  payment_processing_error: (_amount, failCount) => {
    if (failCount >= 2) {
      return {
        strategy: "escalate_human",
        reasoning: `Processing error persisted after ${failCount} attempts. Escalating.`,
        confidence: 0.5,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "send_payment_link",
      reasoning: "General processing error. Send payment link for retry.",
      confidence: 0.6,
      discountPercent: 0,
      retryDelay: null,
    };
  },
  abandoned_checkout: (amount) => {
    if (amount > 500000) {
      return {
        strategy: "send_payment_link",
        reasoning: "High-value abandoned checkout (INR 5,000+). Send payment link without discount.",
        confidence: 0.7,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "send_payment_link",
      reasoning: "Checkout abandoned. Send payment link with small discount to incentivize completion.",
      confidence: 0.65,
      discountPercent: 5,
      retryDelay: null,
    };
  },
  subscription_mandate_failed: () => ({
    strategy: "send_payment_link",
    reasoning: "Subscription mandate failed. Send payment link for manual authorization.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: null,
  }),
  subscription_halted: () => ({
    strategy: "schedule_retry",
    reasoning: "Subscription halted. Schedule retry after 24 hours.",
    confidence: 0.7,
    discountPercent: 0,
    retryDelay: "24h",
  }),
  subscription_first_payment_failed: () => ({
    strategy: "send_payment_link",
    reasoning: "First subscription payment failed. Send payment link to complete onboarding.",
    confidence: 0.7,
    discountPercent: 0,
    retryDelay: null,
  }),
  subscription_recurring_failure: (_amount, failCount) => {
    if (failCount >= 2) {
      return {
        strategy: "escalate_human",
        reasoning: `Recurring subscription failure after ${failCount} attempts. Escalating.`,
        confidence: 0.6,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "schedule_retry",
      reasoning: "Recurring subscription failure. Schedule retry in 24 hours.",
      confidence: 0.65,
      discountPercent: 0,
      retryDelay: "24h",
    };
  },
  overdue_receivable: () => ({
    strategy: "send_payment_link",
    reasoning: "Overdue receivable. Send payment link for follow-up.",
    confidence: 0.6,
    discountPercent: 0,
    retryDelay: null,
  }),
  overdue_receivable_stale: () => ({
    strategy: "escalate_human",
    reasoning: "Overdue receivable is stale (>3 days). Escalate for manual follow-up.",
    confidence: 0.5,
    discountPercent: 0,
    retryDelay: null,
  }),
};

export function selectBaseStrategy(
  rootCause: string,
  amount: number,
  failCount: number
): RootCauseDecision {
  const decisionFn = ROOT_CAUSE_DECISIONS[rootCause];

  if (decisionFn) {
    return decisionFn(amount, failCount);
  }

  if (failCount >= 3) {
    return {
      strategy: "escalate_human",
      reasoning: `Unknown root cause "${rootCause}" with ${failCount} failures. Escalating.`,
      confidence: 0.3,
      discountPercent: 0,
      retryDelay: null,
    };
  }

  return {
    strategy: "send_payment_link",
    reasoning: `No specific decision rule for "${rootCause}". Defaulting to payment link.`,
    confidence: 0.4,
    discountPercent: 0,
    retryDelay: null,
  };
}

const AUTOMATION_STRATEGIES: ReadonlySet<RecoveryStrategy> = new Set([
  "retry_payment",
  "send_payment_link",
  "offer_discount",
  "schedule_retry",
]);

/**
 * Cases with a very low recovery score are poor candidates for automated
 * recovery - hand them to a human instead of burning retries.
 */
export function applyLowScoreRule(
  base: RootCauseDecision,
  score: number
): RootCauseDecision {
  if (
    score < LOW_SCORE_ESCALATION_THRESHOLD &&
    AUTOMATION_STRATEGIES.has(base.strategy)
  ) {
    return {
      ...base,
      strategy: "escalate_human",
      confidence: Math.min(base.confidence, 0.55),
      reasoning: `${base.reasoning} Recovery score ${score} is below the automation threshold (${LOW_SCORE_ESCALATION_THRESHOLD}), so this case is routed to manual review.`,
    };
  }
  return base;
}

/**
 * Priority rubric:
 *   critical - guardrail escalation, or large amount with decent score
 *   high     - strong recovery odds (score >= 70) or significant amount
 *   medium   - workable case
 *   low      - weak case, deprioritise in queues
 */
export function derivePriority(
  score: number,
  amountPaise: number,
  escalatedToHuman: boolean
): DecisionPriority {
  if (escalatedToHuman) return "critical";
  if (amountPaise >= 5_000_000 && score >= 60) return "critical";
  if (score >= 70 || amountPaise >= 1_000_000) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function nextStepFor(
  strategy: RecoveryStrategy,
  options: { discountPercent?: number; retryDelay?: string | null } = {}
): string | null {
  switch (strategy) {
    case "retry_payment":
      return "Retry the charge on the customer's original instrument now.";
    case "send_payment_link": {
      const suffix =
        options.discountPercent && options.discountPercent > 0
          ? ` Apply the ${options.discountPercent}% incentive at link creation.`
          : "";
      return `Create a Razorpay payment link and notify the customer.${suffix}`;
    }
    case "offer_discount":
      return `Create a discounted Razorpay payment link (${
        options.discountPercent ?? 0
      }% off) and notify the customer.`;
    case "schedule_retry":
      return `Schedule an automatic retry${
        options.retryDelay ? ` in ${options.retryDelay}` : ""
      }.`;
    case "escalate_human":
      return "Assign this case to the recovery team for personal outreach.";
    case "no_action":
      return "Close the risk item without further action.";
    default:
      return null;
  }
}
