"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  IconAlertTriangle,
  IconInbox,
  IconRefresh,
} from "@/components/ui/icons";

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-canvas text-faint">
        {icon ?? <IconInbox className="h-5 w-5" />}
      </div>
      <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted">{hint}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  label = "Loading recovery data…",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-6" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg bg-canvas"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Recovery data unavailable",
  message = "Revyn couldn't reach the recovery database.",
}: {
  title?: string;
  message?: string;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!retrying) return;
    const timer = setTimeout(() => setRetrying(false), 2000);
    return () => clearTimeout(timer);
  }, [retrying]);

  function retry() {
    setRetrying(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-danger/20 bg-danger-soft text-danger">
        <IconAlertTriangle className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted">{message}</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-5"
        onClick={retry}
        disabled={retrying}
      >
        <IconRefresh
          className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
        />
        Retry
      </Button>
    </div>
  );
}
