/**
 * Imports products sold in Denmark from the Open Food Facts bulk export into
 * public.packaged_products (source_key 'open-food-facts').
 *
 * Usage: DATABASE_URL=... OPEN_FOOD_FACTS_USER_AGENT="Madro/1.0 (kontakt@example.dk)" \
 *        npx tsx scripts/import-off-denmark.ts [--limit=N]
 *
 * Open Food Facts asks bulk users to use the data export rather than the search
 * API, so this streams the gzipped CSV (about 1 GB) once and keeps rows whose
 * countries include Denmark. Data is ODbL and stays in its own table with
 * source and licence on every row.
 */
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import postgres from "postgres";
import { parseOffProduct } from "../src/server/providers/open-food-facts";
import {
  isSoldInDenmark,
  OFF_CSV_URL,
  offCsvRowToProduct,
  parseCsvLine,
} from "../src/server/providers/open-food-facts-dump";
import { upsertPackagedProducts } from "../src/server/providers/packaged-products-store";
import type { CatalogProduct } from "../src/server/providers/types";

const FLUSH_EVERY = 2_000;

const databaseUrl = process.env.DATABASE_URL;
const userAgent = process.env.OPEN_FOOD_FACTS_USER_AGENT;
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

if (!databaseUrl || !userAgent || userAgent.length < 10) {
  console.error("Set DATABASE_URL and OPEN_FOOD_FACTS_USER_AGENT (app name and contact e-mail).");
  process.exit(1);
}

async function download(): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(process.env.OFF_EXPORT_URL ?? OFF_CSV_URL, {
      headers: { "User-Agent": userAgent! },
    });
    if (res.ok && res.body) return res;
    if (attempt >= 4) throw new Error(`Open Food Facts export: HTTP ${res.status}`);
    console.warn(`Export download failed (HTTP ${res.status}), retrying …`);
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
  }
}

async function main() {
  const sql = postgres(databaseUrl!, { max: 1, prepare: false, onnotice: () => {} });
  const retrievedAt = new Date();
  let header: string[] | null = null;
  let scanned = 0;
  let danish = 0;
  let saved = 0;
  let skipped = 0;
  let pending: CatalogProduct[] = [];

  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    saved += await sql.begin((tx) => upsertPackagedProducts(tx, batch));
    console.log(`scanned ${scanned}, Danish ${danish}, saved ${saved}, skipped ${skipped}`);
  };

  try {
    const res = await download();
    const lines = createInterface({
      input: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(
        createGunzip(),
      ),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!header) {
        header = line.split("\t");
        continue;
      }
      scanned++;
      const row = parseCsvLine(header, line);
      if (!isSoldInDenmark(row)) continue;
      danish++;
      const product = parseOffProduct(
        { status: "success", product: offCsvRowToProduct(row) },
        retrievedAt,
      );
      if (product) pending.push(product);
      else skipped++;
      if (pending.length >= FLUSH_EVERY) await flush();
      if (saved + pending.length >= limit) break;
    }
    await flush();
  } finally {
    await sql.end();
  }
  console.log(`Done: ${saved} Danish products saved, ${skipped} skipped (no name or code).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
