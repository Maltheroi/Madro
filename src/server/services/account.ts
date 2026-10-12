import "server-only";
import { createClient } from "@supabase/supabase-js";
import { withUser } from "@/lib/database/db";
import { getEnv } from "@/lib/env";
import type { SessionUser } from "@/server/auth";
import { enforceRateLimit, LIMITS } from "./rate-limit";

/** Tables holding personal data, exported in full (GDPR art. 15 and 20). */
const PERSONAL_TABLES = [
  ["profile", "profiles", "id"],
  ["nutrition_goals", "nutrition_goals", "user_id"],
  ["weight_entries", "weight_entries", "user_id"],
  ["body_measurements", "body_measurements", "user_id"],
  ["food_diary_entries", "food_diary_entries", "user_id"],
  ["food_diary_days", "food_diary_days", "user_id"],
  ["meal_plans", "meal_plans", "user_id"],
  ["planned_meals", "planned_meals", "user_id"],
  ["recipe_favorites", "recipe_favorites", "user_id"],
  ["own_recipes", "recipes", "owner_id"],
  ["pantry_items", "pantry_items", "user_id"],
  ["shopping_baskets", "shopping_baskets", "user_id"],
  ["shopping_basket_items", "shopping_basket_items", "user_id"],
  ["shopping_lists", "shopping_lists", "user_id"],
  ["shopping_list_items", "shopping_list_items", "user_id"],
  ["calorie_recommendations", "calorie_recommendations", "user_id"],
  ["manual_price_observations", "price_observations", "reported_by"],
] as const;

export async function exportPersonalData(user: SessionUser): Promise<Record<string, unknown>> {
  return withUser(user.id, async (tx) => {
    await enforceRateLimit(tx, LIMITS.dataExport);
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      notice:
        "Eksport af dine personoplysninger. Katalogdata (fødevarer, opskrifter, priser) er ikke med, medmindre du selv har oprettet dem.",
    };
    for (const [key, table, column] of PERSONAL_TABLES) {
      // Identifiers come from the constant list above, never from input.
      out[key] = await tx`select * from ${tx("public." + table)} where ${tx(column)} = ${user.id}`;
    }
    return out;
  });
}

export class AccountDeletionUnavailableError extends Error {
  constructor() {
    super(
      "Sletning er ikke konfigureret på serveren. Kontakt support, så sletter vi din konto manuelt.",
    );
  }
}

/**
 * Deletes the auth user via the Supabase admin API. All personal rows cascade
 * from auth.users (verified in tests/db/rls.test.ts).
 */
export async function deleteAccount(user: SessionUser): Promise<void> {
  const env = getEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new AccountDeletionUnavailableError();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}
