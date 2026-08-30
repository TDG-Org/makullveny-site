/**
 * Draws `assets/icons/` from the cabin mark, once, and commits the result.
 *
 *   npm i -D sharp && node tools/make-icons.mjs
 *
 * ── this is not a build step, and this repo still has none ────────────────
 * Nothing here runs when the site is published: GitHub Pages serves the files
 * in this repository exactly as they are, and the output of this script is
 * committed beside them. `sharp` is not declared anywhere and there is still no
 * `package.json`, which CLAUDE.md protects for its own reasons. Run it by hand
 * on the day the mark changes, and never as part of anything else.
 *
 * ── why the site needed it ────────────────────────────────────────────────
 * `assets/cabin-icon.png` is a 256px raster with a ROUND crop and transparent
 * corners. It is right in the header, where it sits on the page's own
 * background. It is wrong for every install surface, and iOS is the clearest
 * case: Safari composites `apple-touch-icon` on BLACK before applying its own
 * squircle mask, so a transparent corner arrives as a black wedge and a mark
 * that already carries a radius gets rounded a second time. The page also had
 * no `apple-touch-icon` link at all, which means an iPhone was building its
 * Home Screen tile from a SCREENSHOT of the page.
 *
 * So the install icons below are square, opaque, and carry no corner radius of
 * their own. `icon.svg` keeps the rounded tile, because a browser tab draws
 * what it is given and the rounded one is the mark as designed.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not found - run: npm i -D sharp && node tools/make-icons.mjs');
  process.exit(1);
}

/** The night behind the cabin, and the colour every icon falls back to. */
const NIGHT = '#18251f';

/** `assets/cabin-logo.svg`, with the tile's corner radius made an argument. */
const art = (radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">` +
      `<defs>` +
      `<linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">` +
      `<stop offset="0" stop-color="#dceffc"/><stop offset="1" stop-color="#7f9f9f"/></linearGradient>` +
      `<linearGradient id="wood" x1="0" x2="1" y1="0" y2="1">` +
      `<stop offset="0" stop-color="#c98c50"/><stop offset="1" stop-color="#5e3725"/></linearGradient>` +
      `</defs>` +
      `<rect width="128" height="128" rx="${radius}" fill="${NIGHT}"/>` +
      `<circle cx="96" cy="25" r="12" fill="#f7ddb0" opacity=".95"/>` +
      `<path d="M14 82c13-17 26-24 38-21 10 2 16 10 26 8 10-1 17-10 36-7v43H14z" fill="url(#sky)" opacity=".9"/>` +
      `<path d="M28 68 64 38l36 30v37H28z" fill="url(#wood)"/>` +
      `<path d="M21 70 64 33l43 37-8 9-35-30-35 30z" fill="#3b2419"/>` +
      `<rect x="42" y="75" width="18" height="30" rx="3" fill="#2b1d17"/>` +
      `<rect x="68" y="73" width="20" height="17" rx="3" fill="#f6d99b"/>` +
      `<path d="M73 82h10M78 77v10" stroke="#6b4127" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M40 92h18M67 95h24M34 61h60" stroke="#f0b266" stroke-width="4" stroke-linecap="round" opacity=".7"/>` +
      `<path d="M22 103c24-6 55-6 84 0" stroke="#f8f2e6" stroke-width="8" stroke-linecap="round"/>` +
      `</svg>`,
  );

const out = path.join(root, 'assets', 'icons');
fs.mkdirSync(out, { recursive: true });

const png = { compressionLevel: 9, adaptiveFiltering: true };
const square = (size) =>
  sharp(art(0), { density: (size / 128) * 96 }).resize(size, size).flatten({ background: NIGHT });

const write = async (size, name) => {
  await square(size).png(png).toFile(path.join(out, name));
  console.log('assets/icons/', name);
};

fs.writeFileSync(path.join(out, 'icon.svg'), art(28));
console.log('assets/icons/ icon.svg');

for (const size of [16, 32]) await write(size, `favicon-${size}.png`);
await write(180, 'apple-touch-icon.png');
for (const size of [192, 512]) await write(size, `icon-${size}.png`);

/* Maskable is the one that is NOT the same picture. Android may crop an
   installed icon to a circle of 80% diameter, and this scene fills its tile: at
   full bleed the moon and the cabin's own bottom corners fall outside that
   circle. So the whole tile is set at 80% on the night behind it, which is the
   shape the spec asks for and the same thing Bible Educator's generator does. */
for (const size of [192, 512]) {
  const inner = await square(Math.round(size * 0.8)).png(png).toBuffer();
  const name = `icon-maskable-${size}.png`;
  // `removeAlpha` and not `flatten`, and the difference is sharp's fixed
  // pipeline order rather than taste: flatten runs BEFORE composite however the
  // calls are chained, so it flattens the empty canvas and the composite puts
  // an alpha plane straight back. removeAlpha runs after, which is the only
  // place it can do any good. Written down because the file it produced looked
  // completely correct and was still RGBA.
  await sharp({ create: { width: size, height: size, channels: 4, background: NIGHT } })
    .composite([{ input: inner, gravity: 'centre' }])
    .removeAlpha()
    .png(png)
    .toFile(path.join(out, name));
  console.log('assets/icons/', name);
}
