import { describe, expect, it } from "vitest";
import { matchOffersToItems, searchTerms, titleMatches } from "./match";

describe("searchTerms", () => {
  it("drops qualifiers, amounts and stopwords", () => {
    expect(searchTerms("Hakket oksekød 8–12 %")).toEqual([["hakket", "oksekød"]]);
    expect(searchTerms("Tun i vand, drænet")).toEqual([["tun", "vand"]]);
    expect(searchTerms("Hvidløg (fed)")).toEqual([["hvidløg"]]);
    expect(searchTerms("Letmælk 1,5 %")).toEqual([["letmælk"]]);
  });

  it("adds synonyms without duplicates", () => {
    expect(searchTerms("Kikærter, dåse", ["kikærter", "garbanzo"])).toEqual([
      ["kikærter"],
      ["garbanzo"],
    ]);
  });
});

describe("titleMatches", () => {
  const t = (name: string) => searchTerms(name);

  it("matches whole words in any order", () => {
    expect(titleMatches("Oksekød hakket 8-12% 500 g", t("Hakket oksekød 8–12 %"))).toBe(true);
    expect(titleMatches("Løg 1 kg", t("Løg"))).toBe(true);
  });

  it("allows Danish endings", () => {
    expect(titleMatches("Økologiske bananer", t("Banan"))).toBe(true);
    expect(titleMatches("Gulerødderne fra Lammefjorden", t("Gulerødder"))).toBe(true);
  });

  it("matches compounds only for long words", () => {
    expect(titleMatches("Danpo kyllingebrystfilet 900 g", t("Kyllingebryst"))).toBe(true);
    expect(titleMatches("Jordnøddesmør 350 g", t("Smør"))).toBe(false);
    expect(titleMatches("Smørbar 250 g", t("Smør"))).toBe(false);
    expect(titleMatches("Hvidløg 3 stk", t("Løg"))).toBe(false);
  });

  it("needs every word of the name", () => {
    expect(titleMatches("Tun i olie", t("Tun i vand, drænet"))).toBe(false);
    expect(titleMatches("Hakkede tomater 400 g", t("Hakkede tomater, dåse"))).toBe(true);
  });
});

describe("matchOffersToItems", () => {
  const offers = [
    { id: "a", title: "Kyllingebryst 1 kg", priceOre: 7995, validTo: "2026-10-18T21:59:00Z" },
    { id: "b", title: "Kyllingebrystfilet 500 g", priceOre: 4000, validTo: "2026-10-18T21:59:00Z" },
    { id: "c", title: "Lurpak smør 200 g", priceOre: 2000, validTo: "2026-10-18T21:59:00Z" },
  ];

  it("returns the cheapest matches per item and skips items without matches", () => {
    const m = matchOffersToItems(
      [
        { key: "kylling", name: "Kyllingebryst" },
        { key: "smoer", name: "Smør" },
        { key: "tofu", name: "Tofu, naturel" },
      ],
      offers,
      1,
    );
    expect(m.get("kylling")?.map((o) => o.id)).toEqual(["b"]);
    expect(m.get("smoer")?.map((o) => o.id)).toEqual(["c"]);
    expect(m.has("tofu")).toBe(false);
  });
});
