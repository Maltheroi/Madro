"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  addManualItem,
  addManualPrice,
  calculateBasket,
  createListFromBasket,
  deletePantryItem,
  updateListItem,
  upsertPantryItem,
} from "@/server/services/shopping";
import { RateLimitError } from "@/server/services/rate-limit";
import { UNITS } from "@/features/nutrition/domain/units";
import {
  danishNumber,
  fieldErrorsOf,
  isoDate,
  optionalDanishNumber,
  type ActionResult,
} from "@/lib/validation/common";
import { logError } from "@/lib/observability/log";

const kr = (label: string) => optionalDanishNumber({ min: 0, max: 100000, label });

export async function calculateBasketAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const mode = formData.get("mode") === "strict_budget" ? "strict_budget" : "best_value";
  const allowSubstitutes = formData.get("allowSubstitutes") === "on";
  try {
    await calculateBasket(user, { mode, allowSubstitutes });
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    if (e instanceof Error && e.message === "Lav en madplan først.")
      return { ok: false, error: e.message };
    logError("basket.calculate_failed", e);
    return { ok: false, error: "Kurven kunne ikke beregnes." };
  }
  revalidatePath("/indkobsliste/kurv");
  return { ok: true };
}

export async function createListAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const basketId = z.uuid().parse(formData.get("basketId"));
  const storeId = z.uuid().parse(formData.get("storeId"));
  await createListFromBasket(user, basketId, storeId);
  revalidatePath("/indkobsliste");
  redirect("/indkobsliste");
}

const updateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("checked"), value: z.boolean() }),
  z.object({ kind: z.literal("removed"), value: z.boolean() }),
  z.object({ kind: z.literal("packages"), value: z.number().int().min(0).max(99) }),
  z.object({
    kind: z.literal("purchased"),
    valueOre: z.number().int().min(0).max(10_000_000).nullable(),
  }),
]);

export async function updateListItemAction(
  itemId: string,
  update: z.input<typeof updateSchema>,
): Promise<void> {
  const user = await requireUser();
  await updateListItem(user, z.uuid().parse(itemId), updateSchema.parse(update));
  revalidatePath("/indkobsliste");
}

export async function setPurchasedPriceAction(
  itemId: string,
  value: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = kr("pris").safeParse(value);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldig pris." };
  await updateListItem(user, z.uuid().parse(itemId), {
    kind: "purchased",
    valueOre: parsed.data === undefined ? null : Math.round(parsed.data * 100),
  });
  revalidatePath("/indkobsliste");
  return { ok: true };
}

const manualItemSchema = z.object({
  listId: z.uuid(),
  label: z.string().trim().min(1, "Skriv en vare.").max(120),
  price: kr("pris"),
});

export async function addManualItemAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = manualItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await addManualItem(
      user,
      parsed.data.listId,
      parsed.data.label,
      parsed.data.price === undefined ? null : Math.round(parsed.data.price * 100),
    );
  } catch (e) {
    logError("list.manual_item_failed", e);
    return { ok: false, error: "Varen kunne ikke tilføjes." };
  }
  revalidatePath("/indkobsliste");
  return { ok: true, message: "Tilføjet." };
}

const pantrySchema = z.object({
  ingredientId: z.uuid({ error: "Vælg en fødevare." }),
  quantity: danishNumber({ min: 0, max: 100000, label: "mængde" }),
  unit: z.enum(UNITS),
  expiresOn: isoDate.optional().or(z.literal("").transform(() => undefined)),
});

export async function upsertPantryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = pantrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await upsertPantryItem(
      user,
      parsed.data.ingredientId,
      parsed.data.quantity,
      parsed.data.unit,
      parsed.data.expiresOn ?? null,
    );
  } catch (e) {
    logError("pantry.upsert_failed", e);
    return { ok: false, error: "Kunne ikke gemme varen." };
  }
  revalidatePath("/spisekammer");
  revalidatePath("/indkobsliste");
  return { ok: true, message: "Gemt i dit spisekammer." };
}

export async function deletePantryAction(id: string): Promise<void> {
  const user = await requireUser();
  await deletePantryItem(user, z.uuid().parse(id));
  revalidatePath("/spisekammer");
}

const manualPriceSchema = z.object({
  productId: z.uuid(),
  storeId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  price: danishNumber({ min: 0.5, max: 10000, label: "pris" }),
});

export async function addManualPriceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = manualPriceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldig pris." };
  try {
    await addManualPrice(
      user,
      parsed.data.productId,
      parsed.data.storeId ?? null,
      Math.round(parsed.data.price * 100),
    );
  } catch (e) {
    logError("price.manual_failed", e);
    return { ok: false, error: "Prisen kunne ikke gemmes." };
  }
  revalidatePath("/indkobsliste/priser");
  return { ok: true, message: "Pris gemt. Den er kun synlig for dig og markeres som estimeret." };
}
