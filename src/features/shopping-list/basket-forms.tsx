"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { UNIT_LABELS_DA, UNITS, type Unit } from "@/features/nutrition/domain/units";
import { addManualPriceAction, calculateBasketAction, upsertPantryAction } from "./actions";

export function CalculateBasketForm({
  hasBudget,
  defaultMode,
}: {
  hasBudget: boolean;
  defaultMode: "best_value" | "strict_budget";
}) {
  const [state, action] = useActionState(calculateBasketAction, null);
  return (
    <form action={action} className="grid gap-3">
      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Hvad er vigtigst?</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="best_value"
            defaultChecked={defaultMode === "best_value"}
            className="accent-primary mt-1"
          />
          <span>
            <span className="font-medium">Bedste værdi</span>
            <span className="text-muted-foreground block">
              Lav pris, men også mindre madspild og gode varematch.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="strict_budget"
            disabled={!hasBudget}
            defaultChecked={defaultMode === "strict_budget"}
            className="accent-primary mt-1"
          />
          <span>
            <span className="font-medium">Hold budgettet</span>
            <span className="text-muted-foreground block">
              {hasBudget
                ? "Kun kurve inden for dit ugebudget."
                : "Angiv et ugebudget i din profil for at bruge denne."}
            </span>
          </span>
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowSubstitutes" className="accent-primary size-4" />
        Tillad erstatningsvarer (tjekkes stadig for allergener)
      </label>
      <SubmitButton pendingText="Beregner …">Beregn kurv</SubmitButton>
    </form>
  );
}

export function ManualPriceForm({
  productId,
  storeId,
  label,
}: {
  productId: string;
  storeId: string | null;
  label: string;
}) {
  const [state, action] = useActionState(addManualPriceAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="storeId" value={storeId ?? ""} />
      <label className="sr-only" htmlFor={`price-${productId}`}>
        Pris for {label} i kr.
      </label>
      <Input
        id={`price-${productId}`}
        name="price"
        inputMode="decimal"
        placeholder="kr."
        className="h-9 w-24"
      />
      <SubmitButton variant="outline" size="sm" pendingText="…">
        Gem pris
      </SubmitButton>
      {state ? (
        <span className={`text-xs ${state.ok ? "text-success-foreground" : "text-destructive"}`}>
          {state.ok ? "Gemt" : state.error}
        </span>
      ) : null}
    </form>
  );
}

export function PantryForm({
  ingredients,
}: {
  ingredients: { id: string; name: string; defaultUnit: Unit }[];
}) {
  const [state, action] = useActionState(upsertPantryAction, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form action={action} className="grid gap-3">
      {state ? (
        state.ok ? (
          <p role="status" className="text-success-foreground text-sm">
            {state.message}
          </p>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )
      ) : null}
      <FormField id="ingredientId" label="Fødevare" error={err("ingredientId")}>
        <NativeSelect name="ingredientId" defaultValue="">
          <option value="">Vælg …</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField id="quantity" label="Mængde" error={err("quantity")}>
          <Input name="quantity" inputMode="decimal" />
        </FormField>
        <FormField id="unit" label="Enhed">
          <NativeSelect name="unit" defaultValue="g">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS_DA[u]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="expiresOn" label="Holdbar til" optional error={err("expiresOn")}>
          <Input name="expiresOn" type="date" />
        </FormField>
      </div>
      <SubmitButton>Gem</SubmitButton>
    </form>
  );
}
