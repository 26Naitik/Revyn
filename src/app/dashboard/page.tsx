import { Header } from "@/components/layout/Header";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RecoveriesTable } from "@/components/dashboard/RecoveriesTable";
import { RunPipelineButton } from "@/components/dashboard/RunPipelineButton";
import { ErrorPanel } from "@/components/dashboard/states";
import {
  getRecentActivity,
  listRecentRecoveries,
  type ActivityRow,
  type RecoveryRow,
} from "@/lib/dashboard/data";
import { measureStats, type MeasurementResult } from "@/lib/engine/measure";
import { formatINR, formatPercent, labelRiskType } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DashboardData {
  stats: MeasurementResult;
  recoveries: RecoveryRow[];
  activity: ActivityRow[];
}

async function loadDashboardData(): Promise<DashboardData> {
  const [stats, recoveries, activity] = await Promise.all([
    measureStats(),
    listRecentRecoveries(25),
    getRecentActivity(10),
  ]);
  return { stats, recoveries, activity };
}

const STAT_CARD_STYLES = {
  red: "border-l-red-500",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  yellow: "border-l-yellow-500",
} as const;

function StatCard({
  title,
  value,
  description,
  color,
}: {
  title: string;
  value: string;
  description: string;
  color: keyof typeof STAT_CARD_STYLES;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 border-l-4 bg-white p-6 shadow-sm ${STAT_CARD_STYLES[color]}`}
    >
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  );
}

function DashboardError() {
  return (
    <div className="p-6">
      <ErrorPanel message="Check that PostgreSQL is running and DATABASE_URL is configured, then refresh this page." />
    </div>
  );
}

export default async function DashboardPage() {
  let data: DashboardData;

  try {
    data = await loadDashboardData();
  } catch (err) {
    console.error(
      "Dashboard data load failed:",
      err instanceof Error ? err.message : err
    );
    return (
      <>
        <Header title="Dashboard" />
        <DashboardError />
      </>
    );
  }

  const { stats, recoveries, activity } = data;
  const maxTypeCount = Math.max(1, ...Object.values(stats.byType));

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Revenue at Risk"
            value={formatINR(stats.totalAtRisk)}
            description={`${stats.totalRiskItems} risk items tracked`}
            color="red"
          />
          <StatCard
            title="Revenue Recovered"
            value={formatINR(stats.totalRecovered)}
            description="Confirmed via Razorpay webhooks"
            color="green"
          />
          <StatCard
            title="Recovery Rate"
            value={formatPercent(stats.recoveryRate)}
            description="Recovered vs at-risk amount"
            color="blue"
          />
          <StatCard
            title="Active Recoveries"
            value={String(stats.activeRecoveries)}
            description={
              stats.escalatedCount > 0
                ? `${stats.escalatedCount} escalated to human`
                : "Awaiting payment or execution"
            }
            color="yellow"
          />
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">
                Recovery pipeline
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Detect → diagnose → decide. Eligible recoveries can then be
                executed as Razorpay payment links below.
              </p>
            </div>
            <RunPipelineButton />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-medium text-gray-900">
              Recent recovery workflows
            </h3>
            <RecoveriesTable rows={recoveries} />
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-medium text-gray-900">
                Risk by category
              </h3>
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                {stats.totalRiskItems === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">
                    No risks detected yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {(Object.entries(stats.byType) as Array<[string, number]>).map(
                      ([type, count]) => (
                        <li key={type}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-700">
                              {labelRiskType(type)}
                            </span>
                            <span className="font-medium text-gray-900">
                              {count}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500"
                              style={{ width: `${(count / maxTypeCount) * 100}%` }}
                            />
                          </div>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-gray-900">
                Recent activity
              </h3>
              <RecentActivity rows={activity} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
