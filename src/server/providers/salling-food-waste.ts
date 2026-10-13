/**
 * Salling Group Anti Food Waste API: short-dated items marked down in Netto,
 * føtex, Bilka and Basalt stores near a postal code.
 *
 * Terms we follow (Developer Program Terms and Conditions v1.0 and the API
 * reference at developer.sallinggroup.dev, read 2026-10-13):
 *  - free of charge; a back-end API key kept on the server
 *  - data is only shown in the app, reproduced as Salling presents it (§3.2),
 *    not changed or passed on (§3.3), and not stored: responses live in
 *    memory for a short time only (§3.5 asks for deletion within a month)
 *  - no personal data is sent: only a postal code (§3.6)
 *  - quota 100 requests a day plus spike protection, so lookups are cached
 *
 * These are clearance prices on items close to their date, with stock that
 * is "only an indicator". They are never used as regular shelf prices.
 */
import type { ProviderInfo } from "./types";
import { ProviderNotConfiguredError } from "./types";

export const SALLING_FOOD_WASTE_URL = "https://api.sallinggroup.com/v1/food-waste/";

export interface Clearance {
  ean: string | null;
  description: string;
  imageUrl: string | null;
  newPriceOre: number;
  originalPriceOre: number | null;
  percentDiscount: number | null;
  stock: number | null;
  stockUnit: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface FoodWasteStore {
  id: string;
  name: string;
  brand: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  clearances: Clearance[];
}

export function sallingInfo(apiKey: string | undefined): ProviderInfo {
  return {
    key: "salling-group",
    name: "Salling Group (madspild)",
    kinds: ["promotional_offer", "store_availability"],
    status: apiKey ? "active" : "not_configured",
    licence: "Salling Group Developer Program, gratis",
    note: apiKey
      ? "Nedsatte varer med kort holdbarhed i Netto, føtex og Bilka nær dit postnummer. Gemmes ikke, kun kort i hukommelsen."
      : "Nedsatte varer med kort holdbarhed i Netto, føtex og Bilka. Kræver en gratis API-nøgle (SALLING_API_KEY).",
    docsUrl: "https://developer.sallinggroup.dev/apireference/food-waste",
    requiredEnv: ["SALLING_API_KEY"],
  };
}

const kr = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (v: unknown): string | null =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

/** The API response (an array of stores with clearances) → stores we can show. */
export function parseFoodWaste(raw: unknown, now = new Date()): FoodWasteStore[] {
  if (!Array.isArray(raw)) return [];
  const stores: FoodWasteStore[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { store, clearances } = entry as {
      store?: Record<string, unknown>;
      clearances?: unknown;
    };
    if (!store || typeof store.id !== "string" || typeof store.name !== "string") continue;
    const address = (store.address ?? {}) as Record<string, unknown>;
    const items: Clearance[] = [];
    for (const c of Array.isArray(clearances) ? clearances : []) {
      const offer = (c?.offer ?? {}) as Record<string, unknown>;
      const product = (c?.product ?? {}) as Record<string, unknown>;
      const newPriceOre = kr(offer.newPrice);
      const description = str(product.description);
      if (newPriceOre === null || !description) continue;
      const endTime = iso(offer.endTime);
      // An offer that has already ended is not shown.
      if (endTime && Date.parse(endTime) < now.getTime()) continue;
      const original = kr(offer.originalPrice);
      const pct = typeof offer.percentDiscount === "number" ? offer.percentDiscount : null;
      items.push({
        ean: str(product.ean) ?? str(offer.ean),
        description,
        imageUrl: str(product.image),
        newPriceOre,
        originalPriceOre: original !== null && original > newPriceOre ? original : null,
        percentDiscount: pct !== null && pct > 0 && pct < 100 ? pct : null,
        stock: typeof offer.stock === "number" && offer.stock >= 0 ? offer.stock : null,
        stockUnit: str(offer.stockUnit),
        startTime: iso(offer.startTime),
        endTime,
      });
    }
    stores.push({
      id: store.id,
      name: store.name,
      brand: typeof store.brand === "string" ? store.brand : "",
      street: str(address.street),
      zip: str(address.zip),
      city: str(address.city),
      clearances: items,
    });
  }
  return stores;
}

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; stores: FoodWasteStore[] }>();

/**
 * Clearances near a Danish postal code. Results are cached in memory for 30
 * minutes per postal code (the daily quota is 100 requests).
 */
export async function fetchFoodWaste(
  postalCode: string,
  opts: { apiKey: string | undefined; fetchImpl?: typeof fetch; now?: Date },
): Promise<{ stores: FoodWasteStore[]; fetchedAt: Date }> {
  if (!opts.apiKey)
    throw new ProviderNotConfiguredError("salling-group", "SALLING_API_KEY mangler");
  if (!/^\d{4}$/.test(postalCode)) throw new Error("Ugyldigt postnummer");
  const now = opts.now ?? new Date();
  const hit = cache.get(postalCode);
  if (hit && now.getTime() - hit.at < CACHE_MS)
    return { stores: hit.stores, fetchedAt: new Date(hit.at) };

  const res = await (opts.fetchImpl ?? fetch)(`${SALLING_FOOD_WASTE_URL}?zip=${postalCode}`, {
    headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Salling food waste: HTTP ${res.status}`);
  const stores = parseFoodWaste(await res.json(), now);
  cache.set(postalCode, { at: now.getTime(), stores });
  // Keep the cache small; drop entries older than the cache window.
  for (const [k, v] of cache) if (now.getTime() - v.at >= CACHE_MS) cache.delete(k);
  return { stores, fetchedAt: now };
}

/** For tests. */
export function clearFoodWasteCache() {
  cache.clear();
}
