import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// Phone-specific checks: installable manifest and no horizontal scrolling.
test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  test("is installable as an app", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ short_name: "Madro", display: "standalone" });
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
    }
    expect((await request.get("/sw.js")).ok()).toBe(true);
    expect((await request.get("/offline")).ok()).toBe(true);
  });

  test("no page scrolls sideways", async ({ page }) => {
    test.setTimeout(120_000);
    await signUpAndOnboard(page);
    await page.goto("/madplan");
    await page.getByRole("button", { name: "Lav min madplan" }).click();
    await expect(page.getByText(/Uge fra/)).toBeVisible({ timeout: 20_000 });
    const pages = [
      "/oversigt",
      "/madplan",
      "/madregistrering",
      "/vaegt",
      "/indkobsliste",
      "/indkobsliste/kurv",
      "/indkobsliste/priser",
      "/spisekammer",
      "/profil",
      "/profil/mal",
      "/profil/yndlingsretter",
      "/profil/privatliv",
    ];
    const overflowing: string[] = [];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { scroll, width } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }));
      if (scroll > width + 1) overflowing.push(`${path} (${scroll} > ${width})`);
      // Content should use the full width: equal side margins around <main>.
      const box = await page.locator("main").boundingBox();
      if (box && Math.abs(box.x - (width - box.x - box.width)) > 2)
        overflowing.push(`${path} (uneven margins)`);
    }
    expect(overflowing).toEqual([]);
  });
});
