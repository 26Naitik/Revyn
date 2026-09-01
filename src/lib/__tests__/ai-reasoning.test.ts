import { describe, it, expect, vi } from "vitest";
import { DEFAULT_AI_MODELS, getAIConfig, type AIConfig } from "@/lib/ai/config";
import {
  aiDecisionResponseSchema,
  refineDecisionWithAI,
  type AIRefinementInput,
} from "@/lib/ai/reasoning";
import type { FetchLike } from "@/lib/ai/client";

const CONFIG: AIConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "test-model",
  baseUrl: "https://ai.test/v1",
  timeoutMs: 5_000,
};

const BASE_INPUT: AIRefinementInput = {
  risk: {
    type: "failed_payment",
    rootCause: "expired_card",
    amountInr: 299,
    recoveryAttemptsOnCase: 0,
  },
  score: {
    score: 82.5,
    band: "high",
    factors: [
      {
        key: "payment_history",
        label: "Payment history",
        value: 1,
        weight: 0.25,
        contribution: 25,
        detail: "10/10 past payments captured",
      },
    ],
  },
  customer: {
    successfulPayments: 10,
    totalPayments: 10,
    recentFailedPayments: 0,
    recoveryAttempts: 1,
    recoverySuccesses: 1,
    tenureDays: 400,
  },
  baseRecommendation: {
    strategy: "send_payment_link",
    reasoning: "Customer has an expired card.",
    confidence: 0.9,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function openAIResponse(text: string): Response {
  return jsonResponse({
    choices: [{ message: { role: "assistant", content: text } }],
  });
}

function anthropicResponse(text: string): Response {
  return jsonResponse({ content: [{ type: "text", text }] });
}

const VALID_DECISION_JSON = JSON.stringify({
  action: "send_payment_link",
  confidence: 0.88,
  reasoning:
    "Expired card requires customer action; a payment link lets them update it.",
  next_step: "Create a Razorpay payment link and notify the customer.",
});

describe("getAIConfig", () => {
  it("returns null when no API key is configured", () => {
    expect(getAIConfig({})).toBeNull();
    expect(getAIConfig({ AI_API_KEY: "   " })).toBeNull();
  });

  it("defaults to the OpenAI provider with a default model", () => {
    const config = getAIConfig({ AI_API_KEY: "sk-dummy-openai" });
    expect(config).not.toBeNull();
    expect(config!.provider).toBe("openai");
    expect(config!.model).toBe(DEFAULT_AI_MODELS.openai);
    expect(config!.apiKey).toBe("sk-dummy-openai");
  });

  it("infers Anthropic from the key prefix", () => {
    const config = getAIConfig({ AI_API_KEY: "sk-ant-dummy-key" });
    expect(config!.provider).toBe("anthropic");
    expect(config!.model).toBe(DEFAULT_AI_MODELS.anthropic);
  });

  it("honours explicit provider, model, base url and timeout", () => {
    const config = getAIConfig({
      AI_API_KEY: "key",
      AI_PROVIDER: "anthropic",
      AI_MODEL: "custom-model",
      AI_BASE_URL: "https://proxy.internal/",
      AI_TIMEOUT_MS: "30000",
    });
    expect(config!.provider).toBe("anthropic");
    expect(config!.model).toBe("custom-model");
    expect(config!.baseUrl).toBe("https://proxy.internal");
    expect(config!.timeoutMs).toBe(30_000);
  });

  it("rejects unsupported providers and invalid timeouts", () => {
    expect(
      getAIConfig({ AI_API_KEY: "key", AI_PROVIDER: "gemini" })
    ).toBeNull();
    const fallbackTimeout = getAIConfig({
      AI_API_KEY: "key",
      AI_TIMEOUT_MS: "nope",
    });
    expect(fallbackTimeout!.timeoutMs).toBe(15_000);
  });
});

describe("refineDecisionWithAI", () => {
  it("parses a valid OpenAI-style structured response", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      openAIResponse(VALID_DECISION_JSON)
    );

    const refinement = await refineDecisionWithAI(CONFIG, BASE_INPUT, fetchImpl);

    expect(refinement).not.toBeNull();
    expect(refinement!.action).toBe("send_payment_link");
    expect(refinement!.confidence).toBeCloseTo(0.88);
    expect(refinement!.nextStep).toContain("payment link");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://ai.test/v1/chat/completions");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer test-key"
    );
  });

  it("parses Anthropic-style responses with the right wire format", async () => {
    const anthropicConfig: AIConfig = {
      ...CONFIG,
      provider: "anthropic",
      baseUrl: "https://ai.test",
    };
    const fetchImpl = vi.fn<FetchLike>(async () =>
      anthropicResponse(VALID_DECISION_JSON)
    );

    const refinement = await refineDecisionWithAI(
      anthropicConfig,
      BASE_INPUT,
      fetchImpl
    );

    expect(refinement).not.toBeNull();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://ai.test/v1/messages");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("extracts JSON wrapped in markdown fences", async () => {
    const fenced = `\`\`\`json\n${VALID_DECISION_JSON}\n\`\`\``;
    const refinement = await refineDecisionWithAI(
      CONFIG,
      BASE_INPUT,
      async () => openAIResponse(fenced)
    );
    expect(refinement).not.toBeNull();
    expect(refinement!.action).toBe("send_payment_link");
  });

  it("falls back to null on transport failure", async () => {
    const refinement = await refineDecisionWithAI(CONFIG, BASE_INPUT, async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(refinement).toBeNull();
  });

  it("falls back to null when the request times out", async () => {
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const refinement = await refineDecisionWithAI(CONFIG, BASE_INPUT, async () => {
      throw abortError;
    });
    expect(refinement).toBeNull();
  });

  it("falls back to null on HTTP errors", async () => {
    const refinement = await refineDecisionWithAI(
      CONFIG,
      BASE_INPUT,
      async () => jsonResponse({ error: "rate limited" }, 429)
    );
    expect(refinement).toBeNull();
  });

  it("falls back to null on non-JSON bodies", async () => {
    const refinement = await refineDecisionWithAI(
      CONFIG,
      BASE_INPUT,
      async () => new Response("<html>oops</html>", { status: 200 })
    );
    expect(refinement).toBeNull();
  });

  it("falls back to null on unparseable model text", async () => {
    const refinement = await refineDecisionWithAI(
      CONFIG,
      BASE_INPUT,
      async () => openAIResponse("I recommend contacting the customer directly.")
    );
    expect(refinement).toBeNull();
  });

  it("falls back to null when the response violates the schema", async () => {
    const invalid = JSON.stringify({
      action: "send_payment_link",
      confidence: 2.5,
      reasoning: "Too confident for comfort.",
      next_step: "Create a payment link.",
    });
    const refinement = await refineDecisionWithAI(
      CONFIG,
      BASE_INPUT,
      async () => openAIResponse(invalid)
    );
    expect(refinement).toBeNull();

    const wrongAction = JSON.stringify({
      action: "transfer_money_directly",
      confidence: 0.5,
      reasoning: "This is not an allowed recovery action at all.",
      next_step: "Move the money.",
    });
    const disallowed = await refineDecisionWithAI(
      CONFIG,
      BASE_INPUT,
      async () => openAIResponse(wrongAction)
    );
    expect(disallowed).toBeNull();
  });
});

describe("aiDecisionResponseSchema", () => {
  it("accepts every documented strategy action", () => {
    for (const action of [
      "retry_payment",
      "send_payment_link",
      "offer_discount",
      "schedule_retry",
      "escalate_human",
      "no_action",
    ]) {
      const parsed = aiDecisionResponseSchema.safeParse({
        action,
        confidence: 0.5,
        reasoning: "A perfectly reasonable explanation.",
        next_step: "Do the next concrete thing now.",
      });
      expect(parsed.success).toBe(true);
    }
  });
});
