import type postgres from "postgres";
import type { CatalogProduct } from "./types";

/**
 * Writes provider products (e.g. Open Food Facts) to public.packaged_products.
 * Used by the barcode lookup cache and by scripts/import-off-denmark.ts, so it
 * must not import server-only modules. Callers run it with a role that may
 * write provider rows (service_role or the database owner).
 */
export async function upsertPackagedProducts(
  tx: postgres.TransactionSql,
  products: CatalogProduct[],
): Promise<number> {
  let n = 0;
  for (const p of products) {
    const per = p.nutritionPer100g;
    await tx`
      insert into public.packaged_products
        (source_key, code, gtin, name, brand, package_quantity, package_unit, allergens, traces,
         energy_kcal, protein_g, carbohydrate_g, sugars_g, fat_g, saturated_fat_g, fiber_g, salt_g,
         data_quality, licence, source_url, retrieved_at)
      values
        (${p.sourceKey}, ${p.externalId}, ${p.gtin}, ${p.name.slice(0, 200)}, ${p.brand?.slice(0, 120) ?? null},
         ${p.packageQuantity}, ${p.packageUnit}, ${p.allergens}, ${p.traces},
         ${per?.energyKcal ?? null}, ${per?.proteinG ?? null}, ${per?.carbohydrateG ?? null}, ${per?.sugarsG ?? null},
         ${per?.fatG ?? null}, ${per?.saturatedFatG ?? null}, ${per?.fiberG ?? null}, ${per?.saltG ?? null},
         ${p.dataQuality}, ${p.licence}, ${p.sourceUrl}, ${p.retrievedAt})
      on conflict (source_key, code) where created_by is null do update set
        gtin = excluded.gtin, name = excluded.name, brand = excluded.brand,
        package_quantity = excluded.package_quantity, package_unit = excluded.package_unit,
        allergens = excluded.allergens, traces = excluded.traces,
        energy_kcal = excluded.energy_kcal, protein_g = excluded.protein_g,
        carbohydrate_g = excluded.carbohydrate_g, sugars_g = excluded.sugars_g, fat_g = excluded.fat_g,
        saturated_fat_g = excluded.saturated_fat_g, fiber_g = excluded.fiber_g, salt_g = excluded.salt_g,
        data_quality = excluded.data_quality, licence = excluded.licence,
        source_url = excluded.source_url, retrieved_at = excluded.retrieved_at`;
    n++;
  }
  return n;
}
