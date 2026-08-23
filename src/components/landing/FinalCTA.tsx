import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { IconArrowRight } from "@/components/ui/icons";

export function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl bg-navy px-6 py-16 text-center shadow-raised sm:px-12 sm:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_110%,rgba(22,163,74,0.25),transparent)]"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[40px] sm:leading-tight">
            Stop losing recoverable revenue.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[17px] leading-7 text-slate-400">
            Open the dashboard, run a recovery scan, and see exactly how much
            revenue Revyn can bring back.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/dashboard"
              className={`${buttonClasses("primary", "lg")} px-7`}
            >
              Open Revyn
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
