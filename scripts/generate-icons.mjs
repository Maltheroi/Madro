#!/usr/bin/env node
// Generates the app icons in public/icons from the logo mark (see src/components/logo.tsx).
// Usage: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BG = "#2a5745"; // --primary (light theme)
const FG = "#f3fbf6"; // --primary-foreground

// Full-bleed square for "maskable" icons: the mark sits inside the 80 % safe zone.
const mark = (scale) => `
  <g transform="translate(${16 - 16 * scale} ${16 - 16 * scale}) scale(${scale})">
    <path d="M9 19c2.5 3 11.5 3 14 0" stroke="${FG}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M16 8c-3 2-3 6 0 8 3-2 3-6 0-8z" fill="${FG}"/>
  </g>`;
const square = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BG}"/>${mark(scale)}</svg>`;

mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["icon-192.png", 192, square(1.15)],
  ["icon-512.png", 512, square(1.15)],
  ["icon-maskable-512.png", 512, square(0.9)],
  ["apple-touch-icon.png", 180, square(1.1)],
];
for (const [name, size, svg] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
