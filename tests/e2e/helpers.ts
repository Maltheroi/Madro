import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Testkode1234";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Sign up and complete onboarding. Requires a local stack with email autoconfirm. */
export async function signUpAndOnboard(
  page: Page,
  opts: { allergies?: string[]; budgetKr?: string } = {},
) {
  const email = uniqueEmail();
  await page.goto("/opret-konto");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(PASSWORD);
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/onboarding");

  await page.getByLabel("Fødselsår").fill("1992");
  await page.getByLabel("Køn til beregning").selectOption("male");
  await page.getByLabel("Højde (cm)").fill("182");
  await page.getByLabel("Nuværende vægt (kg)").fill("84,5");
  await page.getByRole("button", { name: "Fortsæt" }).click();

  await page.getByLabel("Tabe fedt").check();
  await page.getByLabel("Målvægt (kg)").fill("78");
  await page.getByRole("button", { name: "Fortsæt" }).click();

  for (const a of opts.allergies ?? []) await page.getByLabel(a, { exact: true }).check();
  await page.getByRole("button", { name: "Fortsæt" }).click();

  await page.getByLabel("Ugebudget til mad (kr.)").fill(opts.budgetKr ?? "900");
  await page.getByRole("button", { name: "Fortsæt" }).click();

  await expect(page.getByText("Estimat ud fra dine oplysninger")).toBeVisible();
  await page.getByRole("button", { name: "Gem og vælg yndlingsretter" }).click();
  await page.waitForURL("**/onboarding/retter");

  // Pick five favourite dishes (the minimum).
  const dishes = page.getByRole("list", { name: "Retter" }).getByRole("button");
  await expect(page.getByRole("button", { name: "Vælg 5 mere" })).toBeDisabled();
  for (let i = 0; i < 5; i++) await dishes.nth(i).click();
  await page.getByRole("button", { name: "Gem og se min oversigt" }).click();
  await page.waitForURL("**/oversigt**");
  return email;
}
