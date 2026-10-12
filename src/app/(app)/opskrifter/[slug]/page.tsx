import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NutritionConfidenceBadge, PriceStatusBadge } from "@/components/data-badges";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { loadCatalog } from "@/server/services/catalog";
import { NUTRIENT_KEYS, type NutrientKey } from "@/features/nutrition/domain/recipe-nutrition";
import { UNIT_LABELS_DA } from "@/features/nutrition/domain/units";
import { MEAL_SLOT_LABELS_DA } from "@/features/meal-planning/domain/planner";
import { ALLERGEN_LABEL } from "@/features/profile/constants";
import { formatDecimal, formatInt, formatKr } from "@/lib/format";
import { FavoriteButton } from "@/features/meal-planning/favorite-button";

export const metadata: Metadata = { title: "Opskrift" };

const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energyKcal: "Energi",
  proteinG: "Protein",
  carbohydrateG: "Kulhydrat",
  fatG: "Fedt",
  fiberG: "Kostfibre",
  sugarsG: "Sukkerarter",
  saturatedFatG: "Mættet fedt",
  saltG: "Salt",
};

const MISSING_REASON: Record<string, string> = {
  no_facts: "ingen næringsdata",
  unit_not_convertible: "mængden kan ikke omregnes til gram",
  state_not_convertible: "mangler data for tilberedningstilstanden",
  nutrient_missing: "mangler enkelte næringsstoffer",
};

const STATE_LABEL: Record<string, string> = { raw: "rå", cooked: "tilberedt", dried: "tør", canned_drained: "drænet", as_sold: "" };

export default async function RecipePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ portioner?: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const { portioner } = await searchParams;
  const { catalog, isFavorite } = await withUser(user.id, async (tx) => {
    const catalog = await loadCatalog(tx);
    const recipe = catalog.recipes.find((r) => r.slug === slug);
    const fav = recipe ? await tx`select 1 from public.recipe_favorites where user_id = ${user.id} and recipe_id = ${recipe.id}` : [];
    return { catalog, isFavorite: fav.length > 0 };
  });
  const recipe = catalog.recipes.find((r) => r.slug === slug);
  if (!recipe) notFound();

  const portion = Math.min(4, Math.max(0.25, Number(portioner) || 1));
  const n = recipe.nutrition;
  const scale = portion / recipe.servings;
  const sources = [...new Map(recipe.lines.flatMap((l) => catalog.ingredients.get(l.ingredientId)?.sources ?? []).map((s) => [s.key, s])).values()];

  return (
    <article className="grid gap-6">
      <Link href="/madplan" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Til madplanen
      </Link>
      <header className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {recipe.mealTypes.map((m) => (
            <Badge key={m} variant="secondary">
              {MEAL_SLOT_LABELS_DA[m]}
            </Badge>
          ))}
          {recipe.dietTags.includes("vegan") ? <Badge variant="success">Vegansk</Badge> : recipe.dietTags.includes("vegetarian") ? <Badge variant="success">Vegetarisk</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
        <p className="text-muted-foreground">{recipe.description}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-4" /> {recipe.prepMinutes + recipe.cookMinutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-4" /> Opskriften giver {formatDecimal(recipe.servings).replace(",0", "")} portioner
          </span>
          <FavoriteButton recipeId={recipe.id} initial={isFavorite} />
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Næring pr. {portion === 1 ? "portion" : `${String(portion).replace(".", ",")} portioner`}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <NutritionConfidenceBadge confidence={n.confidence} completeness={n.completeness} />
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <caption className="sr-only">Næringsindhold</caption>
              <tbody className="divide-y">
                {NUTRIENT_KEYS.map((k) => {
                  const v = n.perServing[k] * portion;
                  const incomplete = n.incompleteNutrients.includes(k);
                  return (
                    <tr key={k}>
                      <th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">
                        {NUTRIENT_LABELS[k]}
                      </th>
                      <td className="py-1.5 text-right font-medium">
                        {k === "energyKcal" ? `${formatInt(v)} kcal` : `${formatDecimal(v)} g`}
                        {incomplete ? <span className="ml-1 text-xs text-warning-foreground" title="Ufuldstændige data">*</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {n.incompleteNutrients.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">* Mindst én ingrediens mangler data for dette næringsstof, så værdien er for lav.</p>
            ) : null}
            {n.issues.filter((i) => i.reason !== "nutrient_missing").length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-xs text-warning-foreground">
                {n.issues
                  .filter((i) => i.reason !== "nutrient_missing")
                  .map((i) => (
                    <li key={i.ingredientId}>
                      {i.name}: {MISSING_REASON[i.reason]}
                    </li>
                  ))}
              </ul>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              Beregnet ud fra de faktiske ingrediensmængder. Kilder: {sources.map((s) => s.name).join(", ") || "ingen"}.
            </p>
            {recipe.allergens.length > 0 ? (
              <p className="mt-3 text-sm">
                <strong>Allergener:</strong> {recipe.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ")}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Ingen af de 14 hovedallergener ud fra ingredienslisten.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span>Anslået pris pr. portion: {recipe.cost.perServingOre === null ? "ukendt" : formatKr(recipe.cost.perServingOre)}</span>
              {recipe.cost.statuses.map((s) => (
                <PriceStatusBadge key={s} status={s} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingredienser til {String(portion).replace(".", ",")} portion{portion === 1 ? "" : "er"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {recipe.lines.map((l, i) => {
                const q = l.quantity * scale;
                const shown = q >= 10 ? Math.round(q) : Math.round(q * 10) / 10;
                return (
                  <li key={i} className="flex justify-between gap-3 py-2">
                    <span>
                      {l.ingredientName}
                      {STATE_LABEL[l.state] ? <span className="text-muted-foreground"> ({STATE_LABEL[l.state]})</span> : null}
                      {l.optional ? <span className="text-muted-foreground"> · valgfri</span> : null}
                    </span>
                    <span className="font-medium whitespace-nowrap">
                      {String(shown).replace(".", ",")} {UNIT_LABELS_DA[l.unit]}
                    </span>
                  </li>
                );
              })}
            </ul>
            <h3 className="mt-6 font-semibold">Fremgangsmåde</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              {recipe.instructions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </article>
  );
}
