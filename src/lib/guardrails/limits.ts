export interface GuardrailLimit {
  maxAttemptsPerRisk: number;
  maxRetriesPerCustomer: number;
  maxPaymentLinksPerWeek: number;
  maxDiscountPercent: number;
  maxDiscountPerCustomerPerMonth: number;
  minRecoveryAmountPaise: number;
  maxRecoveryBudgetPaise: number;
  cooldownMinutes: number;
  escalateAfterFailures: number;
}

export const DEFAULT_LIMITS: GuardrailLimit = {
  maxAttemptsPerRisk: 3,
  maxRetriesPerCustomer: 3,
  maxPaymentLinksPerWeek: 2,
  maxDiscountPercent: 10,
  maxDiscountPerCustomerPerMonth: 1,
  minRecoveryAmountPaise: 1000, // INR 10
  maxRecoveryBudgetPaise: 5000000, // INR 50,000
  cooldownMinutes: 60,
  escalateAfterFailures: 3,
};
