import type postgres from "postgres";
import type { CatalogProduct } from "./types";

const BATCH = 500;

/**
 * Writes provider products (e.g. Open Food Facts) to public.packaged_products
 * in multi-row batches. Used by the barcode lookup cache and by
 * scripts/import-off-denmark.ts, so it must not import server-only modules.
 * Callers run it with a role that may write provider rows (service_role or the
 * database owner).
 */
export async function upsertPackagedProducts(
  tx: postgres.TransactionSql,
  products: CatalogProduct[],
): Promise<number> {
  // A batch may not touch the same row twice; keep the last occurrence of each code.
  const unique = [...new Map(products.map((p) => [`${p.sourceKey}:${p.externalId}`, p])).values()];
  for (let i = 0; i < unique.length; i += BATCH) {
    const rows = unique.slice(i, i + BATCH).map((p) => {
      const per = p.nutritionPer100g;
      return {
        source_key: p.sourceKey,
        code: p.externalId,
        gtin: p.gtin,
        name: p.name.slice(0, 200),
        brand: p.brand?.slice(0, 120) ?? null,
        package_quantity: p.packageQuantity,
        package_unit: p.packageUnit,
        allergens: tx.array(p.allergens),
        traces: tx.array(p.traces),
        energy_kcal: per?.energyKcal ?? null,
        protein_g: per?.proteinG ?? null,
        carbohydrate_g: per?.carbohydrateG ?? null,
        sugars_g: per?.sugarsG ?? null,
        fat_g: per?.fatG ?? null,
        saturated_fat_g: per?.saturatedFatG ?? null,
        fiber_g: per?.fiberG ?? null,
        salt_g: per?.saltG ?? null,
        data_quality: p.dataQuality,
        licence: p.licence,
        source_url: p.sourceUrl,
        retrieved_at: p.retrievedAt,
      };
    });
    await tx`
      insert into public.packaged_products ${tx(rows)}
      on conflict (source_key, code) where created_by is null do update set
        gtin = excluded.gtin, name = excluded.name, brand = excluded.brand,
        package_quantity = excluded.package_quantity, package_unit = excluded.package_unit,
        allergens = excluded.allergens, traces = excluded.traces,
        energy_kcal = excluded.energy_kcal, protein_g = excluded.protein_g,
        carbohydrate_g = excluded.carbohydrate_g, sugars_g = excluded.sugars_g, fat_g = excluded.fat_g,
        saturated_fat_g = excluded.saturated_fat_g, fiber_g = excluded.fiber_g, salt_g = excluded.salt_g,
        data_quality = excluded.data_quality, licence = excluded.licence,
        source_url = excluded.source_url, retrieved_at = excluded.retrieved_at`;
  }
  return unique.length;
}
