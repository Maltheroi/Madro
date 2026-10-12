/**
 * Open Food Facts product lookup (API v3, read-only).
 *
 * Terms we follow (https://openfoodfacts.github.io/openfoodfacts-server/api/):
 *  - a custom User-Agent identifying the app and a contact address is required
 *  - read limits: 100 product requests/min (we stay far below with 15/min)
 *  - data is ODbL: attribution required, and the extracted database must stay
 *    separable (stored with source_key 'open-food-facts', never merged
 *    silently into the internal catalogue)
 *
 * OFF data is crowd-sourced. Nutrition from OFF is marked "partial" or
 * "minimal" unless every core nutrient is present, and is never treated as
 * verified.
 */
import { isUnit, type Unit } from "@/features/nutrition/domain/units";
import type { CatalogProduct, Per100g, ProductCatalogProvider, ProviderInfo } from "./types";
import { ProviderNotConfiguredError } from "./types";

export const OFF_LICENCE = "ODbL 1.0 (database), DbCL 1.0 (indhold), CC BY-SA (billeder)";

const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_da",
  "brands",
  "product_quantity",
  "product_quantity_unit",
  "quantity",
  "allergens_tags",
  "traces_tags",
  "nutriments",
  "nutrition_data_per",
  "nutrition_data_prepared_per",
].join(",");

/** OFF taxonomy tags → EU allergen codes used in this app. */
const OFF_ALLERGENS: Record<string, string> = {
  "en:gluten": "gluten",
  "en:crustaceans": "crustaceans",
  "en:eggs": "egg",
  "en:fish": "fish",
  "en:peanuts": "peanuts",
  "en:soybeans": "soy",
  "en:milk": "milk",
  "en:nuts": "nuts",
  "en:celery": "celery",
  "en:mustard": "mustard",
  "en:sesame-seeds": "sesame",
  "en:sulphur-dioxide-and-sulphites": "sulphites",
  "en:lupin": "lupin",
  "en:molluscs": "molluscs",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function mapAllergens(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(tags.map((t) => OFF_ALLERGENS[String(t)]).filter((x): x is string => Boolean(x))),
  ];
}

function parseQuantity(p: Record<string, unknown>): { q: number | null; unit: Unit | null } {
  const q = num(p.product_quantity);
  const rawUnit =
    typeof p.product_quantity_unit === "string" ? p.product_quantity_unit.toLowerCase() : null;
  if (q !== null && q > 0 && rawUnit && isUnit(rawUnit)) return { q, unit: rawUnit };
  // Fall back to a simple "500 g" / "1,5 l" pattern in the free-text quantity.
  const m =
    typeof p.quantity === "string"
      ? /^\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l)\b/i.exec(p.quantity)
      : null;
  if (!m) return { q: null, unit: null };
  let value = Number(m[1].replace(",", "."));
  let unit = m[2].toLowerCase();
  if (unit === "cl") {
    value *= 10;
    unit = "ml";
  }
  return isUnit(unit) ? { q: value, unit } : { q: null, unit: null };
}

/** Pure parser for an API v3 response body; exported for tests. */
export function parseOffProduct(body: unknown, retrievedAt: Date): CatalogProduct | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { status?: string; product?: Record<string, unknown> };
  if (b.status !== "success" && b.status !== "success_with_warnings") return null;
  const p = b.product;
  if (!p || typeof p.code !== "string") return null;
  const name = [p.product_name_da, p.product_name].find(
    (n): n is string => typeof n === "string" && n.trim().length > 0,
  );
  if (!name) return null;

  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const per100: Per100g = {
    energyKcal:
      num(n["energy-kcal_100g"]) ??
      (num(n["energy-kj_100g"]) !== null
        ? Math.round((num(n["energy-kj_100g"])! / 4.184) * 10) / 10
        : null),
    proteinG: num(n.proteins_100g),
    carbohydrateG: num(n.carbohydrates_100g),
    sugarsG: num(n.sugars_100g),
    fatG: num(n.fat_100g),
    saturatedFatG: num(n["saturated-fat_100g"]),
    fiberG: num(n.fiber_100g),
    saltG: num(n.salt_100g),
  };
  const core = [per100.energyKcal, per100.proteinG, per100.carbohydrateG, per100.fatG];
  const present = Object.values(per100).filter((v) => v !== null).length;
  const hasNutrition = present > 0 && p.nutrition_data_per !== "serving";
  const { q, unit } = parseQuantity(p);

  return {
    sourceKey: "open-food-facts",
    externalId: p.code,
    gtin: /^\d{8,14}$/.test(p.code) ? p.code : null,
    name: name.trim(),
    brand: typeof p.brands === "string" && p.brands.trim() ? p.brands.split(",")[0].trim() : null,
    packageQuantity: q,
    packageUnit: unit,
    allergens: mapAllergens(p.allergens_tags),
    traces: mapAllergens(p.traces_tags),
    nutritionPer100g: hasNutrition ? per100 : null,
    nutritionBasis: hasNutrition ? "as_sold" : null,
    dataQuality: !hasNutrition ? "minimal" : core.every((v) => v !== null) ? "complete" : "partial",
    licence: OFF_LICENCE,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(p.code)}`,
    retrievedAt: retrievedAt.toISOString(),
  };
}

export function openFoodFactsInfo(userAgent: string | undefined): ProviderInfo {
  return {
    key: "open-food-facts",
    name: "Open Food Facts",
    kinds: ["product_catalog", "nutrition"],
    status: userAgent ? "active" : "not_configured",
    licence: OFF_LICENCE,
    note: userAgent
      ? "Opslag på stregkode. Crowdsourcede data markeres som ikke-verificerede."
      : "Kræver OPEN_FOOD_FACTS_USER_AGENT med appnavn og kontakt-e-mail.",
    docsUrl: "https://openfoodfacts.github.io/openfoodfacts-server/api/",
    requiredEnv: ["OPEN_FOOD_FACTS_USER_AGENT"],
  };
}

export function createOpenFoodFactsProvider(
  userAgent: string | undefined,
  fetchImpl: typeof fetch = fetch,
): ProductCatalogProvider {
  const info = openFoodFactsInfo(userAgent);
  let windowStart = 0;
  let count = 0;
  return {
    info,
    async getByGtin(gtin) {
      if (!userAgent) throw new ProviderNotConfiguredError(info.key, "missing User-Agent");
      if (!/^\d{8,14}$/.test(gtin)) return null;
      const now = Date.now();
      if (now - windowStart > 60_000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 15) throw new Error("open-food-facts: local rate limit (15/min) reached");
      const res = await fetchImpl(
        `https://world.openfoodfacts.org/api/v3/product/${gtin}?fields=${OFF_FIELDS}`,
        {
          headers: { "User-Agent": userAgent, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`open-food-facts: HTTP ${res.status}`);
      return parseOffProduct(await res.json(), new Date());
    },
  };
}
