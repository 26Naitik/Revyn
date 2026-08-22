import { detectAll } from "./detect";
import { diagnoseAll } from "./diagnose";
import { decideAll } from "./decide";
import { measureStats } from "./measure";
import { prisma } from "@/lib/prisma";

export interface PipelineResult {
  detected: { risksFound: number; totalAtRisk: number };
  diagnosed: { count: number };
  decided: { count: number };
  measured: {
    totalAtRisk: number;
    totalRecovered: number;
    recoveryRate: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
}

export async function runFullPipeline(): Promise<PipelineResult> {
  const detection = await detectAll();

  const diagnosis = await diagnoseAll();

  const decision = await decideAll();

  const measurement = await measureStats();

  await prisma.auditLog.create({
    data: {
      action: "measure",
      actor: "system",
      details: JSON.stringify({
        pipelineRun: true,
        detected: detection.risksFound,
        diagnosed: diagnosis.length,
        decided: decision.length,
        totalAtRisk: measurement.totalAtRisk,
        totalRecovered: measurement.totalRecovered,
      }),
      status: "success",
    },
  });

  return {
    detected: {
      risksFound: detection.risksFound,
      totalAtRisk: detection.totalAtRisk,
    },
    diagnosed: { count: diagnosis.length },
    decided: { count: decision.length },
    measured: {
      totalAtRisk: measurement.totalAtRisk,
      totalRecovered: measurement.totalRecovered,
      recoveryRate: measurement.recoveryRate,
      byType: measurement.byType,
      byStatus: measurement.byStatus,
    },
  };
}
