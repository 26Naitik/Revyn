import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { IconLogo } from "@/components/ui/icons";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-white">
            <IconLogo className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Revyn
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="#how-it-works"
            className={`${buttonClasses("ghost", "sm")} hidden sm:inline-flex`}
          >
            How it works
          </Link>
          <Link href="/dashboard" className={buttonClasses("primary", "sm")}>
            Open Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
