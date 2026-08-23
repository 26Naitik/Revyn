import type { ComponentType, SVGProps } from "react";
import { Card } from "@/components/ui/Card";

type Tone = "brand" | "warning" | "danger" | "neutral";

const TONE_TILE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-dark",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-canvas text-muted",
};

export function MetricCard({
  title,
  value,
  context,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  context: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: Tone;
}) {
  return (
    <Card interactive className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-5 text-muted">{title}</p>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_TILE_CLASSES[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-9 tracking-tight text-ink tabular-nums">
        {value}
      </p>
      <p className="mt-1 truncate text-xs leading-4 text-faint">{context}</p>
    </Card>
  );
}
