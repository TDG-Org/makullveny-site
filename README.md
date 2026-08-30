# Makullveny Site

Public one-page landing page for Makullveny project/account verification.

This repo intentionally does not contain the private Makullveny desktop app source code. It only explains the project at a high level so reviewers can understand what Makullveny is.

## GitHub Pages

The site is designed to publish from the repository root through GitHub Pages.

Expected URL after Pages finishes deploying:

`https://tdg-org.github.io/makullveny-site/`

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
