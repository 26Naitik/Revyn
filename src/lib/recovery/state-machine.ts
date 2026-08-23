import type { RecoveryStatus } from "@/lib/types";

/**
 * Recovery workflow state machine.
 *
 * States (persisted in RecoveryWorkflow.status):
 *   pending          - decision made, waiting for first execution
 *   executing        - an execution attempt is in flight (payment link live)
 *   retry_scheduled  - temporary failure recorded, next retry queued
 *   succeeded        - provider confirmed payment (terminal)
 *   failed           - terminal failure for automation
 *   escalated        - handed to a human operator (terminal for automation)
 *   cancelled        - cancelled by operator (terminal)
 *
 * The table below governs APPLICATION-driven transitions. Trusted Razorpay
 * webhook events are deliberately allowed to mark any non-succeeded workflow
 * as succeeded: recording provider truth is not an "execution", and money
 * that was actually paid must always be recorded.
 */

export const RECOVERY_WORKFLOW_STATUSES: readonly RecoveryStatus[] = [
  "pending",
  "executing",
  "retry_scheduled",
  "succeeded",
  "failed",
  "escalated",
  "cancelled",
];

const TRANSITIONS: Record<RecoveryStatus, readonly RecoveryStatus[]> = {
  pending: ["executing", "cancelled", "escalated"],
  retry_scheduled: ["executing", "cancelled", "escalated"],
  executing: ["succeeded", "failed", "retry_scheduled"],
  failed: ["executing", "escalated", "cancelled"],
  escalated: [],
  succeeded: [],
  cancelled: [],
};

/** States the automatic executor may pick up. */
export const AUTO_EXECUTABLE_STATUSES: readonly RecoveryStatus[] = [
  "pending",
  "retry_scheduled",
];

/**
 * A human operator may additionally force a fresh attempt on a failed
 * workflow - this is what powers the dashboard "Retry now" action. The
 * retry policy still caps total attempts.
 */
export const MANUAL_EXECUTABLE_STATUSES: readonly RecoveryStatus[] = [
  "pending",
  "retry_scheduled",
  "failed",
];

export const TERMINAL_STATUSES: readonly RecoveryStatus[] = [
  "succeeded",
  "failed",
  "escalated",
  "cancelled",
];

export function isRecoveryStatus(value: string): value is RecoveryStatus {
  return (RECOVERY_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isRecoveryStatus(from) || !isRecoveryStatus(to)) {
    return false;
  }
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(`Invalid recovery workflow transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Guard for application-driven transitions. Webhook paths intentionally do
 * NOT route through this guard - see the module docblock.
 */
export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isExecutable(status: string, options: { manual?: boolean } = {}): boolean {
  const list = options.manual ? MANUAL_EXECUTABLE_STATUSES : AUTO_EXECUTABLE_STATUSES;
  return (list as readonly string[]).includes(status);
}
