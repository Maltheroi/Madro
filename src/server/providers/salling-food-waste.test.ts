import { beforeEach, describe, expect, it } from "vitest";
import { clearFoodWasteCache, fetchFoodWaste, parseFoodWaste } from "./salling-food-waste";

// Shape from the API reference example (developer.sallinggroup.dev, food-waste).
const sample = [
  {
    clearances: [
      {
        offer: {
          currency: "DKK",
          discount: 7,
          ean: "20028992",
          endTime: "2026-10-15T22:23:23.000Z",
          lastUpdate: "2026-10-13T13:50:35.000Z",
          newPrice: 15,
          originalPrice: 22,
          percentDiscount: 31.82,
          startTime: "2026-10-13T07:19:19.000Z",
          stock: 4,
          stockUnit: "each",
        },
        product: {
          description: "SF HØNSESALAT 250G",
          ean: "5704000474742",
          image: "https://dam.dsg.dk/x.jpg",
        },
      },
      {
        offer: { newPrice: 10, originalPrice: 20, endTime: "2026-10-12T00:00:00.000Z" },
        product: { description: "UDLØBET TILBUD" },
      },
      { offer: { newPrice: 0 }, product: { description: "GRATIS?" } },
    ],
    store: {
      address: { city: "Århus C", country: "DK", street: "Jægergårdsgade 64-70", zip: "8000" },
      brand: "netto",
      name: "Netto Jægergårdsgade",
      id: "da2957d5-67ec-4f24-9c49-235b6712e063",
    },
  },
];

const now = new Date("2026-10-13T12:00:00Z");

describe("parseFoodWaste", () => {
  it("keeps current clearances as published", () => {
    const [store] = parseFoodWaste(sample, now);
    expect(store).toMatchObject({
      name: "Netto Jægergårdsgade",
      brand: "netto",
      street: "Jægergårdsgade 64-70",
      zip: "8000",
      city: "Århus C",
    });
    expect(store.clearances).toEqual([
      {
        ean: "5704000474742",
        description: "SF HØNSESALAT 250G",
        imageUrl: "https://dam.dsg.dk/x.jpg",
        newPriceOre: 1500,
        originalPriceOre: 2200,
        percentDiscount: 31.82,
        stock: 4,
        stockUnit: "each",
        startTime: "2026-10-13T07:19:19.000Z",
        endTime: "2026-10-15T22:23:23.000Z",
      },
    ]);
  });

  it("ignores malformed input", () => {
    expect(parseFoodWaste(null)).toEqual([]);
    expect(parseFoodWaste([{ store: { id: 1 } }, "x"])).toEqual([]);
  });
});

describe("fetchFoodWaste", () => {
  beforeEach(() => clearFoodWasteCache());

  it("asks by postal code only and caches the answer", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(sample));
    }) as unknown as typeof fetch;
    const a = await fetchFoodWaste("8000", { apiKey: "k", fetchImpl, now });
    const b = await fetchFoodWaste("8000", {
      apiKey: "k",
      fetchImpl,
      now: new Date(now.getTime() + 10 * 60_000),
    });
    expect(urls).toEqual(["https://api.sallinggroup.com/v1/food-waste/?zip=8000"]);
    expect(b.stores).toEqual(a.stores);
    await fetchFoodWaste("8000", {
      apiKey: "k",
      fetchImpl,
      now: new Date(now.getTime() + 31 * 60_000),
    });
    expect(urls).toHaveLength(2);
  });

  it("validates input and configuration", async () => {
    await expect(fetchFoodWaste("8000", { apiKey: undefined })).rejects.toThrow("SALLING_API_KEY");
    await expect(fetchFoodWaste("80000", { apiKey: "k" })).rejects.toThrow("postnummer");
  });
});
