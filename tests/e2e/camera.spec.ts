import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signUpAndOnboard } from "./helpers";

// Feeds Chromium a fake camera showing an EAN-13 barcode. Chromium on Linux has
// no BarcodeDetector, so this exercises the JavaScript decoder that Safari on
// iPhone uses.
const CODE = "5700000000011";

function ean13Bits(code: string): string {
  const L = [
    "0001101",
    "0011001",
    "0010011",
    "0111101",
    "0100011",
    "0110001",
    "0101111",
    "0111011",
    "0110111",
    "0001011",
  ];
  const G = [
    "0100111",
    "0110011",
    "0011011",
    "0100001",
    "0011101",
    "0111001",
    "0000101",
    "0010001",
    "0001001",
    "0010111",
  ];
  const R = [
    "1110010",
    "1100110",
    "1101100",
    "1000010",
    "1011100",
    "1001110",
    "1010000",
    "1000100",
    "1001000",
    "1110100",
  ];
  const P = [
    "LLLLLL",
    "LLGLGG",
    "LLGGLG",
    "LLGGGL",
    "LGLLGG",
    "LGGLLG",
    "LGGGLL",
    "LGLGLG",
    "LGLGGL",
    "LGGLGL",
  ];
  const d = [...code].map(Number);
  let bits = "101";
  d.slice(1, 7).forEach((n, i) => (bits += (P[d[0]][i] === "L" ? L : G)[n]));
  bits += "01010";
  d.slice(7).forEach((n) => (bits += R[n]));
  return bits + "101";
}

function writeBarcodeVideo(path: string) {
  const [W, H, M] = [640, 480, 4];
  const bits = ean13Bits(CODE);
  const y = Buffer.alloc(W * H, 255);
  const x0 = Math.floor((W - bits.length * M) / 2);
  for (let row = 140; row < 340; row++)
    for (let i = 0; i < bits.length; i++)
      if (bits[i] === "1") y.fill(0, row * W + x0 + i * M, row * W + x0 + (i + 1) * M);
  const uv = Buffer.alloc((W * H) / 4, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, uv, uv]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, frame, frame]));
}

const video = join(tmpdir(), "madro-ean13.y4m");
writeBarcodeVideo(video);

test.use({
  permissions: ["camera"],
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
    ],
  },
});

const sql = postgres(
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

test.beforeAll(async () => {
  await sql`
    insert into public.packaged_products (source_key, code, gtin, name, brand, allergens, energy_kcal, protein_g, carbohydrate_g, fat_g, data_quality, licence, source_url)
    values ('open-food-facts', ${CODE}, ${CODE}, 'E2E-skyr naturel', 'Testmejeri', '{milk}', 63, 11, 4, 0.2, 'complete', 'ODbL 1.0',
            ${`https://world.openfoodfacts.org/product/${CODE}`})
    on conflict (source_key, code) where created_by is null do nothing`;
});

test.afterAll(async () => {
  await sql.end();
});

test("scans a barcode with the camera", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpAndOnboard(page);
  await page.goto("/madregistrering");
  await page.getByRole("tab", { name: "Vare", exact: true }).click();
  await page.getByRole("button", { name: "Scan med kamera" }).click();
  await expect(page.getByRole("heading", { name: "E2E-skyr naturel" })).toBeVisible({
    timeout: 20_000,
  });
});
