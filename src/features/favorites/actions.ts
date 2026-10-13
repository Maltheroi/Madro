"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  FavoritesError,
  MAX_FAVORITES,
  MIN_FAVORITES,
  saveFavorites,
} from "@/server/services/favorites";
import type { ActionResult } from "@/lib/validation/common";
import { logError } from "@/lib/observability/log";

const schema = z.object({
  recipeIds: z
    .array(z.uuid())
    .min(MIN_FAVORITES, `Vælg mindst ${MIN_FAVORITES} retter.`)
    .max(MAX_FAVORITES, `Vælg højst ${MAX_FAVORITES} retter.`),
  wishes: z
    .string()
    .max(1000)
    .transform((v) =>
      v
        .split("\n")
        .map((s) => s.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 10),
    ),
  mode: z.enum(["onboarding", "edit"]),
});

export async function saveFavoritesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    recipeIds: formData.getAll("recipeId"),
    wishes: formData.get("wishes") ?? "",
    mode: formData.get("mode"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await saveFavorites(user, parsed.data.recipeIds, parsed.data.wishes);
  } catch (e) {
    if (e instanceof FavoritesError) return { ok: false, error: e.message };
    logError("favorites.save_failed", e);
    return { ok: false, error: "Dine yndlingsretter kunne ikke gemmes." };
  }
  revalidatePath("/", "layout");
  if (parsed.data.mode === "onboarding") redirect("/oversigt?velkommen=1");
  return { ok: true, message: "Dine yndlingsretter er gemt." };
}
