const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatINR(amountPaise: number): string {
  if (!Number.isFinite(amountPaise)) return "₹0";
  return inrFormatter.format(amountPaise / 100);
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatINRCompact(amountPaise: number): string {
  if (!Number.isFinite(amountPaise)) return "₹0";

  const rupees = amountPaise / 100;
  const abs = Math.abs(rupees);

  if (abs >= 1_00_00_000) {
    const cr = rupees / 1_00_00_000;
    return `₹${trimZeros(cr.toFixed(2))}Cr`;
  }
  if (abs >= 1_00_000) {
    const lakh = rupees / 1_00_000;
    return `₹${trimZeros(lakh.toFixed(2))}L`;
  }
  if (abs >= 1_000) {
    const k = rupees / 1_000;
    return `₹${trimZeros(k.toFixed(1))}K`;
  }
  return `₹${Math.round(rupees)}`;
}

function trimZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatRelativeTime(date: Date, now = new Date()): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "—";
  }

  const diffMs = now.getTime() - date.getTime();
  const past = diffMs >= 0;
  const diffMin = Math.floor(Math.abs(diffMs) / 60_000);

  let label: string;
  if (diffMin < 1) label = "just now";
  else if (diffMin < 60) label = `${diffMin}m`;
  else if (diffMin < 24 * 60) label = `${Math.floor(diffMin / 60)}h`;
  else if (diffMin < 30 * 24 * 60) label = `${Math.floor(diffMin / (24 * 60))}d`;
  else return formatDateTime(date);

  if (label === "just now") return label;
  return past ? `${label} ago` : `in ${label}`;
}

const REF_PREFIXES: Array<[RegExp, string]> = [
  [/^risk_/i, "RSK"],
  [/^rec_/i, "REC"],
  [/^paylink_/i, "LNK"],
  [/^link_/i, "LNK"],
];

export function shortRef(id: string | null | undefined): string {
  if (!id) return "—";
  const clean = id.trim();
  if (!clean) return "—";

  let prefix = "REF";
  for (const [pattern, tag] of REF_PREFIXES) {
    if (pattern.test(clean)) {
      prefix = tag;
      break;
    }
  }

  const tail = clean.slice(-6).toUpperCase();
  return `${prefix}·${tail}`;
}

export const RISK_TYPE_LABELS: Record<string, string> = {
  failed_payment: "Failed payment",
  abandoned_checkout: "Abandoned checkout",
  failed_subscription: "Failed subscription",
  overdue_receivable: "Overdue receivable",
};

export const STRATEGY_LABELS: Record<string, string> = {
  retry_payment: "Retry payment",
  send_payment_link: "Payment link",
  offer_discount: "Discount link",
  schedule_retry: "Scheduled retry",
  escalate_human: "Escalate to human",
  no_action: "No action",
};

export function labelRiskType(type: string): string {
  return RISK_TYPE_LABELS[type] ?? type;
}

export function labelStrategy(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDateTime(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "—";
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  detected: "bg-amber-50 text-amber-700 ring-amber-600/20",
  diagnosing: "bg-blue-50 text-blue-700 ring-blue-600/20",
  decided: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  recovering: "bg-sky-50 text-sky-700 ring-sky-600/20",
  recovered: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  executing: "bg-blue-50 text-blue-700 ring-blue-600/20",
  succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-500/20",
  abandoned: "bg-gray-100 text-gray-600 ring-gray-500/20",
  expired: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export function statusBadgeClass(status: string): string {
  return (
    STATUS_BADGE_CLASSES[status] ?? "bg-gray-100 text-gray-600 ring-gray-500/20"
  );
}
