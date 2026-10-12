import { expect, test } from "@playwright/test";
import { PASSWORD, signUpAndOnboard } from "./helpers";

test.describe("public pages", () => {
  test("landing page explains the product in Danish", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Spis efter dine mål");
    await expect(page.locator("html")).toHaveAttribute("lang", "da");
  });

  test("app pages redirect to login when signed out", async ({ page }) => {
    await page.goto("/madplan");
    await expect(page).toHaveURL(/\/log-ind\?next=%2Fmadplan/);
  });

  test("login shows a Danish error for wrong credentials", async ({ page }) => {
    await page.goto("/log-ind");
    await page.getByLabel("E-mail").fill("nobody@example.test");
    await page.getByLabel("Adgangskode").fill("Forkert12345");
    await page.getByRole("button", { name: "Log ind" }).click();
    await expect(page.getByText("Forkert e-mail eller adgangskode.")).toBeVisible();
  });

  test("sign-up validates password strength", async ({ page }) => {
    await page.goto("/opret-konto");
    await page.getByLabel("E-mail").fill("weak@example.test");
    await page.getByLabel("Adgangskode").fill("kort");
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Opret konto" }).click();
    await expect(page.getByText("Adgangskoden skal være mindst 10 tegn.")).toBeVisible();
  });
});

test.describe("core journey", () => {
  test("register, onboard, plan, inspect recipe, sign out and back in", async ({ page }) => {
    const email = await signUpAndOnboard(page, { allergies: ["Nødder"] });
    await expect(page.getByText("Dine mål er gemt")).toBeVisible();
    await expect(page.getByText("Kalorier i dag")).toBeVisible();

    await page.getByRole("link", { name: /Madplan/ }).first().click();
    await page.getByRole("button", { name: "Lav min madplan" }).click();
    await expect(page.getByText(/Uge fra/)).toBeVisible({ timeout: 20_000 });
    // 7 days are rendered
    await expect(page.locator("ol > li h2")).toHaveCount(7);
    // Nut allergy is a hard constraint: no nut recipes in the plan
    await expect(page.getByRole("link", { name: "Banan og mandler" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Skyr med bær og mandler" })).toHaveCount(0);

    await page.locator('a[href^="/opskrifter/"]').first().click();
    await expect(page.getByRole("heading", { name: "Fremgangsmåde" })).toBeVisible();
    await expect(page.getByText(/Datakvalitet/)).toBeVisible();

    await page.goto("/oversigt");
    await page.getByRole("button", { name: "Log ud" }).first().click();
    await expect(page).toHaveURL("/");
    await page.goto("/log-ind");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Adgangskode").fill(PASSWORD);
    await page.getByRole("button", { name: "Log ind" }).click();
    await expect(page).toHaveURL(/\/oversigt/);
  });
});
