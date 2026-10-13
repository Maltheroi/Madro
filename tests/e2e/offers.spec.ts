import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signUpAndOnboard } from "./helpers";

// ShelfAtlas is not called in tests; offer rows are inserted directly into the
// local database, the way the sync job writes them.
const sql = postgres(
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

test.beforeAll(async () => {
  await sql`
    insert into public.promotional_offers
      (retailer_id, source_key, external_id, title, price_ore, regular_price_ore, unit_price_ore, unit_price_unit, valid_from, valid_to)
    select r.id, 'shelfatlas', v.id, v.title, v.price, v.regular, v.unit, 'kg', now() - interval '1 day', now() + interval '5 days'
    from public.retailers r,
      (values ('e2e-havre', 'E2E Havregryn 1 kg', 1295, 1995, 1295),
              ('e2e-ost', 'E2E Skiveost 30+ 450 g', 2995, null, 6656)) v(id, title, price, regular, unit)
    where r.slug = 'netto'
    on conflict (source_key, external_id) do update set valid_to = excluded.valid_to`;
});

test.afterAll(async () => {
  await sql.end();
});

test("weekly offers: search, chain filter and the food-waste page without a key", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signUpAndOnboard(page);

  await page.goto("/indkobsliste");
  await page.getByRole("link", { name: "Ugens tilbud" }).click();
  await expect(page.getByRole("heading", { name: "Ugens tilbud" })).toBeVisible();
  await expect(page.getByText(/kampagnepriser, ikke almindelige hyldepriser/)).toBeVisible();

  await page.getByLabel("Søg i tilbud").fill("e2e havregryn");
  await page.getByRole("button", { name: "Søg" }).click();
  await expect(page.getByText("E2E Havregryn 1 kg")).toBeVisible();
  await expect(page.getByText("E2E Skiveost 30+ 450 g")).toHaveCount(0);
  await expect(page.getByText("12,95 kr.").first()).toBeVisible();

  await page.getByLabel("Søg i tilbud").fill("e2e");
  await page.getByLabel("Kæde").selectOption({ label: "Netto" });
  await page.getByRole("button", { name: "Søg" }).click();
  await expect(page.getByText("E2E Skiveost 30+ 450 g")).toBeVisible();

  await page.getByRole("link", { name: "Madspild nær dig" }).click();
  await expect(page.getByRole("heading", { name: "Madspild nær dig" })).toBeVisible();
  await expect(page.getByText(/Ikke sat op endnu|Vi mangler dit postnummer/)).toBeVisible();
});
