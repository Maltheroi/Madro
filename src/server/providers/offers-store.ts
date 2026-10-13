import type postgres from "postgres";
import type { OfferRecord } from "./shelfatlas";

const BATCH = 500;

/**
 * Writes provider offers to public.promotional_offers. Used by
 * scripts/sync-shelfatlas-offers.ts, so it must not import server-only
 * modules. Runs with the database owner role (the sync job), never as a user.
 *
 * Chains that are not retailers yet are added with the feed's own name.
 * Returns the number of offers written.
 */
export async function upsertOffers(
  tx: postgres.TransactionSql,
  offers: OfferRecord[],
  seenAt: Date,
  syncJobId: string | null,
): Promise<number> {
  const unique = [...new Map(offers.map((o) => [`${o.sourceKey}:${o.externalId}`, o])).values()];
  if (!unique.length) return 0;

  const chains = [...new Map(unique.map((o) => [o.retailerSlug, o.retailerName])).entries()].map(
    ([slug, name]) => ({ slug, name }),
  );
  await tx`insert into public.retailers ${tx(chains)} on conflict (slug) do nothing`;
  const retailerRows = await tx`
    select id, slug from public.retailers where slug in ${tx(chains.map((c) => c.slug))}`;
  const retailerId = new Map(retailerRows.map((r) => [r.slug as string, r.id as string]));

  for (let i = 0; i < unique.length; i += BATCH) {
    const rows = unique.slice(i, i + BATCH).map((o) => ({
      retailer_id: retailerId.get(o.retailerSlug)!,
      source_key: o.sourceKey,
      external_id: o.externalId,
      title: o.title,
      price_ore: o.priceOre,
      regular_price_ore: o.regularPriceOre,
      package_quantity: o.packageQuantity,
      package_unit: o.packageUnit,
      unit_price_ore: o.unitPriceOre,
      unit_price_unit: o.unitPriceUnit,
      valid_from: o.validFrom,
      valid_to: o.validTo,
      source_ingested_at: o.ingestedAt,
      last_seen_at: seenAt.toISOString(),
      sync_job_id: syncJobId,
    }));
    await tx`
      insert into public.promotional_offers ${tx(rows)}
      on conflict (source_key, external_id) do update set
        retailer_id = excluded.retailer_id, title = excluded.title,
        price_ore = excluded.price_ore, regular_price_ore = excluded.regular_price_ore,
        package_quantity = excluded.package_quantity, package_unit = excluded.package_unit,
        unit_price_ore = excluded.unit_price_ore, unit_price_unit = excluded.unit_price_unit,
        valid_from = excluded.valid_from, valid_to = excluded.valid_to,
        source_ingested_at = excluded.source_ingested_at, last_seen_at = excluded.last_seen_at,
        sync_job_id = excluded.sync_job_id`;
  }
  return unique.length;
}

/**
 * Removes offers that ended more than a week ago, and (after a complete sync)
 * offers the feed no longer lists. Returns the number of rows deleted.
 */
export async function pruneOffers(
  tx: postgres.TransactionSql,
  sourceKey: string,
  opts: { completeSyncStartedAt: Date | null },
): Promise<number> {
  const expired = await tx`
    delete from public.promotional_offers
    where source_key = ${sourceKey} and valid_to < now() - interval '7 days'`;
  let withdrawn = 0;
  if (opts.completeSyncStartedAt) {
    const res = await tx`
      delete from public.promotional_offers
      where source_key = ${sourceKey} and last_seen_at < ${opts.completeSyncStartedAt.toISOString()}`;
    withdrawn = res.count;
  }
  return expired.count + withdrawn;
}
