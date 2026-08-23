import {
  IconAlertTriangle,
  IconClock,
  IconCreditCard,
  IconReceipt,
} from "@/components/ui/icons";

const PROBLEMS = [
  {
    icon: IconAlertTriangle,
    title: "Failed payments",
    description:
      "Card declines, insufficient funds and expired credentials silently stall revenue.",
  },
  {
    icon: IconCreditCard,
    title: "Abandoned checkouts",
    description:
      "Customers start a purchase and leave before completion, leaking potential revenue.",
  },
  {
    icon: IconClock,
    title: "Subscription failures",
    description:
      "Renewals fail due to outdated billing details or expired payment methods.",
  },
  {
    icon: IconReceipt,
    title: "Overdue receivables",
    description:
      "Invoice amounts pass due dates without automated, structured follow-up.",
  },
];

export function LeakSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
          The problem
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Revenue doesn&apos;t disappear.
          <br />
          It leaks.
        </h2>
        <p className="mt-3 text-[17px] leading-7 text-muted">
          Most revenue loss isn&apos;t caused by a single dramatic failure.
          It&apos;s a slow, structural leak across payments, subscriptions and
          receivables.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROBLEMS.map((item) => (
          <div
            key={item.title}
            className="group rounded-xl border border-line bg-surface p-6 shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-raised"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-canvas text-muted transition-colors group-hover:border-brand/20 group-hover:bg-brand-soft group-hover:text-brand-dark">
              <item.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-ink">
              {item.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-5 text-muted">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
