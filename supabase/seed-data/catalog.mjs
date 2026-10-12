// Development catalog used to generate supabase/seed.sql (scripts/generate-seed.mjs).
//
// NUTRITION VALUES: approximate per-100 g values for common foods, entered by
// hand for development. They are NOT verified against Frida or any other
// authoritative source. They are stored with source "dev-seed-approximate",
// confidence "low", and the UI labels them as unverified. Replace them with an
// authorised Frida import before launch (docs/DATA_SOURCES.md).
//
// PRICES: generated synthetic fixtures for fictional demo chains. They are not
// real prices and are stored with is_synthetic = true.

const VEGAN = ["vegan", "vegetarian", "pescetarian"];
const VEG = ["vegetarian", "pescetarian"];
const PESC = ["pescetarian"];

// [slug, name_da, category, allergens, dietTags, {density, gpp, yield, shelfStable, unit}, state,
//  kcal, protein, carb, fat, fiber, sugars, satFat, salt, basePriceOrePerKgOrL, packs]
// packs: list of [quantity, unit] package sizes used for synthetic products.
export const ingredients = [
  ["havregryn", "Havregryn", "Kolonial", ["gluten"], VEGAN, { shelfStable: true }, "dried", 370, 13, 59, 7, 10, 1, 1.3, 0, 1600, [[1, "kg"], [500, "g"]]],
  ["skyr-naturel", "Skyr naturel", "Mejeri", ["milk"], VEG, { density: 1.05 }, "as_sold", 63, 11, 4, 0.2, 0, 4, 0.1, 0.1, 2400, [[1, "kg"], [450, "g"]]],
  ["letmaelk", "Letmælk 1,5 %", "Mejeri", ["milk"], VEG, { density: 1.03, unit: "dl" }, "as_sold", 46, 3.5, 4.7, 1.5, 0, 4.7, 1, 0.1, 1100, [[1, "l"]]],
  ["aeg", "Æg", "Mejeri", ["egg"], VEG, { gpp: 50, unit: "stk" }, "raw", 143, 12.6, 0.7, 9.9, 0, 0.4, 3.1, 0.35, 4200, [[10, "stk"], [6, "stk"]]],
  ["rugbroed", "Rugbrød, skiver", "Brød", ["gluten"], VEGAN, { gpp: 45, unit: "stk" }, "as_sold", 210, 6, 38, 2, 8, 3, 0.4, 1.1, 2300, [[1000, "g"], [500, "g"]]],
  ["kyllingebryst", "Kyllingebryst", "Kød", [], [], { yield: 0.75 }, "raw", 110, 23, 0, 1.5, 0, 0, 0.4, 0.15, 9500, [[900, "g"], [500, "g"]]],
  ["hakket-oksekoed", "Hakket oksekød 8–12 %", "Kød", [], [], { yield: 0.7 }, "raw", 170, 20, 0, 10, 0, 0, 4.3, 0.15, 9000, [[500, "g"], [1000, "g"]]],
  ["laksefilet", "Laksefilet", "Fisk", ["fish"], PESC, { yield: 0.8 }, "raw", 200, 20, 0, 13, 0, 0, 2.5, 0.12, 19000, [[250, "g"], [500, "g"]]],
  ["torskefilet", "Torskefilet", "Fisk", ["fish"], PESC, { yield: 0.8 }, "raw", 77, 18, 0, 0.6, 0, 0, 0.1, 0.2, 15000, [[400, "g"]]],
  ["tun-i-vand", "Tun i vand, drænet", "Kolonial", ["fish"], PESC, { shelfStable: true }, "canned_drained", 110, 25, 0, 1, 0, 0, 0.3, 0.9, 11000, [[120, "g"], [360, "g"]]],
  ["roede-linser", "Røde linser", "Kolonial", [], VEGAN, { yield: 2.5, shelfStable: true }, "dried", 340, 24, 50, 1.5, 11, 2, 0.2, 0, 2800, [[500, "g"]]],
  ["kikaerter", "Kikærter, dåse, drænet", "Kolonial", [], VEGAN, { shelfStable: true }, "canned_drained", 125, 7, 16, 2.5, 6, 0.5, 0.3, 0.6, 1700, [[240, "g"]]],
  ["kidneyboenner", "Kidneybønner, dåse, drænet", "Kolonial", [], VEGAN, { shelfStable: true }, "canned_drained", 110, 7.5, 15, 0.5, 6.5, 1, 0.1, 0.6, 1700, [[240, "g"]]],
  ["hakkede-tomater", "Hakkede tomater, dåse", "Kolonial", [], VEGAN, { density: 1.03, shelfStable: true }, "as_sold", 22, 1.2, 3.5, 0.2, 1.2, 3.5, 0, 0.1, 1000, [[400, "g"]]],
  ["pasta", "Pasta, tørret", "Kolonial", ["gluten"], VEGAN, { yield: 2.4, shelfStable: true }, "dried", 355, 12.5, 70, 1.8, 3, 3, 0.4, 0, 1400, [[500, "g"], [1000, "g"]]],
  ["ris-basmati", "Basmatiris", "Kolonial", [], VEGAN, { yield: 2.7, shelfStable: true }, "dried", 350, 8, 77, 0.8, 1.3, 0.2, 0.2, 0, 2200, [[1000, "g"], [500, "g"]]],
  ["kartofler", "Kartofler", "Frugt og grønt", [], VEGAN, { gpp: 120 }, "raw", 77, 2, 16, 0.1, 1.6, 0.8, 0, 0, 1000, [[2000, "g"], [1000, "g"]]],
  ["loeg", "Løg", "Frugt og grønt", [], VEGAN, { gpp: 100, unit: "stk", shelfStable: true }, "raw", 40, 1.1, 8, 0.1, 1.7, 5, 0, 0, 1200, [[1000, "g"]]],
  ["hvidloeg", "Hvidløg (fed)", "Frugt og grønt", [], VEGAN, { gpp: 5, unit: "stk", shelfStable: true }, "raw", 140, 6, 28, 0.5, 2, 1, 0.1, 0, 6000, [[100, "g"]]],
  ["gulerod", "Gulerødder", "Frugt og grønt", [], VEGAN, { gpp: 70 }, "raw", 38, 0.9, 7, 0.2, 2.8, 5, 0, 0.1, 1000, [[1000, "g"]]],
  ["broccoli", "Broccoli", "Frugt og grønt", [], VEGAN, { gpp: 300, unit: "stk" }, "raw", 34, 3, 4, 0.4, 2.6, 1.5, 0.1, 0.05, 3000, [[1, "stk"]]],
  ["spinat", "Babyspinat", "Frugt og grønt", [], VEGAN, {}, "raw", 23, 2.9, 1.4, 0.4, 2.2, 0.4, 0.1, 0.2, 6000, [[100, "g"], [200, "g"]]],
  ["peberfrugt", "Peberfrugt", "Frugt og grønt", [], VEGAN, { gpp: 160, unit: "stk" }, "raw", 30, 1, 5, 0.3, 1.8, 4.5, 0, 0, 3000, [[3, "stk"], [1, "stk"]]],
  ["agurk", "Agurk", "Frugt og grønt", [], VEGAN, { gpp: 350, unit: "stk" }, "raw", 12, 0.7, 2, 0.1, 0.5, 1.7, 0, 0, 2000, [[1, "stk"]]],
  ["tomat", "Tomater", "Frugt og grønt", [], VEGAN, { gpp: 100, unit: "stk" }, "raw", 19, 0.9, 3, 0.2, 1.2, 2.6, 0, 0, 2500, [[500, "g"]]],
  ["banan", "Banan", "Frugt og grønt", [], VEGAN, { gpp: 120, unit: "stk" }, "raw", 95, 1.1, 21, 0.3, 1.7, 17, 0.1, 0, 1800, [[1, "kg"], [5, "stk"]]],
  ["aeble", "Æble", "Frugt og grønt", [], VEGAN, { gpp: 150, unit: "stk" }, "raw", 52, 0.3, 12, 0.2, 2.2, 10, 0, 0, 2000, [[1, "kg"]]],
  ["frosne-baer", "Frosne bær, blandede", "Frost", [], VEGAN, { shelfStable: true }, "raw", 45, 0.9, 8, 0.4, 4, 7, 0, 0, 4000, [[450, "g"], [1000, "g"]]],
  ["aerter-frost", "Ærter, frost", "Frost", [], VEGAN, { shelfStable: true }, "raw", 80, 5.5, 11, 0.4, 5, 4, 0.1, 0, 2000, [[450, "g"]]],
  ["mandler", "Mandler", "Kolonial", ["nuts"], VEGAN, { shelfStable: true }, "as_sold", 600, 21, 7, 52, 12, 4, 4, 0, 12000, [[200, "g"]]],
  ["jordnoeddesmoer", "Jordnøddesmør", "Kolonial", ["peanuts"], VEGAN, { density: 1.1, shelfStable: true }, "as_sold", 620, 25, 12, 50, 6, 6, 10, 0.5, 6000, [[350, "g"]]],
  ["rapsolie", "Rapsolie", "Kolonial", [], VEGAN, { density: 0.92, unit: "spsk", shelfStable: true }, "as_sold", 900, 0, 0, 100, 0, 0, 7, 0, 2500, [[1, "l"], [500, "ml"]]],
  ["smoer", "Smør", "Mejeri", ["milk"], VEG, { shelfStable: true }, "as_sold", 740, 0.6, 0.6, 82, 0, 0.6, 52, 1.2, 8000, [[250, "g"]]],
  ["skiveost", "Skiveost 30+", "Mejeri", ["milk"], VEG, { shelfStable: true }, "as_sold", 280, 30, 0, 17, 0, 0, 11, 1.5, 7500, [[300, "g"]]],
  ["feta", "Feta", "Mejeri", ["milk"], VEG, {}, "as_sold", 250, 15, 1, 21, 0, 1, 14, 2.6, 9000, [[200, "g"]]],
  ["creme-fraiche-9", "Creme fraiche 9 %", "Mejeri", ["milk"], VEG, { density: 1.0 }, "as_sold", 120, 3.5, 4.5, 9, 0, 4.5, 6, 0.1, 3000, [[200, "g"]]],
  ["hytteost", "Hytteost 4 %", "Mejeri", ["milk"], VEG, {}, "as_sold", 90, 12, 2.5, 3.5, 0, 2.5, 2, 0.6, 3500, [[250, "g"]]],
  ["tortilla", "Hvedetortilla", "Brød", ["gluten"], VEGAN, { gpp: 40, unit: "stk", shelfStable: true }, "as_sold", 300, 8, 50, 7, 3, 3, 3, 1.2, 4000, [[8, "stk"]]],
  ["kokosmaelk", "Kokosmælk, dåse", "Kolonial", [], VEGAN, { density: 1.0, shelfStable: true }, "as_sold", 180, 1.5, 3, 18, 0, 2, 16, 0.05, 3500, [[400, "ml"]]],
  ["karry", "Karry, stødt", "Kolonial", ["mustard"], VEGAN, { density: 0.45, unit: "tsk", shelfStable: true }, "as_sold", 325, 14, 25, 14, 33, 3, 2, 0.1, 25000, [[40, "g"]]],
  ["boullionterning", "Grøntsagsbouillon, terning", "Kolonial", ["celery"], VEGAN, { gpp: 10, unit: "stk", shelfStable: true }, "as_sold", 250, 10, 20, 15, 0, 5, 7, 50, 15000, [[8, "stk"]]],
  ["honning", "Honning", "Kolonial", [], VEG, { density: 1.4, unit: "tsk", shelfStable: true }, "as_sold", 320, 0.3, 80, 0, 0, 80, 0, 0, 7000, [[450, "g"]]],
  ["tofu", "Tofu, naturel", "Køl", ["soy"], VEGAN, {}, "raw", 125, 13, 2, 7, 1, 0.5, 1, 0, 6000, [[400, "g"]]],
  ["citron", "Citron", "Frugt og grønt", [], VEGAN, { gpp: 100, unit: "stk" }, "raw", 30, 1, 3, 0.3, 2.8, 2.5, 0, 0, 3000, [[1, "stk"], [3, "stk"]]],
];

// [slug, name, description, servings, prep, cook, mealTypes, difficulty, steps, lines]
// lines: [ingredientSlug, quantity, unit, state, optional?]
export const recipes = [
  ["havregroed-med-baer", "Havregrød med bær", "Cremet havregrød kogt på letmælk med bær.", 1, 2, 8, ["breakfast"], "beginner",
    ["Bring havregryn og mælk i kog under omrøring.", "Lad grøden simre i 3–5 minutter, til den er cremet.", "Top med bær og evt. honning."],
    [["havregryn", 60, "g", "dried"], ["letmaelk", 2.5, "dl", "as_sold"], ["frosne-baer", 100, "g", "raw"], ["honning", 1, "tsk", "as_sold", true]]],
  ["skyr-med-baer-og-mandler", "Skyr med bær og mandler", "Proteinrig skål med skyr, bær, havregryn og mandler.", 1, 5, 0, ["breakfast", "snack"], "beginner",
    ["Kom skyr i en skål.", "Top med bær, havregryn og hakkede mandler."],
    [["skyr-naturel", 250, "g", "as_sold"], ["frosne-baer", 100, "g", "raw"], ["havregryn", 30, "g", "dried"], ["mandler", 15, "g", "as_sold"]]],
  ["rugbroed-med-aeg-og-tomat", "Rugbrød med æg og tomat", "Klassisk rugbrød med kogte æg og tomat.", 1, 5, 9, ["breakfast", "lunch"], "beginner",
    ["Kog æggene i 8–9 minutter, og køl dem af i koldt vand.", "Smør rugbrødet tyndt.", "Pil og skær æggene i skiver, og læg dem på brødet med tomatskiver."],
    [["rugbroed", 2, "stk", "as_sold"], ["aeg", 2, "stk", "raw"], ["tomat", 1, "stk", "raw"], ["smoer", 5, "g", "as_sold"]]],
  ["omelet-med-spinat-og-feta", "Omelet med spinat og feta", "Hurtig omelet med babyspinat og smuldret feta.", 1, 3, 6, ["breakfast", "lunch"], "beginner",
    ["Pisk æggene sammen.", "Svits spinaten kort i olie på en pande.", "Hæld æggene over, og smuldr feta over.", "Steg ved middel varme, til omeletten er stivnet."],
    [["aeg", 3, "stk", "raw"], ["spinat", 50, "g", "raw"], ["feta", 30, "g", "as_sold"], ["rapsolie", 1, "tsk", "as_sold"]]],
  ["rugbroed-med-banan-og-jordnoeddesmoer", "Rugbrød med banan og jordnøddesmør", "Mættende rugbrød med jordnøddesmør og banan.", 1, 3, 0, ["breakfast", "snack"], "beginner",
    ["Smør jordnøddesmør på rugbrødet.", "Top med bananskiver."],
    [["rugbroed", 2, "stk", "as_sold"], ["jordnoeddesmoer", 20, "g", "as_sold"], ["banan", 1, "stk", "raw"]]],
  ["kyllingesalat-med-kikaerter", "Kyllingesalat med kikærter og feta", "Frisk salat med stegt kylling, kikærter, agurk og feta.", 4, 15, 15, ["lunch"], "beginner",
    ["Steg kyllingebrystet gennem i lidt olie, og lad det hvile.", "Skyl kikærterne, og skær agurk og tomat i tern.", "Vend grøntsager og kikærter med olie og citronsaft.", "Skær kyllingen i skiver, og top med smuldret feta."],
    [["kyllingebryst", 400, "g", "raw"], ["kikaerter", 240, "g", "canned_drained"], ["agurk", 1, "stk", "raw"], ["tomat", 4, "stk", "raw"], ["feta", 100, "g", "as_sold"], ["rapsolie", 2, "spsk", "as_sold"], ["citron", 1, "stk", "raw"]]],
  ["tunwraps", "Tunwraps med spinat", "Wraps med tun, creme fraiche, agurk og spinat.", 2, 10, 0, ["lunch"], "beginner",
    ["Rør tun og creme fraiche sammen.", "Skær agurken i tynde stave.", "Fordel spinat, tunsalat og agurk på tortillaerne, og rul dem sammen."],
    [["tun-i-vand", 240, "g", "canned_drained"], ["creme-fraiche-9", 100, "g", "as_sold"], ["agurk", 0.5, "stk", "raw"], ["tortilla", 4, "stk", "as_sold"], ["spinat", 60, "g", "raw"]]],
  ["linsesuppe-med-gulerod", "Linsesuppe med gulerod og karry", "Varmende vegansk suppe med røde linser.", 4, 10, 25, ["lunch", "dinner"], "beginner",
    ["Hak løg og hvidløg, og skær gulerødderne i tern.", "Svits løg, hvidløg og karry i olie.", "Tilsæt linser, gulerødder, tomater, bouillon og 1 liter vand.", "Kog i 20 minutter, til linserne er møre. Blend evt. suppen."],
    [["roede-linser", 250, "g", "dried"], ["gulerod", 4, "stk", "raw"], ["loeg", 1, "stk", "raw"], ["hvidloeg", 2, "stk", "raw"], ["hakkede-tomater", 400, "g", "as_sold"], ["boullionterning", 1, "stk", "as_sold"], ["rapsolie", 1, "spsk", "as_sold"], ["karry", 2, "tsk", "as_sold"]]],
  ["rugbroed-med-hytteost", "Rugbrød med hytteost og agurk", "Let frokost med hytteost og sprød agurk.", 1, 5, 0, ["lunch", "snack"], "beginner",
    ["Fordel hytteost på rugbrødet.", "Top med agurkeskiver og evt. peber."],
    [["rugbroed", 2, "stk", "as_sold"], ["hytteost", 100, "g", "as_sold"], ["agurk", 0.25, "stk", "raw"]]],
  ["laks-med-kartofler-og-broccoli", "Ovnbagt laks med kartofler og broccoli", "Laks i ovn med kogte kartofler og broccoli.", 4, 10, 25, ["dinner"], "beginner",
    ["Kog kartoflerne møre i 20 minutter.", "Bag laksen ved 200 °C i 12–15 minutter med citronskiver.", "Damp broccolien i 4–5 minutter.", "Server med en klat smør på kartoflerne."],
    [["laksefilet", 500, "g", "raw"], ["kartofler", 800, "g", "raw"], ["broccoli", 1, "stk", "raw"], ["citron", 1, "stk", "raw"], ["smoer", 20, "g", "as_sold", true]]],
  ["kylling-i-karry-med-ris", "Kylling i karry med ris", "Cremet karryret med kylling, peberfrugt og kokosmælk.", 4, 15, 25, ["dinner"], "intermediate",
    ["Kog risene efter anvisningen på pakken.", "Skær kylling, løg og peberfrugt i stykker.", "Brun kyllingen i olie, tilsæt løg, hvidløg og karry.", "Tilsæt kokosmælk og peberfrugt, og lad det simre i 15 minutter."],
    [["kyllingebryst", 500, "g", "raw"], ["ris-basmati", 300, "g", "dried"], ["kokosmaelk", 400, "ml", "as_sold"], ["loeg", 1, "stk", "raw"], ["peberfrugt", 2, "stk", "raw"], ["hvidloeg", 2, "stk", "raw"], ["karry", 1, "spsk", "as_sold"], ["rapsolie", 1, "spsk", "as_sold"]]],
  ["chili-sin-carne", "Chili sin carne", "Vegansk chili med bønner og peberfrugt, serveret med ris.", 4, 15, 30, ["dinner", "lunch"], "beginner",
    ["Hak løg, hvidløg og peberfrugt.", "Svits grøntsagerne i olie.", "Tilsæt bønner og tomater, og lad det simre i 20 minutter.", "Kog risene, og server chilien over."],
    [["kidneyboenner", 480, "g", "canned_drained"], ["hakkede-tomater", 800, "g", "as_sold"], ["loeg", 2, "stk", "raw"], ["peberfrugt", 2, "stk", "raw"], ["hvidloeg", 3, "stk", "raw"], ["ris-basmati", 300, "g", "dried"], ["rapsolie", 1, "spsk", "as_sold"]]],
  ["pasta-bolognese", "Pasta bolognese", "Klassisk kødsauce med gulerod og pasta.", 4, 10, 30, ["dinner"], "beginner",
    ["Brun kødet i olie.", "Tilsæt hakket løg, hvidløg og revet gulerod.", "Tilsæt tomater, og lad saucen simre i 20 minutter.", "Kog pastaen, og server med saucen."],
    [["hakket-oksekoed", 500, "g", "raw"], ["pasta", 400, "g", "dried"], ["hakkede-tomater", 800, "g", "as_sold"], ["loeg", 1, "stk", "raw"], ["gulerod", 2, "stk", "raw"], ["hvidloeg", 2, "stk", "raw"], ["rapsolie", 1, "spsk", "as_sold"]]],
  ["torsk-med-ris-og-aerter", "Torsk med ris og ærter", "Mild, dampet torsk med citron, ris og ærter.", 4, 10, 20, ["dinner"], "beginner",
    ["Kog risene.", "Damp torsken i 8–10 minutter med citronskiver.", "Kog ærterne kort.", "Server med smeltet smør og citron."],
    [["torskefilet", 500, "g", "raw"], ["ris-basmati", 250, "g", "dried"], ["aerter-frost", 300, "g", "raw"], ["citron", 1, "stk", "raw"], ["smoer", 20, "g", "as_sold"]]],
  ["tofu-wok-med-ris", "Wok med tofu og grøntsager", "Hurtig wok med sprød tofu, broccoli og peberfrugt.", 3, 15, 15, ["dinner"], "intermediate",
    ["Kog risene.", "Skær tofuen i tern, og steg den gylden i olie.", "Tilsæt grøntsagerne, og wok dem i 4–5 minutter.", "Server over risene."],
    [["tofu", 400, "g", "raw"], ["ris-basmati", 250, "g", "dried"], ["broccoli", 1, "stk", "raw"], ["peberfrugt", 1, "stk", "raw"], ["gulerod", 2, "stk", "raw"], ["rapsolie", 2, "spsk", "as_sold"]]],
  ["kartoffelfrittata", "Kartoffelfrittata med spinat", "Ovnbagt æggekage med kartofler, løg og spinat.", 4, 15, 30, ["dinner", "lunch"], "beginner",
    ["Kog kartoflerne, og skær dem i skiver.", "Svits løg og spinat i olie i en ovnfast pande.", "Fordel kartofler i panden, og hæld piskede æg over.", "Bag ved 200 °C i 15–20 minutter."],
    [["aeg", 8, "stk", "raw"], ["kartofler", 500, "g", "raw"], ["loeg", 1, "stk", "raw"], ["spinat", 100, "g", "raw"], ["rapsolie", 1, "spsk", "as_sold"]]],
  ["kyllingewraps", "Kyllingewraps", "Wraps med stegt kylling, peberfrugt, agurk og creme fraiche.", 4, 15, 15, ["dinner", "lunch"], "beginner",
    ["Steg kyllingen i strimler.", "Skær peberfrugt og agurk i strimler.", "Fyld tortillaerne med kylling, grønt og creme fraiche."],
    [["kyllingebryst", 400, "g", "raw"], ["tortilla", 8, "stk", "as_sold"], ["peberfrugt", 2, "stk", "raw"], ["agurk", 1, "stk", "raw"], ["creme-fraiche-9", 150, "g", "as_sold"]]],
  ["aeble-med-jordnoeddesmoer", "Æble med jordnøddesmør", "Enkelt mellemmåltid.", 1, 2, 0, ["snack"], "beginner",
    ["Skær æblet i både, og server med jordnøddesmør."],
    [["aeble", 1, "stk", "raw"], ["jordnoeddesmoer", 20, "g", "as_sold"]]],
  ["skyr-med-banan", "Skyr med banan", "Proteinrigt mellemmåltid.", 1, 2, 0, ["snack", "breakfast"], "beginner",
    ["Kom skyr i en skål, og top med bananskiver."],
    [["skyr-naturel", 200, "g", "as_sold"], ["banan", 1, "stk", "raw"]]],
  ["banan-og-mandler", "Banan og mandler", "Nemt mellemmåltid til farten.", 1, 1, 0, ["snack"], "beginner",
    ["Pak en banan og en håndfuld mandler."],
    [["banan", 1, "stk", "raw"], ["mandler", 25, "g", "as_sold"]]],
];

// Fictional demo chains used only for synthetic price fixtures.
export const demoRetailers = [
  { slug: "demo-nord", name: "Demo Nord (syntetisk)", factor: 1.0, skip: ["torskefilet", "tofu"] },
  { slug: "demo-syd", name: "Demo Syd (syntetisk)", factor: 0.93, skip: ["laksefilet", "hytteost", "boullionterning"] },
  { slug: "demo-vest", name: "Demo Vest (syntetisk)", factor: 1.08, skip: [] },
];
