"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  createUserProduct,
  lookupBarcode,
  searchProducts,
  type BarcodeLookup,
  type PackagedProduct,
} from "@/server/services/products";
import { RateLimitError } from "@/server/services/rate-limit";
import {
  danishNumber,
  fieldErrorsOf,
  optionalDanishNumber,
  type ActionResult,
} from "@/lib/validation/common";
import { logError } from "@/lib/observability/log";
import { hasValidCheckDigit, normalizeBarcode } from "./domain/products";

export async function searchProductsAction(query: string): Promise<PackagedProduct[]> {
  const user = await requireUser();
  const q = z.string().max(100).catch("").parse(query);
  return searchProducts(user, q);
}

export type BarcodeResult = BarcodeLookup | { status: "invalid"; error: string };

export async function lookupBarcodeAction(input: string): Promise<BarcodeResult> {
  const user = await requireUser();
  const code = normalizeBarcode(z.string().max(40).catch("").parse(input));
  if (!code || !hasValidCheckDigit(code)) {
    return { status: "invalid", error: "Stregkoden er ikke gyldig. Tjek tallene under stregerne." };
  }
  try {
    return await lookupBarcode(user, code);
  } catch (e) {
    if (e instanceof RateLimitError) return { status: "invalid", error: e.message };
    logError("products.lookup_failed", e);
    return { status: "invalid", error: "Opslaget mislykkedes. Prøv igen." };
  }
}

const barcode = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v : undefined),
  z
    .string()
    .transform((v, ctx) => {
      const code = normalizeBarcode(v);
      if (!code || !hasValidCheckDigit(code)) {
        ctx.addIssue({ code: "custom", message: "Stregkoden er ikke gyldig." });
        return z.NEVER;
      }
      return code;
    })
    .optional(),
);

const productSchema = z.object({
  name: z.string().trim().min(1, "Skriv varens navn.").max(200),
  brand: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null),
  gtin: barcode,
  energyKcal: danishNumber({ min: 0, max: 900, label: "kalorier pr. 100 g" }),
  proteinG: optionalDanishNumber({ min: 0, max: 100, label: "protein" }),
  carbohydrateG: optionalDanishNumber({ min: 0, max: 100, label: "kulhydrat" }),
  sugarsG: optionalDanishNumber({ min: 0, max: 100, label: "sukker" }),
  fatG: optionalDanishNumber({ min: 0, max: 100, label: "fedt" }),
  saltG: optionalDanishNumber({ min: 0, max: 100, label: "salt" }),
});

export async function createProductAction(
  _prev: ActionResult<PackagedProduct> | null,
  formData: FormData,
): Promise<ActionResult<PackagedProduct>> {
  const user = await requireUser();
  const parsed = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  const d = parsed.data;
  const parts = [d.carbohydrateG, d.proteinG, d.fatG].reduce<number>((a, v) => a + (v ?? 0), 0);
  if (parts > 100.5) {
    return {
      ok: false,
      error: "Protein, kulhydrat og fedt kan tilsammen højst være 100 g pr. 100 g.",
    };
  }
  try {
    const product = await createUserProduct(user, {
      name: d.name,
      brand: d.brand,
      gtin: d.gtin ?? null,
      energyKcal: d.energyKcal,
      proteinG: d.proteinG ?? null,
      carbohydrateG: d.carbohydrateG ?? null,
      sugarsG: d.sugarsG ?? null,
      fatG: d.fatG ?? null,
      saltG: d.saltG ?? null,
    });
    return { ok: true, data: product, message: "Varen er gemt." };
  } catch (e) {
    logError("products.create_failed", e);
    return { ok: false, error: "Varen kunne ikke gemmes." };
  }
}
