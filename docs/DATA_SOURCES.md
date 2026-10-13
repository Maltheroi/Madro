# Data sources

How the app gets nutrition, product and price data, and what each source allows.

## How the app uses them today

| Source | Code | Status in the app |
|---|---|---|
| Development catalogue (44 foods, 20 recipes) | `supabase/seed-data/catalog.mjs` → `supabase/seed.sql` | **Fixture.** Nutrition values are approximate and marked `dev-seed-approximate`, confidence `low`. Replace with Frida before launch. |
| Synthetic prices for "Demo Nord/Syd/Vest (syntetisk)" | same seed | **Fixture.** `price_observations.is_synthetic = true`; the UI always shows the "Testpriser" notice and never calls these prices real. Real Danish chains exist only as reference rows with no prices. |
| User-entered prices | `addManualPrice` in `src/server/services/shopping.ts` | **Active.** Private to the reporter (RLS), status `estimated`. |
| Open Food Facts v3 | `src/server/providers/open-food-facts.ts` | **Implemented.** Barcode lookups (cached in `packaged_products`) when `OPEN_FOOD_FACTS_USER_AGENT` is set. Danish products are imported from the official bulk export (gzipped CSV, filtered on countries = Denmark) by `scripts/import-off-denmark.ts`, run as the GitHub Actions workflow "Import Open Food Facts (Danmark)". The search API returned 503 for bulk paging, and OFF asks bulk users to use the export. Rows keep `source_key`, licence and source URL; the UI labels them "Ikke verificeret" with an ODbL link. Users can add private products (`source_key 'user'`). |
| Frida, supermarkedspriser, ShelfAtlas, Salling | `src/server/providers/registry.ts` | **Awaiting agreement.** Listed on `/admin/datakilder`; no adapter calls them. |

Provider contracts live in `src/server/providers/types.ts` (`ProductCatalogProvider`, `RetailerPriceProvider`, `PromotionalOfferProvider`, `StoreAvailabilityProvider`). A new source implements one of them and writes immutable rows to `price_observations` (or `nutrition_facts`) with its own `source_key`. Freshness thresholds are in `src/features/grocery-pricing/domain/prices.ts` (shelf 72 h, online 48 h, promotional 7 days, manual 30 days).

Rules the code enforces:
- No price is shown without its status (Aktuel, Forældet, Estimeret, Syntetisk).
- Savings are marked unverified when any synthetic or estimated price is involved.
- Promotional prices are used only within their validity window.
- AI never supplies nutrition or prices (see `src/server/ai/substitutions.ts`).
- Nothing scrapes retailer sites.

---

# Research notes (2026-10-12)

Research date: 2026-10-12. Method: public docs, terms and pricing pages read with WebFetch/WebSearch only. No scraping, no undocumented API calls.

Verification legend:
- **[V-official]**: verified on the provider's own docs, terms or pricing page (URL given).
- **[V-3rd]**: stated by a third party, not by the provider.
- **[Inferred]**: my reading or prior knowledge, not confirmed on a page today.
- **Unverified**: could not confirm. Several portals (Frida, Salling developer portal) render with JavaScript and gave no readable content.

---

## A. Nutrition

### A1. DTU Fødevareinstituttet: Frida (Food Data)

| Item | Finding | Status / source |
|---|---|---|
| Current version | **Frida 5.5** (DTU news item dated 23 Feb 2026: "Frida (v. 5.5)") | [V-official] https://www.food.dtu.dk/english/newsarchive/2026/02/new-nutrient-data-for-energy-drinks-dressings-mayonnaise-and-remoulade |
| Dataset DOI | 10.11583/DTU.29500682. "Dataset from The Danish Food Composition Database, Frida version 5.5", made available 19 Jan 2026. Worksheets: Readme, Data_Table, Data_Normalised, Food, FoodGroup, Parameter, Source | [V-official] https://orbit.dtu.dk/en/datasets/f55019c6-9d39-444b-b427-2a0fb4d1fff9/ |
| Site | frida.fooddata.dk now 302-redirects to **fcdb.fooddata.dk**. That SPA returned no readable text | [V-official] (redirect seen); content Unverified |
| Scope | "more than 1,000 foods": energy, vitamins, minerals, fat, protein, carbohydrates | [V-official] https://food.dtu.dk/english/about-us/facilities-and-infrastructure/food-data-database-on-nutrients-in-food |
| Download formats | DTU says users "can also download data onto their own computer" but names no format. The worksheet list points to an **Excel workbook**. A third party reports the download link is e-mailed after a form, with no stable public URL | Format [Inferred] / [V-3rd] https://github.com/eait-fit/fooddb/issues/35 |
| API | None documented anywhere I could read | Unverified (no API found) |
| License | **Unverified.** CC BY 4.0 is NOT confirmed. The DTU Orbit dataset page says: "All rights are reserved, including those for text and data mining, AI training…". That may be generic portal boilerplate, but it is the only rights text I found. FAO lists the database as "Free access" with no named license | Unverified. https://orbit.dtu.dk/... (above); https://www.fao.org/food-composition/tables-and-databases/detail/(denmark--2024)-danish-food-composition-table/en |
| Attribution text | Suggested by a third party (not official): "Frida Food Data (https://frida.fooddata.dk), National Food Institute, Technical University of Denmark". Formal citation: Poulsen, A. et al. (2026). *Dataset from The Danish Food Composition Database, Frida version 5.5*. DTU. doi:10.11583/DTU.29500682 | [V-3rd] / citation [V-official] |
| Commercial use | Not stated on any page I could read | **Unverified** |

**Action:** e-mail DTU (food@food.dtu.dk) for written confirmation of the license, commercial use and the exact attribution string before shipping. Until then, treat Frida as **Approved for dev, needs written license confirmation for production**.

### A2. Open Food Facts (OFF)

| Item | Finding | Status / source |
|---|---|---|
| API version | **v3 (v3.6 latest)** is "Current — recommended for all new integrations". v2 is deprecated but still supported | [V-official] https://openfoodfacts.github.io/openfoodfacts-server/api/ |
| Product by barcode | `GET /api/v3/product/{barcode}` (doc example: `/api/v3.6/product/3274080005003.json`). v2 equivalent: `/api/v2/product/{barcode}` | [V-official] same URL |
| Search | Structured filter search only in **v2**: `GET /api/v2/search`. v3 has no structured search. Full-text search goes through **Search-a-licious**, a separate service | [V-official] same URL |
| User-Agent | Required: "always use a custom User-Agent to identify your app". Format `AppName/Version (ContactEmail)` | [V-official] same URL |
| Rate limits | **15 req/min/IP** for product reads; **10 req/min/IP** for search. Separate global limits return HTTP 503 | [V-official] same URL |
| Bulk alternative | Full data dumps (implied by the limits). Use dumps for bulk import, not the API | [Inferred] |
| Licensing | Database: **ODbL**. Individual contents: **DbCL**. Images: **CC BY-SA**, which "may contain graphical elements subject to copyright" such as trademarks. Commercial use allowed. Attribution to Open Food Facts with a link is required. "Derivative works must be shared under the same conditions." Data is "indicative" and "must not be used for medical purposes" | [V-official] https://world.openfoodfacts.org/terms-of-use |
| DK coverage | **22,557 products** listed for Denmark on dk.openfoodfacts.org. Quality and completeness vary because the data is crowdsourced | Count [V-official] https://dk.openfoodfacts.org/ ; quality [Inferred] |

**What share-alike means if we combine OFF with a proprietary database (ODbL 1.0)** [V-official] https://opendatacommons.org/licenses/odbl/1-0/
- **Derivative Database** (§4.4): if we extract or reuse "the whole or a Substantial part" of OFF into a new database and publicly use it, that database must be released under ODbL. A database where OFF and proprietary fields are merged into the same records is very likely a Derivative Database. [Inferred]
- **Collective Database** (§4.5): if OFF data is kept in a separate, unmodified store and only placed alongside our own independent data, our data does not have to be ODbL. ODbL still governs the OFF part.
- **Produced Work** (§4.3): screens and API responses shown to users are Produced Works. They need a notice saying the content comes from OFF under ODbL. Creating a Produced Work does not by itself make a Derivative Database.
- Improvements we make to OFF data (corrections, matches) that we publicly use must be shared back under ODbL.
- **Recommendation:** keep OFF in its own table or schema keyed by EAN. Do not write proprietary licensed data (GS1, price feeds) into OFF-derived records. Show "Data fra Open Food Facts (ODbL)" with a link. Avoid OFF images, or attribute them CC BY-SA. Get legal sign-off. [Inferred]

**Recommendation: Approved for dev and production** (with attribution and the architecture above).

---

## B. Prices and offers (Denmark)

### B3. supermarkedspriser.dk

Sources: https://supermarkedspriser.dk/data and https://supermarkedspriser.dk/metode [V-official, both read 2026-10-12]

| Attribute | Finding |
|---|---|
| Data fields (open files) | "Supermarkedspriser-kurven": one row per chain per day, with basket price (DKK), how many of the 100 basket items the chain stocks, whether coverage is full, and whether the chain was cheapest that day |
| Data fields (API) | Item-level prices and per-item price history, "udleveres gennem API'et med nøgle" (handed out through the API with a key). /metode says product-level raw data is available "by agreement" |
| Retailer coverage | 20 chains per /data. /metode lists REMA 1000, nemlig.com, Motatos, Lidl, Netto, føtex, Bilka; Brugsen, SuperBrugsen, MENY, SPAR, Min Købmand via **Wolt delivery prices from one store each**; 365discount and Kvickly **weekly paper offers only**; plus 3 border-shop chains (labelled, excluded from rankings) |
| Product coverage | Item-level data exists (EAN/GTIN as primary key). Items without a barcode are matched by name and marked "≈ navnematch". Total count not published |
| Freshness | REMA, Bilka, føtex, nemlig 3×/day. Lidl, Motatos 1×/day. Wolt chains 2×/day. Netto and føtex fresh goods continuously via Salling APIs. Prices not confirmed for 3 days are removed. Collected since 11 Aug 2026 |
| Geography | National webshop prices. Wolt prices come from a single store per chain |
| Price type | Shelf/online prices where chains publish them. Coop offers labelled "avistilbud". Wolt prices labelled "leveringspris" (higher than in-store). Member prices labelled and excluded from rankings. Crowdsourced prices labelled "indberettet" |
| Individual product data? | Yes, but **only via a keyed API by agreement** (not open) |
| Auth & rate limits | API key. Rate limits not published (**Unverified**) |
| Commercial use | Aggregated data: CC BY 4.0, "også kommercielt" (commercial use included), with attribution "Supermarkedspriser" and a link. Item-level API terms: **Unverified / by agreement** |
| Cost | Open files free. API cost **Unverified** |
| Integration effort | Low for CSV/JSON. API docs not public |
| Known gaps | The site itself says Coop and Lidl don't publish full shelf prices. Wolt ≠ in-store. Short history (since Aug 2026). The site depends on retailer webshops that may change |
| Recommendation | **Aggregates: Approved for dev and production** (CC BY). **Item-level: Needs contract** |

### B4. ShelfAtlas (shelfatlas.com / api.shelfatlas.com)

Sources: https://shelfatlas.com/ , https://shelfatlas.com/docs , https://shelfatlas.com/pricing , https://shelfatlas.com/legal/terms [V-official]

| Attribute | Finding |
|---|---|
| Data fields | Offer: `id, rawName, price, currency, validFrom, validTo, chainId, storeId, productId, volumeMl, unitCount, imageUrl, originalPrice, discountPct, unitPrice, unitPriceUnit`. Store: `id, name, chainSlug, address, city, postalCode, lat, lng, openingHours`. Price history: `productId, date, minPriceCents, chainSlug` (prices in øre) |
| Endpoints | `/api/v1/public/catalog/`: `chains`, `stores` (geo search), `products` (lookup by UUID or EAN), `products/:id/offers`, `offers`, `offers/search`, `offers/history`, `offers/price-drops`, `price-history` (≤50 products, 1–90 days), `local-prices`, `observed-prices` (B2B). Webhooks. OpenAPI 3.1. SDKs for TS, Python and Go |
| Retailer coverage | 20 chains: Bilka, Føtex, Netto, Kvickly, SuperBrugsen, Dagli'Brugsen, Coop 365discount, Lidl, Rema 1000, Meny, Spar, Min Købmand, Løvbjerg, LET-KØB, Calle, plus border shops (Scandinavian Park, fakta Tyskland, Fleggaard, Pøtzsch, BorderShop). 2,750 stores; 6,111 live offers on 2026-10-12 |
| Product coverage | Offer feed covers "every major Danish chain", but the curated product catalog is smaller. An empty result means "no offers linked yet" |
| Price type | **Mainly leaflet campaign offers**: "not everyday shelf prices", and history shows "Advertised leaflet prices, never a normal price". Shelf prices only as crowd-observed `local-prices`. `observed-prices` needs a B2B coverage package |
| Freshness | Webhooks: "up to ~15 minutes" latency. Per-chain freshness is on /status. No SLA |
| Geography | Store-level offers with lat/lng. National |
| Individual product data? | Yes (by EAN), offers-centric |
| Auth & rate limits | `Authorization: Bearer sa_live_…`. Free 1k req/month at 60/min; Hobby 5k at 120/min; Standard 100k at 300/min; Growth 500k at 600/min; Scale 1M at 1,200/min. 429 when exceeded |
| Commercial use | Free and Hobby are "personal, non-commercial use" only. Commercial use needs **Standard (649 DKK/mo) or higher**. Enterprise has custom terms |
| Cost | 0 / 49 / 649 / 2,499 / 4,599 DKK per month; Enterprise by quote |
| Terms caveats | "Early access", "as-is", no warranty of accuracy or availability, may be changed or discontinued at any time. Catalog asserted as "the work of ShelfAtlas". Some images are AI-generated. A separate Acceptable Use policy was not reviewed. Redistribution and caching rules not stated (**Unverified**) |
| Integration effort | Low (REST, OpenAPI, SDKs, webhooks) |
| Known gaps | No regular shelf prices (except crowd data and B2B). Early-access stability risk. Provider is small and new |
| Recommendation | **Approved for dev** on the Free tier (personal or dev testing only). **Production: paid Standard+ plan** (self-serve commercial contract). Get the AUP and caching terms confirmed |

### B5. Salling Group Developer Portal (Netto, føtex, Bilka)

Sources: developer.sallinggroup.com now 302-redirects to https://developer.sallinggroup.dev/ ; API list at https://developer.sallinggroup.dev/apireference [V-official]. The individual API, quota and terms pages render with JavaScript and could not be read (**Unverified**).

| Attribute | Finding |
|---|---|
| Public APIs listed | **Anti Food Waste, Product Suggestions, Stores, Holidays, Jobs**. Base URL `https://api.sallinggroup.com` [V-official] |
| Shelf-price API? | **None listed publicly.** No "Products" or price API appears in the public reference. supermarkedspriser.dk says it uses "Sallings Products API" and Salling APIs for Netto and føtex. That API may be restricted or partner-only (**Unverified**) |
| Anti Food Waste fields | From prior knowledge [Inferred / Unverified]: clearance offers per store (by zip/store) with `originalPrice`, `newPrice`, `discount`, `percentDiscount`, `stock`, `ean`, validity dates, and product description and image. These are **markdown prices on short-dated items, not regular shelf prices** |
| Product Suggestions | Content not readable. Historically returned product names and IDs for autocomplete; prices not confirmed (**Unverified**) |
| Stores | Store locations, opening hours, brand (**Inferred**) |
| Auth | Four integration types: front-end API key, back-end API key, employee (Entra ID), customer (SAP CDC). "Only the first two are publicly available." Signup "Free… No card required" [V-official] |
| Rate limits | Docs have "Quota" and "Spike Protection" topics, but the numbers are **Unverified** |
| Commercial use / terms | Terms page exists but was not readable: **Unverified** |
| Cost | Free signup [V-official] |
| Recommendation | Food Waste and Stores: **Approved for dev**. Production needs the terms reviewed. Shelf prices: **Not available publicly; ask Salling for partner access (Needs contract)** |

### B6. REMA 1000, Lidl Denmark, Coop

| Retailer | Finding | Status |
|---|---|---|
| REMA 1000 | No official developer API or product feed found. Search results show only third-party Apify scrapers (not usable: scraping) | Unverified (none found). https://apify.com/studio-amba/rema1000-dk-scraper (3rd-party scraper, not an endorsement) |
| Lidl DK | No official API or product feed found. supermarkedspriser says Lidl "does not publish full shelf prices" | Unverified (none found) |
| Coop (coop.dk, 365discount, SuperBrugsen, Kvickly, Brugsen) | `developer.coop.dk` exists, but its robots.txt blocks automated reading, so I could not check what it offers or whether it is active. No current public docs found by search. supermarkedspriser says Coop doesn't publish full shelf prices | **Unverified**: check manually in a browser and contact Coop Digital |

**Recommendation:** None of these are usable without a direct agreement (**Needs contract**). Do not scrape their webshops.

### B7. Offer catalog aggregators

| Provider | API availability | Terms | Recommendation |
|---|---|---|---|
| **Tjek (eTilbudsavis)** | "The API is only available to customers". Contact services@tjek.com. Pricing not public [V-official https://tjek.com/apis-and-sdks] | API use only on the customer's own platforms (§8.2). Fair use 8,000,000 calls/month/country (§8.5). No sharing of keys or content (§8.4). Embedding or hotlinking needs written approval and rights-holder consent (§8.3). **No AI/ML training on the data** (§8.6). Insights data may not be resold (§7.6) [V-official https://tjek.com/terms] | **Needs contract** |
| **minetilbud.dk** (Dayli) | No API or feed mentioned. A retailer-side "Publisher" platform exists (publisher.minetilbud.dk) [V-official https://www.minetilbud.dk/] | No reuse terms found | **Not usable** (no API). Contact needed |
| **Tilbudsugen.dk** | No API or feed. A /partner link exists. "Alle rettigheder forbeholdes" (all rights reserved) [V-official https://www.tilbudsugen.dk/] | All rights reserved | **Not usable** |

### B8. Licensed commercial providers

| Provider | Finding | Status |
|---|---|---|
| **GS1 Denmark** (GS1Trade Sync / GDSN) | Product master data exchange. **Data recipients pay by active GTINs**, from 5,408 DKK/yr (0–100 GTINs). Also "Datamodtager (API via GS1Trade Sync)" under Packaging at 30,000 DKK/yr. Membership 650 DKK/yr. "Verified by GS1" GTIN lookup. Nutrition attributes not confirmed on the page. Data access also typically needs supplier publication agreements [Inferred] | Prices [V-official https://www.gs1.dk/priser-og-abonnementer]; "Trustbox" not mentioned on gs1.dk (**Unverified**, may be a legacy name) |
| **NielsenIQ / Circana** | Retail measurement and pricing data. Enterprise contracts only, no public pricing | [Inferred]; not researched in depth |

---

## Summary matrix

| Source | Price type | Item-level | Commercial | Cost | Verdict |
|---|---|---|---|---|---|
| Frida 5.5 | (nutrition) | Yes | Unverified | Free | Dev OK; confirm license |
| Open Food Facts v3 | (nutrition / product) | Yes | Yes (ODbL) | Free | Approved |
| supermarkedspriser (open files) | Shelf/online basket aggregates | No | Yes (CC BY 4.0) | Free | Approved |
| supermarkedspriser API | Shelf/online + offers | Yes | By agreement | Unknown | Needs contract |
| ShelfAtlas | Leaflet offers (+ crowd shelf) | Yes | Standard+ plan | 649+ DKK/mo | Dev OK (Free); paid for prod |
| Salling Food Waste / Stores | Markdown clearance | Yes | Terms unread | Free | Dev OK; review terms |
| Salling shelf prices | Shelf | n/a | n/a | n/a | Needs contract |
| REMA / Lidl / Coop | n/a | n/a | n/a | n/a | Needs contract |
| Tjek | Leaflet catalogs | Yes | Contract, no AI | Quote | Needs contract |
| minetilbud / Tilbudsugen | n/a | n/a | No | n/a | Not usable |
| GS1 DK Trade Sync | (master data) | Yes | Contract | ≥5,408 DKK/yr | Needs contract |

---

## Recommended production configuration

1. **Nutrition backbone:** Frida 5.5 for generic foods and recipes, imported from the Excel download into our own DB with Frida attribution. Production use depends on DTU's written license confirmation.
2. **Packaged products by EAN:** Open Food Facts, loaded from bulk dumps plus v3 barcode lookups (custom User-Agent, ≤15 req/min, cached). Kept in a separate ODbL-licensed store, with attribution shown in the UI.
3. **Offers/campaigns:** ShelfAtlas Standard plan (649 DKK/mo; upgrade to Growth as traffic grows), using webhooks to cut request volume. Label prices as "tilbud" and show validity dates. Show the disclaimer that the retailer's leaflet prevails.
4. **Shelf-price context:** supermarkedspriser CC BY basket aggregates for chain-level comparisons. Pursue an agreement for its item-level API to get per-item shelf prices for REMA, Netto, føtex, Bilka, nemlig and Lidl.
5. **Supplementary:** Salling Anti Food Waste (clearance deals) and Stores API, after reviewing the terms.
6. **Do not** scrape retailer webshops or offer sites. Do not present Wolt or offer prices as in-store shelf prices. Do not merge OFF data with licensed proprietary data in the same records.
7. **Later:** GS1 Trade Sync if verified master data or nutrition is needed at scale; a Tjek contract if full catalog visuals are needed (note its ban on AI/ML use).

## Credentials and approvals the product owner must obtain

- [ ] **DTU Food Institute:** written confirmation of the Frida license, commercial use and attribution string (food@food.dtu.dk); download access to the Frida 5.5 Excel file.
- [ ] **Open Food Facts:** no key needed. Choose a User-Agent string with a contact e-mail. Legal sign-off on the ODbL architecture.
- [ ] **ShelfAtlas:** account and API key (`sa_live_…`); buy the Standard plan before any commercial or company traffic; get the Acceptable Use policy and caching/redistribution terms in writing.
- [ ] **supermarkedspriser.dk:** API key and data agreement for item-level prices (cost, rate limits, commercial terms).
- [ ] **Salling Group:** developer account and back-end API key at developer.sallinggroup.dev; review the Terms and Quota pages; ask about partner access to a Products/price API.
- [ ] **Coop Digital / REMA 1000 / Lidl DK:** formal requests for product or price feeds (check developer.coop.dk status manually).
- [ ] **Tjek:** commercial quote (services@tjek.com) only if leaflet catalogs are needed.
- [ ] **GS1 Denmark:** membership and a GS1Trade Sync data-recipient subscription, if master data is needed.
- [ ] **Legal review:** CC BY attributions (supermarkedspriser, Frida if confirmed), ODbL notice (OFF), and consumer-law labelling of offer vs. shelf vs. delivery prices.
