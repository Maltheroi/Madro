import { describe, expect, it } from "vitest";
import {
  dkkToOre,
  fetchLiveOffers,
  parseShelfAtlasOffer,
  retailerSlugFor,
  type ShelfAtlasChain,
} from "./shelfatlas";

const chains = new Map<string, ShelfAtlasChain>([
  ["c-netto", { id: "c-netto", slug: "netto", name: "Netto", country: "DK" }],
  ["c-rema", { id: "c-rema", slug: "rema1000", name: "Rema 1000", displayName: "REMA 1000" }],
]);

const offer = {
  id: "o1",
  chainId: "c-netto",
  storeId: null,
  productId: null,
  rawName: "  Danpo kyllingebrystfilet   900 g ",
  price: "59.95",
  originalPrice: "89.00",
  unitPrice: "66.61",
  unitPriceUnit: "kg",
  currency: "DKK",
  validFrom: "2026-10-10T00:00:00.000Z",
  validTo: "2026-10-16T21:59:59.000Z",
  ingestedAt: "2026-10-12T06:00:00.000Z",
  imageUrl: null,
  volumeMl: null,
  unitCount: 1,
  priceKind: "campaign",
};

describe("dkkToOre", () => {
  it("converts decimal strings and numbers", () => {
    expect(dkkToOre("59.95")).toBe(5995);
    expect(dkkToOre("10")).toBe(1000);
    expect(dkkToOre("4,50")).toBe(450);
    expect(dkkToOre(12.5)).toBe(1250);
  });
  it("rejects missing, zero and nonsense", () => {
    expect(dkkToOre(null)).toBeNull();
    expect(dkkToOre("")).toBeNull();
    expect(dkkToOre("0")).toBeNull();
    expect(dkkToOre("abc")).toBeNull();
  });
});

describe("retailerSlugFor", () => {
  it("maps feed slugs onto existing retailer rows", () => {
    expect(retailerSlugFor("rema1000")).toBe("rema-1000");
    expect(retailerSlugFor("føtex")).toBe("foetex");
    expect(retailerSlugFor("365discount")).toBe("coop-365");
    expect(retailerSlugFor("Min Købmand")).toBe("min-koebmand");
  });
});

describe("parseShelfAtlasOffer", () => {
  it("maps an offer to a promotional offer row", () => {
    expect(parseShelfAtlasOffer(offer, chains)).toEqual({
      sourceKey: "shelfatlas",
      externalId: "o1",
      retailerSlug: "netto",
      retailerName: "Netto",
      title: "Danpo kyllingebrystfilet 900 g",
      priceOre: 5995,
      regularPriceOre: 8900,
      packageQuantity: null,
      packageUnit: null,
      unitPriceOre: 6661,
      unitPriceUnit: "kg",
      validFrom: "2026-10-10T00:00:00.000Z",
      validTo: "2026-10-16T21:59:59.000Z",
      ingestedAt: "2026-10-12T06:00:00.000Z",
    });
  });

  it("uses the display name and ml package size", () => {
    const r = parseShelfAtlasOffer(
      { ...offer, chainId: "c-rema", volumeMl: 1500, unitPrice: null, unitPriceUnit: null },
      chains,
    );
    expect(r?.retailerSlug).toBe("rema-1000");
    expect(r?.retailerName).toBe("REMA 1000");
    expect(r?.packageQuantity).toBe(1500);
    expect(r?.packageUnit).toBe("ml");
    expect(r?.unitPriceOre).toBeNull();
    expect(r?.unitPriceUnit).toBeNull();
  });

  it("drops a before-price that is not higher than the offer", () => {
    expect(
      parseShelfAtlasOffer({ ...offer, originalPrice: "59.95" }, chains)?.regularPriceOre,
    ).toBe(null);
  });

  it("refuses offers it cannot show honestly", () => {
    expect(parseShelfAtlasOffer({ ...offer, price: null }, chains)).toBeNull();
    expect(parseShelfAtlasOffer({ ...offer, chainId: "unknown" }, chains)).toBeNull();
    expect(parseShelfAtlasOffer({ ...offer, currency: "EUR" }, chains)).toBeNull();
    expect(parseShelfAtlasOffer({ ...offer, priceKind: "regular" }, chains)).toBeNull();
    expect(parseShelfAtlasOffer({ ...offer, validTo: "not a date" }, chains)).toBeNull();
    expect(
      parseShelfAtlasOffer({ ...offer, validTo: "2026-10-01T00:00:00.000Z" }, chains),
    ).toBeNull();
    expect(parseShelfAtlasOffer({ ...offer, rawName: "  " }, chains)).toBeNull();
  });
});

function fakeApi(pages: Record<string, { status?: number; body: unknown; quota?: number }>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL) => {
    const u = new URL(String(url));
    const key = u.pathname.split("/").pop()! + (u.searchParams.get("cursor") ?? "");
    calls.push(key);
    const p = pages[key] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(p.body), {
      status: p.status ?? 200,
      headers: p.quota !== undefined ? { "X-Quota-Remaining": String(p.quota) } : {},
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe("fetchLiveOffers", () => {
  const chainBody = { ok: true, data: [...chains.values()] };

  it("pages through all offers", async () => {
    const api = fakeApi({
      chains: { body: chainBody, quota: 900 },
      offers: { body: { ok: true, data: [offer], pagination: { cursor: "p2" } }, quota: 899 },
      offersp2: {
        body: {
          ok: true,
          data: [{ ...offer, id: "o2", chainId: "c-rema" }],
          pagination: { cursor: null },
        },
        quota: 898,
      },
    });
    const r = await fetchLiveOffers({ apiKey: "sa_live_x", fetchImpl: api.impl });
    expect(api.calls).toEqual(["chains", "offers", "offersp2"]);
    expect(r.offers.map((o) => o.externalId)).toEqual(["o1", "o2"]);
    expect(r).toMatchObject({ seen: 2, requests: 3, complete: true, quotaRemaining: 898 });
  });

  it("stops at the request cap and reports an incomplete run", async () => {
    const api = fakeApi({
      chains: { body: chainBody },
      offers: { body: { ok: true, data: [offer], pagination: { cursor: "p2" } } },
    });
    const r = await fetchLiveOffers({ apiKey: "k", fetchImpl: api.impl, maxRequests: 2 });
    expect(r.complete).toBe(false);
    expect(r.offers).toHaveLength(1);
    expect(api.calls).toHaveLength(2);
  });

  it("stops when the monthly quota is nearly used", async () => {
    const api = fakeApi({
      chains: { body: chainBody, quota: 40 },
    });
    const r = await fetchLiveOffers({ apiKey: "k", fetchImpl: api.impl, quotaReserve: 50 });
    expect(r.complete).toBe(false);
    expect(api.calls).toEqual(["chains"]);
  });

  it("stops on monthly_limit_reached without retrying", async () => {
    const api = fakeApi({
      chains: { status: 429, body: { ok: false, error: { code: "monthly_limit_reached" } } },
    });
    const r = await fetchLiveOffers({ apiKey: "k", fetchImpl: api.impl, sleep: async () => {} });
    expect(r.complete).toBe(false);
    expect(api.calls).toEqual(["chains"]);
  });

  it("needs a key", async () => {
    await expect(fetchLiveOffers({ apiKey: undefined })).rejects.toThrow("SHELFATLAS_API_KEY");
  });
});
