"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/lib/validation/common";
import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";

function FormMessage({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok && state.message)
    return (
      <Alert variant="success">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  if (!state.ok)
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  return null;
}

const err = (s: ActionResult | null, k: string) =>
  s && !s.ok ? s.fieldErrors?.[k]?.[0] : undefined;

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="email" label="E-mail" error={err(state, "email")}>
        <Input name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField id="password" label="Adgangskode" error={err(state, "password")}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <SubmitButton pendingText="Logger ind …">Log ind</SubmitButton>
      <div className="flex justify-between text-sm">
        <Link href="/glemt-adgangskode" className="text-primary underline-offset-4 hover:underline">
          Glemt adgangskode?
        </Link>
        <Link href="/opret-konto" className="text-primary underline-offset-4 hover:underline">
          Opret konto
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField id="email" label="E-mail" error={err(state, "email")}>
        <Input name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField
        id="password"
        label="Adgangskode"
        hint="Mindst 10 tegn med store og små bogstaver og et tal."
        error={err(state, "password")}
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </FormField>
      <div className="grid gap-1.5">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            className="accent-primary mt-0.5 size-5"
            aria-describedby="consent-error"
          />
          <span>
            Jeg har læst{" "}
            <Link href="/privatlivspolitik" className="text-primary underline">
              privatlivspolitikken
            </Link>{" "}
            og giver samtykke til, at Madro behandler mine helbredsoplysninger (vægt, mål og kost)
            for at kunne give mig personlige anbefalinger. Jeg kan til enhver tid trække samtykket
            tilbage ved at slette min konto.
          </span>
        </label>
        {err(state, "consent") ? (
          <p id="consent-error" className="text-destructive text-sm">
            {err(state, "consent")}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingText="Opretter …">Opret konto</SubmitButton>
      <p className="text-sm">
        Har du allerede en konto?{" "}
        <Link href="/log-ind" className="text-primary underline-offset-4 hover:underline">
          Log ind
        </Link>
      </p>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField id="email" label="E-mail" error={err(state, "email")}>
        <Input name="email" type="email" autoComplete="email" required />
      </FormField>
      <SubmitButton pendingText="Sender …">Send link</SubmitButton>
      <Link href="/log-ind" className="text-primary text-sm underline-offset-4 hover:underline">
        Tilbage til log ind
      </Link>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField
        id="password"
        label="Ny adgangskode"
        hint="Mindst 10 tegn med store og små bogstaver og et tal."
        error={err(state, "password")}
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </FormField>
      <SubmitButton>Gem ny adgangskode</SubmitButton>
    </form>
  );
}
