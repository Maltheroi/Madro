import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation. Secrets are only read here, on the
 * server; nothing in this module is exposed to the browser bundle.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// URL"),
  /** Required for account deletion via the Supabase admin API. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  /** Use "disable" only for local development databases. */
  DATABASE_SSL: z.enum(["require", "disable"]).default("require"),
  /** Optional: enables the Open Food Facts product lookup. Must identify the app and a contact. */
  OPEN_FOOD_FACTS_USER_AGENT: z.string().min(10).optional(),
  /** Optional: enables AI-assisted explanations and substitutions. */
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  AI_MODEL: z.string().default("claude-haiku-5-5"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export class MissingConfigurationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Missing or invalid configuration: ${issues.join("; ")}`);
  }
}

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new MissingConfigurationError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  cached = parsed.data;
  return cached;
}

export function isConfigured(): boolean {
  try {
    getEnv();
    return true;
  } catch {
    return false;
  }
}
