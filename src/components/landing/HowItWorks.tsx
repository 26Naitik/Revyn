import {
  IconChart,
  IconDecide,
  IconDiagnose,
  IconRadar,
  IconSend,
} from "@/components/ui/icons";

const STEPS = [
  {
    icon: IconRadar,
    title: "Detect",
    description:
      "Continuous scans surface failed payments, abandoned checkouts, subscription failures and overdue receivables.",
  },
  {
    icon: IconDiagnose,
    title: "Diagnose",
    description:
      "Each risk gets a root-cause analysis with a confidence score, so actions are informed — not blind.",
  },
  {
    icon: IconDecide,
    title: "Decide",
    description:
      "A bounded decision engine picks the right strategy: retry, payment link, discount, schedule or escalate.",
  },
  {
    icon: IconSend,
    title: "Recover",
    description:
      "Recovery actions execute through Razorpay payment links with strict guardrails on every attempt.",
  },
  {
    icon: IconChart,
    title: "Measure",
    description:
      "Recovered amounts are confirmed via webhooks and attributed back to each recovery workflow.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
            How Revyn works
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            One pipeline from risk to revenue.
          </h2>
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative lg:px-4 lg:first:pl-0 lg:last:pr-0">
              {/* Connector */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[47px] top-5 hidden h-px w-[calc(100%-40px)] bg-line lg:block"
                />
              )}
              <div className="relative flex items-start gap-4 lg:block">
                <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand-soft text-brand-dark">
                  <step.icon className="h-5 w-5" />
                </span>
                <div className="lg:mt-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {step.title}
                    <span className="rounded border border-line bg-canvas px-1 font-mono text-[10px] font-medium text-faint">
                      0{i + 1}
                    </span>
                  </p>
                  <p className="mt-1.5 max-w-xs text-[13px] leading-5 text-muted">
                    {step.description}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
