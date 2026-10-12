"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/lib/validation/common";
import {
  addMeasurementAction,
  addWeightAction,
  decideRecommendationAction,
  deleteMeasurementAction,
  deleteWeightAction,
  evaluateRecommendationAction,
} from "./actions";

const err = (s: ActionResult | null, k: string) =>
  s && !s.ok ? s.fieldErrors?.[k]?.[0] : undefined;

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok)
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  return state.message ? (
    <p role="status" className="text-success-foreground text-sm">
      {state.message}
    </p>
  ) : null;
}

export function WeightForm({ today }: { today: string }) {
  const [state, action] = useActionState(addWeightAction, null);
  return (
    <form action={action} className="grid gap-3">
      <Feedback state={state} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="weightKg" label="Vægt (kg)" error={err(state, "weightKg")}>
          <Input name="weightKg" inputMode="decimal" placeholder="f.eks. 82,4" />
        </FormField>
        <FormField id="weight-date" label="Dato" error={err(state, "date")}>
          <Input id="weight-date" name="date" type="date" defaultValue={today} max={today} />
        </FormField>
      </div>
      <FormField id="note" label="Note" optional>
        <Input name="note" maxLength={200} />
      </FormField>
      <SubmitButton>Gem vægt</SubmitButton>
    </form>
  );
}

export function MeasurementForm({ today }: { today: string }) {
  const [state, action] = useActionState(addMeasurementAction, null);
  return (
    <form action={action} className="grid gap-3">
      <Feedback state={state} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField id="waistCm" label="Talje (cm)" optional error={err(state, "waistCm")}>
          <Input name="waistCm" inputMode="decimal" />
        </FormField>
        <FormField
          id="bodyFatPercent"
          label="Fedt (%)"
          optional
          error={err(state, "bodyFatPercent")}
        >
          <Input name="bodyFatPercent" inputMode="decimal" />
        </FormField>
        <FormField id="m-date" label="Dato" error={err(state, "date")}>
          <Input id="m-date" name="date" type="date" defaultValue={today} max={today} />
        </FormField>
      </div>
      <SubmitButton variant="outline">Gem måling</SubmitButton>
    </form>
  );
}

export function DeleteButton({
  id,
  label,
  kind,
}: {
  id: string;
  label: string;
  kind: "weight" | "measurement";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Slet ${label}`}
      disabled={pending}
      onClick={() =>
        startTransition(() =>
          kind === "weight" ? deleteWeightAction(id) : deleteMeasurementAction(id),
        )
      }
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

export function EvaluateButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            const r = await evaluateRecommendationAction();
            setError(r.ok ? null : r.error);
          })
        }
      >
        {pending ? "Vurderer …" : "Vurdér mit kaloriemål nu"}
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

export function DecisionButtons({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (accept: boolean) =>
    startTransition(async () => {
      const r = await decideRecommendationAction(id, accept);
      setError(r.ok ? null : r.error);
    });
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => decide(true)}>
          Acceptér nyt mål
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide(false)}>
          Behold nuværende
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
