import type { MealPlanResult } from "./planner";

/** Fixed extra starting points when the budget is out of reach, so the cheapest plan found is stable. */
const EXTRA_SEEDS = [1, 2, 3];

/**
 * Aims the week at the weekly budget. The planner's own cost model is a
 * simplification of the basket optimizer, so the target given to the planner
 * is adjusted over a few rounds until the cheapest complete basket lands just
 * under the budget. Picks the closest result that is not over budget,
 * preferring plans that meet every nutrition target.
 *
 * When the planner cannot reach the budget at all, lowering its target does
 * not help; instead it is restarted from a few fixed seeds and the cheapest
 * plan wins, so "the cheapest plan" does not depend on a lucky start.
 */
export function planTowardsBudget(
  run: (budgetTargetOre: number, seed?: number) => MealPlanResult,
  budgetOre: number,
  basketTotal: (r: MealPlanResult) => number | null,
): { result: MealPlanResult; basketTotalOre: number | null } {
  const tried: { result: MealPlanResult; total: number }[] = [];
  let target = budgetOre;
  let outOfReach = false;
  for (let round = 0; round < 5; round++) {
    const result = run(target);
    const total = basketTotal(result);
    if (total === null) {
      const first = tried[0];
      return first
        ? { result: first.result, basketTotalOre: first.total }
        : { result, basketTotalOre: null };
    }
    tried.push({ result, total });
    if (total <= budgetOre && total >= budgetOre * 0.97) break;
    const fit = result.budgetFit;
    if (total > budgetOre && fit && fit.costOre > fit.targetOre * 1.01) {
      outOfReach = true;
      break;
    }
    const next = Math.round(target * ((budgetOre * 0.99) / total));
    if (Math.abs(next - target) < budgetOre * 0.005) break;
    target = next;
  }
  if (outOfReach) {
    for (const seed of EXTRA_SEEDS) {
      // Target 1 øre: pure cost minimisation, so the cheapest plan does not depend on the budget.
      const result = run(1, seed);
      const total = basketTotal(result);
      if (total !== null) tried.push({ result, total });
    }
  }
  // Plans that meet every nutrition target come first.
  const valid = tried.filter((t) => t.result.valid);
  const pool = valid.length > 0 ? valid : tried;
  const within = pool.filter((t) => t.total <= budgetOre).sort((a, b) => b.total - a.total);
  const pick = within[0] ?? [...pool].sort((a, b) => a.total - b.total)[0];
  return { result: pick.result, basketTotalOre: pick.total };
}
