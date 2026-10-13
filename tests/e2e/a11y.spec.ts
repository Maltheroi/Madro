import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${path} ${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(", ")}`,
  );
  expect(summary).toEqual([]);
}

test.describe("accessibility (WCAG 2.1 AA, axe)", () => {
  test("public pages", async ({ page }) => {
    for (const path of [
      "/",
      "/log-ind",
      "/opret-konto",
      "/glemt-adgangskode",
      "/privatlivspolitik",
    ]) {
      await audit(page, path);
    }
  });

  test("app pages", async ({ page }) => {
    test.setTimeout(120_000);
    await signUpAndOnboard(page);
    await page.goto("/madplan");
    await page.getByRole("button", { name: "Lav min madplan" }).click();
    await expect(page.getByText(/Uge fra/)).toBeVisible({ timeout: 20_000 });
    const recipe = await page.locator('a[href^="/opskrifter/"]').first().getAttribute("href");
    for (const path of [
      "/oversigt",
      "/madplan",
      recipe!,
      "/madregistrering",
      "/vaegt",
      "/indkobsliste",
      "/indkobsliste/kurv",
      "/indkobsliste/priser",
      "/spisekammer",
      "/profil",
      "/profil/mal",
      "/profil/privatliv",
    ]) {
      await audit(page, path);
    }
  });
});
