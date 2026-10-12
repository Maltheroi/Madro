"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { MEAL_SLOT_LABELS_DA, MEAL_SLOTS } from "@/features/meal-planning/domain/planner";
import type { ActionResult } from "@/lib/validation/common";
import { addEntryAction, deleteEntryAction, setDayCompleteAction } from "./actions";

type Tab = "plan" | "recipe" | "ingredient" | "manual";
const TABS: [Tab, string][] = [
  ["plan", "Fra madplan"],
  ["recipe", "Opskrift"],
  ["ingredient", "Fødevare"],
  ["manual", "Manuelt"],
];

const err = (s: ActionResult | null, k: string) =>
  s && !s.ok ? s.fieldErrors?.[k]?.[0] : undefined;

function SlotSelect() {
  return (
    <FormField id="slot" label="Måltid" optional>
      <NativeSelect name="slot" defaultValue="">
        <option value="">Ikke angivet</option>
        {MEAL_SLOTS.map((s) => (
          <option key={s} value={s}>
            {MEAL_SLOT_LABELS_DA[s]}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
}

export function AddEntryPanel({
  date,
  planned,
  recipes,
  ingredients,
}: {
  date: string;
  planned: { id: string; label: string; logged: boolean }[];
  recipes: { id: string; name: string }[];
  ingredients: { id: string; name: string; states: string[] }[];
}) {
  const [tab, setTab] = useState<Tab>(planned.length ? "plan" : "recipe");
  const [state, action] = useActionState(addEntryAction, null);
  const [ingredientId, setIngredientId] = useState("");
  const states = ingredients.find((i) => i.id === ingredientId)?.states ?? [];
  const STATE_LABELS: Record<string, string> = {
    raw: "Rå",
    cooked: "Tilberedt",
    dried: "Tør",
    canned_drained: "Drænet",
    as_sold: "Som købt",
  };

  return (
    <div className="grid gap-4">
      <div
        role="tablist"
        aria-label="Registreringstype"
        className="bg-muted grid grid-cols-4 gap-1 rounded-lg p-1"
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md px-2 py-2 text-sm ${tab === key ? "bg-card font-medium shadow-xs" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
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

      {tab === "plan" && (
        <div role="tabpanel" className="grid gap-2">
          {planned.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ingen planlagte måltider denne dag.</p>
          ) : null}
          {planned.map((p) => (
            <form
              key={p.id}
              action={action}
              className="bg-card flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <input type="hidden" name="kind" value="planned_meal" />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="plannedMealId" value={p.id} />
              <span className="text-sm">{p.label}</span>
              <SubmitButton variant={p.logged ? "outline" : "default"} pendingText="…">
                {p.logged ? "Registrér igen" : "Registrér"}
              </SubmitButton>
            </form>
          ))}
        </div>
      )}

      {tab === "recipe" && (
        <form role="tabpanel" action={action} className="grid gap-3">
          <input type="hidden" name="kind" value="recipe" />
          <input type="hidden" name="date" value={date} />
          <FormField id="recipeId" label="Opskrift" error={err(state, "recipeId")}>
            <NativeSelect name="recipeId" defaultValue="">
              <option value="">Vælg …</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="servings" label="Portioner" error={err(state, "servings")}>
              <Input name="servings" inputMode="decimal" defaultValue="1" />
            </FormField>
            <SlotSelect />
          </div>
          <SubmitButton>Tilføj</SubmitButton>
        </form>
      )}

      {tab === "ingredient" && (
        <form role="tabpanel" action={action} className="grid gap-3">
          <input type="hidden" name="kind" value="ingredient" />
          <input type="hidden" name="date" value={date} />
          <FormField id="ingredientId" label="Fødevare" error={err(state, "ingredientId")}>
            <NativeSelect
              name="ingredientId"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
            >
              <option value="">Vælg …</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField id="grams" label="Gram" error={err(state, "grams")}>
              <Input name="grams" inputMode="decimal" />
            </FormField>
            <FormField id="state" label="Tilstand">
              <NativeSelect name="state" key={ingredientId}>
                {(states.length ? states : ["raw"]).map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABELS[s] ?? s}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <SlotSelect />
          </div>
          <SubmitButton>Tilføj</SubmitButton>
        </form>
      )}

      {tab === "manual" && (
        <form role="tabpanel" action={action} className="grid gap-3">
          <input type="hidden" name="kind" value="manual" />
          <input type="hidden" name="date" value={date} />
          <FormField id="description" label="Hvad har du spist?" error={err(state, "description")}>
            <Input name="description" />
          </FormField>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField id="energyKcal" label="Kalorier" error={err(state, "energyKcal")}>
              <Input name="energyKcal" inputMode="decimal" />
            </FormField>
            <FormField id="proteinG" label="Protein (g)" optional error={err(state, "proteinG")}>
              <Input name="proteinG" inputMode="decimal" />
            </FormField>
            <FormField
              id="carbohydrateG"
              label="Kulhydrat (g)"
              optional
              error={err(state, "carbohydrateG")}
            >
              <Input name="carbohydrateG" inputMode="decimal" />
            </FormField>
            <FormField id="fatG" label="Fedt (g)" optional error={err(state, "fatG")}>
              <Input name="fatG" inputMode="decimal" />
            </FormField>
          </div>
          <SlotSelect />
          <SubmitButton>Tilføj</SubmitButton>
        </form>
      )}
    </div>
  );
}

export function DeleteEntryButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Slet ${label}`}
      disabled={pending}
      onClick={() => startTransition(() => deleteEntryAction(id))}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

export function DayCompleteToggle({ date, complete }: { date: string; complete: boolean }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(complete);
  return (
    <label className="bg-card flex items-start gap-3 rounded-lg border p-3 text-sm">
      <input
        type="checkbox"
        className="accent-primary mt-0.5 size-5"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setChecked(next);
            await setDayCompleteAction(date, next);
          });
        }}
      />
      <span>
        <span className="font-medium">Dagen er fuldt registreret</span>
        <span className="text-muted-foreground block">
          Markér, når du har registreret alt, du har spist. Kun komplette dage bruges til at
          tilpasse dit kaloriemål.
        </span>
      </span>
    </label>
  );
}
