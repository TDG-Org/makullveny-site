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
| `index.html` | The front page: hero, the dashboard, Lock In, Friends, Selah, a short door to the apps and tools, the ten rooms in one strip, faith, download, and the three most recent releases |
| `features/` | Every app and tool, with its pictures: Library Desk, Study Hall, Import Desk (and a photo into cards), Flashcards, File Workshop, Cloud Backpack, Typing Trials, Calculator and the radio |
| `themes/` | The room-by-room browser (ten rooms; the six Candle rooms in the Theme Market's own captures) and the Illustrated bundle |
| `account/` | Make a TDG account from the website -- the same account the app uses (see below) |
| `u/` | A student's public profile link, or -- opened with no link while signed in on the website -- the student's own profile |
| `updates/` | Every published release, newest first |
| `read/` | The read-only viewer a shared Makullveny page opens in |
| `profile/` | A student's profile at `/profile/<username>` (the canonical address; `404.html` routes it, and old `/u/#<token>` links land on it too), with Add friend for a signed-in visitor |
| `checkout/` | The return page a completed purchase lands on |

## How the three pages are made

The pages were designed on a Claude Design canvas, and their sources are the
artboards in `design/` — ordinary HTML wrapped in the canvas's own
`<x-dc>`/`<helmet>` tags, with `{{ }}` holes where the canvas's logic used to
fill something in. `tools/build-site.mjs` turns those into the pages served
here:

```bash
node tools/build-site.mjs      # design/*.dc.html  ->  index.html, features/, themes/, updates/
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

**The Home button** (the cross at the end of the brand, on all three pages) is
the TDG site's own flourish: pressed, the cross turns into a sword and a
sparkle writes *Jesus Loves You*, then runs home again. Its look is
`bless.css`, a byte-for-byte copy of the blessing block in TDG-Site's
`src/components/Nav.css` behind a short adapter that supplies TDG's dark-theme
colours and its Cormorant Garamond words; its press logic is section 7 of
`site.js`. Change it on the TDG side and copy it here, so the two buttons stay
indistinguishable. Every moving part runs on the compositor (152 animations,
none on the main thread). On the two subpages the brand is a page load, so the
press leaves a note and the flourish plays when the front page arrives.

Screenshots live in `assets/site/`, and the scene art they sit on is in
`assets/scenes/`.

`updates/updates-data.js` is the only file a new release needs: push one entry
onto `window.MAKULLVENY_UPDATES` and both the archive and the three cards on the
front page follow it.

## Accounts from the website

`account/` makes a TDG account without the app. It is not a second account
system: it posts to `mak-web-signup`, a Supabase function whose source lives in
the app repo (`supabase/functions/mak-web-signup/`), and that function calls
the same GoTrue sign-up the app does, with the same metadata and the same
redirect to `auth/`. So a student who signs up here signs in to the app with
the same username or email and password, and everything else follows.

**The page holds no key.** Like `read/` and `u/` it posts to the one pinned
function origin with no apikey and no Authorization header; the function holds
the project key server-side, never returns a session, answers a known email
exactly like a new one, and refuses browsers on other websites.
`tests/account-page.test.js` pins the origin, the CSP and the absence of a key.

**Signing in on the website is "who am I", not a session.** The same function's
`signin` action checks the password with GoTrue, reads the student's own
profile row *as the student*, ends that session before answering, and returns
three public facts: username, display name, avatar number. `account/me.js`
(loaded on every page) keeps only those in `localStorage` and swaps the top
bar's Sign in button for the avatar, which opens the student's Makullveny
profile at `u/`. With no token in the address, `u/` draws the signed-in
student's own card from those three facts; a profile link from the app
(`u/#<token>`) still shows the classes and calendar the student chose. While
signed in, the page's other account doors ("Make a free account", the
footer's Sign in) lead to the profile too, and get their words back on
sign-out. No password, token or email is ever kept in the browser, so there is
nothing here worth stealing.

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
in the page header is a rounded 512px source with transparent corners. That is not an
inconsistency to tidy up. iOS composites a touch icon on **black** and then cuts
its own squircle out of it, so a round or rounded source arrives on the Home
Screen with black wedges around it. The header icon sits on the page's own
background and is right as it is.

## Local preview

```bash
node tools/serve.mjs
```

Serves the repository root at `http://localhost:4173`.
Use this before publishing a visual pass so screenshots and download links can be checked in-browser.
