// Turn the design artboards in design/ into the three pages this site serves.
//
// WHY THIS EXISTS, AND WHY ITS OUTPUT IS COMMITTED. The pages were designed on
// a Claude Design canvas, where each one is a `.dc.html` artboard: ordinary
// HTML wrapped in <x-dc>/<helmet> and driven by a DCLogic class, with `{{ }}`
// holes for anything the logic computes. GitHub Pages serves this repository
// straight from the branch and there is NO build step between here and the
// internet -- so this script is run BY HAND and its output is checked in, the
// same arrangement assets/icons/ and tools/make-icons.mjs already use.
//
//   node tools/build-site.mjs
//
// Edit design/*.dc.html, run this, commit both. Editing the generated HTML
// directly is not wrong, but the next run will overwrite it.
//
// What it does: drops the canvas scaffolding, resolves the holes the logic
// used to fill (the rotator's five slides and their captions, the lightbox),
// rewrites image paths to assets/site/, and gives each page a real <head> --
// the site's own title, description, icon family and manifest. The behaviour
// the DCLogic class provided is re-implemented once, in site.js, for a plain
// browser.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// title, meta description, and how deep the page sits from the repository root
const PAGES = [
  {
    src: "design/Main.dc.html",
    out: "index.html",
    up: "./",
    title: "Makullveny",
    desc:
      "Makullveny is a free, local-first desktop study app for students: a dashboard that lays out the day, a notes workspace on real paper, a focus timer that builds a world, and the small tools around them.",
    preload: ["assets/site/ov-bough-top-left.webp", "assets/site/hero-dash.jpg"]
  },
  {
    src: "design/ThemesPage.dc.html",
    out: "themes/index.html",
    up: "../",
    title: "Themes · Makullveny",
    desc:
      "Every Makullveny theme, in its three bundles: four included with the free app, five in the Candle bundle, and the Illustrated Art collection that arrives with the tiers above it.",
    preload: []
  },
  {
    src: "design/NewsPage.dc.html",
    out: "updates/index.html",
    up: "../",
    title: "Updates · Makullveny",
    desc: "Every published Makullveny release, newest first, in plain words.",
    preload: []
  }
];

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Manrope:wght@400;500;600;700;800&display=swap">';

function head(page) {
  const u = page.up;
  const preloads = page.preload
    .map((p) => `\n    <link rel="preload" as="image" href="${u}${p}" fetchpriority="high">`)
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${page.desc}">
    <!-- The NAME, not a headline: a bookmark is saved as the <title>, and iOS
         falls back to it for a Home Screen tile. The descriptor lives in the
         meta description above, which is where a search result reads it. -->
    <title>${page.title}</title>
    <meta name="apple-mobile-web-app-title" content="Makullveny">
    <meta name="application-name" content="Makullveny">
    <!-- assets/icons/ is the square, opaque family drawn by tools/make-icons.mjs.
         cabin-icon.png is a ROUND crop and is wrong for every install surface:
         iOS composites apple-touch-icon on BLACK before applying its own mask,
         so those transparent corners come back as black wedges. -->
    <link rel="icon" href="${u}assets/icons/icon.svg" type="image/svg+xml">
    <link rel="icon" type="image/png" sizes="32x32" href="${u}assets/icons/favicon-32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="${u}assets/icons/favicon-16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${u}assets/icons/apple-touch-icon.png">
    <meta name="theme-color" content="#100d0a">
    <link rel="manifest" href="${u}site.webmanifest">${preloads}
    ${FONTS}
`;
}

// The five hero slides, and the window title the rotator writes for each.
const SLIDE_TITLES = [
  "Makullveny — Today",
  "Makullveny — Library Desk",
  "Selah: Study Grounds · golden hour",
  "Selah: Study Grounds · night",
  "Library Desk — Blueprint"
];

function build(page) {
  let s = readFileSync(join(ROOT, page.src), "utf8");

  // ── the canvas scaffolding ───────────────────────────────────────────────
  const style = s.slice(s.indexOf("<helmet>") + 8, s.indexOf("</helmet>"));
  const bodyStart = s.indexOf("</helmet>") + 9;
  const bodyEnd = s.indexOf("</x-dc>");
  let body = s.slice(bodyStart, bodyEnd);
  // whatever sits between </x-dc> and the logic block -- the lightbox
  const after = s.slice(bodyEnd + 7, s.indexOf("<script data-dc-script"));
  body += after;

  // the fonts link lived in the helmet; the head writes its own
  const css = style.replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/, "").trim();

  // ── the holes the logic used to fill ─────────────────────────────────────
  // The rotator drove five images and five captions off one index. site.js
  // does the same, reading the slide number from data-slide.
  body = body.replace(/\s*style="opacity: \{\{o(\d)\}\}"/g, (_m, n) => ` data-slide="${n}"`);
  body = body.replace("{{ title }}", SLIDE_TITLES[0]);
  // the dots were an <sc-for>; write them out flat
  body = body.replace(
    /<sc-for list="\{\{dots\}\}"[\s\S]*?<\/sc-for>/,
    SLIDE_TITLES.map(
      (t, n) =>
        `<button class="rot-dot" type="button" data-on="${n === 0 ? "true" : "false"}"` +
        ` aria-label="Show ${t.replace(/"/g, "&quot;")}"></button>`
    ).join("\n          ")
  );
  // <sc-if> gated the lightbox on state; site.js owns its visibility instead
  body = body.replace(/<sc-if value="\{\{ zooming \}\}"[^>]*>/g, "");
  body = body.replace(/<\/sc-if>/g, "");
  body = body.replace('src="{{ zoom }}"', 'src="" hidden');
  body = body.replace('alt="{{ zoomAlt }}"', 'alt=""');
  body = body.replace(/\s*onClick="\{\{[^}]*\}\}"/g, "");
  body = body.replace(/\{\{[^}]*\}\}/g, "");

  // ── paths ────────────────────────────────────────────────────────────────
  body = body.replace(/src="([a-z0-9._-]+\.(?:jpg|webp|png))"/g, `src="${page.up}assets/site/$1"`);
  body = body.replace(
    /url\(&quot;([a-z0-9._-]+\.(?:jpg|webp|png))&quot;\)/g,
    `url(&quot;${page.up}assets/site/$1&quot;)`
  );
  const cssOut = css.replace(
    /url\((["']?)([a-z0-9._-]+\.(?:jpg|webp|png))\1\)/g,
    `url($1${page.up}assets/site/$2$1)`
  );

  const html =
    head(page) +
    "    " +
    cssOut +
    "\n  </head>\n  <body>\n" +
    body.trimEnd() +
    // Deferred scripts run in document order, so the release data is always
    // defined before site.js draws the three cards on the front page.
    "\n\n" +
    (page.out === "index.html" ? '    <script src="./updates/updates-data.js" defer></script>\n' : "") +
    (page.out === "updates/index.html" ? '    <script src="./updates-data.js" defer></script>\n' : "") +
    `    <script src="${page.up}site.js" defer></script>\n` +
    (page.out === "index.html" ? '    <script src="./download.js" defer></script>\n' : "") +
    (page.out === "updates/index.html" ? '    <script src="./updates.js" defer></script>\n' : "") +
    "  </body>\n</html>\n";

  const dest = join(ROOT, page.out);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  return { out: page.out, bytes: html.length };
}

for (const page of PAGES) {
  const r = build(page);
  console.log(`${r.out.padEnd(20)} ${(r.bytes / 1024).toFixed(1)} KB`);
}
