"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { fieldErrorsOf, type ActionResult } from "@/lib/validation/common";
import { logEvent } from "@/lib/observability/log";

const email = z.email({ error: "Angiv en gyldig e-mailadresse." }).max(254);
const password = z
  .string()
  .min(10, "Adgangskoden skal være mindst 10 tegn.")
  .max(128)
  .regex(/[a-zæøå]/, "Adgangskoden skal indeholde et lille bogstav.")
  .regex(/[A-ZÆØÅ]/, "Adgangskoden skal indeholde et stort bogstav.")
  .regex(/[0-9]/, "Adgangskoden skal indeholde et tal.");

/** Only allow same-site relative redirects. */
function safeNext(next: unknown, fallback: string): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Map Supabase auth errors to Danish messages without leaking account existence. */
function authErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Forkert e-mail eller adgangskode.";
    case "email_not_confirmed":
      return "Bekræft din e-mailadresse via linket, vi har sendt dig, før du logger ind.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "For mange forsøg. Vent lidt, og prøv igen.";
    case "weak_password":
      return "Adgangskoden er for svag. Vælg en længere adgangskode.";
    default:
      return fallback;
  }
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1, "Angiv din adgangskode.") }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logEvent("auth.sign_in_failed", { code: error.code });
    return { ok: false, error: authErrorMessage(error.code, "Du kunne ikke logges ind. Prøv igen.") };
  }
  redirect(safeNext(formData.get("next"), "/oversigt"));
}

export async function signUp(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      email,
      password,
      consent: z.literal("on", { error: "Du skal acceptere privatlivspolitikken for at oprette en konto." }),
    })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), consent: formData.get("consent") });
  if (!parsed.success) return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${getEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/onboarding` },
  });
  if (error) {
    logEvent("auth.sign_up_failed", { code: error.code });
    return { ok: false, error: authErrorMessage(error.code, "Kontoen kunne ikke oprettes. Prøv igen.") };
  }
  if (data.session) redirect("/onboarding");
  return {
    ok: true,
    message: "Tjek din indbakke. Vi har sendt et link, som bekræfter din e-mailadresse.",
  };
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ email }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/ny-adgangskode`,
  });
  if (error) logEvent("auth.reset_failed", { code: error.code });
  // Same response whether or not the account exists.
  return { ok: true, message: "Hvis der findes en konto med den e-mail, har vi sendt et link til at nulstille adgangskoden." };
}

export async function updatePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ password }).safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorMessage(error.code, "Adgangskoden kunne ikke opdateres. Linket kan være udløbet.") };
  redirect("/oversigt");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
