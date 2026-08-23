export const PAYMENT_LINK_ELIGIBLE_STRATEGIES: ReadonlySet<string> = new Set([
  "send_payment_link",
  "offer_discount",
]);

export function isPaymentLinkEligible(row: {
  status: string;
  strategy: string;
}): boolean {
  return (
    row.status === "pending" &&
    PAYMENT_LINK_ELIGIBLE_STRATEGIES.has(row.strategy)
  );
}
