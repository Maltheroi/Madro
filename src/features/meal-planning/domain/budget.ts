import type { MealPlanResult } from "./planner";

/**
 * Aims the week at the weekly budget. The planner prices recipes per serving,
 * but the basket buys whole packages (minus the pantry), so the target given
 * to the planner is adjusted over a few rounds until the cheapest complete
 * basket lands just under the budget. Picks the closest result that is not
 * over budget, or the cheapest one when every result is over.
 */
export function planTowardsBudget(
  run: (budgetTargetOre: number) => MealPlanResult,
  budgetOre: number,
  basketTotal: (r: MealPlanResult) => number | null,
): { result: MealPlanResult; basketTotalOre: number | null } {
  const tried: { result: MealPlanResult; total: number }[] = [];
  let target = budgetOre;
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
    const next = Math.round(target * ((budgetOre * 0.99) / total));
    if (Math.abs(next - target) < budgetOre * 0.005) break;
    target = next;
  }
  const within = tried.filter((t) => t.total <= budgetOre).sort((a, b) => b.total - a.total);
  const pick = within[0] ?? [...tried].sort((a, b) => a.total - b.total)[0];
  return { result: pick.result, basketTotalOre: pick.total };
}
