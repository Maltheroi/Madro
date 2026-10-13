import "server-only";
import type { SessionUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getEnv } from "@/lib/env";
import { getProfile } from "@/server/repositories/profile";
import { getRequiredItems } from "@/server/services/shopping";
import { matchOffersToItems } from "@/features/offers/domain/match";
import { fetchFoodWaste, type FoodWasteStore } from "@/server/providers/salling-food-waste";
import { logError } from "@/lib/observability/log";

export interface OfferView {
  id: string;
  title: string;
  retailerSlug: string;
  retailerName: string;
  priceOre: number;
  regularPriceOre: number | null;
  unitPriceOre: number | null;
  unitPriceUnit: "kg" | "l" | "stk" | null;
  validFrom: string;
  validTo: string;
  sourceKey: string;
}

const MAX_RESULTS = 120;

function toView(r: Record<string, unknown>): OfferView {
  return {
    id: r.id as string,
    title: r.title as string,
    retailerSlug: r.retailer_slug as string,
    retailerName: r.retailer_name as string,
    priceOre: r.price_ore as number,
    regularPriceOre: (r.regular_price_ore as number | null) ?? null,
    unitPriceOre: (r.unit_price_ore as number | null) ?? null,
    unitPriceUnit: (r.unit_price_unit as OfferView["unitPriceUnit"]) ?? null,
    validFrom: new Date(r.valid_from as string).toISOString(),
    validTo: new Date(r.valid_to as string).toISOString(),
    sourceKey: r.source_key as string,
  };
}

/** Escape LIKE wildcards in user input. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Offers valid now (or starting within two days), optionally filtered by a
 * search text and a chain. Shared catalogue data, read as the signed-in user.
 */
export async function searchOffers(
  user: SessionUser,
  opts: { q?: string; retailer?: string },
): Promise<{
  offers: OfferView[];
  retailers: { slug: string; name: string }[];
  total: number;
  lastSyncAt: Date | null;
}> {
  const q = opts.q?.trim().slice(0, 60) ?? "";
  const retailer = opts.retailer && /^[a-z0-9-]{1,64}$/.test(opts.retailer) ? opts.retailer : null;
  return withUser(user.id, async (tx) => {
    const [rows, retailers, [sync]] = await Promise.all([
      tx`
        select o.id, o.title, o.price_ore, o.regular_price_ore, o.unit_price_ore, o.unit_price_unit,
               o.valid_from, o.valid_to, o.source_key, r.slug as retailer_slug, r.name as retailer_name,
               count(*) over ()::int as total
        from public.promotional_offers o join public.retailers r on r.id = o.retailer_id
        where o.valid_to >= now() and o.valid_from <= now() + interval '2 days'
          ${q ? tx`and lower(o.title) like ${"%" + likeEscape(q.toLowerCase()) + "%"}` : tx``}
          ${retailer ? tx`and r.slug = ${retailer}` : tx``}
        order by ${q ? tx`o.price_ore` : tx`r.name, o.title`}
        limit ${MAX_RESULTS}`,
      tx`
        select distinct r.slug, r.name
        from public.promotional_offers o join public.retailers r on r.id = o.retailer_id
        where o.valid_to >= now()
        order by r.name`,
      tx`select max(last_seen_at) as at from public.promotional_offers`,
    ]);
    return {
      offers: rows.map(toView),
      retailers: retailers.map((r) => ({ slug: r.slug as string, name: r.name as string })),
      total: (rows[0]?.total as number | undefined) ?? 0,
      lastSyncAt: (sync?.at as Date | null) ?? null,
    };
  });
}

/** Current offers that match this week's shopping needs, per ingredient. */
export async function offersForMyList(
  user: SessionUser,
): Promise<{ ingredientId: string; name: string; offers: OfferView[] }[] | null> {
  const required = await getRequiredItems(user);
  if (!required) return null;
  const items = required.items.filter((i) => i.toBuy > 0);
  if (!items.length) return [];
  const { offers, synonyms } = await withUser(user.id, async (tx) => {
    const [offers, synonyms] = await Promise.all([
      tx`
        select o.id, o.title, o.price_ore, o.regular_price_ore, o.unit_price_ore, o.unit_price_unit,
               o.valid_from, o.valid_to, o.source_key, r.slug as retailer_slug, r.name as retailer_name
        from public.promotional_offers o join public.retailers r on r.id = o.retailer_id
        where o.valid_to >= now() and o.valid_from <= now() + interval '2 days'`,
      tx`select id, synonyms from public.ingredients where id in ${tx(items.map((i) => i.ingredientId))}`,
    ]);
    return {
      offers: offers.map(toView),
      synonyms: new Map(synonyms.map((s) => [s.id as string, s.synonyms as string[]])),
    };
  });
  const matches = matchOffersToItems(
    items.map((i) => ({
      key: i.ingredientId,
      name: i.name,
      synonyms: synonyms.get(i.ingredientId),
    })),
    offers,
    3,
  );
  return items
    .filter((i) => matches.has(i.ingredientId))
    .map((i) => ({
      ingredientId: i.ingredientId,
      name: i.name,
      offers: matches.get(i.ingredientId)!,
    }));
}

export type FoodWasteResult =
  | { status: "ok"; postalCode: string; stores: FoodWasteStore[]; fetchedAt: Date }
  | { status: "not_configured"; postalCode: string | null }
  | { status: "no_postal_code"; postalCode: string | null }
  | { status: "error"; postalCode: string | null };

/** Salling clearances near the user's postal code (only the postal code is sent). */
export async function foodWasteNearMe(user: SessionUser): Promise<FoodWasteResult> {
  const profile = await withUser(user.id, (tx) => getProfile(tx, user.id));
  const postalCode = profile?.postalCode ?? null;
  const apiKey = getEnv().SALLING_API_KEY;
  if (!apiKey) return { status: "not_configured", postalCode };
  if (!postalCode || !/^\d{4}$/.test(postalCode)) return { status: "no_postal_code", postalCode };
  try {
    const r = await fetchFoodWaste(postalCode, { apiKey });
    return { status: "ok", postalCode, ...r };
  } catch (e) {
    logError("salling_food_waste_failed", e);
    return { status: "error", postalCode };
  }
}
