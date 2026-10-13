/**
 * Pure helpers for packaged products (barcodes and per-portion nutrition).
 */

/** Strips spaces and dashes; returns null unless 8, 12, 13 or 14 digits. */
export function normalizeBarcode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  return digits;
}

/** GS1 check digit (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-A codes are often stored by Open Food Facts as EAN-13 with a leading zero. */
export function barcodeVariants(code: string): string[] {
  if (code.length === 12) return [code, `0${code}`];
  if (code.length === 13 && code.startsWith("0")) return [code, code.slice(1)];
  return [code];
}

/** Danish GS1 prefixes are 570–579. */
export const isDanishBarcode = (code: string) => code.length === 13 && /^57\d/.test(code);

export interface ProductNutrition {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
}

export interface PortionNutrition {
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  /** Macros the product has no value for; counted as 0 and shown to the user. */
  unknown: ("proteinG" | "carbohydrateG" | "fatG")[];
}

/** Nutrition for a portion in grams from per-100 g values, or null if energy is unknown. */
export function portionNutrition(per100: ProductNutrition, grams: number): PortionNutrition | null {
  if (per100.energyKcal === null || !(grams > 0)) return null;
  const f = grams / 100;
  const unknown = (["proteinG", "carbohydrateG", "fatG"] as const).filter(
    (k) => per100[k] === null,
  );
  return {
    energyKcal: per100.energyKcal * f,
    proteinG: (per100.proteinG ?? 0) * f,
    carbohydrateG: (per100.carbohydrateG ?? 0) * f,
    fatG: (per100.fatG ?? 0) * f,
    unknown: [...unknown],
  };
}
