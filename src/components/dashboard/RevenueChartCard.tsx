"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { formatINRCompact } from "@/lib/format";
import { IconChart } from "@/components/ui/icons";

const AT_RISK_COLOR = "#F59E0B";
const RECOVERED_COLOR = "#16A34A";

interface ChartDatum {
  name: string;
  value: number;
  fill: string;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <div className="rounded-lg border border-navy-line bg-navy px-3 py-2 shadow-raised">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {datum.name}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-white tabular-nums">
        {formatINRCompact(datum.value)}
        <span className="ml-1.5 text-[11px] font-normal text-slate-400">
          {datum.value === 0 ? "" : `(${Math.round(datum.value / 100).toLocaleString("en-IN")} ₹)`}
        </span>
      </p>
    </div>
  );
}

export function RevenueChartCard({
  atRiskPaise,
  recoveredPaise,
  recoveryRateLabel,
}: {
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRateLabel: string;
}) {
  const hasData = atRiskPaise > 0 || recoveredPaise > 0;

  const data: ChartDatum[] = [
    { name: "Revenue at risk", value: atRiskPaise, fill: AT_RISK_COLOR },
    { name: "Recovered revenue", value: recoveredPaise, fill: RECOVERED_COLOR },
  ];

  return (
    <Card>
      <CardHeader
        title="Revenue Recovery Overview"
        description={`Amounts across all tracked risks · recovery rate ${recoveryRateLabel}`}
        action={
          <span className="hidden items-center gap-4 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: AT_RISK_COLOR }}
              />
              At risk
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: RECOVERED_COLOR }}
              />
              Recovered
            </span>
          </span>
        }
      />
      <div className="p-5">
        {hasData ? (
          <div className="h-[264px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="#E4E7EC"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#667085" }}
                  tickMargin={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tick={{ fontSize: 11, fill: "#98A2B3" }}
                  tickFormatter={(value: number) => formatINRCompact(value)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(16, 24, 40, 0.03)" }}
                  content={<ChartTooltip />}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={<IconChart className="h-5 w-5" />}
            title="No recovery activity yet"
            hint="Run a recovery scan to identify revenue at risk and start measuring recovered revenue."
          />
        )}
      </div>
    </Card>
  );
}
