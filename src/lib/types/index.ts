export type RevenueRiskType =
  | "failed_payment"
  | "abandoned_checkout"
  | "failed_subscription"
  | "overdue_receivable";

export type RevenueRiskStatus =
  | "detected"
  | "diagnosing"
  | "decided"
  | "recovering"
  | "recovered"
  | "failed"
  | "abandoned"
  | "expired";

export type RecoveryStrategy =
  | "retry_payment"
  | "send_payment_link"
  | "offer_discount"
  | "schedule_retry"
  | "escalate_human"
  | "no_action";

export type RecoveryStatus =
  | "pending"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AuditAction =
  | "detect"
  | "diagnose"
  | "decide"
  | "recover"
  | "measure"
  | "guardrail_block"
  | "guardrail_warn"
  | "error"
  | "webhook";

export type AuditActor = "system" | "ai_agent" | "razorpay_webhook" | "user";

export type AuditStatus = "success" | "failure" | "warning";

export interface DashboardStats {
  totalAtRisk: number;
  totalRecovered: number;
  recoveryRate: number;
  activeRecoveries: number;
  byType: Record<RevenueRiskType, number>;
  byStatus: Record<RevenueRiskStatus, number>;
}

export interface DetectionResult {
  risksFound: number;
  totalAtRisk: number;
  items: Array<{
    id: string;
    type: RevenueRiskType;
    amountAtRisk: number;
    customerName: string;
    status: RevenueRiskStatus;
    createdAt: Date;
  }>;
}

export interface DiagnosisResult {
  riskId: string;
  rootCause: string;
  confidenceScore: number;
  details: string;
}

export interface RecoveryDecision {
  strategy: RecoveryStrategy;
  reasoning: string;
  confidence: number;
  estimatedRecovery: number;
  discountPercent: number;
  retryDelay: string | null;
  escalationReason: string | null;
}
