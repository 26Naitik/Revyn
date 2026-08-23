import { z } from "zod";
import type { RecoveryScoreResult, RecoveryStrategy } from "@/lib/types";
import { RECOVERY_STRATEGIES } from "@/lib/engine/decision-rules";
import type { AIConfig } from "./config";
import { callAI, type FetchLike } from "./client";

/**
 * AI reasoning layer.
 *
 * The deterministic engine always runs first. This layer may refine the
 * *explanation* and, within strict bounds, the chosen action - it can never
 * touch amounts, discounts beyond the deterministic cap, or bypass guardrails
 * (the caller re-applies those after this function returns).
 *
 * Any failure (no config, network error, timeout, malformed output) yields
 * `null` and callers fall back to the deterministic decision.
 */

export const aiDecisionResponseSchema = z.object({
  action: z.enum(
    RECOVERY_STRATEGIES as unknown as [RecoveryStrategy, ...RecoveryStrategy[]]
  ),
  reasoning: z.string().trim().min(10).max(600),
  next_step: z.string().trim().min(5).max(300),
  confidence: z.number().min(0).max(1),
});

export interface AIRefinement {
  action: RecoveryStrategy;
  reasoning: string;
  nextStep: string;
  confidence: number;
}

export interface AIRefinementInput {
  risk: {
    type: string;
    rootCause: string | null;
    amountInr: number;
    recoveryAttemptsOnCase: number;
  };
  score: RecoveryScoreResult;
  customer: {
    successfulPayments: number;
    totalPayments: number;
    recentFailedPayments: number;
    recoveryAttempts: number;
    recoverySuccesses: number;
    tenureDays: number;
  };
  baseRecommendation: {
    strategy: RecoveryStrategy;
    reasoning: string;
    confidence: number;
  };
}

const SYSTEM_PROMPT = [
  "You are Revyn's revenue-recovery decision reviewer for an Indian payments platform (Razorpay).",
  "A deterministic engine already scored the case and proposed a recovery strategy. Review its work.",
  "You MUST respond with a single JSON object and nothing else, using exactly these keys:",
  '{"action": one of ["retry_payment","send_payment_link","offer_discount","schedule_retry","escalate_human","no_action"],',
  ' "confidence": number between 0 and 1,',
  ' "reasoning": string under 600 chars explaining why this action best recovers the revenue,',
  ' "next_step": string under 300 chars describing the single concrete next step}',
  "Hard rules you must never break:",
  "- Never propose refunds, transfers, or direct charges outside the listed actions.",
  "- Never invent amounts, discounts or customer data; amounts are fixed by the system.",
  "- Prefer the deterministic recommendation unless the evidence clearly supports a different listed action.",
].join("\n");

function buildUserPrompt(input: AIRefinementInput): string {
  const topFactors = [...input.score.factors]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 4)
    .map((factor) => ({
      factor: factor.label,
      scoreOutOf100: factor.value * 100,
      note: factor.detail,
    }));

  return JSON.stringify({
    case: {
      riskType: input.risk.type,
      rootCause: input.risk.rootCause,
      amountINR: input.risk.amountInr,
      priorAttemptsOnThisCase: input.risk.recoveryAttemptsOnCase,
      recoveryScore: input.score.score,
      scoreBand: input.score.band,
      topFactors,
    },
    customer: input.customer,
    deterministicRecommendation: input.baseRecommendation,
    instructions:
      "Return only the JSON object described in the system prompt. Choose 'action' from the allowed list.",
  });
}

/** Extracts the first JSON object from a model response (handles ```json fences). */
function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Ask the configured provider to review a deterministic decision.
 * Resolves to null on ANY failure - missing config, transport errors,
 * timeouts, non-JSON output, schema violations.
 */
export async function refineDecisionWithAI(
  config: AIConfig,
  input: AIRefinementInput,
  fetchImpl: FetchLike = fetch
): Promise<AIRefinement | null> {
  const raw = await callAI(
    config,
    {
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(input),
      maxTokens: 500,
      temperature: 0.2,
    },
    fetchImpl
  );

  if (!raw) return null;

  const json = extractJsonBlock(raw);
  if (json === null) {
    console.error("AI reasoning layer returned unparseable content");
    return null;
  }

  const parsed = aiDecisionResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error("AI reasoning layer failed schema validation");
    return null;
  }

  return {
    action: parsed.data.action,
    reasoning: parsed.data.reasoning,
    nextStep: parsed.data.next_step,
    confidence: parsed.data.confidence,
  };
}
