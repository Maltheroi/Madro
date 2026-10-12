"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/lib/validation/common";
import { deleteAccountAction, updateTolerancesAction } from "./account-actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="text-success-foreground text-sm">
      {state.message}
    </p>
  ) : (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, null);
  return (
    <form action={action} className="grid gap-3">
      <Feedback state={state} />
      <FormField
        id="confirm"
        label="Skriv SLET for at bekræfte"
        hint="Sletningen kan ikke fortrydes."
      >
        <Input name="confirm" autoComplete="off" />
      </FormField>
      <SubmitButton variant="destructive" pendingText="Sletter …">
        Slet min konto og alle data
      </SubmitButton>
    </form>
  );
}

export function TolerancesForm({
  defaults,
}: {
  defaults: { energy: number; proteinShortfall: number; carbohydrate: number; fat: number };
}) {
  const [state, action] = useActionState(updateTolerancesAction, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  const pct = (n: number) => String(Math.round(n * 1000) / 10).replace(".", ",");
  return (
    <form action={action} className="grid gap-3">
      <Feedback state={state} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="energy" label="Energi ± %" error={err("energy")}>
          <Input name="energy" inputMode="decimal" defaultValue={pct(defaults.energy)} />
        </FormField>
        <FormField
          id="proteinShortfall"
          label="Protein under mål %"
          error={err("proteinShortfall")}
        >
          <Input
            name="proteinShortfall"
            inputMode="decimal"
            defaultValue={pct(defaults.proteinShortfall)}
          />
        </FormField>
        <FormField id="carbohydrate" label="Kulhydrat ± %" error={err("carbohydrate")}>
          <Input
            name="carbohydrate"
            inputMode="decimal"
            defaultValue={pct(defaults.carbohydrate)}
          />
        </FormField>
        <FormField id="fat" label="Fedt ± %" error={err("fat")}>
          <Input name="fat" inputMode="decimal" defaultValue={pct(defaults.fat)} />
        </FormField>
      </div>
      <SubmitButton variant="outline">Gem tolerancer</SubmitButton>
    </form>
  );
}
