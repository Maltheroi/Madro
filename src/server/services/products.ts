import "server-only";
import { randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import { withService, withUser, type Tx } from "@/lib/database/db";
import { logError } from "@/lib/observability/log";
import type { SessionUser } from "@/server/auth";
import { createOpenFoodFactsProvider } from "@/server/providers/open-food-facts";
import type { CatalogProduct } from "@/server/providers/types";
import { upsertPackagedProducts } from "@/server/providers/packaged-products-store";
import type { Unit } from "@/features/nutrition/domain/units";
import { barcodeVariants } from "@/features/products/domain/products";
import { enforceRateLimit, LIMITS } from "./rate-limit";

export interface PackagedProduct {
  id: string;
  sourceKey: "open-food-facts" | "user";
  code: string;
  gtin: string | null;
  name: string;
  brand: string | null;
  packageQuantity: number | null;
  packageUnit: Unit | null;
  allergens: string[];
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  sugarsG: number | null;
  saltG: number | null;
  dataQuality: "complete" | "partial" | "minimal";
  sourceUrl: string | null;
  isOwn: boolean;
}

function mapProduct(r: Record<string, unknown>): PackagedProduct {
  return {
    id: r.id as string,
    sourceKey: r.source_key as PackagedProduct["sourceKey"],
    code: r.code as string,
    gtin: r.gtin as string | null,
    name: r.name as string,
    brand: r.brand as string | null,
    packageQuantity: r.package_quantity as number | null,
    packageUnit: r.package_unit as Unit | null,
    allergens: r.allergens as string[],
    energyKcal: r.energy_kcal as number | null,
    proteinG: r.protein_g as number | null,
    carbohydrateG: r.carbohydrate_g as number | null,
    fatG: r.fat_g as number | null,
    sugarsG: r.sugars_g as number | null,
    saltG: r.salt_g as number | null,
    dataQuality: r.data_quality as PackagedProduct["dataQuality"],
    sourceUrl: r.source_url as string | null,
    isOwn: r.created_by !== null,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Searches Danish packaged products (shared Open Food Facts copy plus the user's own). */
export async function searchProducts(user: SessionUser, query: string): Promise<PackagedProduct[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const pattern = `%${escapeLike(q)}%`;
  return withUser(user.id, async (tx) => {
    const rows = await tx`
      select *, lower(name || ' ' || coalesce(brand, '')) as haystack
      from public.packaged_products
      where (created_by is null or created_by = ${user.id})
        and (lower(name || ' ' || coalesce(brand, '')) like ${pattern}
             or extensions.word_similarity(${q}, lower(name || ' ' || coalesce(brand, ''))) > 0.5)
      order by (created_by is not null) desc,
               (energy_kcal is not null) desc,
               extensions.word_similarity(${q}, lower(name || ' ' || coalesce(brand, ''))) desc,
               char_length(name)
      limit 20`;
    return rows.map(mapProduct);
  });
}

async function findByBarcode(tx: Tx, userId: string, code: string) {
  const rows = await tx`
    select * from public.packaged_products
    where gtin in ${tx(barcodeVariants(code))} and (created_by is null or created_by = ${userId})
    order by (created_by is not null) desc
    limit 1`;
  return rows[0] ? mapProduct(rows[0]) : null;
}

export type BarcodeLookup =
  { status: "found"; product: PackagedProduct } | { status: "not_found"; checkedOnline: boolean };

/**
 * Looks a barcode up in the local copy first, then in Open Food Facts when
 * configured. Products fetched from Open Food Facts are cached in the shared
 * table (service role) so the next lookup is local.
 */
export async function lookupBarcode(user: SessionUser, code: string): Promise<BarcodeLookup> {
  const local = await withUser(user.id, async (tx) => {
    await enforceRateLimit(tx, LIMITS.barcodeLookup);
    return findByBarcode(tx, user.id, code);
  });
  if (local) return { status: "found", product: local };

  const userAgent = getEnv().OPEN_FOOD_FACTS_USER_AGENT;
  if (!userAgent) return { status: "not_found", checkedOnline: false };
  let fetched: CatalogProduct | null = null;
  try {
    const off = createOpenFoodFactsProvider(userAgent);
    for (const variant of barcodeVariants(code)) {
      fetched = await off.getByGtin(variant);
      if (fetched) break;
    }
  } catch (e) {
    logError("products.off_lookup_failed", e);
    return { status: "not_found", checkedOnline: false };
  }
  if (!fetched) return { status: "not_found", checkedOnline: true };
  await upsertProviderProducts([fetched]);
  const product = await withUser(user.id, (tx) => findByBarcode(tx, user.id, code));
  return product ? { status: "found", product } : { status: "not_found", checkedOnline: true };
}

/** Inserts or refreshes provider products (service role). */
export async function upsertProviderProducts(products: CatalogProduct[]): Promise<number> {
  return withService((tx) => upsertPackagedProducts(tx, products));
}

export interface NewUserProduct {
  name: string;
  brand: string | null;
  gtin: string | null;
  energyKcal: number;
  proteinG: number | null;
  carbohydrateG: number | null;
  sugarsG: number | null;
  fatG: number | null;
  saltG: number | null;
}

/** Saves a product the user typed in from the package. Visible only to that user. */
export async function createUserProduct(
  user: SessionUser,
  p: NewUserProduct,
): Promise<PackagedProduct> {
  const core = [p.energyKcal, p.proteinG, p.carbohydrateG, p.fatG];
  const quality = core.every((v) => v !== null) ? "complete" : "partial";
  const code = p.gtin ?? `eget-${randomUUID()}`;
  return withUser(user.id, async (tx) => {
    const [row] = await tx`
      insert into public.packaged_products
        (source_key, code, gtin, name, brand, energy_kcal, protein_g, carbohydrate_g, sugars_g, fat_g, salt_g,
         data_quality, licence, created_by)
      values ('user', ${code}, ${p.gtin}, ${p.name}, ${p.brand}, ${p.energyKcal}, ${p.proteinG}, ${p.carbohydrateG},
              ${p.sugarsG}, ${p.fatG}, ${p.saltG}, ${quality}, 'Brugerens egne data', ${user.id})
      on conflict (created_by, code) where created_by is not null do update set
        name = excluded.name, brand = excluded.brand, energy_kcal = excluded.energy_kcal,
        protein_g = excluded.protein_g, carbohydrate_g = excluded.carbohydrate_g,
        sugars_g = excluded.sugars_g, fat_g = excluded.fat_g, salt_g = excluded.salt_g,
        data_quality = excluded.data_quality
      returning *`;
    return mapProduct(row);
  });
}

/** Reads one product the user may see (RLS plus explicit owner filter). */
export async function getProduct(tx: Tx, userId: string, id: string) {
  const [row] = await tx`
    select * from public.packaged_products
    where id = ${id} and (created_by is null or created_by = ${userId})`;
  return row ? mapProduct(row) : null;
}
