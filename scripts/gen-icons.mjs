// Generates all app/launcher artwork from the official Indian Army insignia:
//   - PWA icons in public/icons (192, 512, maskable 512)
//   - Android adaptive + legacy launcher icons at every density
// The insignia red is #D90000; icon plates use the same red so it blends
// edge-to-edge under circular/squircle launcher masks.
// Run with: node scripts/gen-icons.mjs   (requires `sharp`)
import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync } from "fs";

const LOGO = "public/mcte-logo.png";
const BG = { r: 217, g: 0, b: 0, alpha: 1 }; // #D90000
if (!existsSync(LOGO)) {
  console.error(`ERROR: ${LOGO} not found — place the Indian Army insignia there first.`);
  process.exit(1);
}

/** Red square plate with the emblem centered at `ratio` of the canvas. */
async function plate(size, ratio) {
  const logo = await sharp(LOGO)
    .resize(Math.round(size * ratio), Math.round(size * ratio), { fit: "inside" })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

/** Transparent foreground for Android adaptive icons (safe-zoned). */
async function foreground(size) {
  const logo = await sharp(LOGO)
    .resize(Math.round(size * 0.66), Math.round(size * 0.66), { fit: "inside" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

// PWA icons live at the public/ ROOT (flat) so they survive simple
// drag-and-drop GitHub uploads that can miss nested folders.
// --- PWA / PWA-Builder icons ---
await sharp(await plate(192, 0.95)).toFile("public/icon-192.png");
await sharp(await plate(512, 0.95)).toFile("public/icon-512.png");
// Maskable: red full-bleed, emblem kept inside the 80% safe zone.
await sharp(await plate(512, 0.72)).toFile("public/icon-maskable-512.png");

// --- Android (Capacitor) densities, if a native project exists ---
if (existsSync("android")) {
  const valuesDir = "android/app/src/main/res/values";
  mkdirSync(valuesDir, { recursive: true });
  writeFileSync(
    `${valuesDir}/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#D90000</color>\n</resources>\n`
  );
  const dir = (d) => `android/app/src/main/res/mipmap-${d}`;
  const fgSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  const legacySizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, s] of Object.entries(fgSizes)) {
    mkdirSync(dir(d), { recursive: true });
    await sharp(await foreground(s)).toFile(`${dir(d)}/ic_launcher_foreground.png`);
  }
  for (const [d, s] of Object.entries(legacySizes)) {
    const buf = await plate(s, 0.98);
    await sharp(buf).toFile(`${dir(d)}/ic_launcher.png`);
    await sharp(buf).toFile(`${dir(d)}/ic_launcher_round.png`);
  }
}

console.log("PWA + launcher icons generated from public/mcte-logo.png");
