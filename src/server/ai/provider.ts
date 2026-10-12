import "server-only";
import { getEnv } from "@/lib/env";
import type { AiProvider } from "./substitutions";

/**
 * Returns the configured AI provider, or null when AI is disabled. The API key
 * stays on the server; only minimal, non-identifying context is sent.
 */
export function getAiProvider(): AiProvider | null {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) return null;
  const key = env.ANTHROPIC_API_KEY;
  return {
    name: "anthropic",
    async complete(system, user) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      return body.content?.find((c) => c.type === "text")?.text ?? "";
    },
  };
}
