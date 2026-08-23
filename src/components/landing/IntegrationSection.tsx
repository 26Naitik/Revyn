import type { ComponentType, SVGProps } from "react";
import {
  IconActivity,
  IconCheckCircle,
  IconLock,
  IconSend,
} from "@/components/ui/icons";

type IntegrationItem = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
};

const INTEGRATION_POINTS: IntegrationItem[] = [
  {
    icon: IconSend,
    title: "Payment links",
    description:
      "Recovery actions create real Razorpay payment links in Test Mode, expiring after 7 days.",
  },
  {
    icon: IconActivity,
    title: "Signed webhooks",
    description:
      "payment_link.paid events are verified with HMAC signatures before revenue is recorded.",
  },
  {
    icon: IconCheckCircle,
    title: "Confirmed recovery",
    description:
      "Recovered amounts are only counted after a verified Razorpay confirmation — never assumed.",
  },
];

function IntegrationCard({ item }: { item: IntegrationItem }) {
  return (
    <div className="rounded-xl border border-navy-line bg-navy-raised p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-navy-line bg-navy text-emerald-400">
        <item.icon className="h-4 w-4" />
      </span>
      <h3 className="mt-3.5 text-sm font-semibold text-white">{item.title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-slate-400">
        {item.description}
      </p>
    </div>
  );
}

export function IntegrationSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-line bg-navy shadow-raised">
        <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-navy-line bg-navy-raised px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
              <IconLock className="h-3 w-3" />
              Razorpay · Test Mode
            </p>
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Built for real payment recovery.
            </h2>
            <p className="mt-4 max-w-md text-[17px] leading-7 text-slate-400">
              Revyn is wired into Razorpay&apos;s Test Mode end to end —
              detection through decisioning to confirmed recovered revenue — so
              every number you see is backed by a real payment event.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="rounded-md border border-navy-line bg-navy-raised px-2.5 py-1.5 text-slate-300">
                <span className="text-emerald-400">POST</span> /api/pipeline
              </span>
              <span className="rounded-md border border-navy-line bg-navy-raised px-2.5 py-1.5 text-slate-300">
                <span className="text-emerald-400">POST</span>{" "}
                /api/recover/payment-link
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-navy-line bg-navy-raised px-2.5 py-1.5 text-slate-300">
                <IconActivity className="h-3 w-3 text-emerald-400" />
                payment_link.paid
              </span>
            </div>
          </div>

          <div className="grid gap-4">
            {INTEGRATION_POINTS.map((item) => (
              <IntegrationCard key={item.title} item={item} />
            ))}
          </div>
        </div>

        <div className="border-t border-navy-line bg-navy-raised/50 px-8 py-3.5 sm:px-12">
          <p className="text-xs text-slate-500">
            Runs entirely on Razorpay Test Mode — no live money movement while
            evaluating recovery flows.
          </p>
        </div>
      </div>
    </section>
  );
}
