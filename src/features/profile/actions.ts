"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { saveProfile } from "@/server/services/profile";
import { fieldErrorsOf, type ActionResult } from "@/lib/validation/common";
import { logError } from "@/lib/observability/log";
import { profileSchema, type ProfileInput } from "./schema";

export async function saveOnboardingAction(input: ProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Nogle felter skal rettes.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  try {
    await saveProfile(user, parsed.data, { onboarding: true, recalculateGoals: true });
  } catch (e) {
    logError("profile.onboarding_failed", e);
    return { ok: false, error: "Vi kunne ikke gemme dine oplysninger. Prøv igen." };
  }
  redirect("/oversigt?velkommen=1");
}

export async function updateProfileAction(
  input: ProfileInput,
  recalculateGoals: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Nogle felter skal rettes.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  try {
    await saveProfile(user, parsed.data, { onboarding: false, recalculateGoals });
  } catch (e) {
    logError("profile.update_failed", e);
    return { ok: false, error: "Vi kunne ikke gemme dine ændringer. Prøv igen." };
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: recalculateGoals
      ? "Profilen er gemt, og dine mål er beregnet igen."
      : "Profilen er gemt.",
  };
}
