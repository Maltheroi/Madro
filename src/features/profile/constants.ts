/** EU's 14 mandatory allergens (Regulation 1169/2011, Annex II), with Danish labels. */
export const ALLERGENS = [
  ["gluten", "Gluten"],
  ["crustaceans", "Krebsdyr"],
  ["egg", "Æg"],
  ["fish", "Fisk"],
  ["peanuts", "Jordnødder"],
  ["soy", "Soja"],
  ["milk", "Mælk"],
  ["nuts", "Nødder"],
  ["celery", "Selleri"],
  ["mustard", "Sennep"],
  ["sesame", "Sesam"],
  ["sulphites", "Svovldioxid og sulfitter"],
  ["lupin", "Lupin"],
  ["molluscs", "Bløddyr"],
] as const;
export type AllergenCode = (typeof ALLERGENS)[number][0];
export const ALLERGEN_CODES = ALLERGENS.map(([c]) => c) as unknown as readonly [AllergenCode, ...AllergenCode[]];
export const ALLERGEN_LABEL: Record<string, string> = Object.fromEntries(ALLERGENS);

export const ACTIVITY_LABELS = {
  sedentary: ["Stillesiddende", "Kontorarbejde og kun lidt gang"],
  light: ["Let aktiv", "Går dagligt eller let motion 1–3 gange om ugen"],
  moderate: ["Moderat aktiv", "Træning 3–5 gange om ugen eller stående arbejde"],
  active: ["Meget aktiv", "Hård træning 6–7 gange om ugen eller fysisk arbejde"],
  very_active: ["Ekstremt aktiv", "Fysisk hårdt arbejde og daglig træning"],
} as const;

export const GOAL_LABELS = {
  fat_loss: ["Tabe fedt", "Et moderat kalorieunderskud"],
  maintenance: ["Vedligeholde", "Hold vægten stabil"],
  muscle_gain: ["Opbygge muskler", "Et lille kalorieoverskud"],
  recomposition: ["Rekomposition", "Tab fedt og opbyg muskler tæt på vedligehold"],
} as const;

export const DIET_LABELS = {
  omnivore: "Spiser alt",
  pescetarian: "Pescetar",
  vegetarian: "Vegetar",
  vegan: "Veganer",
} as const;

export const SEX_LABELS = {
  female: "Kvinde",
  male: "Mand",
  unspecified: "Ønsker ikke at oplyse",
} as const;

export const SKILL_LABELS = {
  beginner: "Begynder",
  intermediate: "Øvet",
  advanced: "Erfaren",
} as const;
