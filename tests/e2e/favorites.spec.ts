import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("favourite dishes can be filtered by cuisine and changed later", async ({ page }) => {
  await signUpAndOnboard(page);
  await expect(page.getByText(/Vælg 5–10 yndlingsretter/)).toHaveCount(0);
  await page.goto("/profil/yndlingsretter");
  await expect(page.getByText("5 valgt")).toBeVisible();
  await page.getByRole("button", { name: "Thai", exact: true }).click();
  const dishes = page.getByRole("list", { name: "Retter" });
  await expect(dishes.getByText("Pad thai med kylling")).toBeVisible();
  await expect(dishes.getByText("Pasta bolognese")).toHaveCount(0);
  await dishes.getByRole("button", { name: /Pad thai med kylling/ }).click();
  await expect(page.getByText("6 valgt")).toBeVisible();
  await page.getByLabel(/Savner du en ret/).fill("Pho");
  await page.getByRole("button", { name: "Gem yndlingsretter" }).click();
  await expect(page.getByText("Dine yndlingsretter er gemt.")).toBeVisible();
});
