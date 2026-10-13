import "server-only";
import { getEnv } from "@/lib/env";
import { openFoodFactsInfo } from "./open-food-facts";
import { sallingInfo } from "./salling-food-waste";
import { shelfAtlasInfo } from "./shelfatlas";
import type { ProviderInfo } from "./types";

/**
 * Every data source the app knows about, with its current status. Sources
 * marked "awaiting_agreement" have no adapter calling them: they need a licence
 * or contract first (see docs/DATA_SOURCES.md). Nothing here scrapes.
 */
export function listProviders(opts: { offersSyncedAt?: Date | null } = {}): ProviderInfo[] {
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
      note: "98 fødevarer og 80 opskrifter med omtrentligt næringsindhold. Skal erstattes af Frida-data før lancering.",
    },
    openFoodFactsInfo(env.OPEN_FOOD_FACTS_USER_AGENT),
    {
      key: "frida",
      name: "Frida 5.5 (DTU Fødevareinstituttet)",
      kinds: ["nutrition"],
      status: "not_configured",
      licence: "CC BY 4.0",
      note: "Officiel dansk fødevaredatabase, frigivet under CC BY 4.0. Importeres til fødevarekataloget, så næringsværdierne erstatter de omtrentlige udviklingsværdier.",
      docsUrl: "https://doi.org/10.11583/DTU.29500682",
    },
    {
      key: "supermarkedspriser",
      name: "supermarkedspriser.dk",
      kinds: ["retailer_price"],
      status: "awaiting_agreement",
      licence: "Pris-API kun efter individuel aftale",
      note: "Priser pr. vare kræver en nøgle efter aftale, og der udstedes som udgangspunkt ikke nye nøgler (læst 13.10.2026). Bruges ikke.",
      docsUrl: "https://supermarkedspriser.dk/api",
    },
    shelfAtlasInfo(opts.offersSyncedAt ?? null),
    sallingInfo(env.SALLING_API_KEY),
  ];
}
