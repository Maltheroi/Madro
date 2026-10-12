import { describe, expect, it, vi } from "vitest";
import { createOpenFoodFactsProvider, parseOffProduct } from "./open-food-facts";

const now = new Date("2026-10-12T10:00:00Z");

const sample = {
  status: "success",
  product: {
    code: "5701234567890",
    product_name: "Skyr naturel",
    product_name_da: "Skyr naturel",
    brands: "Testmejeri, Andet",
    product_quantity: "1000",
    product_quantity_unit: "g",
    allergens_tags: ["en:milk", "en:unknown"],
    traces_tags: ["en:nuts"],
    nutrition_data_per: "100g",
    nutriments: {
      "energy-kcal_100g": 63,
      proteins_100g: 11,
      carbohydrates_100g: 4,
      fat_100g: 0.2,
      salt_100g: "0,1",
    },
  },
};

describe("parseOffProduct", () => {
  it("maps fields, allergens and nutrition", () => {
    const p = parseOffProduct(sample, now)!;
    expect(p).toMatchObject({
      externalId: "5701234567890",
      gtin: "5701234567890",
      name: "Skyr naturel",
      brand: "Testmejeri",
      packageQuantity: 1000,
      packageUnit: "g",
      allergens: ["milk"],
      traces: ["nuts"],
      dataQuality: "complete",
      nutritionBasis: "as_sold",
    });
    expect(p.nutritionPer100g).toMatchObject({
      energyKcal: 63,
      proteinG: 11,
      saltG: 0.1,
      fiberG: null,
    });
  });

  it("derives kcal from kJ and parses free-text quantity", () => {
    const p = parseOffProduct(
      {
        status: "success",
        product: {
          code: "12345678",
          product_name: "Juice",
          quantity: "1,5 l",
          nutriments: { "energy-kj_100g": 184 },
        },
      },
      now,
    )!;
    expect(p.packageQuantity).toBe(1.5);
    expect(p.packageUnit).toBe("l");
    expect(p.nutritionPer100g!.energyKcal).toBeCloseTo(44);
    expect(p.dataQuality).toBe("partial");
  });

  it("does not use per-serving nutrition or guess missing data", () => {
    const p = parseOffProduct(
      {
        status: "success",
        product: {
          code: "12345678",
          product_name: "X",
          nutrition_data_per: "serving",
          nutriments: { proteins_100g: 3 },
        },
      },
      now,
    )!;
    expect(p.nutritionPer100g).toBeNull();
    expect(p.dataQuality).toBe("minimal");
    expect(p.packageQuantity).toBeNull();
  });

  it("rejects failures and nameless products", () => {
    expect(parseOffProduct({ status: "failure" }, now)).toBeNull();
    expect(parseOffProduct({ status: "success", product: { code: "1" } }, now)).toBeNull();
    expect(parseOffProduct(null, now)).toBeNull();
  });
});

describe("Open Food Facts provider", () => {
  it("requires a User-Agent", async () => {
    await expect(createOpenFoodFactsProvider(undefined).getByGtin("5701234567890")).rejects.toThrow(
      /User-Agent/,
    );
  });

  it("sends the User-Agent and handles 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));
    const provider = createOpenFoodFactsProvider(
      "Madro/0.1 (kontakt@example.dk)",
      fetchImpl as unknown as typeof fetch,
    );
    expect(await provider.getByGtin("5701234567890")).toBeNull();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v3/product/5701234567890");
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("Madro");
  });

  it("ignores invalid barcodes without calling the API", async () => {
    const fetchImpl = vi.fn();
    const provider = createOpenFoodFactsProvider("ua", fetchImpl as unknown as typeof fetch);
    expect(await provider.getByGtin("abc")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
