/**
 * Provider contracts. Every external data source is wrapped in one of these
 * interfaces so the rest of the app never depends on a specific vendor, and so
 * a source can be swapped when licences or commercial terms change.
 *
 * Providers return evidence with provenance (source key, licence, observed
 * time). They never invent values: unknown is `null`, not a guess.
 */
import type { Unit } from "@/features/nutrition/domain/units";
import type { PriceType } from "@/features/grocery-pricing/domain/prices";

export type ProviderKind =
  "nutrition" | "product_catalog" | "retailer_price" | "promotional_offer" | "store_availability";

/**
 *  active              configured and allowed to run
 *  fixture             development fixtures only; never real-world data
 *  not_configured      implemented, but credentials or settings are missing
 *  awaiting_agreement  needs a licence, contract or written permission first
 */
export type ProviderStatus = "active" | "fixture" | "not_configured" | "awaiting_agreement";

export interface ProviderInfo {
  key: string;
  name: string;
  kinds: ProviderKind[];
  status: ProviderStatus;
  licence: string;
  /** Short Danish explanation for the admin page. */
  note: string;
  docsUrl?: string;
  /** Env vars this provider needs (names only; values are never exposed). */
  requiredEnv?: string[];
}

export interface Per100g {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  sugarsG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  fiberG: number | null;
  saltG: number | null;
}

export interface CatalogProduct {
  sourceKey: string;
  externalId: string;
  gtin: string | null;
  name: string;
  brand: string | null;
  packageQuantity: number | null;
  packageUnit: Unit | null;
  allergens: string[];
  traces: string[];
  nutritionPer100g: Per100g | null;
  /** Nutrition basis as reported by the source. */
  nutritionBasis: "as_sold" | "prepared" | null;
  dataQuality: "complete" | "partial" | "minimal";
  licence: string;
  sourceUrl: string | null;
  retrievedAt: string;
}

export interface PriceEvidence {
  sourceKey: string;
  externalProductId: string;
  retailerSlug: string;
  storeExternalId: string | null;
  priceOre: number;
  priceType: Exclude<PriceType, "manual">;
  observedAt: string;
  validFrom: string | null;
  validTo: string | null;
  confidence: "high" | "medium" | "low";
  isSynthetic: boolean;
}

export interface StoreRecord {
  sourceKey: string;
  externalId: string;
  retailerSlug: string;
  name: string;
  postalCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ProductCatalogProvider {
  info: ProviderInfo;
  getByGtin(gtin: string): Promise<CatalogProduct | null>;
}

export interface RetailerPriceProvider {
  info: ProviderInfo;
  fetchPrices(opts: { retailerSlug: string; since?: Date }): Promise<PriceEvidence[]>;
}

export interface PromotionalOfferProvider {
  info: ProviderInfo;
  fetchOffers(opts: { retailerSlug?: string; postalCode?: string }): Promise<PriceEvidence[]>;
}

export interface StoreAvailabilityProvider {
  info: ProviderInfo;
  fetchStores(opts: { retailerSlug?: string; postalCode?: string }): Promise<StoreRecord[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(
    public readonly providerKey: string,
    reason: string,
  ) {
    super(`${providerKey}: ${reason}`);
  }
}
