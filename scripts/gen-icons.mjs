// Generates app launcher icons from the OFFICIAL MCTE crest (no redrawing):
//   public/mcte-logo.png  → PWA icon + Android adaptive/legacy launcher icons
// Run with: node scripts/gen-icons.mjs   (requires `sharp`: npm i -D sharp)
import sharp from "sharp";
import { mkdirSync } from "fs";

const LOGO = "public/mcte-logo.png";
const BG = { r: 20, g: 27, b: 16, alpha: 1 }; // #141b10 army green-black

/** Dark square background with the crest centered at `ratio` of the canvas. */
async function plate(size, ratio) {
  const logo = await sharp(LOGO)
    .resize(Math.round(size * ratio), Math.round(size * ratio), {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

/** Transparent canvas with the crest kept inside Android's safe zone (~60%). */
async function foreground(size) {
  const logo = await sharp(LOGO)
    .resize(Math.round(size * 0.6), Math.round(size * 0.6), { fit: "inside" })
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
await sharp(await plate(512, 0.82)).toFile("public/icons/icon-512.png");

// --- Android densities ---
const dir = (d) => `android/app/src/main/res/mipmap-${d}`;
const fgSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const legacySizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [d, s] of Object.entries(fgSizes)) {
  mkdirSync(dir(d), { recursive: true });
  await sharp(await foreground(s)).toFile(`${dir(d)}/ic_launcher_foreground.png`);
}
for (const [d, s] of Object.entries(legacySizes)) {
  const buf = await plate(s, 0.86);
  await sharp(buf).toFile(`${dir(d)}/ic_launcher.png`);
  await sharp(buf).toFile(`${dir(d)}/ic_launcher_round.png`);
}
console.log("launcher icons generated from official MCTE crest");
