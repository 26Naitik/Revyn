import { Badge } from "@/components/ui/Badge";
import {
  IconCheckCircle,
  IconDecide,
  IconDiagnose,
  IconRadar,
  IconSend,
} from "@/components/ui/icons";

const WORKFLOW_STEPS = [
  {
    icon: IconRadar,
    label: "Payment failure detected",
    meta: "failed_payment · ₹12,400",
    state: "done" as const,
  },
  {
    icon: IconDiagnose,
    label: "Diagnosis completed",
    meta: "root cause: card expired · confidence 0.94",
    state: "done" as const,
  },
  {
    icon: IconDecide,
    label: "Recovery strategy selected",
    meta: "send_payment_link within guardrail limits",
    state: "done" as const,
  },
  {
    icon: IconSend,
    label: "Razorpay payment link created",
    meta: "link_lnk8f21 · expires in 7 days",
    state: "active" as const,
  },
];

export function IntelligenceSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Copy */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
            Product intelligence
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            From payment failure to recovered revenue.
          </h2>
          <p className="mt-4 text-[17px] leading-7 text-muted">
            Revyn doesn&apos;t just flag problems. Every risk moves through a
            structured workflow — detected, diagnosed, decided, recovered —
            with the reasoning and outcome recorded at each step.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Root-cause diagnosis with confidence scoring",
              "Strategy chosen per risk, not one-size-fits-all",
              "Outcomes confirmed by Razorpay webhooks, not assumptions",
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="text-[15px] leading-6 text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Workflow card */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(22,163,74,0.08),transparent)]"
          />
          <div className="relative rounded-xl border border-line bg-surface shadow-raised">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="text-[13px] font-semibold text-ink">
                Recovery workflow
              </p>
              <Badge status="executing">executing</Badge>
            </div>

            <ol className="relative p-5">
              <span
                aria-hidden="true"
                className="absolute bottom-6 left-[35px] top-6 w-px bg-line"
              />
              {WORKFLOW_STEPS.map((step) => (
                <li key={step.label} className="relative flex gap-4 py-3">
                  <span
                    className={`z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border ${
                      step.state === "done"
                        ? "border-brand/25 bg-brand-soft text-brand-dark"
                        : "border-line bg-canvas text-muted"
                    }`}
                  >
                    <step.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13px] font-medium leading-5 text-ink">
                      {step.label}
                    </p>
                    <p className="truncate font-mono text-[11px] leading-4 text-faint">
                      {step.meta}
                    </p>
                  </div>
                </li>
              ))}
              <li className="relative flex gap-4 pt-1">
                <span className="z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-brand/25 bg-brand text-white">
                  <IconCheckCircle className="h-3.5 w-3.5" />
                </span>
                <div className="pt-0.5">
                  <p className="text-[13px] font-semibold leading-5 text-brand-dark">
                    Payment recovered
                  </p>
                  <p className="font-mono text-[11px] leading-4 text-muted tabular-nums">
                    ₹12,400 confirmed via webhook
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
