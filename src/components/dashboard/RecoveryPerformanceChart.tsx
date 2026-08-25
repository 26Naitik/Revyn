"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { formatINRCompact } from "@/lib/format";
import type { DailyPoint } from "@/lib/dashboard/intelligence";
import { IconChart } from "@/components/ui/icons";

const DETECTED_COLOR = "#F59E0B";
const RECOVERED_COLOR = "#16A34A";

interface TooltipPayloadItem {
  payload: DailyPoint;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-navy-line bg-navy px-3 py-2 shadow-raised">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {point.label}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-200">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: DETECTED_COLOR }}
        />
        Detected
        <span className="font-semibold text-white tabular-nums">
          {formatINRCompact(point.detectedPaise)}
        </span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-200">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: RECOVERED_COLOR }}
        />
        Recovered
        <span className="font-semibold text-white tabular-nums">
          {formatINRCompact(point.recoveredPaise)}
        </span>
      </p>
    </div>
  );
}

/**
 * One clear insight: money detected vs money recovered, per day.
 * Rendered only when there is real history - no fabricated flat lines.
 */
export function RecoveryPerformanceChart({ series }: { series: DailyPoint[] }) {
  const hasHistory = series.some((p) => p.detectedPaise > 0 || p.recoveredPaise > 0);

  return (
    <Card className="h-full">
      <CardHeader
        title="Recovery performance"
        description="Value newly detected vs value confirmed recovered, last 14 days."
        action={
          <span className="hidden items-center gap-4 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DETECTED_COLOR }} />
              Detected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RECOVERED_COLOR }} />
              Recovered
            </span>
          </span>
        }
      />
      <div className="p-5">
        {hasHistory ? (
          <div className="h-[264px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E4E7EC" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#667085" }}
                  tickMargin={10}
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={58}
                  tick={{ fontSize: 11, fill: "#667085" }}
                  tickFormatter={(v: number) => formatINRCompact(v)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(102,112,133,0.06)" }} />
                <Bar
                  dataKey="detectedPaise"
                  name="Detected"
                  fill={DETECTED_COLOR}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                  opacity={0.55}
                />
                <Line
                  type="monotone"
                  dataKey="recoveredPaise"
                  name="Recovered"
                  stroke={RECOVERED_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={<IconChart className="h-5 w-5" />}
            title="No performance history yet"
            hint="Daily detection and recovery values appear once Revyn starts processing cases. Nothing is invented for empty days."
          />
        )}
      </div>
    </Card>
  );
}
