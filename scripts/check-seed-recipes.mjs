#!/usr/bin/env node
// Sanity checks for the development recipe catalog (supabase/seed-data).
// Usage: node scripts/check-seed-recipes.mjs [file ...]   (default: all recipe files)
import { allIngredients, allRecipes, CUISINES } from "../supabase/seed-data/index.mjs";

const ML = { ml: 1, dl: 100, l: 1000, tsk: 5, spsk: 15 };
const ing = new Map(allIngredients.map((i) => [i[0], i]));
const SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const errors = [];
const seen = new Set();
const rows = [];

for (const r of allRecipes) {
  const [slug, name, desc, servings, , , mealTypes, difficulty, steps, lines, cuisines = []] = r;
  const e = (m) => errors.push(`${slug}: ${m}`);
  if (!/^[a-z0-9-]+$/.test(slug)) e("bad slug");
  if (seen.has(slug)) e("duplicate slug");
  seen.add(slug);
  if (!name || !desc) e("missing name/description");
  if (!(servings > 0)) e("servings");
  if (!mealTypes.length || mealTypes.some((m) => !SLOTS.includes(m))) e("meal types");
  if (!["beginner", "intermediate", "advanced"].includes(difficulty)) e("difficulty");
  if (!steps.length) e("no steps");
  if (cuisines.some((c) => !CUISINES.includes(c))) e(`unknown cuisine ${cuisines}`);
  let kcal = 0,
    p = 0,
    c = 0,
    f = 0;
  for (const [s, qty, unit, state] of lines) {
    const i = ing.get(s);
    if (!i) {
      e(`unknown ingredient ${s}`);
      continue;
    }
    if (state !== i[6]) e(`${s}: state ${state}, expected ${i[6]}`);
    const o = i[5];
    let g = null;
    if (unit === "g") g = qty;
    else if (unit === "kg") g = qty * 1000;
    else if (ML[unit] && o.density) g = qty * ML[unit] * o.density;
    else if (unit === "stk" && o.gpp) g = qty * o.gpp;
    if (g === null) {
      e(`${s}: unit ${unit} not convertible`);
      continue;
    }
    kcal += (i[7] * g) / 100;
    p += (i[8] * g) / 100;
    c += (i[9] * g) / 100;
    f += (i[10] * g) / 100;
  }
  const per = (x) => Math.round(x / servings);
  if (per(kcal) < 120 || per(kcal) > 1100) e(`kcal per serving ${per(kcal)} out of range`);
  rows.push(
    `${slug.padEnd(40)} ${String(per(kcal)).padStart(5)} kcal  P${String(per(p)).padStart(3)}  C${String(per(c)).padStart(3)}  F${String(per(f)).padStart(3)}  ${mealTypes.join("/")}  [${cuisines.join(",")}]`,
  );
}
if (process.argv.includes("--list")) console.log(rows.join("\n"));
console.log(`${allRecipes.length} recipes, ${allIngredients.length} ingredients`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
