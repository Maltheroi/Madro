/**
 * ShelfAtlas offer catalogue (leaflet/campaign offers from Danish chains).
 *
 * Terms we follow (https://shelfatlas.com/legal/terms, /legal/acceptable-use,
 * read 2026-10-13):
 *  - the Free plan (1,000 requests per month, 60 per minute) is for personal,
 *    non-commercial use by an individual. Madro is used that way; any
 *    commercial use needs the Standard plan or higher
 *  - caching is allowed "where your use case allows"; raw bulk data must not
 *    be redistributed, and the data must be shown as coming from ShelfAtlas
 *  - the key stays private (server-side job only, never in the browser)
 *  - the chain's own published price and offer period is what applies
 *
 * Public responses only contain campaign prices (`priceKind: "campaign"`).
 * They are offers, never everyday shelf prices, and are labelled as such.
 */
import type { Unit } from "@/features/nutrition/domain/units";
import type { ProviderInfo } from "./types";
import { ProviderNotConfiguredError } from "./types";

export const SHELFATLAS_API = "https://api.shelfatlas.com/api/v1/public/catalog";
export const SHELFATLAS_LICENCE = "ShelfAtlas Free (personlig, ikke-kommerciel brug)";
const PAGE_SIZE = 200;

export interface ShelfAtlasChain {
  id: string;
  slug: string;
  name: string;
  displayName?: string | null;
  country?: string;
}

export interface OfferRecord {
  sourceKey: "shelfatlas";
  externalId: string;
  retailerSlug: string;
  retailerName: string;
  title: string;
  priceOre: number;
  regularPriceOre: number | null;
  packageQuantity: number | null;
  packageUnit: Unit | null;
  unitPriceOre: number | null;
  unitPriceUnit: "kg" | "l" | "stk" | null;
  validFrom: string;
  validTo: string;
  ingestedAt: string | null;
}

/**
 * The API key lives only in GitHub Actions (the sync job), so the app judges
 * the status from the last successful sync instead of from its own env.
 */
export function shelfAtlasInfo(lastSyncAt: Date | null, now = new Date()): ProviderInfo {
  const recent = lastSyncAt !== null && now.getTime() - lastSyncAt.getTime() < 8 * 86_400_000;
  return {
    key: "shelfatlas",
    name: "ShelfAtlas",
    kinds: ["promotional_offer"],
    status: recent ? "active" : "not_configured",
    licence: SHELFATLAS_LICENCE,
    note: recent
      ? 'Ugens tilbud fra kædernes aviser. Hentes mandag og torsdag af GitHub Actions-jobbet "Synkroniser tilbud (ShelfAtlas)".'
      : 'Ugens tilbud fra kædernes aviser. Ingen vellykket synkronisering de sidste 8 dage: læg en gratis nøgle i GitHub-hemmeligheden SHELFATLAS_API_KEY og kør jobbet "Synkroniser tilbud (ShelfAtlas)".',
    docsUrl: "https://shelfatlas.com/docs",
    requiredEnv: ["SHELFATLAS_API_KEY (GitHub Actions)"],
  };
}

/** Our retailer slugs for chains that already exist as reference rows. */
const KNOWN_SLUGS: Record<string, string> = {
  rema1000: "rema-1000",
  "rema-1000": "rema-1000",
  fotex: "foetex",
  foetex: "foetex",
  "coop-365": "coop-365",
  coop365: "coop-365",
  "365discount": "coop-365",
  "coop-365discount": "coop-365",
};

/** ShelfAtlas chain slug → retailer slug used in this app (`^[a-z0-9-]+$`). */
export function retailerSlugFor(chainSlug: string): string {
  const s = chainSlug
    .toLowerCase()
    .replace(/ø/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return KNOWN_SLUGS[s] ?? s;
}

/** "12.95" (DKK, Postgres numeric) → 1295 øre. Null for anything not a positive amount. */
export function dkkToOre(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/**
 * One API offer → a row for public.promotional_offers. Returns null when the
 * offer cannot be shown honestly (no price, no validity window, unknown chain,
 * or not in DKK).
 */
export function parseShelfAtlasOffer(
  raw: unknown,
  chains: Map<string, ShelfAtlasChain>,
): OfferRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.rawName !== "string") return null;
  if (o.currency !== undefined && o.currency !== "DKK") return null;
  if (o.priceKind !== undefined && o.priceKind !== "campaign") return null;
  const chain = typeof o.chainId === "string" ? chains.get(o.chainId) : undefined;
  if (!chain) return null;
  const priceOre = dkkToOre(o.price);
  if (priceOre === null) return null;
  if (!isIso(o.validFrom) || !isIso(o.validTo)) return null;
  if (Date.parse(o.validTo) < Date.parse(o.validFrom)) return null;
  const title = o.rawName.replace(/\s+/g, " ").trim();
  if (!title) return null;

  const regular = dkkToOre(o.originalPrice);
  const volumeMl = typeof o.volumeMl === "number" && o.volumeMl > 0 ? o.volumeMl : null;
  const unitPriceUnit =
    o.unitPriceUnit === "kg" || o.unitPriceUnit === "l" || o.unitPriceUnit === "stk"
      ? o.unitPriceUnit
      : null;
  const unitPriceOre = unitPriceUnit ? dkkToOre(o.unitPrice) : null;

  return {
    sourceKey: "shelfatlas",
    externalId: o.id,
    retailerSlug: retailerSlugFor(chain.slug),
    retailerName: (chain.displayName || chain.name).slice(0, 80),
    title: title.slice(0, 200),
    priceOre,
    // A "before" price is only kept when it is actually higher than the offer.
    regularPriceOre: regular !== null && regular > priceOre ? regular : null,
    packageQuantity: volumeMl,
    packageUnit: volumeMl ? "ml" : null,
    unitPriceOre,
    unitPriceUnit: unitPriceOre !== null ? unitPriceUnit : null,
    validFrom: new Date(o.validFrom).toISOString(),
    validTo: new Date(o.validTo).toISOString(),
    ingestedAt: isIso(o.ingestedAt) ? new Date(o.ingestedAt).toISOString() : null,
  };
}

export interface FetchOffersResult {
  offers: OfferRecord[];
  seen: number;
  requests: number;
  /** True when every page was read; false when the request budget or quota stopped us. */
  complete: boolean;
  quotaRemaining: number | null;
}

export interface FetchOffersOptions {
  apiKey: string | undefined;
  /** Hard cap on requests in one run, so a sync never eats the monthly quota. */
  maxRequests?: number;
  /** Stop when ShelfAtlas reports fewer monthly requests left than this. */
  quotaReserve?: number;
  chainSlugs?: string[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Reads every live offer (all chains, or the given chains), page by page.
 * Uses 1 request for the chain list plus one per 200 offers.
 */
export async function fetchLiveOffers(opts: FetchOffersOptions): Promise<FetchOffersResult> {
  if (!opts.apiKey)
    throw new ProviderNotConfiguredError("shelfatlas", "SHELFATLAS_API_KEY mangler");
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRequests = opts.maxRequests ?? 80;
  const reserve = opts.quotaReserve ?? 50;
  let requests = 0;
  let quotaRemaining: number | null = null;

  const get = async (path: string): Promise<{ data: unknown[]; cursor: string | null } | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (requests >= maxRequests) return null;
      if (quotaRemaining !== null && quotaRemaining <= reserve) return null;
      requests++;
      const res = await doFetch(`${SHELFATLAS_API}${path}`, {
        headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "application/json" },
      });
      const q = Number(res.headers.get("X-Quota-Remaining"));
      if (res.headers.has("X-Quota-Remaining") && Number.isFinite(q)) quotaRemaining = q;
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        if (JSON.stringify(body).includes("monthly_limit_reached")) return null;
        const wait = Number(res.headers.get("Retry-After"));
        await sleep((Number.isFinite(wait) && wait > 0 ? wait : 5) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`ShelfAtlas ${path.split("?")[0]}: HTTP ${res.status}`);
      const json = (await res.json()) as {
        data?: unknown[];
        pagination?: { cursor?: string | null };
      };
      return {
        data: Array.isArray(json.data) ? json.data : [],
        cursor: json.pagination?.cursor ?? null,
      };
    }
    return null;
  };

  const chainPage = await get("/chains");
  if (!chainPage) return { offers: [], seen: 0, requests, complete: false, quotaRemaining };
  const chains = new Map<string, ShelfAtlasChain>();
  for (const c of chainPage.data as ShelfAtlasChain[]) {
    if (c && typeof c.id === "string" && typeof c.slug === "string") chains.set(c.id, c);
  }

  const offers: OfferRecord[] = [];
  let seen = 0;
  let complete = true;
  const scopes = opts.chainSlugs?.length ? opts.chainSlugs : [null];
  for (const chainSlug of scopes) {
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (chainSlug) params.set("chain_slug", chainSlug);
      if (cursor) params.set("cursor", cursor);
      const page = await get(`/offers?${params}`);
      if (!page) {
        complete = false;
        break;
      }
      seen += page.data.length;
      for (const raw of page.data) {
        const offer = parseShelfAtlasOffer(raw, chains);
        if (offer && offer.retailerSlug) offers.push(offer);
      }
      cursor = page.data.length ? page.cursor : null;
    } while (cursor);
    if (!complete) break;
  }
  return { offers, seen, requests, complete, quotaRemaining };
}
