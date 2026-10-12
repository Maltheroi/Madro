import { describe, expect, it } from "vitest";
import {
  aiRankedSubstitutions,
  allowedCandidates,
  deterministicSubstitutions,
  type AiProvider,
  type SubstitutionIngredient,
} from "./substitutions";

const ing = (
  id: string,
  category: string,
  extra: Partial<SubstitutionIngredient> = {},
): SubstitutionIngredient => ({
  id,
  name: id,
  category,
  allergens: [],
  dietTags: ["vegan", "vegetarian", "pescetarian"],
  energyKcal: 100,
  proteinG: 5,
  ...extra,
});

const all = [
  ing("mandler", "nødder", { allergens: ["nuts"], energyKcal: 600 }),
  ing("solsikkekerner", "nødder", { energyKcal: 580 }),
  ing("graeskarkerner", "nødder", { energyKcal: 560 }),
  ing("kylling", "kød", { dietTags: [], proteinG: 23 }),
  ing("tofu", "kød", { proteinG: 12 }),
  ing("laks", "kød", { dietTags: ["pescetarian"], proteinG: 20 }),
];
const none = { allergens: [], diet: "omnivore" as const, excludedTerms: [] };

describe("substitutions", () => {
  it("filters allergens, diet and exclusions", () => {
    expect(
      allowedCandidates(all[3], all, { ...none, allergens: ["nuts"] }).map((i) => i.id),
    ).not.toContain("mandler");
    expect(
      allowedCandidates(all[3], all, { ...none, diet: "vegetarian" }).map((i) => i.id),
    ).not.toContain("laks");
    expect(
      allowedCandidates(all[3], all, { ...none, diet: "pescetarian" }).map((i) => i.id),
    ).toContain("laks");
    expect(
      allowedCandidates(all[3], all, { ...none, excludedTerms: ["TOFU"] }).map((i) => i.id),
    ).not.toContain("tofu");
  });

  it("ranks same-category candidates by nutritional similarity", () => {
    expect(deterministicSubstitutions(all[3], all, none).map((s) => s.ingredientId)).toEqual([
      "laks",
      "tofu",
    ]);
  });

  it("uses valid AI rankings but ignores invented ingredients", async () => {
    const ai: AiProvider = {
      name: "fake",
      complete: async () =>
        JSON.stringify({
          suggestions: [
            { ingredientId: "opfundet", reason: "findes ikke" },
            { ingredientId: "tofu", reason: "Plantebaseret protein." },
          ],
        }),
    };
    const res = await aiRankedSubstitutions(ai, all[3], all, none);
    expect(res).toEqual([
      { ingredientId: "tofu", name: "tofu", reason: "Plantebaseret protein.", source: "ai" },
    ]);
  });

  it("never lets AI pick an allergen-conflicting candidate", async () => {
    const ai: AiProvider = {
      name: "fake",
      complete: async () =>
        JSON.stringify({ suggestions: [{ ingredientId: "mandler", reason: "Lignende." }] }),
    };
    const res = await aiRankedSubstitutions(ai, all[1], all, { ...none, allergens: ["nuts"] });
    expect(res.every((s) => s.ingredientId !== "mandler")).toBe(true);
    expect(res[0].source).toBe("deterministic");
  });

  it("falls back on malformed output or errors", async () => {
    const bad: AiProvider = { name: "fake", complete: async () => "ikke json" };
    const err: AiProvider = {
      name: "fake",
      complete: async () => Promise.reject(new Error("down")),
    };
    expect((await aiRankedSubstitutions(bad, all[3], all, none))[0].source).toBe("deterministic");
    expect((await aiRankedSubstitutions(err, all[3], all, none))[0].source).toBe("deterministic");
  });
});
