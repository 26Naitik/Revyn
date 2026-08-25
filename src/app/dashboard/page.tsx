import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { RecentActivityCard } from "@/components/dashboard/RecentActivity";
import { RecoveriesTable } from "@/components/dashboard/RecoveriesTable";
import { RunPipelineButton } from "@/components/dashboard/RunPipelineButton";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RecoveryFunnelCard } from "@/components/dashboard/RecoveryFunnelCard";
import { RecoveryPerformanceChart } from "@/components/dashboard/RecoveryPerformanceChart";
import { OpportunityTable } from "@/components/dashboard/OpportunityTable";
import { AttentionQueue } from "@/components/dashboard/AttentionQueue";
import { BreakdownPanels } from "@/components/dashboard/BreakdownPanels";
import { AiInsightsPanel } from "@/components/dashboard/AiInsightsPanel";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { buttonClasses } from "@/components/ui/Button";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconBolt,
  IconCheckCircle,
  IconClock,
  IconDecide,
  IconGauge,
  IconRefresh,
  IconShieldCheck,
  IconUsers,
  IconXCircle,
} from "@/components/ui/icons";
import {
  getRecentActivity,
  listRecentRecoveries,
  type ActivityRow,
  type RecoveryRow,
} from "@/lib/dashboard/data";
import { getCommandCenterIntel } from "@/lib/dashboard/intel-data";
import { getAIConfig } from "@/lib/ai/config";
import { formatINRCompact, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DashboardData {
  intel: Awaited<ReturnType<typeof getCommandCenterIntel>>;
  activity: ActivityRow[];
  recentRecoveries: RecoveryRow[];
}

async function loadDashboardData(): Promise<DashboardData> {
  const [intel, activity, recentRecoveries] = await Promise.all([
    getCommandCenterIntel(),
    getRecentActivity(10),
    listRecentRecoveries(8),
  ]);
  return { intel, activity, recentRecoveries };
}

export default async function DashboardPage() {
  let data: DashboardData;
  let aiEnabled = false;

  try {
    data = await loadDashboardData();
    aiEnabled = getAIConfig() !== null;
  } catch (err) {
    console.error(
      "Dashboard data load failed:",
      err instanceof Error ? err.message : err
    );
    return (
      <>
        <Header title="Recovery Command Center" />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <ErrorState message="Revyn couldn't reach the recovery database. Check that PostgreSQL is running and DATABASE_URL is configured." />
        </div>
      </>
    );
  }

  const { intel, activity, recentRecoveries } = data;

  /* Completely empty deployment: one clear call to action. */
  if (
    intel.stats.totalRiskItems === 0 &&
    intel.stats.totalRecoveryWorkflows === 0
  ) {
    return (
      <>
        <Header
          title="Recovery Command Center"
          description="Revenue recovery health at a glance."
          actions={<RunPipelineButton size="sm" />}
        />
        <div className="animate-fade-in px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-dashed border-line-strong bg-surface">
            <EmptyState
              title="No revenue risk tracked yet"
              hint="Run the pipeline to scan payments, orders and subscriptions for failed or stalled revenue. Everything on this page fills in from real data - nothing is simulated."
              action={<RunPipelineButton />}
            />
          </div>
        </div>
      </>
    );
  }

  const { financial, operational, intelligence } = intel;

  // Honest weekly trend: only shown when both windows have recovered revenue.
  const trendLabel =
    intel.weeklyTrend?.meaningful
      ? `${intel.weeklyTrend.direction === "up" ? "+" : intel.weeklyTrend.direction === "down" ? "−" : "±"}${formatINRCompact(Math.abs(intel.weeklyTrend.deltaPaise))} vs prior week`
      : "No trend yet - needs a second week of recoveries";

  return (
    <>
      <Header
        title="Recovery Command Center"
        description="How much is at risk, what Revyn has recovered, and what needs you right now."
        actions={
          <div className="flex items-center gap-2">
            {!aiEnabled && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted md:inline-flex"
                title="Set AI_API_KEY to enable AI-assisted decisions. Revyn falls back to its deterministic scoring engine."
              >
                <IconShieldCheck className="h-3.5 w-3.5" />
                Deterministic engine
              </span>
            )}
            <Link href="/dashboard/recoveries" className={buttonClasses("secondary", "sm")}>
              All recoveries
              <IconArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <RunPipelineButton size="sm" />
          </div>
        }
      />

      <div className="animate-fade-in px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {/* Financial KPIs */}
        <section aria-label="Financial recovery health">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
            Financial
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Revenue at Risk"
              value={formatINRCompact(financial.totalAtRiskPaise)}
              context={`${intel.stats.totalRiskItems} risk item${intel.stats.totalRiskItems === 1 ? "" : "s"} tracked`}
              icon={IconAlertTriangle}
              tone="warning"
            />
            <MetricCard
              title="Revenue Recovered"
              value={formatINRCompact(financial.recoveredPaise)}
              context={`${formatPercent(financial.recoveryRate)} of at-risk value · confirmed via webhooks`}
              icon={IconCheckCircle}
              tone="brand"
            />
            <MetricCard
              title="Currently Recoverable"
              value={formatINRCompact(financial.currentlyRecoverablePaise)}
              context={`${operational.activeRecoveries} active workflow${operational.activeRecoveries === 1 ? "" : "s"} still open`}
              icon={IconGauge}
              tone="brand"
            />
            <MetricCard
              title="Revenue Lost"
              value={formatINRCompact(financial.lostPaise)}
              context="Closed without recovery (failed / cancelled)"
              icon={IconXCircle}
              tone="danger"
            />
          </div>
        </section>

        {/* Operational KPIs */}
        <section aria-label="Operational status" className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
            Operational
          </h2>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
            <MetricCard
              title="Active"
              value={String(operational.activeRecoveries)}
              context="Workflows in motion"
              icon={IconRefresh}
              tone="neutral"
            />
            <MetricCard
              title="Awaiting execution"
              value={String(operational.pendingDecisions)}
              context="Decided, not yet executed"
              icon={IconDecide}
              tone="neutral"
            />
            <MetricCard
              title="Retry scheduled"
              value={String(operational.retryScheduled)}
              context="Automatic retries queued"
              icon={IconClock}
              tone="warning"
            />
            <MetricCard
              title="Escalated"
              value={String(operational.escalated)}
              context="Waiting on humans"
              icon={IconUsers}
              tone="danger"
            />
            <MetricCard
              title="Failed"
              value={String(operational.failedRecoveries)}
              context="Attempts that gave up"
              icon={IconXCircle}
              tone="danger"
            />
            <MetricCard
              title="Recovered"
              value={String(operational.successfulRecoveries)}
              context="Cases closed successfully"
              icon={IconCheckCircle}
              tone="brand"
            />
          </div>
        </section>

        {/* Performance + decision intelligence */}
        <section
          aria-label="Recovery performance and decision quality"
          className="mt-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-3"
        >
          <div className="xl:col-span-2">
            <RecoveryPerformanceChart series={intel.dailySeries} />
          </div>
          <AiInsightsPanel aiStats={intel.aiStats} />
        </section>

        {/* Funnel + breakdowns */}
        <section
          aria-label="Recovery funnel and breakdowns"
          className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-3"
        >
          <RecoveryFunnelCard stages={intel.funnel} />
          <div className="xl:col-span-2">
            <BreakdownPanels
              byStatus={intel.breakdowns.byStatus}
              byStrategy={intel.breakdowns.byStrategy}
              byFailureCategory={intel.breakdowns.byFailureCategory}
              byScoreBand={intel.breakdowns.byScoreBand}
              workflows={intel.workflows}
            />
          </div>
        </section>

        {/* Attention queue */}
        <section aria-label="Cases needing attention" className="mt-6">
          <AttentionQueue items={intel.attention} />
        </section>

        {/* Opportunities */}
        <section aria-label="Biggest recovery opportunities" className="mt-6">
          <OpportunityTable opportunities={intel.opportunities} />
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
            {recentRecoveries.length > 0 && (
              <Link
                href="/dashboard/recoveries"
                className={`${buttonClasses("ghost", "sm")} -mr-2`}
              >
                View all
                <IconArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <RecoveriesTable rows={recentRecoveries} />
        </section>

        {/* Live activity feed */}
        <section aria-label="Recent engine activity" className="mt-6">
          <RecentActivityCard rows={activity} />
        </section>

        {/* Intelligence KPI footnote row */}
        <section aria-label="Decision intelligence summary" className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Avg Recovery Score"
              value={String(intelligence.avgRecoveryScore)}
              context="Across all workflows (0-100)"
              icon={IconGauge}
              tone="neutral"
            />
            <MetricCard
              title="High-Opportunity Cases"
              value={String(intelligence.highOpportunityCases)}
              context="Score ≥ 70 - act on these first"
              icon={IconBolt}
              tone="brand"
            />
            <MetricCard
              title="AI-Assisted Decisions"
              value={
                aiEnabled
                  ? String(intelligence.aiAssistedDecisions)
                  : "0"
              }
              context={
                aiEnabled
                  ? `${formatPercent(
                      intel.aiStats.sources.find((s) => s.source === "ai")
                        ?.avgConfidence ?? 0
                    )} avg confidence`
                  : "Not configured - set AI_API_KEY"
              }
              icon={IconBolt}
              tone={aiEnabled ? "brand" : "neutral"}
            />
            <MetricCard
              title="Rule-Based Decisions"
              value={String(intelligence.ruleBasedDecisions)}
              context="Deterministic fallback engine"
              icon={IconDecide}
              tone="neutral"
            />
          </div>
        </section>
      </div>
    </>
  );
}
