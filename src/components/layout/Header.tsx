"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconMenu, IconRefresh } from "@/components/ui/icons";
import { ShellActions } from "@/components/layout/ShellContext";

export function Header({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toggle } = ShellActions();

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-sm">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label="Open navigation"
            className={`${buttonClasses("ghost", "sm")} -ml-1 px-2 lg:hidden`}
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 hidden truncate text-[13px] leading-5 text-muted sm:block">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {actions}
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={isPending}
            aria-label="Refresh data"
          >
            <IconRefresh
              className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <span className="hidden items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark ring-1 ring-inset ring-brand/20 md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Test mode
          </span>
        </div>
      </div>
    </header>
  );
}
