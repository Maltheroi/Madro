import "server-only";
import { getEnv } from "@/lib/env";
import { openFoodFactsInfo } from "./open-food-facts";
import type { ProviderInfo } from "./types";

/**
 * Every data source the app knows about, with its current status. Sources
 * marked "awaiting_agreement" have no adapter calling them: they need a licence
 * or contract first (see docs/DATA_SOURCES.md). Nothing here scrapes.
 */
export function listProviders(): ProviderInfo[] {
  const env = getEnv();
  return [
    {
      key: "dev-synthetic",
      name: "Syntetiske demopriser",
      kinds: ["retailer_price", "promotional_offer", "store_availability"],
      status: "fixture",
      licence: "Genereret til udvikling",
      note: "Fiktive kæder (Demo Nord/Syd/Vest). Bruges kun til at udvikle og teste. Ingen rigtige priser.",
    },
    {
      key: "manual",
      name: "Brugerindtastede priser",
      kinds: ["retailer_price"],
      status: "active",
      licence: "Brugerens egne data",
      note: "Priser, som brugeren selv har set i butikken. Private og markeret som estimerede.",
    },
    {
      key: "dev-seed-approximate",
      name: "Udviklingskatalog (næringsindhold)",
      kinds: ["nutrition"],
      status: "fixture",
      licence: "Omtrentlige værdier",
      note: "44 fødevarer med omtrentligt næringsindhold. Skal erstattes af Frida-data før lancering.",
    },
    openFoodFactsInfo(env.OPEN_FOOD_FACTS_USER_AGENT),
    {
      key: "frida",
      name: "Frida (DTU Fødevareinstituttet)",
      kinds: ["nutrition"],
      status: "awaiting_agreement",
      licence: "Ikke bekræftet",
      note: "Officiel dansk fødevaredatabase. Licens til kommerciel brug skal bekræftes skriftligt af DTU før import.",
      docsUrl: "https://frida.fooddata.dk/",
    },
    {
      key: "supermarkedspriser",
      name: "supermarkedspriser.dk",
      kinds: ["retailer_price"],
      status: "awaiting_agreement",
      licence: "CC BY 4.0 for kurvdata; API efter aftale",
      note: "Daglige kurvpriser er åbne. Priser pr. vare kræver API-nøgle efter aftale.",
      docsUrl: "https://supermarkedspriser.dk/",
    },
    {
      key: "shelfatlas",
      name: "ShelfAtlas",
      kinds: ["promotional_offer", "retailer_price"],
      status: "awaiting_agreement",
      licence: "Kommerciel (Standard 649 kr./md.)",
      note: "Tilbudsaviser via REST-API. Gratis niveau er kun til personlig brug.",
      docsUrl: "https://shelfatlas.com/",
      requiredEnv: ["SHELFATLAS_API_KEY"],
    },
    {
      key: "salling-group",
      name: "Salling Group API",
      kinds: ["store_availability"],
      status: "awaiting_agreement",
      licence: "Salling Group udviklervilkår",
      note: "Butikker og madspild-tilbud for Netto, føtex og Bilka. Ingen offentlig hyldepris-API.",
      docsUrl: "https://developer.sallinggroup.dev/",
      requiredEnv: ["SALLING_API_KEY"],
    },
  ];
}
