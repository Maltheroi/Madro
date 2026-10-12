/**
 * Ingredient substitutions.
 *
 * Candidates always come from the catalogue and are filtered by hard
 * constraints (allergens, diet, exclusions) in code. An optional AI provider
 * may only re-rank those candidates and add a short reason; it can never add
 * an ingredient, a nutrition value or a price. If the AI is unavailable or
 * returns anything invalid, the deterministic ranking is used.
 */
import { z } from "zod";

export interface SubstitutionIngredient {
  id: string;
  name: string;
  category: string;
  allergens: string[];
  dietTags: string[];
  /** kcal and protein per 100 g, from the catalogue; null when unknown. */
  energyKcal: number | null;
  proteinG: number | null;
}

export interface SubstitutionConstraints {
  allergens: string[];
  diet: "omnivore" | "pescetarian" | "vegetarian" | "vegan";
  excludedTerms: string[];
}

export interface Substitution {
  ingredientId: string;
  name: string;
  reason: string;
  source: "deterministic" | "ai";
}

/** Diet tags that satisfy each diet (a vegan ingredient is also vegetarian, and so on). */
const DIET_ACCEPTS: Record<SubstitutionConstraints["diet"], string[] | null> = {
  omnivore: null,
  pescetarian: ["pescetarian", "vegetarian", "vegan"],
  vegetarian: ["vegetarian", "vegan"],
  vegan: ["vegan"],
};

export function allowedCandidates(
  target: SubstitutionIngredient,
  all: SubstitutionIngredient[],
  c: SubstitutionConstraints,
): SubstitutionIngredient[] {
  const accepts = DIET_ACCEPTS[c.diet];
  const excluded = c.excludedTerms.map((t) => t.toLowerCase());
  return all.filter(
    (i) =>
      i.id !== target.id &&
      !i.allergens.some((a) => c.allergens.includes(a)) &&
      (accepts === null || i.dietTags.some((t) => accepts.includes(t))) &&
      !excluded.some((t) => i.name.toLowerCase().includes(t)),
  );
}

function similarity(a: SubstitutionIngredient, b: SubstitutionIngredient): number {
  let s = a.category === b.category ? 0 : 10;
  if (a.energyKcal !== null && b.energyKcal !== null)
    s += Math.abs(a.energyKcal - b.energyKcal) / 50;
  else s += 3;
  if (a.proteinG !== null && b.proteinG !== null) s += Math.abs(a.proteinG - b.proteinG) / 5;
  else s += 3;
  return s;
}

export function deterministicSubstitutions(
  target: SubstitutionIngredient,
  all: SubstitutionIngredient[],
  c: SubstitutionConstraints,
  limit = 3,
): Substitution[] {
  return allowedCandidates(target, all, c)
    .filter((i) => i.category === target.category)
    .sort(
      (x, y) => similarity(target, x) - similarity(target, y) || x.name.localeCompare(y.name, "da"),
    )
    .slice(0, limit)
    .map((i) => ({
      ingredientId: i.id,
      name: i.name,
      reason: "Samme varegruppe og lignende næringsindhold.",
      source: "deterministic" as const,
    }));
}

export const aiSubstitutionSchema = z.object({
  suggestions: z
    .array(z.object({ ingredientId: z.string(), reason: z.string().min(3).max(160) }))
    .max(5),
});

export interface AiProvider {
  name: string;
  /** Returns raw JSON text; validation happens in `aiRankedSubstitutions`. */
  complete(system: string, user: string): Promise<string>;
}

/** Validates AI output against the candidate list; falls back on any problem. */
export async function aiRankedSubstitutions(
  provider: AiProvider | null,
  target: SubstitutionIngredient,
  all: SubstitutionIngredient[],
  c: SubstitutionConstraints,
  limit = 3,
): Promise<Substitution[]> {
  const fallback = deterministicSubstitutions(target, all, c, limit);
  if (!provider) return fallback;
  const candidates = allowedCandidates(target, all, c);
  if (candidates.length === 0) return fallback;
  const byId = new Map(candidates.map((i) => [i.id, i]));
  try {
    const text = await provider.complete(
      'Du hjælper med at finde erstatninger for en ingrediens i danske opskrifter. Vælg KUN blandt de givne kandidater (brug deres id). Opfind aldrig næringsværdier eller priser. Svar kun med JSON: {"suggestions":[{"ingredientId":"...","reason":"kort begrundelse på dansk"}]}',
      JSON.stringify({
        erstat: target.name,
        kandidater: candidates.map((i) => ({ id: i.id, navn: i.name, gruppe: i.category })),
        maks: limit,
      }),
    );
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const parsed = aiSubstitutionSchema.parse(json);
    const valid = parsed.suggestions.filter((s) => byId.has(s.ingredientId)).slice(0, limit);
    if (valid.length === 0) return fallback;
    return valid.map((s) => ({
      ingredientId: s.ingredientId,
      name: byId.get(s.ingredientId)!.name,
      reason: s.reason,
      source: "ai" as const,
    }));
  } catch {
    return fallback;
  }
}
