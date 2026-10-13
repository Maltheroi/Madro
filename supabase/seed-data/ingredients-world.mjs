// Extra development ingredients for Thai, Asian, Danish, Italian, Mexican and
// fitness recipes. Same tuple format and same caveats as catalog.mjs:
// nutrition is approximate per 100 g (source "dev-seed-approximate"), prices
// feed SYNTHETIC fixtures only.
//
// [slug, name_da, category, allergens, dietTags, {density, gpp, yield, shelfStable, unit}, state,
//  kcal, protein, carb, fat, fiber, sugars, satFat, salt, basePriceOrePerKgOrL, packs]

const VEGAN = ["vegan", "vegetarian", "pescetarian"];
const VEG = ["vegetarian", "pescetarian"];
const PESC = ["pescetarian"];

// prettier-ignore
export const worldIngredients = [
  // Asian and Thai
  ["jasminris", "Jasminris", "Kolonial", [], VEGAN, { yield: 2.8, shelfStable: true }, "dried", 355, 7, 79, 0.6, 1, 0.1, 0.2, 0, 2500, [[1, "kg"]]],
  ["risnudler", "Risnudler", "Kolonial", [], VEGAN, { yield: 2.5, shelfStable: true }, "dried", 360, 6, 80, 0.6, 1.6, 0, 0.2, 0.05, 4500, [[250, "g"]]],
  ["aegnudler", "Ægnudler", "Kolonial", ["gluten", "egg"], VEG, { yield: 2.4, shelfStable: true }, "dried", 370, 13, 70, 3.5, 3, 2, 1, 0.3, 4000, [[250, "g"]]],
  ["fiskesauce", "Fiskesauce", "Kolonial", ["fish"], PESC, { density: 1.2, unit: "spsk", shelfStable: true }, "as_sold", 35, 5, 4, 0, 0, 3.6, 0, 23, 6000, [[200, "ml"]]],
  ["sojasauce", "Sojasauce", "Kolonial", ["soy", "gluten"], VEGAN, { density: 1.15, unit: "spsk", shelfStable: true }, "as_sold", 55, 8, 5, 0.1, 0.8, 0.4, 0, 15, 5000, [[150, "ml"]]],
  ["roed-karrypasta", "Rød karrypasta", "Kolonial", ["crustaceans"], PESC, { density: 1.1, unit: "spsk", shelfStable: true }, "as_sold", 120, 2.5, 12, 7, 4, 5, 1, 8, 15000, [[100, "g"]]],
  ["groen-karrypasta", "Grøn karrypasta", "Kolonial", ["crustaceans"], PESC, { density: 1.1, unit: "spsk", shelfStable: true }, "as_sold", 110, 2.5, 11, 6, 4, 4, 1, 8, 15000, [[100, "g"]]],
  ["sesamolie", "Sesamolie", "Kolonial", ["sesame"], VEGAN, { density: 0.92, unit: "tsk", shelfStable: true }, "as_sold", 884, 0, 0, 100, 0, 0, 14, 0, 12000, [[250, "ml"]]],
  ["jordnoedder", "Jordnødder, usaltede", "Kolonial", ["peanuts"], VEGAN, { shelfStable: true }, "as_sold", 590, 26, 13, 49, 8, 4, 7, 0, 5000, [[250, "g"]]],
  ["ingefaer", "Ingefær", "Frugt og grønt", [], VEGAN, {}, "raw", 80, 1.8, 18, 0.8, 2, 1.7, 0.2, 0, 4000, [[100, "g"]]],
  ["lime", "Lime", "Frugt og grønt", [], VEGAN, { gpp: 60, unit: "stk" }, "raw", 30, 0.7, 10, 0.2, 2.8, 1.7, 0, 0, 3000, [[3, "stk"]]],
  ["koriander", "Frisk koriander", "Frugt og grønt", [], VEGAN, {}, "raw", 23, 2, 4, 0.5, 2.8, 0.9, 0, 0.1, 25000, [[25, "g"]]],
  ["foraarsloeg", "Forårsløg", "Frugt og grønt", [], VEGAN, { gpp: 15, unit: "stk" }, "raw", 32, 1.8, 7, 0.2, 2.6, 2.3, 0, 0, 5000, [[8, "stk"]]],
  ["chili", "Rød chili", "Frugt og grønt", [], VEGAN, { gpp: 10, unit: "stk" }, "raw", 40, 1.9, 9, 0.4, 1.5, 5, 0, 0, 8000, [[5, "stk"]]],
  ["boennespirer", "Bønnespirer", "Frugt og grønt", [], VEGAN, {}, "raw", 30, 3, 6, 0.2, 1.8, 4, 0, 0, 3000, [[200, "g"]]],
  ["sukkeraerter", "Sukkerærter", "Frugt og grønt", [], VEGAN, {}, "raw", 42, 2.8, 7.5, 0.2, 2.6, 4, 0, 0, 6000, [[200, "g"]]],
  ["spidskaal", "Spidskål", "Frugt og grønt", [], VEGAN, { gpp: 800 }, "raw", 25, 1.3, 6, 0.1, 2.5, 3.2, 0, 0, 1800, [[1, "stk"]]],
  ["edamame", "Edamamebønner, frost", "Frost", ["soy"], VEGAN, {}, "raw", 120, 11, 9, 5, 5, 2, 0.6, 0, 4500, [[400, "g"]]],
  ["rejer", "Rejer, rå og pillede", "Frost", ["crustaceans"], PESC, { yield: 0.85 }, "raw", 85, 20, 0, 1, 0, 0, 0.3, 0.6, 15000, [[400, "g"]]],
  ["hakket-svinekoed", "Hakket svinekød 8-12 %", "Kød", [], [], { yield: 0.72 }, "raw", 180, 19, 0, 11, 0, 0, 4, 0.15, 6500, [[500, "g"]]],
  ["svinemoerbrad", "Svinemørbrad", "Kød", [], [], { yield: 0.75 }, "raw", 120, 21, 0, 4, 0, 0, 1.4, 0.15, 11000, [[500, "g"]]],
  // Danish
  ["svinebryst", "Svinebryst i skiver", "Kød", [], [], { yield: 0.6 }, "raw", 400, 14, 0, 38, 0, 0, 14, 0.15, 7000, [[500, "g"]]],
  ["hvedemel", "Hvedemel", "Kolonial", ["gluten"], VEGAN, { density: 0.55, shelfStable: true }, "dried", 340, 10, 71, 1.2, 3, 0.5, 0.2, 0, 1000, [[1, "kg"]]],
  ["persille", "Frisk persille", "Frugt og grønt", [], VEGAN, {}, "raw", 36, 3, 6, 0.8, 3.3, 0.9, 0.1, 0.1, 20000, [[25, "g"]]],
  ["roedkaal", "Rødkål, syltet", "Kolonial", [], VEGAN, { shelfStable: true }, "as_sold", 60, 1, 13, 0.3, 2, 11, 0, 0.6, 2500, [[580, "g"]]],
  ["roedbeder", "Rødbeder, syltede", "Kolonial", [], VEGAN, { shelfStable: true }, "as_sold", 55, 1.2, 12, 0.1, 2, 10, 0, 0.5, 2500, [[570, "g"]]],
  ["kogt-skinke", "Kogt skinke, pålæg", "Køl", [], [], {}, "as_sold", 110, 18, 1, 4, 0, 1, 1.4, 2.2, 15000, [[100, "g"]]],
  ["remoulade", "Remoulade", "Køl", ["egg", "mustard"], VEG, { density: 1, unit: "spsk" }, "as_sold", 360, 1, 12, 34, 1, 9, 3, 1.5, 5000, [[375, "g"]]],
  ["sennep", "Sennep", "Kolonial", ["mustard"], VEGAN, { density: 1.1, unit: "tsk", shelfStable: true }, "as_sold", 150, 6, 12, 8, 3, 8, 0.5, 4, 4000, [[350, "g"]]],
  // Italian
  ["mozzarella", "Mozzarella", "Mejeri", ["milk"], VEG, {}, "as_sold", 250, 18, 2, 19, 0, 1, 13, 0.5, 9000, [[125, "g"]]],
  ["parmesan", "Parmesan", "Mejeri", ["milk"], VEG, {}, "as_sold", 400, 35, 0, 28, 0, 0, 18, 1.6, 25000, [[100, "g"]]],
  ["olivenolie", "Olivenolie", "Kolonial", [], VEGAN, { density: 0.91, unit: "spsk", shelfStable: true }, "as_sold", 884, 0, 0, 100, 0, 0, 14, 0, 9000, [[500, "ml"]]],
  ["basilikum", "Frisk basilikum", "Frugt og grønt", [], VEGAN, {}, "raw", 23, 3, 3, 0.6, 1.6, 0.3, 0, 0, 25000, [[25, "g"]]],
  ["champignon", "Champignon", "Frugt og grønt", [], VEGAN, {}, "raw", 22, 3, 3, 0.3, 1, 2, 0, 0, 4500, [[250, "g"]]],
  ["squash", "Squash", "Frugt og grønt", [], VEGAN, { gpp: 300, unit: "stk" }, "raw", 17, 1.2, 3, 0.3, 1, 2.5, 0, 0, 2500, [[1, "stk"]]],
  ["risottoris", "Risottoris", "Kolonial", [], VEGAN, { yield: 2.5, shelfStable: true }, "dried", 350, 7, 78, 0.6, 1, 0, 0.2, 0, 3500, [[500, "g"]]],
  ["fuldkornspasta", "Fuldkornspasta", "Kolonial", ["gluten"], VEGAN, { yield: 2.4, shelfStable: true }, "dried", 350, 13, 63, 2.5, 8, 3, 0.5, 0, 2500, [[500, "g"]]],
  ["tomatpure", "Tomatpuré", "Kolonial", [], VEGAN, { density: 1.1, unit: "spsk", shelfStable: true }, "as_sold", 85, 4.5, 14, 0.5, 4, 12, 0.1, 0.2, 3500, [[140, "g"]]],
  ["gaer", "Gær", "Køl", [], VEGAN, {}, "as_sold", 105, 13, 9, 1.5, 7, 0, 0.2, 0, 4000, [[50, "g"]]],
  ["kyllingelaar", "Kyllingelår uden ben", "Kød", [], [], { yield: 0.75 }, "raw", 160, 19, 0, 9, 0, 0, 2.5, 0.2, 7000, [[500, "g"]]],
  // Mexican
  ["sorte-boenner", "Sorte bønner", "Kolonial", [], VEGAN, { shelfStable: true }, "canned_drained", 130, 8.5, 17, 0.5, 7, 0.3, 0.1, 0.3, 2500, [[400, "g"]]],
  ["majs", "Majs, dåse", "Kolonial", [], VEGAN, { shelfStable: true }, "canned_drained", 80, 2.7, 14, 1.2, 2.5, 4.5, 0.2, 0.4, 2500, [[340, "g"]]],
  ["avocado", "Avocado", "Frugt og grønt", [], VEGAN, { gpp: 150, unit: "stk" }, "raw", 160, 2, 2, 15, 7, 0.7, 2.1, 0, 4500, [[2, "stk"]]],
  ["spidskommen", "Spidskommen, stødt", "Kolonial", [], VEGAN, { density: 0.4, unit: "tsk", shelfStable: true }, "as_sold", 375, 18, 34, 22, 11, 2, 1.5, 0.4, 25000, [[40, "g"]]],
  ["paprika-krydderi", "Paprika, stødt", "Kolonial", [], VEGAN, { density: 0.45, unit: "tsk", shelfStable: true }, "as_sold", 280, 14, 18, 13, 35, 10, 2, 0.1, 25000, [[40, "g"]]],
  ["revet-ost", "Revet ost 30+", "Mejeri", ["milk"], VEG, {}, "as_sold", 330, 27, 0, 25, 0, 0, 16, 1.5, 9000, [[175, "g"]]],
  ["roedloeg", "Rødløg", "Frugt og grønt", [], VEGAN, { gpp: 100, unit: "stk" }, "raw", 40, 1.1, 9, 0.1, 1.7, 4, 0, 0, 2000, [[500, "g"]]],
  // Fitness
  ["soede-kartofler", "Søde kartofler", "Frugt og grønt", [], VEGAN, { gpp: 250 }, "raw", 86, 1.6, 20, 0.1, 3, 4, 0, 0.1, 2500, [[1, "kg"]]],
  ["hakket-kalkun", "Hakket kalkun 4-7 %", "Kød", [], [], { yield: 0.75 }, "raw", 130, 21, 0, 5, 0, 0, 1.5, 0.15, 9000, [[400, "g"]]],
  ["kvark", "Kvark 0,3 %", "Mejeri", ["milk"], VEG, { density: 1.05 }, "as_sold", 65, 11, 4, 0.3, 0, 4, 0.2, 0.1, 3000, [[500, "g"]]],
  ["aeggehvider", "Æggehvider, pasteuriserede", "Køl", ["egg"], VEG, { density: 1.03, unit: "dl" }, "as_sold", 48, 11, 0.7, 0.2, 0, 0.7, 0, 0.4, 4500, [[500, "ml"]]],
  ["quinoa", "Quinoa", "Kolonial", [], VEGAN, { yield: 2.7, shelfStable: true }, "dried", 368, 14, 64, 6, 7, 0, 0.7, 0, 6000, [[500, "g"]]],
  ["roeget-laks", "Røget laks", "Fisk", ["fish"], PESC, {}, "as_sold", 180, 22, 0, 10, 0, 0, 2, 3, 30000, [[100, "g"]]],
  ["blaabaer", "Blåbær", "Frugt og grønt", [], VEGAN, {}, "raw", 57, 0.7, 14, 0.3, 2.4, 10, 0, 0, 10000, [[125, "g"]]],
];
