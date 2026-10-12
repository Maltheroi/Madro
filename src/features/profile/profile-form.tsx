"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { describeNote, estimateEnergy, RATE_LIMITS } from "@/features/nutrition/domain/energy";
import { formatInt } from "@/lib/format";
import { parseDanishNumber } from "@/lib/format";
import type { ActionResult } from "@/lib/validation/common";
import { profileSchema, type ProfileData, type ProfileInput } from "./schema";
import { ACTIVITY_LABELS, ALLERGENS, DIET_LABELS, GOAL_LABELS, SEX_LABELS, SKILL_LABELS } from "./constants";
import { saveOnboardingAction, updateProfileAction } from "./actions";

type Mode = "wizard" | "edit";

const STEPS: { title: string; fields: FieldPath<ProfileInput>[] }[] = [
  { title: "Om dig", fields: ["displayName", "birthYear", "sex", "heightCm", "weightKg"] },
  { title: "Dit mål", fields: ["goal", "goalWeightKg", "weeklyRatePercent", "targetBodyFatPercent", "activityLevel", "trainingDaysPerWeek"] },
  { title: "Kost og allergier", fields: ["diet", "allergens", "excludedIngredients", "dislikedIngredients"] },
  { title: "Hverdag og budget", fields: ["mealsPerDay", "maxCookingMinutes", "cookingSkill", "householdSize", "weeklyBudgetKr", "postalCode"] },
  { title: "Kalorier og makroer", fields: ["allowCalorieEstimate", "customEnergyKcal", "customProteinG", "customCarbohydrateG", "customFatG"] },
];

const num = (v: unknown) => {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : parseDanishNumber(String(v));
  return Number.isFinite(n) ? n : undefined;
};

export function ProfileForm({ mode, defaults }: { mode: Mode; defaults: Partial<ProfileInput> }) {
  const [step, setStep] = useState(0);
  const [serverState, setServerState] = useState<ActionResult | null>(null);
  const [recalculate, setRecalculate] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<ProfileInput, unknown, ProfileData>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: {
      sex: "unspecified",
      activityLevel: "light",
      goal: "maintenance",
      diet: "omnivore",
      allergens: [],
      allowCalorieEstimate: true,
      mealsPerDay: 3,
      cookingSkill: "intermediate",
      householdSize: 1,
      trainingDaysPerWeek: 2,
      ...defaults,
    },
  });
  const { register, watch, formState, trigger, handleSubmit } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const e = (k: string) => errors[k]?.message ?? (serverState && !serverState.ok ? serverState.fieldErrors?.[k]?.[0] : undefined);

  const values = watch();
  const goal = values.goal;
  const estimate = useMemo(() => {
    const birthYear = num(values.birthYear);
    const heightCm = num(values.heightCm);
    const weightKg = num(values.weightKg);
    if (!birthYear || !heightCm || !weightKg) return null;
    try {
      return estimateEnergy({
        ageYears: new Date().getFullYear() - birthYear,
        heightCm,
        weightKg,
        sex: values.sex ?? "unspecified",
        activityLevel: values.activityLevel ?? "light",
        goal: values.goal ?? "maintenance",
        weeklyRatePercent: num(values.weeklyRatePercent) ?? null,
      });
    } catch {
      return null;
    }
  }, [values.birthYear, values.heightCm, values.weightKg, values.sex, values.activityLevel, values.goal, values.weeklyRatePercent]);

  const submit = handleSubmit((data) => {
    void data;
    startTransition(async () => {
      const raw = form.getValues();
      const res = mode === "wizard" ? await saveOnboardingAction(raw) : await updateProfileAction(raw, recalculate);
      setServerState(res);
    });
  });

  const next = async () => {
    const ok = await trigger(STEPS[step].fields);
    if (ok) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
      window.scrollTo({ top: 0 });
    }
  };

  const visible = (i: number) => mode === "edit" || step === i;
  const rate = goal === "fat_loss" || goal === "muscle_gain" ? RATE_LIMITS[goal] : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-8">
      {mode === "wizard" ? (
        <ol className="flex gap-1.5" aria-label="Trin">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}>
              <span className="sr-only">
                Trin {i + 1}: {s.title}
                {i === step ? " (aktuelt)" : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {serverState && !serverState.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{serverState.error}</AlertDescription>
        </Alert>
      ) : null}
      {serverState?.ok && serverState.message ? (
        <Alert variant="success">
          <AlertDescription>{serverState.message}</AlertDescription>
        </Alert>
      ) : null}

      {visible(0) && (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">{STEPS[0].title}</legend>
          <FormField id="displayName" label="Fornavn" optional error={e("displayName")}>
            <Input autoComplete="given-name" {...register("displayName")} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="birthYear" label="Fødselsår" error={e("birthYear")} hint="Vi gemmer kun året.">
              <Input inputMode="numeric" autoComplete="bday-year" {...register("birthYear")} />
            </FormField>
            <FormField id="sex" label="Køn til beregning" error={e("sex")}>
              <NativeSelect {...register("sex")}>
                {Object.entries(SEX_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="heightCm" label="Højde (cm)" error={e("heightCm")}>
              <Input inputMode="decimal" {...register("heightCm")} />
            </FormField>
            <FormField id="weightKg" label="Nuværende vægt (kg)" error={e("weightKg")}>
              <Input inputMode="decimal" {...register("weightKg")} />
            </FormField>
          </div>
          <p className="text-xs text-muted-foreground">
            Køn bruges kun i energiligningen (Mifflin-St Jeor), fordi den har forskellige konstanter. Vælger du ikke at
            oplyse det, bruger vi et gennemsnit, og estimatet bliver mere usikkert.
          </p>
        </fieldset>
      )}

      {visible(1) && (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">{STEPS[1].title}</legend>
          <div className="grid gap-2" role="radiogroup" aria-label="Primært mål">
            {Object.entries(GOAL_LABELS).map(([v, [label, desc]]) => (
              <label key={v} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="radio" value={v} {...register("goal")} className="mt-1 size-4 accent-primary" />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{desc}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="goalWeightKg" label="Målvægt (kg)" optional error={e("goalWeightKg")}>
              <Input inputMode="decimal" {...register("goalWeightKg")} />
            </FormField>
            <FormField id="targetBodyFatPercent" label="Mål for fedtprocent" optional error={e("targetBodyFatPercent")}>
              <Input inputMode="decimal" {...register("targetBodyFatPercent")} />
            </FormField>
          </div>
          {rate ? (
            <FormField
              id="weeklyRatePercent"
              label={`Tempo (% af kropsvægt pr. uge)`}
              optional
              error={e("weeklyRatePercent")}
              hint={`Mellem ${String(rate.min).replace(".", ",")} og ${String(rate.max).replace(".", ",")} %. Standard er ${String(rate.default).replace(".", ",")} %.`}
            >
              <Input inputMode="decimal" placeholder={String(rate.default).replace(".", ",")} {...register("weeklyRatePercent")} />
            </FormField>
          ) : null}
          <FormField id="activityLevel" label="Aktivitetsniveau" error={e("activityLevel")}>
            <NativeSelect {...register("activityLevel")}>
              {Object.entries(ACTIVITY_LABELS).map(([v, [l, d]]) => (
                <option key={v} value={v}>
                  {l} – {d}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="trainingDaysPerWeek" label="Træningspas pr. uge" error={e("trainingDaysPerWeek")}>
            <Input inputMode="numeric" {...register("trainingDaysPerWeek")} />
          </FormField>
        </fieldset>
      )}

      {visible(2) && (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">{STEPS[2].title}</legend>
          <FormField id="diet" label="Kost" error={e("diet")}>
            <NativeSelect {...register("diet")}>
              {Object.entries(DIET_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Allergier og intolerancer</legend>
            <p className="text-xs text-muted-foreground">
              Allergier er absolutte krav. Vi foreslår aldrig opskrifter eller varer, der indeholder dem.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ALLERGENS.map(([code, label]) => (
                <label key={code} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm has-[:checked]:border-primary">
                  <input type="checkbox" value={code} {...register("allergens")} className="size-4 accent-primary" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <FormField id="excludedIngredients" label="Ingredienser du aldrig vil have" optional hint="Adskil med komma, fx: svinekød, rejer" error={e("excludedIngredients")}>
            <Textarea rows={2} {...register("excludedIngredients")} />
          </FormField>
          <FormField id="dislikedIngredients" label="Ingredienser du helst undgår" optional hint="Vi undgår dem, når der er alternativer." error={e("dislikedIngredients")}>
            <Textarea rows={2} {...register("dislikedIngredients")} />
          </FormField>
        </fieldset>
      )}

      {visible(3) && (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">{STEPS[3].title}</legend>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="mealsPerDay" label="Måltider pr. dag" error={e("mealsPerDay")}>
              <NativeSelect {...register("mealsPerDay")}>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="householdSize" label="Personer i husstanden" error={e("householdSize")}>
              <Input inputMode="numeric" {...register("householdSize")} />
            </FormField>
            <FormField id="maxCookingMinutes" label="Maks. tid pr. måltid (min)" optional error={e("maxCookingMinutes")}>
              <Input inputMode="numeric" {...register("maxCookingMinutes")} />
            </FormField>
            <FormField id="cookingSkill" label="Erfaring i køkkenet" error={e("cookingSkill")}>
              <NativeSelect {...register("cookingSkill")}>
                {Object.entries(SKILL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="weeklyBudgetKr" label="Ugebudget til mad (kr.)" optional error={e("weeklyBudgetKr")}>
              <Input inputMode="decimal" {...register("weeklyBudgetKr")} />
            </FormField>
            <FormField id="postalCode" label="Postnummer" optional hint="Bruges til at finde butikker nær dig." error={e("postalCode")}>
              <Input inputMode="numeric" autoComplete="postal-code" maxLength={4} {...register("postalCode")} />
            </FormField>
          </div>
        </fieldset>
      )}

      {visible(4) && (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">{STEPS[4].title}</legend>
          <label className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <input type="checkbox" {...register("allowCalorieEstimate")} className="mt-1 size-4 accent-primary" />
            <span>
              <span className="font-medium">Beregn mit kalorie- og makromål for mig</span>
              <span className="block text-sm text-muted-foreground">Fravælg, hvis du allerede har mål fra fx en diætist.</span>
            </span>
          </label>
          {values.allowCalorieEstimate && estimate ? (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Estimat ud fra dine oplysninger</p>
              <p className="mt-1 text-3xl font-semibold">{formatInt(estimate.targetKcal)} kcal</p>
              <p className="mt-1 text-sm">
                Protein {estimate.macros.proteinG} g · Kulhydrat {estimate.macros.carbohydrateG} g · Fedt {estimate.macros.fatG} g
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Hvilestofskifte (Mifflin-St Jeor) {formatInt(estimate.bmrKcal)} kcal × aktivitetsfaktor = forbrug ca.{" "}
                {formatInt(estimate.tdeeKcal)} kcal. Justering for dit mål: {estimate.appliedDeltaKcal > 0 ? "+" : ""}
                {formatInt(estimate.appliedDeltaKcal)} kcal. Det er et estimat, ikke en måling.
              </p>
              {estimate.notes.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {estimate.notes.map((n, i) => (
                    <li key={i}>{describeNote(n)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {!values.allowCalorieEstimate ? (
            <div className="grid grid-cols-2 gap-4">
              <FormField id="customEnergyKcal" label="Kalorier pr. dag" error={e("customEnergyKcal")}>
                <Input inputMode="numeric" {...register("customEnergyKcal")} />
              </FormField>
              <FormField id="customProteinG" label="Protein (g)" optional error={e("customProteinG")}>
                <Input inputMode="numeric" {...register("customProteinG")} />
              </FormField>
              <FormField id="customCarbohydrateG" label="Kulhydrat (g)" optional error={e("customCarbohydrateG")}>
                <Input inputMode="numeric" {...register("customCarbohydrateG")} />
              </FormField>
              <FormField id="customFatG" label="Fedt (g)" optional error={e("customFatG")}>
                <Input inputMode="numeric" {...register("customFatG")} />
              </FormField>
            </div>
          ) : null}
          <Alert variant="info">
            <Info aria-hidden />
            <AlertDescription>
              Madro giver generelle estimater, ikke medicinsk rådgivning. Er du gravid, ammer, har en spiseforstyrrelse
              eller en sygdom, så tal med din læge eller en klinisk diætist.
            </AlertDescription>
          </Alert>
          {mode === "edit" ? (
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={recalculate} onChange={(ev) => setRecalculate(ev.target.checked)} className="size-4 accent-primary" />
              Beregn mine mål igen ud fra de nye oplysninger
            </label>
          ) : null}
        </fieldset>
      )}

      <div className="flex justify-between gap-3">
        {mode === "wizard" && step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            Tilbage
          </Button>
        ) : (
          <span />
        )}
        {mode === "wizard" && step < STEPS.length - 1 ? (
          // Distinct keys: reusing one <button> and flipping its type to "submit"
          // mid-click would submit the form before the last step is shown.
          <Button key="next" type="button" onClick={next}>
            Fortsæt
          </Button>
        ) : (
          <Button key="submit" type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Gemmer …" : mode === "wizard" ? "Gem og se min oversigt" : "Gem ændringer"}
          </Button>
        )}
      </div>
    </form>
  );
}
