import { describe, expect, it } from "vitest";
import { optimizeBasket, packagesNeeded, type OptimizeInput } from "./optimizer";
import { effectivePrice, priceStatus, type PriceObservation } from "@/features/grocery-pricing/domain/prices";
import { consolidateIngredients } from "@/features/shopping-list/domain/consolidate";

const now = new Date("2026-10-12T12:00:00Z");

const obs = (
  id: string,
  productId: string,
  retailerId: string,
  priceOre: number,
  extra: Partial<PriceObservation> = {},
): PriceObservation => ({
  id,
  productId,
  retailerId,
  storeId: null,
  priceOre,
  priceType: "shelf",
  observedAt: "2026-10-12T06:00:00Z",
  sourceKey: "test",
  confidence: "high",
  ...extra,
});

describe("packagesNeeded", () => {
  it("is ceil(q/p)", () => {
    expect(packagesNeeded(1200, 500)).toBe(3);
    expect(packagesNeeded(1000, 500)).toBe(2);
    expect(packagesNeeded(0, 500)).toBe(0);
    // float noise: 0.1 + 0.2 kg in grams vs 300 g package
    expect(packagesNeeded((0.1 + 0.2) * 1000, 300)).toBe(1);
  });
  it("rejects zero package size", () => {
    expect(() => packagesNeeded(1, 0)).toThrow();
  });
});

describe("price freshness", () => {
  it("classifies statuses", () => {
    expect(priceStatus(obs("a", "p", "r", 100), now)).toBe("live");
    expect(priceStatus(obs("a", "p", "r", 100, { observedAt: "2026-10-01T00:00:00Z" }), now)).toBe("stale");
    expect(priceStatus(obs("a", "p", "r", 100, { priceType: "synthetic" }), now)).toBe("synthetic");
    expect(priceStatus(obs("a", "p", "r", 100, { priceType: "manual" }), now)).toBe("estimated");
  });

  it("uses promotions only within validity and when cheaper", () => {
    const list = [
      obs("reg", "p", "r", 2000),
      obs("promo", "p", "r", 1500, { priceType: "promotional", validFrom: "2026-10-10T00:00:00Z", validTo: "2026-10-16T23:59:59Z" }),
      obs("expired", "p", "r", 1000, { priceType: "promotional", validTo: "2026-10-05T00:00:00Z" }),
    ];
    const e = effectivePrice(list, "p", "s1", "r", now)!;
    expect(e.observation.id).toBe("promo");
    expect(e.regularPriceOre).toBe(2000);
  });

  it("prefers fresh over stale and store-specific over chain-wide", () => {
    const list = [
      obs("stale", "p", "r", 900, { observedAt: "2026-09-01T00:00:00Z" }),
      obs("chain", "p", "r", 1100),
      obs("store", "p", "r", 1050, { storeId: "s1" }),
    ];
    expect(effectivePrice(list, "p", "s1", "r", now)!.observation.id).toBe("store");
    expect(effectivePrice(list, "p", "s2", "r", now)!.observation.id).toBe("chain");
  });
});

function baseInput(): OptimizeInput {
  return {
    items: [
      { ingredientId: "havregryn", name: "Havregryn", category: "kolonial", dimension: "mass", quantity: 1200, coveredByPantry: 0, toBuy: 1200, required: true, recipeIds: [] },
      { ingredientId: "maelk", name: "Mælk", category: "mejeri", dimension: "volume", quantity: 1500, coveredByPantry: 0, toBuy: 1500, required: true, recipeIds: [] },
      { ingredientId: "persille", name: "Persille", category: "frugt", dimension: "mass", quantity: 20, coveredByPantry: 0, toBuy: 20, required: false, recipeIds: [] },
    ],
    stores: [
      { id: "s-a", retailerId: "A", name: "Butik A", retailerName: "A" },
      { id: "s-b", retailerId: "B", name: "Butik B", retailerName: "B" },
    ],
    products: [
      { id: "a-oats", retailerId: "A", name: "Havregryn 1 kg", brand: null, packageQuantity: 1, packageUnit: "kg" },
      { id: "a-milk", retailerId: "A", name: "Letmælk 1 l", brand: null, packageQuantity: 1, packageUnit: "l" },
      { id: "a-pers", retailerId: "A", name: "Persille", brand: null, packageQuantity: 50, packageUnit: "g" },
      { id: "b-oats", retailerId: "B", name: "Havregryn 500 g", brand: null, packageQuantity: 500, packageUnit: "g" },
      { id: "b-milk", retailerId: "B", name: "Letmælk 1 l", brand: null, packageQuantity: 1, packageUnit: "l" },
    ],
    matches: [
      { ingredientId: "havregryn", productId: "a-oats", quality: "exact", allergens: ["gluten"] },
      { ingredientId: "maelk", productId: "a-milk", quality: "exact", allergens: ["milk"] },
      { ingredientId: "persille", productId: "a-pers", quality: "exact", allergens: [] },
      { ingredientId: "havregryn", productId: "b-oats", quality: "exact", allergens: ["gluten"] },
      { ingredientId: "maelk", productId: "b-milk", quality: "exact", allergens: ["milk"] },
    ],
    observations: [
      obs("1", "a-oats", "A", 1500),
      obs("2", "a-milk", "A", 1200),
      obs("3", "a-pers", "A", 1000),
      obs("4", "b-oats", "B", 600),
      obs("5", "b-milk", "B", 1100),
    ],
    ingredients: new Map([
      ["havregryn", { id: "havregryn", shelfStable: true }],
      ["maelk", { id: "maelk", shelfStable: false, densityGPerMl: 1.03 }],
      ["persille", { id: "persille", shelfStable: false }],
    ]),
    userAllergens: [],
    mode: "best_value",
    budgetOre: null,
    allowSubstitutes: false,
    now,
  };
}

describe("basket optimizer", () => {
  it("computes package counts and checkout cost per store", () => {
    const res = optimizeBasket(baseInput());
    const a = res.baskets.find((b) => b.store.id === "s-a")!;
    // oats 2 × 15.00, milk 2 × 12.00, parsley 1 × 10.00
    expect(a.checkoutTotalOre).toBe(3000 + 2400 + 1000);
    const b = res.baskets.find((b) => b.store.id === "s-b")!;
    // oats 3 × 6.00, milk 2 × 11.00, parsley optional & missing
    expect(b.checkoutTotalOre).toBe(1800 + 2200);
    expect(b.complete).toBe(true);
    expect(b.unmatched).toEqual([expect.objectContaining({ ingredientId: "persille", required: false })]);
    expect(res.recommended!.store.id).toBe("s-b");
    expect(res.savings).toMatchObject({ againstStoreId: "s-a", amountOre: 2400, verified: true });
  });

  it("separates leftovers from likely waste", () => {
    const res = optimizeBasket(baseInput());
    const a = res.baskets.find((b) => b.store.id === "s-a")!;
    const oats = a.lines.find((l) => l.ingredientId === "havregryn")!;
    expect(oats.leftoverQuantity).toBe(800);
    expect(oats.likelyWasteValueOre).toBe(0); // shelf stable
    const milk = a.lines.find((l) => l.ingredientId === "maelk")!;
    expect(milk.likelyWasteValueOre).toBe(600); // 0.5 l of 12.00
  });

  it("never recommends an incomplete basket and explains missing items", () => {
    const input = baseInput();
    input.observations = input.observations.filter((o) => o.productId !== "b-milk" && o.productId !== "a-oats");
    const res = optimizeBasket(input);
    expect(res.recommended).toBeNull();
    expect(res.explanation[0]).toContain("Ingen butik");
  });

  it("strict budget mode explains the shortfall", () => {
    const res = optimizeBasket({ ...baseInput(), mode: "strict_budget", budgetOre: 3500 });
    expect(res.recommended).toBeNull();
    expect(res.budget).toMatchObject({ cheapestCompleteStoreId: "s-b", shortfallOre: 500 });
    expect(res.budget!.suggestions.length).toBeGreaterThan(0);
  });

  it("strict budget mode returns a basket within budget when possible", () => {
    const res = optimizeBasket({ ...baseInput(), mode: "strict_budget", budgetOre: 4000 });
    expect(res.recommended!.store.id).toBe("s-b");
    expect(res.recommended!.withinBudget).toBe(true);
  });

  it("does not match products that conflict with allergies", () => {
    const res = optimizeBasket({ ...baseInput(), userAllergens: ["gluten"] });
    const b = res.baskets.find((x) => x.store.id === "s-b")!;
    expect(b.unmatched.find((u) => u.ingredientId === "havregryn")!.reason).toBe("allergen_conflict");
    expect(res.recommended).toBeNull();
  });

  it("marks savings as unverified when synthetic prices are involved", () => {
    const input = baseInput();
    input.observations = input.observations.map((o) => ({ ...o, priceType: "synthetic" as const }));
    const res = optimizeBasket(input);
    expect(res.savings!.verified).toBe(false);
    expect(res.explanation.join(" ")).toContain("syntetiske");
  });

  it("does not compare incompatible units", () => {
    const input = baseInput();
    input.items[1] = { ...input.items[1], dimension: "count", quantity: 2, toBuy: 2 };
    const res = optimizeBasket(input);
    const a = res.baskets.find((b) => b.store.id === "s-a")!;
    expect(a.unmatched.find((u) => u.ingredientId === "maelk")!.reason).toBe("incompatible_unit");
  });
});

describe("consolidation", () => {
  it("sums across meals, scales by servings and subtracts pantry", () => {
    const recipes = new Map([
      ["r1", { id: "r1", servings: 4, lines: [{ ingredientId: "ris", quantity: 300, unit: "g" as const }, { ingredientId: "olie", quantity: 2, unit: "spsk" as const }] }],
      ["r2", { id: "r2", servings: 2, lines: [{ ingredientId: "ris", quantity: 150, unit: "g" as const }, { ingredientId: "aeg", quantity: 2, unit: "stk" as const }] }],
    ]);
    const ingredients = new Map([
      ["ris", { id: "ris", name: "Ris", category: "kolonial" }],
      ["olie", { id: "olie", name: "Olie", category: "kolonial", densityGPerMl: 0.92 }],
      ["aeg", { id: "aeg", name: "Æg", category: "mejeri" }],
    ]);
    const items = consolidateIngredients(
      [
        { recipeId: "r1", householdServings: 2 },
        { recipeId: "r2", householdServings: 2 },
      ],
      recipes,
      ingredients,
      [{ ingredientId: "ris", quantity: 100, unit: "g" }],
    );
    const ris = items.find((i) => i.ingredientId === "ris")!;
    expect(ris.quantity).toBe(300);
    expect(ris.toBuy).toBe(200);
    const olie = items.find((i) => i.ingredientId === "olie")!;
    expect(olie.dimension).toBe("mass");
    expect(olie.quantity).toBeCloseTo(13.8);
    const aeg = items.find((i) => i.ingredientId === "aeg")!;
    expect(aeg).toMatchObject({ dimension: "count", quantity: 2 });
  });
});
