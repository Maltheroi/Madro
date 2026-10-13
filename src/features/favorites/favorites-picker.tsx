"use client";

import { useActionState, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { CUISINE_LABELS_DA, CUISINES, type Cuisine } from "@/features/meal-planning/domain/planner";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PickerRecipe } from "@/server/services/favorites";
import { saveFavoritesAction } from "./actions";

const MIN = 5;
const MAX = 10;

export function FavoritesPicker({
  recipes,
  selectedIds,
  wishes,
  mode,
}: {
  recipes: PickerRecipe[];
  selectedIds: string[];
  wishes: string[];
  mode: "onboarding" | "edit";
}) {
  const [state, action] = useActionState(saveFavoritesAction, null);
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const [cuisine, setCuisine] = useState<Cuisine | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        (!cuisine || r.cuisines.includes(cuisine)) &&
        (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)),
    );
  }, [recipes, cuisine, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX) next.add(id);
      return next;
    });

  const count = selected.size;
  const ready = count >= MIN && count <= MAX;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="mode" value={mode} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="recipeId" value={id} />
      ))}

      <div className="grid gap-3">
        <div role="group" aria-label="Køkken" className="flex flex-wrap gap-2">
          {[null, ...CUISINES].map((c) => (
            <button
              key={c ?? "alle"}
              type="button"
              aria-pressed={cuisine === c}
              onClick={() => setCuisine(c)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm",
                cuisine === c ? "bg-primary text-primary-foreground border-primary" : "bg-card",
              )}
            >
              {c ? CUISINE_LABELS_DA[c] : "Alle"}
            </button>
          ))}
        </div>
        <FormField id="favQuery" label="Søg efter ret">
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </FormField>
      </div>

      <p role="status" aria-live="polite" className="text-sm font-medium">
        {count} valgt{" "}
        <span className="text-muted-foreground font-normal">
          (vælg {MIN}–{MAX})
        </span>
      </p>

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Retter">
        {visible.map((r) => {
          const on = selected.has(r.id);
          const full = !on && count >= MAX;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={full}
                onClick={() => toggle(r.id)}
                className={cn(
                  "bg-card flex h-full w-full items-start gap-3 rounded-lg border p-3 text-left disabled:opacity-50",
                  on && "border-primary ring-primary ring-1",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
                    on && "bg-primary border-primary text-primary-foreground",
                  )}
                >
                  {on ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {[
                      r.cuisines.map((c) => CUISINE_LABELS_DA[c]).join(", "),
                      `${formatInt(r.kcalPerServing)} kcal`,
                      `${formatInt(r.proteinPerServing)} g protein`,
                      `${r.minutes} min`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ingen retter matcher.</p>
      ) : null}

      <FormField
        id="wishes"
        label="Savner du en ret?"
        optional
        hint="Skriv retter, du godt kan lide, som ikke er på listen. Én pr. linje. Vi bruger det til at vælge nye opskrifter."
      >
        <Textarea name="wishes" rows={3} defaultValue={wishes.join("\n")} />
      </FormField>

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-success-foreground text-sm">
          {state.message}
        </p>
      ) : null}
      <div className="bg-background sticky bottom-0 py-3">
        <SubmitButton className="w-full" disabled={!ready}>
          {ready
            ? mode === "onboarding"
              ? "Gem og se min oversigt"
              : "Gem yndlingsretter"
            : `Vælg ${count < MIN ? MIN - count : 0} mere`}
        </SubmitButton>
      </div>
    </form>
  );
}
