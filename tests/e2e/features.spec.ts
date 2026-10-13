import { expect, test } from "@playwright/test";
import { PASSWORD, signUpAndOnboard } from "./helpers";

test.describe("feature screens", () => {
  test.describe.configure({ mode: "serial" });

  test("diary, weight, shopping, pantry, goals, export and account deletion", async ({ page }) => {
    test.setTimeout(120_000);
    const email = await signUpAndOnboard(page, { budgetKr: "900" });

    // Meal plan is the source for diary shortcuts and the shopping list.
    await page.goto("/madplan");
    await page.getByRole("button", { name: "Lav min madplan" }).click();
    await expect(page.getByText(/Uge fra/)).toBeVisible({ timeout: 20_000 });
    // The plan is aimed at the 900 kr weekly budget from onboarding.
    await expect(page.getByText(/Forventet indkøb for ugen/)).toBeVisible();

    // --- Madregistrering
    await page.goto("/madregistrering");
    await expect(page.getByRole("heading", { name: "Madregistrering" })).toBeVisible();
    const planTab = page.getByRole("tabpanel");
    await planTab.getByRole("button", { name: "Registrér" }).first().click();
    await expect(page.getByText("Registreret.")).toBeVisible();
    await page.getByRole("tab", { name: "Manuelt" }).click();
    await page.getByLabel("Hvad har du spist?").fill("Æble");
    await page.getByLabel("Kalorier").fill("80");
    await page.getByLabel("Protein (g)").fill("0,3");
    await page.getByRole("button", { name: "Tilføj" }).click();
    await expect(page.getByText("Æble", { exact: true })).toBeVisible();
    await expect(page.getByText(/manuelt indtastet/)).toBeVisible();
    await page.getByRole("button", { name: "Slet Æble" }).click();
    await expect(page.getByText("Æble", { exact: true })).toHaveCount(0);
    await page.getByLabel(/Dagen er fuldt registreret/).check();
    await expect(page.getByLabel(/Dagen er fuldt registreret/)).toBeChecked();

    // --- Vægt og mål
    await page.goto("/vaegt");
    await page.getByLabel("Vægt (kg)").fill("84,1");
    await page.getByRole("button", { name: "Gem vægt" }).click();
    await expect(page.getByText("Vægt gemt.")).toBeVisible();
    await expect(page.getByText(/84,1 kg/).first()).toBeVisible();
    await page.getByLabel("Talje (cm)").fill("92");
    await page.getByRole("button", { name: "Gem måling" }).click();
    await expect(page.getByText(/talje 92/)).toBeVisible();
    // Weight outside the allowed range is rejected with a Danish message
    await page.getByLabel("Vægt (kg)").fill("12");
    await page.getByRole("button", { name: "Gem vægt" }).click();
    await expect(page.getByText("Vægt skal være mellem 30 og 300.")).toBeVisible();
    await expect(page.getByText("Vejedage")).toBeVisible();

    // --- Spisekammer
    await page.goto("/spisekammer");
    await page.getByLabel("Fødevare").selectOption({ label: "Havregryn" });
    await page.getByLabel("Mængde").fill("200");
    await page.getByRole("button", { name: "Gem" }).click();
    await expect(page.getByText(/Havregryn: 200 g/)).toBeVisible();

    // --- Indkøbsliste via butikssammenligning
    await page.goto("/indkobsliste");
    await expect(page.getByText("Det skal du bruge denne uge")).toBeVisible();
    await page.getByRole("link", { name: "Sammenlign butikker" }).click();
    await page.getByRole("button", { name: "Beregn kurv" }).click();
    await expect(page.getByText(/Anbefalet: |Ingen anbefaling/)).toBeVisible({ timeout: 20_000 });
    // Demo prices are always labelled as synthetic
    await expect(page.getByText(/syntetiske|Syntetisk/).first()).toBeVisible();
    await page
      .getByRole("button", { name: /Lav indkøbsliste til/ })
      .first()
      .click();
    await page.waitForURL("**/indkobsliste");
    await expect(page.getByText(/varer i kurven/)).toBeVisible();
    const firstItem = page.getByRole("checkbox", { name: /lagt i kurven/ }).first();
    await firstItem.check();
    await expect(page.getByText(/^1 af \d+ varer i kurven$/)).toBeVisible();
    await page
      .getByLabel(/Betalt pris for/)
      .first()
      .fill("19,95");
    await page.getByRole("button", { name: "Gem", exact: true }).first().click();
    await expect(page.getByText(/Betalt indtil nu: 19,95/)).toBeVisible();
    await page.getByLabel("Egen vare").fill("Opvaskemiddel");
    await page.getByRole("button", { name: "Tilføj" }).click();
    await expect(page.getByText("Opvaskemiddel", { exact: true })).toBeVisible();

    // --- Manuelle priser
    await page.goto("/indkobsliste/priser");
    await page
      .getByLabel(/Pris for .* i kr\./)
      .first()
      .fill("12,50");
    await page.getByRole("button", { name: "Gem pris" }).first().click();
    await expect(page.getByText("Gemt", { exact: true })).toBeVisible();

    // --- Mål og tolerancer
    await page.goto("/profil/mal");
    await expect(page.getByText(/kcal pr. dag/)).toBeVisible();
    await page.getByLabel("Energi ± %").fill("8");
    await page.getByRole("button", { name: "Gem tolerancer" }).click();
    await expect(page.getByText(/Tolerancer gemt/)).toBeVisible();

    // --- Admin page is hidden from normal users
    // (Streaming may already have sent a 200, so assert on the rendered not-found page.)
    await page.goto("/admin/datakilder");
    await expect(page.getByRole("heading", { name: "Siden findes ikke" })).toBeVisible();
    await expect(page.getByText("Udbydere")).toHaveCount(0);

    // --- Dataeksport
    await page.goto("/profil/privatliv");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download mine data" }).click(),
    ]);
    const body = JSON.parse(
      await (
        await download.createReadStream()
      )
        .toArray()
        .then((c) => Buffer.concat(c).toString("utf8")),
    );
    expect(body.account.email).toBe(email);
    expect(body.weight_entries.length).toBeGreaterThanOrEqual(2);
    expect(body.shopping_list_items.length).toBeGreaterThan(0);

    // --- Sletning
    await page.getByLabel("Skriv SLET for at bekræfte").fill("SLET");
    await page.getByRole("button", { name: "Slet min konto og alle data" }).click();
    await page.waitForURL("**/?slettet=1");
    await page.goto("/log-ind");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Adgangskode").fill(PASSWORD);
    await page.getByRole("button", { name: "Log ind" }).click();
    await expect(page.getByText("Forkert e-mail eller adgangskode.")).toBeVisible();
  });

  test("profile edits are saved", async ({ page }) => {
    await signUpAndOnboard(page);
    await page.goto("/profil");
    await page.getByLabel("Postnummer").fill("8000");
    await page.getByRole("button", { name: "Gem ændringer" }).click();
    await expect(page.getByText(/Profilen er gemt/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Postnummer")).toHaveValue("8000");
  });
});
