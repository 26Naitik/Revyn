import {
  IconClock,
  IconGauge,
  IconRepeat,
  IconUsers,
} from "@/components/ui/icons";

const GUARDRAILS = [
  {
    icon: IconRepeat,
    title: "Bounded attempts",
    description:
      "Every risk gets a fixed number of recovery attempts — no endless retry loops against your customers.",
  },
  {
    icon: IconClock,
    title: "Cooldowns",
    description:
      "Mandatory waiting periods between actions prevent customers from being pressured repeatedly.",
  },
  {
    icon: IconGauge,
    title: "Recovery limits",
    description:
      "Minimum and maximum amount thresholds keep automated recovery inside safe, sensible bounds.",
  },
  {
    icon: IconUsers,
    title: "Human escalation",
    description:
      "When automation shouldn't act, the workflow escalates to a person instead of pushing further.",
  },
];

export function GuardrailsSection() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
            Guardrails
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Recovery without reckless automation.
          </h2>
          <p className="mt-3 text-[17px] leading-7 text-muted">
            Revyn is deliberately conservative. Automation acts only inside
            strict boundaries you can audit.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GUARDRAILS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-line bg-canvas/60 p-6 transition-colors hover:border-brand/25"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-dark ring-1 ring-inset ring-brand/15">
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
      </div>
    </section>
  );
}
