import { describe, expect, it } from "vitest";
import { parseOffProduct } from "./open-food-facts";
import { isSoldInDenmark, offCsvRowToProduct, parseCsvLine } from "./open-food-facts-dump";

const header = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "countries_tags",
  "allergens",
  "traces_tags",
  "energy-kcal_100g",
  "proteins_100g",
  "carbohydrates_100g",
  "fat_100g",
  "salt_100g",
];

describe("Open Food Facts export", () => {
  const line = [
    "5700000000011",
    "Skyr naturel",
    "Testmejeri,Andet",
    "1 kg",
    "en:denmark,en:sweden",
    "en:milk",
    "",
    "63",
    "11",
    "4",
    "0.2",
    "0.1",
  ].join("\t");

  it("maps a row to a product the API parser understands", () => {
    const row = parseCsvLine(header, line);
    expect(isSoldInDenmark(row)).toBe(true);
    const p = parseOffProduct(
      { status: "success", product: offCsvRowToProduct(row) },
      new Date("2026-10-13T00:00:00Z"),
    );
    expect(p).toMatchObject({
      externalId: "5700000000011",
      gtin: "5700000000011",
      name: "Skyr naturel",
      brand: "Testmejeri",
      packageQuantity: 1,
      packageUnit: "kg",
      allergens: ["milk"],
      dataQuality: "complete",
      nutritionPer100g: { energyKcal: 63, proteinG: 11, carbohydrateG: 4, fatG: 0.2, saltG: 0.1 },
    });
  });

  it("skips products not sold in Denmark", () => {
    const row = parseCsvLine(header, line.replace("en:denmark,", ""));
    expect(isSoldInDenmark(row)).toBe(false);
  });
});
