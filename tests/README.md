# Tests

Run with:

```
node --test
```

No dependency, no build step — Node's own built-in test runner, matching
this repo's rule that it never gains a package.json full of devDependencies.
(`node --test tests/` with an explicit trailing-slash path did not resolve
correctly in this environment; bare `node --test` auto-discovers every
`*.test.js` file and is what's documented here and is what CI, if any is
ever wired up for this repo, should call.)

## What's covered here

### `reader-contract.test.js` — the original contract surface

Exercises every DOM-free function in `read/read.js`: token parsing from the
URL fragment, the accent-name-to-color lookup (never trusts a raw color from
the network), schema/format classification (the "unsupported schema version"
refusal), and the HTTP-status-to-reader-message mapping (confirming
404-family causes are worded identically, and that a paused share never leaks
*why* it's paused).

### `reader-hardening.test.js` — what was added when the viewer was tightened

**The outbound-origin allowlist.** `apiOriginAllowed()` accepts only the one
pinned Supabase origin, bare or with a path, and refuses plain `http`, a
different project on the same platform, a non-URL, an empty string, a
protocol-relative or relative path, and — the case that motivates comparing
parsed *origins* rather than doing a prefix test —
`https://<project>.supabase.co.evil.com`, which starts with the real host.

**The exact cover colour** (`coverFromSnapshot`), a contract shared with the
private app. Seven hand-computed cases pin the derived edge and ink for pure
black, pure white, a walnut brown, a light mint, a near-zero triplet (the
two-digit zero pad), and a pair straddling the ink threshold at 149993 and
150107 — so both ink branches are covered from either side. Fourteen
rejections confirm the single canonical spelling: uppercase, mixed case,
three-digit shorthand, `rgb()`, `rgba()`, a `url()`, a trailing declaration,
a named colour, eight-digit hex, padded whitespace, `""`, a missing field,
`null` and a number all fall back to the legacy accent palette instead. The
expectations are written out by hand rather than recomputed from the
implementation, because a test that recomputes a formula from the code it is
testing passes even when the formula is wrong.

**What a server may not tell a visitor.** No `stateForStatus` message names
an internal cause; a snapshot carrying `reason`, `code`, `plan`, `quota`,
`egress` and `delivery` gets none of them into any rendered string; and a
source scan fails the moment any viewer file so much as *reads* one of those
properties — which covers the fields nothing renders yet.

**Clamping.** `displayName` is bounded at 200 characters on the way into the
`article:author` meta tag (it used to go in unbounded) and in the on-page
byline; title, description and handle are bounded too, and a `null` snapshot
never throws.

**Wiring regressions**, checked against the source because they are the kind
of defect that leaves no runtime trace: the malformed-body path takes its
tone from the status map instead of a hardcoded one; the Print button is
actually unhidden somewhere, so `read.css`'s `@media print` block is
reachable; the reader logs nothing at all and never puts the token in a query
string, a text node or a link; every `sessionStorage` and `replaceState`
access sits inside a `try`; both renderers export a `teardown()` and install
no listener outside their tracked `on()` helper; `scene.css` answers
`prefers-reduced-transparency` with no `rgba()` or `backdrop-filter` left in
that block; and the home page actually links `/updates/`.

**Two cross-file consistency checks**, which no single-module test could see:
the CSP `connect-src` directive in `read/index.html` must list exactly the
origins `ALLOWED_API_ORIGINS` permits (change one, the other fails), and the
committed `read/config.js` must still declare an empty `apiUrl` and an empty
`publishableKey` — this repository is public, and that file is filled in at
deploy time, never in git.

## What's covered elsewhere, and why

The DOMParser-based sanitizer (book pages) and the hand-built SVG blueprint
renderer both need a real DOM. Rather than add jsdom (or any dependency) to
this static-site repo just to test them, that coverage lives in two places
that already have what they need:

1. **The private Makullveny app's test suite** already runs 30+ hostile-markup
   cases through this exact sanitizer logic under jsdom
   (`tests/publicReaderSecurity.test.js` there) — that repo already carries
   jsdom as a devDependency for its own Electron testing, so this is the one
   place a real DOM costs nothing extra.
2. **Manual verification in a real browser**, done as part of building this
   feature: a fixture snapshot containing
   `<script>window.hacked=true</script><img src=x onerror=alert(1)>` was
   rendered through the actual `read/index.html` + `book.js`, and neither the
   script nor the `onerror` executed — the script's text became inert page
   text (the sanitizer's documented "keep the words, drop the wrapper"
   behavior) and the image vanished entirely. Both book and blueprint
   renderers were also checked at desktop, tablet, and mobile widths; see the
   session's completion report for the full list of what was exercised.

If this repo ever adds real browser automation for CI, that is where a
fixture-parity suite (feeding the exact contract shapes from
`docs/decisions/sharing/2026-09-03-published-snapshots.md` and the
2026-09-05 migrations through the real renderer) belongs.
