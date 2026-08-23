import type { AIConfig } from "./config";

/**
 * Minimal AI provider client built on fetch - no SDK dependency.
 * Both supported wire formats are OpenAI chat completions and Anthropic
 * messages. Every failure mode resolves to `null`; this layer never throws so
 * decision callers can fall back to deterministic rules unconditionally.
 */

export interface AIChatRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isOpenAIContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : ""
      )
      .join("");
    return text || null;
  }
  return null;
}

function extractOpenAIText(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "choices" in payload &&
    Array.isArray((payload as { choices: unknown }).choices) &&
    (payload as { choices: unknown[] }).choices.length > 0
  ) {
    const first = (payload as { choices: Array<Record<string, unknown>> }).choices[0];
    const message = first?.message;
    if (typeof message === "object" && message !== null && "content" in message) {
      return isOpenAIContent((message as { content: unknown }).content);
    }
  }
  return null;
}

function extractAnthropicText(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "content" in payload &&
    Array.isArray((payload as { content: unknown }).content)
  ) {
    for (const block of (payload as { content: unknown[] }).content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        return (block as { text: string }).text;
      }
    }
  }
  return null;
}

export async function callAI(
  config: AIConfig,
  request: AIChatRequest,
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    let response: Response;

    if (config.provider === "anthropic") {
      response = await fetchImpl(`${config.baseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        }),
      });
    } else {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
    }

    if (!response.ok) {
      console.error(
        `AI provider ${config.provider} returned HTTP ${response.status}`
      );
      return null;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (payload === null) {
      console.error("AI provider returned a non-JSON body");
      return null;
    }

    const text =
      config.provider === "anthropic"
        ? extractAnthropicText(payload)
        : extractOpenAIText(payload);

    if (!text) {
      console.error("AI provider response did not contain message text");
      return null;
    }

    return text;
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `timed out after ${config.timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : "unknown error";
    console.error(`AI provider call failed: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
