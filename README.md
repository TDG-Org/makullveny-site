# Makullveny Site

The public site for **Makullveny**, a free, local-first desktop study app for
students. Three pages, no build step, published from the repository root through
GitHub Pages.

This repo deliberately does **not** contain the Makullveny desktop app source.
It is the marketing site and nothing else, so everything here is safe to read.

Expected URL once Pages has deployed:

`https://tdg-org.github.io/makullveny-site/`

## The pages

| Path | What it is |
| --- | --- |
| `index.html` | The front page: hero, the dashboard, Selah, the two apps, the five tools, the themes, faith, download, and the three most recent releases |
| `themes/` | The full theme catalogue, grouped into its three bundles |
| `updates/` | Every published release, newest first |
| `read/` | The read-only viewer a shared Makullveny page opens in |
| `checkout/` | The return page a completed purchase lands on |

## How the three pages are made

The pages were designed on a Claude Design canvas, and their sources are the
artboards in `design/` — ordinary HTML wrapped in the canvas's own
`<x-dc>`/`<helmet>` tags, with `{{ }}` holes where the canvas's logic used to
fill something in. `tools/build-site.mjs` turns those into the pages served
here:

```bash
node tools/build-site.mjs      # design/*.dc.html  ->  index.html, themes/, updates/
```

**Its output is committed, and that is on purpose.** GitHub Pages serves this
repository straight from the branch and there is no build step between here and
the internet — so this runs by hand and the result is checked in, exactly the
arrangement `assets/icons/` and `tools/make-icons.mjs` already use. Edit an
artboard, run the script, commit both. Editing the generated HTML directly is
not wrong, but the next run overwrites it.

`site.js` is the other half: the behaviour the canvas's logic class used to
provide, written once for a plain browser — the hero rotator and its captions,
the lightbox, the parallax and the pointer-lit hero, the scroll reveals, the top
bar's ground, and the download controls that light the first-launch panel. None
of it is needed to *read* the site: with that file blocked every picture, every
word and every link still works.

Screenshots live in `assets/site/`, and the scene art they sit on is in
`assets/scenes/`.

`updates/updates-data.js` is the only file a new release needs: push one entry
onto `window.MAKULLVENY_UPDATES` and both the archive and the three cards on the
front page follow it.

## Downloads

`download.js` fills four slots from the public releases feed — Windows
installer, Windows portable, macOS and Linux — and picks the one matching the
visitor's system for the big card at the top. It degrades to a link to the
releases page when JavaScript is off or nothing has been published yet.

The site also carries the **first-launch instructions**, and they are not
decoration: Makullveny is not code-signed on either platform, so both operating
systems block the first run. Windows is *More info → Run anyway*; macOS is
*System Settings → Privacy & Security → Open Anyway*, with the
`xattr -dr com.apple.quarantine` one-liner underneath. A person who downloads
the app and cannot open it does not come back, so that block stays above the
fold of the download section with an arrow pointing at it.

## Screenshots

Every screenshot on the site is a real capture of the running app, taken through
the desktop repo's own harnesses rather than mocked up here:

```bash
# in the Makullveny app repo
npm start -- --guide-asset-capture                      # every module, current theme
npm start -- --guide-asset-capture --visual-theme=<key> # the same set, one theme
npm start -- --probe="<expression>" --probe-capture=<file.png>
```

Two rules learned the hard way, both worth keeping:

- **Capture at `--force-device-scale-factor=1.5`.** A 1x capture downscaled into
  a slot the browser renders at 2x is the reason an earlier pass of this site
  looked soft in every single image.
- **Do not crop.** Trim the window border and nothing else. Cropping to "the
  interesting part" is what removed the bookshelf rail from the Library Desk
  shots and left the backgrounds looking wrong.

## Visual direction

The palette is not invented here. It is read out of the app's own
`src/styles/base.css` `:root`, which *is* the Cozy Cabin theme:

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | `#15120f` | espresso, the page's darkest ground |
| `--accent` | `#d58c4b` | amber, every call to action |
| `--accent-2` | `#8db9ad` | sage-teal, the quiet second voice |
| `--pine` | `#244436` | the green half of the page |
| `--paper` / `--ink` | `#f5e7cf` / `#2d2218` | the app's writing surface |

The page never leaves the dark. It walks espresso → walnut → deep teal → pine →
ember brown → espresso, and every join is a long gradient whose end colour is
exactly the next section's start colour, with a light bleed crossing it. No hard
edges, no wave paths.

Type is **Lora** and **Manrope**, both already shipped in the app's own
`assets/fonts/`.

## Scenic art

`assets/scenes/makullveny-cabin-layers/` holds the three-plate cabin scene —
sky and ridge, midground conifers with the lit cabin, foreground frame — stacked
in that order and moved at different rates to make the hero-to-page transition.
`assets/scenes/makullveny-cabin-overlays/` holds the boughs, ivy and pine cones
that hang over the section edges. Each has its own `README.md` describing the
stacking order; keep it.

Scenic art is original, deliberately simple 2D illustration: large layered
silhouettes, darkest values at the frame edges, one warm focal light. No
photorealism, no heavy texture, no clutter.

## Icons

`assets/icons/` is the browser and install icon family, and it is **generated
and committed**: run `node tools/make-icons.mjs` after changing the cabin mark,
never as part of a build. Nothing here has a build step and this does not add
one.

The one thing worth knowing before touching it: `apple-touch-icon.png` is
square, opaque and has no corner radius of its own, while `assets/cabin-icon.png`
in the page header is a round crop with transparent corners. That is not an
inconsistency to tidy up. iOS composites a touch icon on **black** and then cuts
its own squircle out of it, so a round or rounded source arrives on the Home
Screen with black wedges around it. The header icon sits on the page's own
background and is right as it is.

## Local preview

```bash
node tools/serve.mjs
```

Serves the repository root at `http://localhost:4173`.
