import Link from "next/link";
import { IconLogo } from "@/components/ui/icons";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-white">
            <IconLogo className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">Revyn</p>
            <p className="text-[11px] text-faint">
              Revenue recovery infrastructure
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-6 text-[13px] text-muted">
          <Link href="#how-it-works" className="transition-colors hover:text-ink">
            How it works
          </Link>
          <Link href="/dashboard/risks" className="transition-colors hover:text-ink">
            Revenue at Risk
          </Link>
          <Link href="/dashboard/audit" className="transition-colors hover:text-ink">
            Audit Trail
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-ink">
            Dashboard
          </Link>
        </nav>

        <p className="flex items-center gap-1.5 text-xs text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Razorpay Test Mode · © 2026 Revyn
        </p>
      </div>
    </footer>
  );
}
