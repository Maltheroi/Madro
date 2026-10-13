// Combines the development catalog files. See catalog.mjs for the caveats
// (approximate nutrition, synthetic prices).
import { ingredients, recipes, demoRetailers } from "./catalog.mjs";
import { worldIngredients } from "./ingredients-world.mjs";
import { recipes as fitnessRecipes } from "./recipes-fitness.mjs";
import { recipes as thaiRecipes } from "./recipes-thai.mjs";
import { recipes as asianRecipes } from "./recipes-asian.mjs";
import { recipes as danishRecipes } from "./recipes-danish.mjs";
import { recipes as italianRecipes } from "./recipes-italian.mjs";
import { recipes as mexicanRecipes } from "./recipes-mexican.mjs";

export const CUISINES = ["fitness", "thai", "asiatisk", "dansk", "italiensk", "mexicansk"];

export const allIngredients = [...ingredients, ...worldIngredients];
// Cuisine tags for the original catalog recipes (11th tuple element).
const ORIGINAL_CUISINES = {
  "havregroed-med-baer": ["dansk"],
  "skyr-med-baer-og-mandler": ["fitness", "dansk"],
  "rugbroed-med-aeg-og-tomat": ["dansk"],
  "omelet-med-spinat-og-feta": ["fitness"],
  "rugbroed-med-banan-og-jordnoeddesmoer": ["dansk"],
  "kyllingesalat-med-kikaerter": ["fitness"],
  tunwraps: ["fitness"],
  "rugbroed-med-hytteost": ["dansk", "fitness"],
  "laks-med-kartofler-og-broccoli": ["dansk", "fitness"],
  "kylling-i-karry-med-ris": ["asiatisk"],
  "chili-sin-carne": ["mexicansk"],
  "pasta-bolognese": ["italiensk"],
  "torsk-med-ris-og-aerter": ["fitness"],
  "tofu-wok-med-ris": ["asiatisk"],
  kartoffelfrittata: ["italiensk"],
  kyllingewraps: ["mexicansk"],
  "skyr-med-banan": ["fitness"],
};

export const allRecipes = [
  ...recipes.map((r) => [...r.slice(0, 10), ORIGINAL_CUISINES[r[0]] ?? []]),
  ...fitnessRecipes,
  ...thaiRecipes,
  ...asianRecipes,
  ...danishRecipes,
  ...italianRecipes,
  ...mexicanRecipes,
];
export { demoRetailers };
