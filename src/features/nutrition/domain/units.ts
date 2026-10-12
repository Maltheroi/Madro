/**
 * Unit conversion for ingredient quantities.
 *
 * Every quantity is normalised to one of three base dimensions:
 *   mass   → grams (g)
 *   volume → millilitres (ml)
 *   count  → pieces (stk)
 *
 * Converting between dimensions requires ingredient-specific data (density or
 * average piece weight). When that data is missing the conversion returns
 * `null` so callers can flag the line instead of guessing.
 */

export const UNITS = ["g", "kg", "ml", "dl", "l", "tsk", "spsk", "stk"] as const;
export type Unit = (typeof UNITS)[number];

export type Dimension = "mass" | "volume" | "count";

const UNIT_TABLE: Record<Unit, { dimension: Dimension; toBase: number }> = {
  g: { dimension: "mass", toBase: 1 },
  kg: { dimension: "mass", toBase: 1000 },
  ml: { dimension: "volume", toBase: 1 },
  dl: { dimension: "volume", toBase: 100 },
  l: { dimension: "volume", toBase: 1000 },
  // Danish kitchen measures: teske 5 ml, spiseske 15 ml.
  tsk: { dimension: "volume", toBase: 5 },
  spsk: { dimension: "volume", toBase: 15 },
  stk: { dimension: "count", toBase: 1 },
};

export const UNIT_LABELS_DA: Record<Unit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  dl: "dl",
  l: "l",
  tsk: "tsk.",
  spsk: "spsk.",
  stk: "stk.",
};

export function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value);
}

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_TABLE[unit].dimension;
}

export interface BaseQuantity {
  dimension: Dimension;
  /** Value in g, ml or stk depending on dimension. */
  value: number;
}

export function toBase(quantity: number, unit: Unit): BaseQuantity {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`Invalid quantity: ${quantity}`);
  }
  const { dimension, toBase: factor } = UNIT_TABLE[unit];
  return { dimension, value: quantity * factor };
}

/** Physical properties that allow conversion between dimensions. */
export interface ConversionData {
  /** Grams per millilitre. Water is 1.0, oil ≈ 0.92, flour ≈ 0.55. */
  densityGPerMl?: number | null;
  /** Average edible grams per piece (stk), e.g. one egg ≈ 50–60 g. */
  gramsPerPiece?: number | null;
}

/** Convert any quantity to grams, or `null` if the ingredient lacks the data. */
export function toGrams(quantity: number, unit: Unit, data: ConversionData = {}): number | null {
  const base = toBase(quantity, unit);
  switch (base.dimension) {
    case "mass":
      return base.value;
    case "volume":
      return data.densityGPerMl && data.densityGPerMl > 0 ? base.value * data.densityGPerMl : null;
    case "count":
      return data.gramsPerPiece && data.gramsPerPiece > 0 ? base.value * data.gramsPerPiece : null;
  }
}

/**
 * Convert a quantity into another unit. Same-dimension conversion is exact;
 * cross-dimension conversion goes through grams and needs ConversionData.
 */
export function convert(
  quantity: number,
  from: Unit,
  to: Unit,
  data: ConversionData = {},
): number | null {
  const fromDim = dimensionOf(from);
  const toDim = dimensionOf(to);
  if (fromDim === toDim) {
    return (quantity * UNIT_TABLE[from].toBase) / UNIT_TABLE[to].toBase;
  }
  const grams = toGrams(quantity, from, data);
  if (grams === null) return null;
  switch (toDim) {
    case "mass":
      return grams / UNIT_TABLE[to].toBase;
    case "volume":
      return data.densityGPerMl ? grams / data.densityGPerMl / UNIT_TABLE[to].toBase : null;
    case "count":
      return data.gramsPerPiece ? grams / data.gramsPerPiece : null;
  }
}
