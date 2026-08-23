import type { Prisma } from "@prisma/client";
import type { AuditAction, AuditActor, AuditStatus } from "@/lib/types";

/**
 * Structured audit trail for the recovery lifecycle.
 *
 * Every meaningful state change writes one AuditLog row whose `details` JSON
 * carries a stable shape:
 *   { kind, event, from?, to?, reason?, ...metadata }
 *
 * `kind: "duplicate_suppressed"` rows are the observability signal for
 * duplicate webhooks/requests that were safely ignored.
 *
 * Never pass credentials or provider secrets into metadata.
 */

export type AuditClient = {
  auditLog: {
    create: Prisma.AuditLogDelegate["create"];
  };
};

export interface LifecycleEventInput {
  riskId?: string | null;
  recoveryId?: string | null;
  event: string;
  action?: AuditAction;
  actor?: AuditActor;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  status?: AuditStatus;
  source?: string;
  metadata?: Record<string, unknown>;
}

function serializeDetails(input: LifecycleEventInput): Record<string, unknown> {
  return {
    kind: "lifecycle",
    event: input.event,
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.metadata ?? {}),
  };
}

export async function recordLifecycleEvent(
  client: AuditClient,
  input: LifecycleEventInput
): Promise<void> {
  await client.auditLog.create({
    data: {
      revenueRiskId: input.riskId ?? undefined,
      recoveryId: input.recoveryId ?? undefined,
      action: input.action ?? "recover",
      actor: input.actor ?? "system",
      details: JSON.stringify(serializeDetails(input)),
      status: input.status ?? "success",
    },
  });
}

/** Fire-and-forget variant that never lets auditing break the main flow. */
export function recordLifecycleEventSafe(
  client: AuditClient,
  input: LifecycleEventInput
): Promise<void> {
  return recordLifecycleEvent(client, input).catch((err) => {
    console.error(
      "Failed to write lifecycle audit event:",
      err instanceof Error ? err.message : err
    );
  });
}

export async function recordDuplicateSuppressed(
  client: AuditClient,
  input: {
    riskId?: string | null;
    recoveryId?: string | null;
    event: string;
    actor?: AuditActor;
    reason: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await client.auditLog.create({
    data: {
      revenueRiskId: input.riskId ?? undefined,
      recoveryId: input.recoveryId ?? undefined,
      action: "recover",
      actor: input.actor ?? "system",
      details: JSON.stringify({
        kind: "duplicate_suppressed",
        event: input.event,
        reason: input.reason,
        ...(input.metadata ?? {}),
      }),
      status: "warning",
    },
  });
}
