/**
 * Price observations and freshness rules.
 *
 * A price observation is immutable evidence: who reported which price for
 * which product, where, when and of which kind. "Current price" is always a
 * derived judgement made here, with explicit freshness thresholds. A stale or
 * synthetic price is never presented as a current verified price.
 */

export const PRICE_TYPES = ["shelf", "online", "promotional", "manual", "synthetic"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const PRICE_TYPE_LABELS_DA: Record<PriceType, string> = {
  shelf: "Hyldepris",
  online: "Onlinepris",
  promotional: "Tilbudspris",
  manual: "Indtastet af dig",
  synthetic: "Syntetisk testpris",
};

export interface PriceObservation {
  id: string;
  productId: string;
  retailerId: string;
  /** Null means the price applies chain-wide. */
  storeId: string | null;
  priceOre: number;
  priceType: PriceType;
  observedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  sourceKey: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Status shown to the user:
 *  live       — fresh observation from an authorised live provider
 *  stale      — older than the freshness threshold; shown as indicative only
 *  estimated  — user-entered or derived, not verified by a provider
 *  synthetic  — development fixture data, never a real-world price
 */
export type PriceStatus = "live" | "stale" | "estimated" | "synthetic";

export const PRICE_STATUS_LABELS_DA: Record<PriceStatus, string> = {
  live: "Aktuel",
  stale: "Forældet",
  estimated: "Estimeret",
  synthetic: "Syntetisk",
};

/** Maximum age before an observation is considered stale, per price type. */
export const FRESHNESS_THRESHOLD_HOURS: Record<PriceType, number> = {
  shelf: 72,
  online: 48,
  promotional: 24 * 7,
  manual: 24 * 30,
  synthetic: Number.POSITIVE_INFINITY,
};

export function ageHours(observedAt: string, now: Date): number {
  return (now.getTime() - new Date(observedAt).getTime()) / 3_600_000;
}

export function isWithinValidity(o: PriceObservation, now: Date): boolean {
  if (o.validFrom && new Date(o.validFrom) > now) return false;
  if (o.validTo && new Date(o.validTo) < now) return false;
  return true;
}

export function priceStatus(o: PriceObservation, now: Date): PriceStatus {
  if (o.priceType === "synthetic") return "synthetic";
  if (o.priceType === "manual") {
    return "estimated";
  }
  if (ageHours(o.observedAt, now) > FRESHNESS_THRESHOLD_HOURS[o.priceType]) return "stale";
  return "live";
}

const STATUS_RANK: Record<PriceStatus, number> = { live: 0, estimated: 1, synthetic: 2, stale: 3 };

export interface EffectivePrice {
  observation: PriceObservation;
  status: PriceStatus;
  /** Regular (non-promotional) price for comparison when a promotion applies. */
  regularPriceOre: number | null;
}

/**
 * Choose the price a shopper at `storeId` can expect today:
 *  - promotional prices only within their validity window
 *  - store-specific observations over chain-wide ones of equal quality
 *  - better status first, then most recent
 *  - an applicable promotion wins if it is cheaper than the regular price
 */
export function effectivePrice(
  observations: PriceObservation[],
  productId: string,
  storeId: string,
  retailerId: string,
  now: Date,
): EffectivePrice | null {
  const relevant = observations.filter(
    (o) =>
      o.productId === productId &&
      o.retailerId === retailerId &&
      (o.storeId === null || o.storeId === storeId) &&
      new Date(o.observedAt) <= now,
  );
  const sortFn = (a: PriceObservation, b: PriceObservation) =>
    STATUS_RANK[priceStatus(a, now)] - STATUS_RANK[priceStatus(b, now)] ||
    Number(b.storeId !== null) - Number(a.storeId !== null) ||
    b.observedAt.localeCompare(a.observedAt);

  const regular = relevant.filter((o) => o.priceType !== "promotional").sort(sortFn)[0];
  const promo = relevant
    .filter((o) => o.priceType === "promotional" && isWithinValidity(o, now))
    .sort(sortFn)[0];

  if (promo && (!regular || promo.priceOre < regular.priceOre)) {
    return { observation: promo, status: priceStatus(promo, now), regularPriceOre: regular?.priceOre ?? null };
  }
  if (!regular) return null;
  return { observation: regular, status: priceStatus(regular, now), regularPriceOre: null };
}
