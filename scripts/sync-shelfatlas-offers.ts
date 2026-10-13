/**
 * Syncs current leaflet offers from ShelfAtlas into public.promotional_offers.
 *
 * Usage: DATABASE_URL=... SHELFATLAS_API_KEY=sa_live_... \
 *        npx tsx scripts/sync-shelfatlas-offers.ts [--chains=netto,rema-1000] [--max-requests=80]
 *
 * Runs twice a week from GitHub Actions ("Synkroniser tilbud (ShelfAtlas)").
 * A full run is one request for the chain list plus one per 200 offers
 * (about 35 in October 2026), well inside the free plan's 1,000 a month. The
 * run stops early if the request cap or the monthly quota is reached; then it
 * keeps what it has and does not remove anything as withdrawn.
 */
import postgres from "postgres";
import { pruneOffers, upsertOffers } from "../src/server/providers/offers-store";
import { fetchLiveOffers } from "../src/server/providers/shelfatlas";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = process.env.SHELFATLAS_API_KEY;
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] || undefined;
const chainSlugs = (arg("chains") ?? process.env.SHELFATLAS_CHAINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const maxRequests = Number(arg("max-requests") ?? 80);

if (!databaseUrl || !apiKey) {
  console.error("Set DATABASE_URL and SHELFATLAS_API_KEY.");
  process.exit(1);
}

async function main() {
  const sql = postgres(databaseUrl!, { max: 1, prepare: false, onnotice: () => {} });
  const startedAt = new Date();
  const [job] = await sql`
    insert into public.data_sync_jobs (provider_key, job_type, status, started_at, metadata)
    values ('shelfatlas', 'offers', 'running', ${startedAt.toISOString()},
            ${sql.json({ chains: chainSlugs.length ? chainSlugs : "all" })})
    returning id`;
  try {
    const result = await fetchLiveOffers({ apiKey, maxRequests, chainSlugs });
    const written = await sql.begin(async (tx) => {
      const n = await upsertOffers(tx, result.offers, startedAt, job.id);
      // Only a complete, unfiltered sync may conclude that an offer was withdrawn.
      const removed = await pruneOffers(tx, "shelfatlas", {
        completeSyncStartedAt: result.complete && !chainSlugs.length ? startedAt : null,
      });
      console.log(`removed ${removed} expired or withdrawn offers`);
      return n;
    });
    await sql`
      update public.data_sync_jobs set
        status = ${result.complete ? "succeeded" : "failed"}, finished_at = now(),
        records_seen = ${result.seen}, records_written = ${written},
        error_message = ${result.complete ? null : "Stoppet før alle sider var hentet (kvote eller loft over kald)."},
        metadata = metadata || ${sql.json({ requests: result.requests, quotaRemaining: result.quotaRemaining })}
      where id = ${job.id}`;
    console.log(
      `seen ${result.seen}, saved ${written}, requests ${result.requests}, quota left ${result.quotaRemaining ?? "?"}, complete ${result.complete}`,
    );
    if (!result.complete) process.exitCode = 1;
  } catch (e) {
    await sql`
      update public.data_sync_jobs set status = 'failed', finished_at = now(),
        error_message = ${String(e instanceof Error ? e.message : e).slice(0, 500)}
      where id = ${job.id}`;
    throw e;
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
