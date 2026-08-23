/**
 * AI provider configuration.
 *
 * The engine works fully without AI - when no key is configured every call
 * site falls back to the deterministic rule engine. Keys are only read from
 * environment variables and never leave the server process.
 */

export type AIProvider = "openai" | "anthropic";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
};

const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

export const DEFAULT_AI_TIMEOUT_MS = 15_000;

function resolveProvider(rawProvider: string | undefined, apiKey: string): AIProvider | null {
  if (!rawProvider) {
    // Infer from the key prefix so an empty AI_PROVIDER still works.
    return apiKey.startsWith("sk-ant-") ? "anthropic" : "openai";
  }
  if (rawProvider === "openai" || rawProvider === "anthropic") {
    return rawProvider;
  }
  return null;
}

function resolveTimeoutMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000) {
    return parsed;
  }
  return DEFAULT_AI_TIMEOUT_MS;
}

/**
 * Returns null whenever AI is not configured; callers must treat that as
 * "use deterministic rules" rather than an error.
 */
export function getAIConfig(
  env: Record<string, string | undefined> = process.env
): AIConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;

  const provider = resolveProvider(env.AI_PROVIDER?.trim().toLowerCase(), apiKey);
  if (!provider) return null;

  return {
    provider,
    apiKey,
    model: env.AI_MODEL?.trim() || DEFAULT_AI_MODELS[provider],
    baseUrl:
      env.AI_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_BASE_URLS[provider],
    timeoutMs: resolveTimeoutMs(env.AI_TIMEOUT_MS),
  };
}
