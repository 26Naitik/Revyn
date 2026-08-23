import type { ReactNode } from "react";
import { statusBadgeClass } from "@/lib/format";

export function Badge({
  status,
  children,
  className = "",
}: {
  status?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tone = status ? statusBadgeClass(status) : statusBadgeClass("pending");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {children ?? status}
    </span>
  );
}
