"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  addMeasurement,
  addWeight,
  decideRecommendation,
  deleteMeasurement,
  deleteWeight,
  evaluateRecommendation,
} from "@/server/services/weight";
import { RateLimitError } from "@/server/services/rate-limit";
import {
  danishNumber,
  fieldErrorsOf,
  isoDate,
  optionalDanishNumber,
  type ActionResult,
} from "@/lib/validation/common";
import { todayInCopenhagen } from "@/lib/format";
import { logError } from "@/lib/observability/log";

/** Today's entries keep the real time; back-dated entries are stored at noon UTC, which is the same calendar day in Copenhagen. */
function measuredAtFor(date: string): Date {
  return date === todayInCopenhagen() ? new Date() : new Date(`${date}T12:00:00Z`);
}

const notInFuture = isoDate.refine(
  (d) => d <= todayInCopenhagen(),
  "Datoen må ikke ligge i fremtiden.",
);

const weightSchema = z.object({
  date: notInFuture,
  weightKg: danishNumber({ min: 30, max: 300, label: "vægt" }),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
});

const measurementSchema = z
  .object({
    date: notInFuture,
    bodyFatPercent: optionalDanishNumber({ min: 3, max: 70, label: "fedtprocent" }),
    waistCm: optionalDanishNumber({ min: 40, max: 250, label: "taljemål" }),
  })
  .refine((m) => m.bodyFatPercent !== undefined || m.waistCm !== undefined, {
    message: "Angiv mindst én måling.",
    path: ["waistCm"],
  });

function refresh() {
  revalidatePath("/vaegt");
  revalidatePath("/oversigt");
}

export async function addWeightAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = weightSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await addWeight(user, measuredAtFor(parsed.data.date), parsed.data.weightKg, parsed.data.note);
  } catch (e) {
    logError("weight.add_failed", e);
    return { ok: false, error: "Vægten kunne ikke gemmes." };
  }
  refresh();
  return { ok: true, message: "Vægt gemt." };
}

export async function addMeasurementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = measurementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await addMeasurement(
      user,
      measuredAtFor(parsed.data.date),
      parsed.data.bodyFatPercent ?? null,
      parsed.data.waistCm ?? null,
    );
  } catch (e) {
    logError("measurement.add_failed", e);
    return { ok: false, error: "Målingen kunne ikke gemmes." };
  }
  refresh();
  return { ok: true, message: "Måling gemt." };
}

export async function deleteWeightAction(id: string) {
  const user = await requireUser();
  await deleteWeight(user, z.uuid().parse(id));
  refresh();
}

export async function deleteMeasurementAction(id: string) {
  const user = await requireUser();
  await deleteMeasurement(user, z.uuid().parse(id));
  refresh();
}

export async function evaluateRecommendationAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const rec = await evaluateRecommendation(user);
    if (!rec) return { ok: false, error: "Der mangler et mål eller en vægtregistrering." };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    logError("recommendation.evaluate_failed", e);
    return { ok: false, error: "Vurderingen kunne ikke gennemføres." };
  }
  refresh();
  return { ok: true };
}

export async function decideRecommendationAction(
  id: string,
  accept: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await decideRecommendation(user, z.uuid().parse(id), accept);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kunne ikke gemme dit valg." };
  }
  refresh();
  revalidatePath("/profil/mal");
  revalidatePath("/madplan");
  return { ok: true };
}
