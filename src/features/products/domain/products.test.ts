import { describe, expect, it } from "vitest";
import {
  barcodeVariants,
  hasValidCheckDigit,
  isDanishBarcode,
  normalizeBarcode,
  portionNutrition,
} from "./products";

describe("barcodes", () => {
  it("normalizes typed codes", () => {
    expect(normalizeBarcode(" 5701 234-567892 ")).toBe("5701234567892");
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode("abc12345")).toBeNull();
  });

  it("checks the GS1 check digit", () => {
    expect(hasValidCheckDigit("4006381333931")).toBe(true); // EAN-13
    expect(hasValidCheckDigit("4006381333932")).toBe(false);
    expect(hasValidCheckDigit("96385074")).toBe(true); // EAN-8
    expect(hasValidCheckDigit("036000291452")).toBe(true); // UPC-A
  });

  it("treats UPC-A and zero-padded EAN-13 as the same product", () => {
    expect(barcodeVariants("036000291452")).toEqual(["036000291452", "0036000291452"]);
    expect(barcodeVariants("0036000291452")).toEqual(["0036000291452", "036000291452"]);
  });

  it("recognizes Danish prefixes", () => {
    expect(isDanishBarcode("5701234567892")).toBe(true);
    expect(isDanishBarcode("4006381333931")).toBe(false);
  });
});

describe("portionNutrition", () => {
  it("scales per-100 g values and reports unknown macros", () => {
    const p = portionNutrition({ energyKcal: 60, proteinG: 4, carbohydrateG: null, fatG: 3 }, 150);
    expect(p).toEqual({
      energyKcal: 90,
      proteinG: 6,
      carbohydrateG: 0,
      fatG: 4.5,
      unknown: ["carbohydrateG"],
    });
  });

  it("refuses when energy is unknown", () => {
    expect(
      portionNutrition({ energyKcal: null, proteinG: 1, carbohydrateG: 1, fatG: 1 }, 100),
    ).toBeNull();
  });
});
