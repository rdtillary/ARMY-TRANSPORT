// Generates app launcher icons from the official Indian Army circular insignia:
//   public/mcte-logo.png  → PWA icon + Android adaptive/legacy launcher icons
// The insignia red is #D90000; icon plates use the same red so the disc blends
// seamlessly edge-to-edge under circular/squircle launcher masks.
// Run with: node scripts/gen-icons.mjs   (requires `sharp`)
import sharp from "sharp";
import { mkdirSync } from "fs";

const LOGO = "public/mcte-logo.png";
const BG = { r: 217, g: 0, b: 0, alpha: 1 }; // #D90000 — matches the insignia disc

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

/** Transparent foreground with the red disc kept inside Android's safe zone;
 *  the red background layer fills around it seamlessly. */
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

// --- PWA icon (512) ---
await sharp(await plate(512, 0.95)).toFile("public/icons/icon-512.png");

// --- Android densities ---
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
console.log("launcher icons generated from official Indian Army insignia");
