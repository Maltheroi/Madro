/**
 * Imports products sold in Denmark from Open Food Facts into
 * public.packaged_products (source_key 'open-food-facts').
 *
 * Usage: DATABASE_URL=... OPEN_FOOD_FACTS_USER_AGENT="Madro/1.0 (kontakt@example.dk)" \
 *        npx tsx scripts/import-off-denmark.ts [--max-pages=N]
 *
 * Follows the Open Food Facts API terms: identifying User-Agent, and at most
 * 10 search requests per minute (we wait 6.5 s between pages). Data is ODbL
 * and stays in its own table with source and licence on every row.
 */
import postgres from "postgres";
import { parseOffProduct } from "../src/server/providers/open-food-facts";
import { upsertPackagedProducts } from "../src/server/providers/packaged-products-store";
import type { CatalogProduct } from "../src/server/providers/types";

const FIELDS = [
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
].join(",");
const PAGE_SIZE = 100;
const DELAY_MS = 6_500;

const databaseUrl = process.env.DATABASE_URL;
const userAgent = process.env.OPEN_FOOD_FACTS_USER_AGENT;
const maxPagesArg = process.argv.find((a) => a.startsWith("--max-pages="));
const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : Infinity;

if (!databaseUrl || !userAgent || userAgent.length < 10) {
  console.error("Set DATABASE_URL and OPEN_FOOD_FACTS_USER_AGENT (app name and contact e-mail).");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page: number): Promise<{ count: number; products: unknown[] }> {
  const url = new URL("https://world.openfoodfacts.org/api/v2/search");
  url.searchParams.set("countries_tags_en", "denmark");
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent!, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return (await res.json()) as { count: number; products: unknown[] };
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`Open Food Facts search page ${page}: HTTP ${res.status}`);
    }
    await sleep(DELAY_MS * 2 ** attempt);
  }
}

async function main() {
  const sql = postgres(databaseUrl!, { max: 1, prepare: false, onnotice: () => {} });
  let page = 1;
  let total = 0;
  let skipped = 0;
  let pages = Infinity;
  try {
    while (page <= Math.min(pages, maxPages)) {
      const body = await fetchPage(page);
      pages = Math.ceil(body.count / PAGE_SIZE);
      const now = new Date();
      const parsed: CatalogProduct[] = [];
      for (const raw of body.products ?? []) {
        const p = parseOffProduct({ status: "success", product: raw }, now);
        if (p) parsed.push(p);
        else skipped++;
      }
      await sql.begin((tx) => upsertPackagedProducts(tx, parsed));
      total += parsed.length;
      console.log(
        `page ${page}/${pages}: ${parsed.length} saved (total ${total}, skipped ${skipped})`,
      );
      page++;
      if (page <= Math.min(pages, maxPages)) await sleep(DELAY_MS);
    }
  } finally {
    await sql.end();
  }
  console.log(`Done: ${total} products saved, ${skipped} skipped (no name or code).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
