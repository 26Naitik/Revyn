import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { RecentActivityCard } from "@/components/dashboard/RecentActivity";
import { RecoveriesTable } from "@/components/dashboard/RecoveriesTable";
import { RunPipelineButton } from "@/components/dashboard/RunPipelineButton";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RecoveryPipeline } from "@/components/dashboard/RecoveryPipeline";
import { RevenueChartCard } from "@/components/dashboard/RevenueChartCard";
import { ErrorState } from "@/components/ui/states";
import { buttonClasses } from "@/components/ui/Button";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheckCircle,
  IconGauge,
  IconSend,
} from "@/components/ui/icons";
import {
  getRecentActivity,
  listRecentRecoveries,
  type ActivityRow,
  type RecoveryRow,
} from "@/lib/dashboard/data";
import { measureStats, type MeasurementResult } from "@/lib/engine/measure";
import { formatINRCompact, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DashboardData {
  stats: MeasurementResult;
  recoveries: RecoveryRow[];
  activity: ActivityRow[];
}

async function loadDashboardData(): Promise<DashboardData> {
  const [stats, recoveries, activity] = await Promise.all([
    measureStats(),
    listRecentRecoveries(8),
    getRecentActivity(10),
  ]);
  return { stats, recoveries, activity };
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
        <Header title="Revenue Recovery" />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <ErrorState message="Revyn couldn't reach the recovery database. Check that PostgreSQL is running and DATABASE_URL is configured." />
        </div>
      </>
    );
  }

  const { stats, recoveries, activity } = data;

  return (
    <>
      <Header
        title="Revenue Recovery"
        description="See what's at risk, what's recovered, and where Revyn is acting."
        actions={<RunPipelineButton size="sm" />}
      />

      <div className="animate-fade-in px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {/* Metric cards */}
        <section aria-label="Key metrics">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Revenue at Risk"
              value={formatINRCompact(stats.totalAtRisk)}
              context={`${stats.totalRiskItems} risk item${stats.totalRiskItems === 1 ? "" : "s"} tracked`}
              icon={IconAlertTriangle}
              tone="warning"
            />
            <MetricCard
              title="Recovered Revenue"
              value={formatINRCompact(stats.totalRecovered)}
              context="Confirmed via Razorpay webhooks"
              icon={IconCheckCircle}
              tone="brand"
            />
            <MetricCard
              title="Recovery Rate"
              value={formatPercent(stats.recoveryRate)}
              context="Recovered vs at-risk amount"
              icon={IconGauge}
              tone="neutral"
            />
            <MetricCard
              title="Active Recoveries"
              value={String(stats.activeRecoveries)}
              context={
                stats.escalatedCount > 0
                  ? `${stats.escalatedCount} escalated to human`
                  : "Awaiting payment or execution"
              }
              icon={IconSend}
              tone="danger"
            />
          </div>
        </section>

        {/* Chart + activity */}
        <section
          aria-label="Recovery visualization and activity"
          className="mt-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-3"
        >
          <div className="xl:col-span-2">
            <RevenueChartCard
              atRiskPaise={stats.totalAtRisk}
              recoveredPaise={stats.totalRecovered}
              recoveryRateLabel={formatPercent(stats.recoveryRate)}
            />
          </div>
          <RecentActivityCard rows={activity} />
        </section>

        {/* Pipeline */}
        <section aria-label="Recovery pipeline" className="mt-6">
          <RecoveryPipeline
            counts={{
              detected: stats.byStatus.detected,
              diagnosing: stats.byStatus.diagnosing,
              decided: stats.byStatus.decided,
              recovering: stats.byStatus.recovering,
              recovered: stats.byStatus.recovered,
            }}
          />
        </section>

        {/* Recent workflows */}
        <section aria-label="Recent recovery workflows" className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                Recent recovery workflows
              </h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Latest decided risks and how their recovery is progressing.
              </p>
            </div>
            {recoveries.length > 0 && (
              <Link
                href="/dashboard/recoveries"
                className={`${buttonClasses("ghost", "sm")} -mr-2`}
              >
                View all
                <IconArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <RecoveriesTable rows={recoveries} />
        </section>
      </div>
    </>
  );
}
