import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signUpAndOnboard } from "./helpers";

// Open Food Facts is not called in tests; a provider row is inserted directly
// into the local database to check how shared, unverified products are shown.
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);
const OFF_CODE = "5700000000011";

test.beforeAll(async () => {
  await sql`
    insert into public.packaged_products (source_key, code, gtin, name, brand, allergens, energy_kcal, protein_g, carbohydrate_g, fat_g, data_quality, licence, source_url)
    values ('open-food-facts', ${OFF_CODE}, ${OFF_CODE}, 'E2E-skyr naturel', 'Testmejeri', '{milk}', 63, 11, 4, 0.2, 'complete', 'ODbL 1.0',
            ${`https://world.openfoodfacts.org/product/${OFF_CODE}`})
    on conflict (source_key, code) where created_by is null do nothing`;
});

// The fixture row is left in the local test database: projects run in parallel
// workers, and deleting it here would race with the other project's test.
test.afterAll(async () => {
  await sql.end();
});

test("find products by barcode and name, create own products and log them", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpAndOnboard(page);
  await page.goto("/madregistrering");
  await page.getByRole("tab", { name: "Vare", exact: true }).click();

  // Invalid check digit
  await page.getByLabel("Stregkode").fill("5700000000018");
  await page.getByRole("button", { name: "Slå op" }).click();
  await expect(page.getByText(/Stregkoden er ikke gyldig/)).toBeVisible();

  // Shared Open Food Facts product: unverified, with attribution
  await page.getByLabel("Stregkode").fill(OFF_CODE);
  await page.getByRole("button", { name: "Slå op" }).click();
  await expect(page.getByRole("heading", { name: "E2E-skyr naturel" })).toBeVisible();
  await expect(page.getByText("Ikke verificeret")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Food Facts" })).toHaveAttribute(
    "href",
    `https://world.openfoodfacts.org/product/${OFF_CODE}`,
  );
  await expect(page.getByText(/Allergener ifølge kilden: Mælk/)).toBeVisible();
  await page.getByLabel("Gram").fill("150");
  await expect(page.getByText(/95 kcal/)).toBeVisible();
  await page.getByRole("button", { name: "Tilføj" }).click();
  await expect(page.getByText("Registreret.")).toBeVisible();
  await expect(page.getByText("E2E-skyr naturel (Testmejeri)")).toBeVisible();

  // Unknown barcode: create the product from the package
  await page.getByRole("button", { name: "Vælg en anden vare" }).click();
  await page.getByLabel("Stregkode").fill("4006381333931");
  await page.getByRole("button", { name: "Slå op" }).click();
  await expect(page.getByText(/findes ikke i vores varekatalog/)).toBeVisible();
  await expect(page.getByLabel("Stregkode")).toHaveValue("4006381333931");
  await page.getByLabel("Navn").fill("Mit rugbrød");
  await page.getByLabel("Kalorier (kcal)").fill("220");
  await page.getByLabel("Protein (g)").fill("7");
  await page.getByLabel("Fedt (g)").fill("3,5");
  await page.getByRole("button", { name: "Gem vare" }).click();
  await expect(page.getByRole("heading", { name: "Mit rugbrød" })).toBeVisible();
  await expect(page.getByText("Din egen vare")).toBeVisible();
  await page.getByLabel("Gram").fill("50");
  await expect(page.getByText(/110 kcal.*kulhydrat er ukendt/)).toBeVisible();
  await page.getByRole("button", { name: "Tilføj" }).click();
  await expect(page.getByText("Mit rugbrød", { exact: true }).last()).toBeVisible();

  // Search finds both the shared and the own product
  await page.getByRole("button", { name: "Vælg en anden vare" }).click();
  await page.getByLabel("Søg efter vare").fill("rugbr");
  const results = page.getByRole("list", { name: "Søgeresultater" });
  await expect(results.getByText("Mit rugbrød")).toBeVisible();
  await page.getByLabel("Søg efter vare").fill("skyr");
  await expect(results.getByText("E2E-skyr naturel")).toBeVisible();
});
