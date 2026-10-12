"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/database/db";
import { AccountDeletionUnavailableError, deleteAccount } from "@/server/services/account";
import { logError, logEvent } from "@/lib/observability/log";
import { danishNumber, fieldErrorsOf, type ActionResult } from "@/lib/validation/common";

export async function deleteAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "SLET"
  ) {
    return { ok: false, error: "Skriv SLET for at bekræfte." };
  }
  try {
    await deleteAccount(user);
  } catch (e) {
    if (e instanceof AccountDeletionUnavailableError) return { ok: false, error: e.message };
    logError("account.delete_failed", e);
    return { ok: false, error: "Kontoen kunne ikke slettes. Prøv igen, eller kontakt support." };
  }
  logEvent("account.deleted");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/?slettet=1");
}

const percent = (label: string, min: number, max: number) => danishNumber({ min, max, label });

const toleranceSchema = z.object({
  energy: percent("energitolerance", 1, 30),
  proteinShortfall: percent("proteintolerance", 0, 50),
  carbohydrate: percent("kulhydrattolerance", 1, 100),
  fat: percent("fedttolerance", 1, 100),
});

export async function updateTolerancesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = toleranceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  const t = parsed.data;
  const rows = await withUser(
    user.id,
    (tx) => tx`
    update public.nutrition_goals set
      tolerance_energy = ${t.energy / 100}, tolerance_protein_shortfall = ${t.proteinShortfall / 100},
      tolerance_carbohydrate = ${t.carbohydrate / 100}, tolerance_fat = ${t.fat / 100}
    where user_id = ${user.id} and is_active returning id`,
  );
  if (rows.length === 0) return { ok: false, error: "Du har intet aktivt mål." };
  revalidatePath("/profil/mal");
  revalidatePath("/madplan");
  return { ok: true, message: "Tolerancer gemt. De bruges næste gang du laver en madplan." };
}
