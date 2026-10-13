/**
 * Matching leaflet offers to shopping list items by name.
 *
 * Offers come with a free-text title ("Danpo kyllingebrystfilet 900 g") and
 * no link to our ingredients, so this is a suggestion, never a price the
 * basket optimizer uses. The rule is deliberately strict to avoid false
 * hits: every significant word of an ingredient name must appear in the offer
 * title as a whole word (allowing Danish plural/definite endings), or as the
 * start of a longer compound when the word has at least 6 letters
 * ("kyllingebryst" matches "kyllingebrystfilet", "smør" does not match
 * "jordnøddesmør" or "smørbar").
 */

const STOPWORDS = new Set(["i", "med", "og", "af", "til", "på", "uden", "fra", "en", "et"]);
const ENDINGS = ["", "e", "er", "r", "s", "n", "en", "et", "ne", "erne", "rne"];
const PREFIX_MIN = 6;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/[^a-zæøåéü0-9]+/g, " ")
    .trim();
}

export function words(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Search terms for an ingredient name: the part before a comma or
 * parenthesis, without amounts ("Hakket oksekød 8–12 %" → "hakket oksekød").
 */
export function searchTerms(name: string, synonyms: string[] = []): string[][] {
  const terms = [name, ...synonyms]
    .map((n) => n.split(/[,(]/)[0])
    .map((n) => words(n.replace(/\d+([.,]\d+)?\s*(-\s*\d+)?\s*%?/g, " ")))
    .filter((t) => t.length > 0);
  const seen = new Set<string>();
  return terms.filter((t) => {
    const key = t.join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wordMatches(term: string, titleWords: string[]): boolean {
  return titleWords.some(
    (w) => ENDINGS.some((e) => w === term + e) || (term.length >= PREFIX_MIN && w.startsWith(term)),
  );
}

export function titleMatches(title: string, terms: string[][]): boolean {
  const tw = normalize(title).split(" ");
  return terms.some((term) => term.every((t) => wordMatches(t, tw)));
}

export interface MatchableOffer {
  id: string;
  title: string;
  priceOre: number;
  validTo: string;
}

export interface MatchableItem {
  key: string;
  name: string;
  synonyms?: string[];
}

/**
 * For each item, the offers whose title matches, cheapest first, at most
 * `perItem`. Items without a match are left out.
 */
export function matchOffersToItems<T extends MatchableOffer>(
  items: MatchableItem[],
  offers: T[],
  perItem = 3,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const terms = searchTerms(item.name, item.synonyms);
    if (!terms.length) continue;
    const hits = offers
      .filter((o) => titleMatches(o.title, terms))
      .sort((a, b) => a.priceOre - b.priceOre || a.title.localeCompare(b.title, "da"))
      .slice(0, perItem);
    if (hits.length) result.set(item.key, hits);
  }
  return result;
}
