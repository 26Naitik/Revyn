import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { HeroPreview } from "@/components/landing/HeroPreview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Subtle texture */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(22,163,74,0.07),transparent)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[620px] [background-image:linear-gradient(to_right,rgba(17,24,39,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(75%_65%_at_50%_0%,black,transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Revenue recovery infrastructure
          </p>

          <h1
            className="animate-fade-up mt-6 text-balance text-[44px] font-semibold leading-[1.06] tracking-tight text-ink sm:text-[58px]"
            style={{ animationDelay: "60ms" }}
          >
            Recover revenue
            <br />
            before it&apos;s lost.
          </h1>

          <p
            className="animate-fade-up mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-7 text-muted"
            style={{ animationDelay: "120ms" }}
          >
            Revyn detects payment risk, chooses the right recovery action, and
            turns failed payments into recovered revenue.
          </p>

          <div
            className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "180ms" }}
          >
            <Link href="/dashboard" className={buttonClasses("primary", "lg")}>
              Open Dashboard
            </Link>
            <Link
              href="#how-it-works"
              className={buttonClasses("secondary", "lg")}
            >
              See how it works
            </Link>
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "260ms" }}>
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}
