import "server-only";
import type { Tx } from "@/lib/database/db";

export class RateLimitError extends Error {
  constructor() {
    super("For mange forespørgsler. Vent lidt, og prøv igen.");
  }
}

/** Fixed-window limits for expensive or sensitive operations. */
export const LIMITS = {
  mealPlanGenerate: { action: "meal_plan_generate", limit: 30, windowSeconds: 3600 },
  basketOptimize: { action: "basket_optimize", limit: 60, windowSeconds: 3600 },
  dataExport: { action: "data_export", limit: 5, windowSeconds: 3600 },
  aiRequest: { action: "ai_request", limit: 20, windowSeconds: 3600 },
  recommendation: { action: "calorie_recommendation", limit: 20, windowSeconds: 3600 },
  barcodeLookup: { action: "barcode_lookup", limit: 60, windowSeconds: 3600 },
} as const;

export async function enforceRateLimit(
  tx: Tx,
  l: (typeof LIMITS)[keyof typeof LIMITS],
): Promise<void> {
  const [{ ok }] =
    await tx`select public.consume_rate_limit(${l.action}, ${l.limit}, ${l.windowSeconds}) as ok`;
  if (!ok) throw new RateLimitError();
}
