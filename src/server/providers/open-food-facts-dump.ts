/**
 * Open Food Facts bulk export (tab-separated CSV), the documented way to get
 * many products: https://world.openfoodfacts.org/data. Rows are converted to
 * the API product shape so parseOffProduct handles both sources the same way.
 */
export const OFF_CSV_URL =
  "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";

const NUTRIMENT_COLUMNS = [
  "energy-kcal_100g",
  "energy-kj_100g",
  "proteins_100g",
  "carbohydrates_100g",
  "sugars_100g",
  "fat_100g",
  "saturated-fat_100g",
  "fiber_100g",
  "salt_100g",
];

const tags = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

/** Splits one export line into named columns using the header row. */
export function parseCsvLine(header: string[], line: string): Record<string, string> {
  const cells = line.split("\t");
  const row: Record<string, string> = {};
  header.forEach((h, i) => {
    row[h] = cells[i] ?? "";
  });
  return row;
}

export function isSoldInDenmark(row: Record<string, string>): boolean {
  return tags(row.countries_tags).includes("en:denmark");
}

/** Converts an export row to the API v3 product shape (without the status wrapper). */
export function offCsvRowToProduct(row: Record<string, string>): Record<string, unknown> {
  const nutriments: Record<string, string> = {};
  for (const c of NUTRIMENT_COLUMNS) if (row[c]) nutriments[c] = row[c];
  return {
    code: row.code,
    product_name: row.product_name || undefined,
    product_name_da: row.product_name_da || undefined,
    brands: row.brands || undefined,
    product_quantity: row.product_quantity || undefined,
    product_quantity_unit: row.product_quantity_unit || undefined,
    quantity: row.quantity || undefined,
    allergens_tags: tags(row.allergens_tags || row.allergens),
    traces_tags: tags(row.traces_tags),
    nutriments,
    nutrition_data_per: row.nutrition_data_per || undefined,
  };
}
