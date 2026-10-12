/**
 * Rounding rules (see docs/ARCHITECTURE.md#rounding).
 *
 * Calculations always run on unrounded values. Rounding happens only at the
 * presentation or persistence boundary, using these helpers so that every
 * screen and every stored value follows the same rule.
 */

/** Round half away from zero to `decimals` places, robust to binary float error. */
export function roundTo(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const shifted = Math.abs(value) * factor;
  // Nudge by a relative epsilon so 1.005 → 1.01 rather than 1.00.
  const rounded = Math.round(shifted * (1 + Number.EPSILON * 4)) / factor;
  return Math.sign(value) * rounded;
}

/** Energy is shown and stored in whole kilocalories. */
export const roundKcal = (kcal: number) => roundTo(kcal, 0);

/** Macronutrients are shown with one decimal in grams. */
export const roundGrams = (grams: number) => roundTo(grams, 1);

/** Prices are kept in whole øre internally; DKK values round to two decimals. */
export const roundDkk = (dkk: number) => roundTo(dkk, 2);

/** Body weight is shown with one decimal in kilograms. */
export const roundKg = (kg: number) => roundTo(kg, 1);

/**
 * Calorie targets are rounded to the nearest 10 kcal. Finer precision would
 * suggest an accuracy the estimate does not have.
 */
export const roundTargetKcal = (kcal: number) => Math.round(kcal / 10) * 10;

/** Ingredient quantities for display: whole grams up to 100 g, then nearest 5 g. */
export function roundDisplayGrams(grams: number): number {
  if (grams < 100) return Math.max(0, Math.round(grams));
  return Math.round(grams / 5) * 5;
}
