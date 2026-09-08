/*
  THE HARDENING SUITE. Sibling to reader-contract.test.js, which covers the
  original DOM-free surface; this file covers what was added when the viewer
  was tightened: the outbound-origin allowlist, the exact-cover-colour
  cross-repo contract, and the rules about what a server may and may not put
  in front of a visitor.

  Three of these are CROSS-FILE tests — they read read/index.html and
  read/config.js off disk and compare them against read/read.js. That is
  deliberate. The facts they check ("the CSP names the same origin the code
  allows", "the committed config declares nothing") are exactly the kind that
  drift when someone edits one file and not the other, and no amount of
  testing a single module can see it.

  Zero dependencies, node:test + node:assert/strict only. Run with:
    node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var R = require(path.join("..", "read", "read.js"));

var READ_DIR = path.join(__dirname, "..", "read");
function source(name) { return fs.readFileSync(path.join(READ_DIR, name), "utf8"); }

/*
  These files are heavily commented on purpose, and their prose necessarily
  NAMES the things the scans below forbid — "sessionStorage throws outright",
  "reason, code, plan, quota". So every scan runs over the CODE only. Comment
  bodies are blanked rather than deleted so reported line numbers still point
  at the real line.
*/
function code(name) {
  return source(name)
    .replace(/\/\*[\s\S]*?\*\//g, function (block) { return block.replace(/[^\n]/g, " "); })
    .split("\n")
    .map(function (line) { return /^\s*\/\//.test(line) ? "" : line; })
    .join("\n");
}

var ALLOWED_ORIGIN = "https://ddbksawvchsauiuiwvrl.supabase.co";

/* ─────────────────────────────────── the outbound-origin allowlist ─────── */

test("apiOriginAllowed: accepts the exact allowed origin, bare and with a path", function () {
  assert.equal(R.apiOriginAllowed(ALLOWED_ORIGIN), true);
  assert.equal(R.apiOriginAllowed(ALLOWED_ORIGIN + "/"), true);
  assert.equal(R.apiOriginAllowed(ALLOWED_ORIGIN + "/functions/v1/mak-share"), true);
  assert.equal(R.apiOriginAllowed(ALLOWED_ORIGIN + "/functions/v1/mak-share?x=1"), true);
});

test("apiOriginAllowed: refuses plain http even on the right host", function () {
  assert.equal(R.apiOriginAllowed("http://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share"), false);
});

test("apiOriginAllowed: refuses a LOOKALIKE host that merely starts with the real one", function () {
  /* The whole reason this compares parsed origins instead of doing a prefix
     or substring test. Both of these read as "our host" to a careless check. */
  assert.equal(R.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co.evil.com/functions/v1/mak-share"), false);
  assert.equal(R.apiOriginAllowed("https://evil.com/ddbksawvchsauiuiwvrl.supabase.co"), false);
  assert.equal(R.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co@evil.com/x"), false);
});

test("apiOriginAllowed: refuses a different Supabase project on the same platform", function () {
  assert.equal(R.apiOriginAllowed("https://someotherproject.supabase.co/functions/v1/mak-share"), false);
});

test("apiOriginAllowed: refuses empty, non-URL, relative and non-http schemes", function () {
  assert.equal(R.apiOriginAllowed(""), false);
  assert.equal(R.apiOriginAllowed(null), false);
  assert.equal(R.apiOriginAllowed(undefined), false);
  assert.equal(R.apiOriginAllowed("not a url at all"), false);
  assert.equal(R.apiOriginAllowed("/functions/v1/mak-share"), false, "relative paths do not parse as absolute URLs");
  assert.equal(R.apiOriginAllowed("//ddbksawvchsauiuiwvrl.supabase.co/x"), false, "protocol-relative is not absolute");
  assert.equal(R.apiOriginAllowed("javascript:alert(1)"), false);
  assert.equal(R.apiOriginAllowed("data:text/plain,hi"), false);
  assert.equal(R.apiOriginAllowed({}), false);
});

test("ALLOWED_API_ORIGINS and the page's CSP connect-src name the SAME origin", function () {
  /* Two enforcement points for one fact; if they can drift, they will. */
  var html = source("index.html");
  var csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(csp, "read/index.html must carry a Content-Security-Policy meta tag");

  var connect = /(?:^|;)\s*connect-src\s+([^;"]+)/.exec(csp[1]);
  assert.ok(connect, "the CSP must carry a connect-src directive");

  var sources = connect[1].trim().split(/\s+/);
  assert.deepEqual(sources, R.ALLOWED_API_ORIGINS,
    "connect-src must list exactly the origins read.js will talk to — change both together");
  assert.ok(sources.indexOf("https:") === -1, "connect-src must never be the wide-open `https:` again");
});

test("the committed read/config.js declares nothing — no URL, no key", function () {
  /* This repository is public. The deploy fills this file in; git must not. */
  /* Code only — the file's own doc comment shows a filled-in EXAMPLE. */
  var config = code("config.js");
  var apiUrl = /apiUrl:\s*"([^"]*)"/.exec(config);
  var key = /publishableKey:\s*"([^"]*)"/.exec(config);
  assert.ok(apiUrl && key, "config.js must still declare both fields");
  assert.equal(apiUrl[1], "", "a committed apiUrl ties this public repo to one project");
  assert.equal(key[1], "", "no key of any kind belongs in git here");
});

/* ────────────────────────────────────── the exact cover colour ─────────── */

/*
  HAND-COMPUTED, NOT DERIVED FROM THE IMPLEMENTATION. Each expectation below
  was worked out from the contract's own arithmetic:

      edge byte = floor(channel * 58 / 100), lowercase, zero-padded to two
      ink       = (r*299 + g*587 + b*114) >= 150000 ? "#241a12" : "#f6ecdc"

  A test that recomputed those from the same code it is testing would pass
  even if the formula were wrong, and the private app implements the identical
  formula against these same numbers.
*/
var COVER_CASES = [
  {
    why: "pure black — the darkest possible cover, and the zero edge",
    coverColor: "#000000",
    expect: { base: "#000000", edge: "#000000", ink: "#f6ecdc" }
  },
  {
    why: "pure white — the lightest possible cover; 255*58/100 = 147.9 floors to 147 = 0x93",
    coverColor: "#ffffff",
    expect: { base: "#ffffff", edge: "#939393", ink: "#241a12" }
  },
  {
    why: "a walnut brown: 91/58/41 -> 52/33/23 edge, brightness 65929 is dark",
    coverColor: "#5b3a29",
    expect: { base: "#5b3a29", edge: "#342117", ink: "#f6ecdc" }
  },
  {
    why: "a light mint: 127/214/161 -> 73/124/93 edge, brightness 181945 is light",
    coverColor: "#7fd6a1",
    expect: { base: "#7fd6a1", edge: "#497c5d", ink: "#241a12" }
  },
  {
    why: "near-zero channels — the two-digit ZERO PAD, where a naive toString(16) gives one digit",
    coverColor: "#010203",
    expect: { base: "#010203", edge: "#000101", ink: "#f6ecdc" }
  },
  {
    why: "one below the ink threshold: 255*299 + 100*587 + 132*114 = 149993",
    coverColor: "#ff6484",
    expect: { base: "#ff6484", edge: "#933a4c", ink: "#f6ecdc" }
  },
  {
    why: "one above the ink threshold: 255*299 + 100*587 + 133*114 = 150107",
    coverColor: "#ff6485",
    expect: { base: "#ff6485", edge: "#933a4d", ink: "#241a12" }
  }
];

COVER_CASES.forEach(function (c) {
  test("coverFromSnapshot: " + c.coverColor + " — " + c.why, function () {
    assert.deepEqual(R.coverFromSnapshot({ coverColor: c.coverColor }), c.expect);
  });
});

test("coverFromSnapshot: both ink branches are actually exercised by the cases above", function () {
  var inks = COVER_CASES.map(function (c) { return c.expect.ink; });
  assert.ok(inks.indexOf("#241a12") >= 0, "at least one light cover taking the dark ink");
  assert.ok(inks.indexOf("#f6ecdc") >= 0, "at least one dark cover taking the light ink");
});

test("coverFromSnapshot: every edge byte is lowercase two-digit hex", function () {
  COVER_CASES.forEach(function (c) {
    assert.match(c.expect.edge, /^#[0-9a-f]{6}$/, c.coverColor + " edge must be canonical lowercase hex");
  });
});

/*
  THE REJECTIONS. `coverColor` has exactly ONE valid spelling and everything
  else falls back to the legacy accent-name palette — the shape every snapshot
  written before this field existed still carries.
*/
var LEGACY = R.accentFromName("walnut");
var LEGACY_TRIPLE = { base: LEGACY.base, edge: LEGACY.edge, ink: LEGACY.ink };

var COVER_REJECTIONS = [
  { why: "UPPERCASE hex is not the canonical spelling", snapshot: { coverColor: "#5B3A29", accent: "walnut" } },
  { why: "mixed-case hex is not the canonical spelling", snapshot: { coverColor: "#5b3A29", accent: "walnut" } },
  { why: "three-digit shorthand is not accepted", snapshot: { coverColor: "#abc", accent: "walnut" } },
  { why: "rgb() is not accepted", snapshot: { coverColor: "rgb(91, 58, 41)", accent: "walnut" } },
  { why: "rgba() is not accepted", snapshot: { coverColor: "rgba(91, 58, 41, 0.5)", accent: "walnut" } },
  { why: "a CSS url() is refused outright", snapshot: { coverColor: "url(javascript:alert(1))", accent: "walnut" } },
  { why: "a colour with a trailing declaration is refused", snapshot: { coverColor: "#5b3a29; background:url(x)", accent: "walnut" } },
  { why: "a named colour is not a hex triplet", snapshot: { coverColor: "rebeccapurple", accent: "walnut" } },
  { why: "eight-digit hex with alpha is not the contract", snapshot: { coverColor: "#5b3a29ff", accent: "walnut" } },
  { why: "leading/trailing whitespace is not the canonical spelling", snapshot: { coverColor: " #5b3a29 ", accent: "walnut" } },
  { why: "an empty string", snapshot: { coverColor: "", accent: "walnut" } },
  { why: "a missing field", snapshot: { accent: "walnut" } },
  { why: "an explicit null", snapshot: { coverColor: null, accent: "walnut" } },
  { why: "a number rather than a string", snapshot: { coverColor: 5977129, accent: "walnut" } }
];

COVER_REJECTIONS.forEach(function (c) {
  test("coverFromSnapshot: falls back to the legacy accent palette — " + c.why, function () {
    assert.deepEqual(R.coverFromSnapshot(c.snapshot), LEGACY_TRIPLE);
  });
});

test("coverFromSnapshot: survives a null/undefined snapshot and still returns a palette triple", function () {
  [null, undefined, {}].forEach(function (snapshot) {
    var cover = R.coverFromSnapshot(snapshot);
    var known = R.ACCENT_PALETTE.some(function (p) {
      return p.base === cover.base && p.edge === cover.edge && p.ink === cover.ink;
    });
    assert.ok(known, "must resolve to one of the reader's own palette entries");
  });
});

test("coverFromSnapshot: never returns a value safeColor() would reject", function () {
  /* Both renderers pass every field of this object through safeColor() on the
     way into CSS. If this function could ever produce something safeColor
     refuses, the cover would silently fall back to a hardcoded default. */
  var samples = COVER_CASES.map(function (c) { return { coverColor: c.coverColor }; })
    .concat(COVER_REJECTIONS.map(function (c) { return c.snapshot; }));
  samples.forEach(function (snapshot) {
    var cover = R.coverFromSnapshot(snapshot);
    ["base", "edge", "ink"].forEach(function (field) {
      assert.equal(R.safeColor(cover[field], "REJECTED"), cover[field],
        field + " (" + cover[field] + ") must survive safeColor()");
    });
  });
});

test("the legacy accent palette is still present and still reachable", function () {
  /* coverFromSnapshot's fallback depends on it; older snapshots depend on the
     fallback. Neither may be deleted as "superseded". */
  assert.ok(R.ACCENT_PALETTE.length > 0);
  assert.equal(typeof R.accentFromName, "function");
});

/* ─────────────────────── nothing internal reaches a visitor ────────────── */

/*
  `reason`, `code`, `plan`, `quota`, `egress` and `delivery` describe the
  OWNER's account and the server's own state. A visitor holding a link has no
  business learning why a share is unavailable — and "revoked", "expired" and
  "never existed" must stay indistinguishable from each other.
*/
var FORBIDDEN_FIELDS = ["reason", "code", "plan", "quota", "egress", "delivery"];

test("stateForStatus: no status's message names an internal cause", function () {
  [0, 200, 400, 401, 403, 404, 410, 429, 500, 502, 503, 999].forEach(function (status) {
    var state = R.stateForStatus(status);
    FORBIDDEN_FIELDS.forEach(function (field) {
      assert.ok(!new RegExp(field, "i").test(state.message),
        "status " + status + " must not mention " + field + ": " + state.message);
    });
  });
});

test("no renderable field can carry a server-supplied reason / code / plan / quota / egress / delivery", function () {
  var hostile = {
    format: "makullveny-share@1",
    schemaVersion: 1,
    itemKind: "book",
    title: "A quiet reading",
    description: "Three pages about moss.",
    displayName: "Nate",
    reason: "SENTINEL_REASON_revoked_by_owner",
    code: "SENTINEL_CODE_MAK_403",
    plan: "SENTINEL_PLAN_hearth",
    quota: "SENTINEL_QUOTA_4.7GB_of_5GB",
    egress: "SENTINEL_EGRESS_812MB_this_month",
    delivery: "SENTINEL_DELIVERY_paused_for_nonpayment"
  };

  var rendered = [
    R.openGraphFields(hostile).title,
    R.openGraphFields(hostile).description,
    R.openGraphFields(hostile).author,
    R.byline(hostile)
  ].join(" | ");

  assert.ok(!/SENTINEL_/.test(rendered), "an internal field reached a rendered string: " + rendered);
  /* And the honest half: what the visitor DOES get is the reading's own text. */
  assert.equal(R.openGraphFields(hostile).title, "A quiet reading");
  assert.equal(R.openGraphFields(hostile).description, "Three pages about moss.");
  assert.equal(R.byline(hostile), "Nate");
});

test("no viewer source file READS one of those fields off a response", function () {
  /* A behavioural test can only cover the fields something already renders.
     This one covers the fields nothing renders YET — it fails the moment
     someone writes `snapshot.reason` anywhere in the viewer. Property access
     only, so the prose above (which names all six) does not trip it. */
  ["read.js", "book.js", "blueprint.js"].forEach(function (name) {
    var text = code(name);
    FORBIDDEN_FIELDS.forEach(function (field) {
      assert.ok(!new RegExp("\\.\\s*" + field + "\\b").test(text),
        name + " must not read a `." + field + "` property off a response");
      assert.ok(!new RegExp("\\[\\s*[\"']" + field + "[\"']").test(text),
        name + " must not read a [\"" + field + "\"] property off a response");
    });
  });
});

/* ────────────────────────────── clamping every rendered string ─────────── */

test("openGraphFields: displayName is clamped like every other rendered string", function () {
  /* It used to go into the article:author meta content attribute unbounded —
     the one string on this page an upstream could make arbitrarily long. */
  var fields = R.openGraphFields({ title: "T", displayName: "n".repeat(5000) });
  assert.equal(fields.author.length, 200);
  assert.equal(fields.author, "n".repeat(200));
});

test("openGraphFields: title and description are clamped to the server's own limits", function () {
  var fields = R.openGraphFields({ title: "t".repeat(900), description: "d".repeat(9000) });
  assert.equal(fields.title.length, 200);
  assert.equal(fields.description.length, 500);
});

test("openGraphFields: anonymous publishing withholds the author entirely", function () {
  assert.equal(R.openGraphFields({ title: "T", displayName: "Nate", anonymous: true }).author, "");
});

test("openGraphFields: an untitled, undescribed snapshot still yields honest text", function () {
  assert.equal(R.openGraphFields({}).title, "Untitled");
  assert.equal(R.openGraphFields({}).description, "A shared reading from Makullveny.");
  assert.equal(R.openGraphFields({ itemKind: "blueprint" }).description, "A shared blueprint from Makullveny.");
  assert.equal(R.openGraphFields(null).title, "Untitled", "a null snapshot must not throw");
});

test("byline: clamped, anonymous-respecting, and falls back to the handle", function () {
  assert.equal(R.byline({ displayName: "n".repeat(5000) }).length, 200);
  assert.equal(R.byline({ handle: "h".repeat(5000) }).length, 65, "an @ plus 64 clamped characters");
  assert.equal(R.byline({ displayName: "Nate", handle: "nate", anonymous: true }), "");
  assert.equal(R.byline({ handle: "nate" }), "@nate");
  assert.equal(R.byline({}), "");
  assert.equal(R.byline(null), "", "a null snapshot must not throw");
});

/* ──────────────────────────────────────── wiring regressions ───────────── */

test("the malformed-body path uses the tone the status map returns, not a hardcoded one", function () {
  /* stateForStatus(0) is the not-available sentence, which is "refused". The
     malformed-body path used to render that sentence with a hardcoded "retry"
     tone, so the words and the styling disagreed. */
  assert.equal(R.stateForStatus(0).tone, "refused");

  var text = source("read.js");
  assert.ok(!/stateForStatus\(0\)\.message,\s*["']retry["']/.test(text),
    "the hardcoded retry tone is back");
  var uses = text.match(/setState\(malformed\.message,\s*malformed\.tone\)/g) || [];
  assert.equal(uses.length, 2, "both malformed-body branches must take the tone from the map");
});

test("the Print button is unhidden when a reading renders — the @media print block is reachable", function () {
  /* It shipped `hidden`, was bound at load, and nothing ever revealed it, so
     read.css's whole print block was dead. */
  var text = source("read.js");
  assert.ok(/el\("readerPrint"\)/.test(text), "read.js must still look the button up");
  assert.ok(/print\.hidden\s*=\s*false/.test(text), "something must unhide it");
  var html = source("index.html");
  assert.ok(/id="readerPrint"[^>]*hidden/.test(html), "it must still ship hidden");
});

test("the token is never written anywhere a person or another origin could read it", function () {
  var text = code("read.js");
  assert.ok(/TOKEN_STORAGE_KEY\s*=\s*"mak\.read\.token"/.test(text),
    "the per-tab storage key must be the documented one");
  ["read.js", "book.js", "blueprint.js"].forEach(function (name) {
    assert.ok(!/console\s*\./.test(code(name)), name + " must log nothing at all");
  });
  /* No query-string carrier, and no link built out of the token. */
  assert.ok(!/[?&]\w*token/i.test(text), "the token must never travel in a query string");
  assert.ok(!/textContent\s*=\s*token\b/.test(text), "the token must never become page text");
  assert.ok(!/href[^\n]*\btoken\b/.test(text), "the token must never become a link");
});

test("every sessionStorage and history access sits inside a try block", function () {
  /* sessionStorage THROWS on access in some privacy modes — it does not
     return null — and replaceState throws on a sandboxed document. A working
     page beats a stripped URL, so none of these may be left bare. */
  var lines = code("read.js").split(/\r?\n/);
  var risky = /sessionStorage|replaceState/;
  var depth = 0;
  var guarded = 0;
  var bare = [];
  lines.forEach(function (line, i) {
    var isRisky = risky.test(line) && !/^\s*(\/\*|\*|\/\/)/.test(line);
    if (isRisky) {
      if (depth > 0) guarded += 1;
      else bare.push(i + 1 + ": " + line.trim());
    }
    if (/\btry\s*\{/.test(line)) depth += 1;
    else if (depth > 0 && /^\s*\}\s*catch/.test(line)) depth -= 1;
  });
  assert.deepEqual(bare, [], "these are outside a try block");
  assert.ok(guarded >= 3, "expected the getItem, the setItem and the replaceState to be guarded");
});

test("both renderers expose a teardown, and neither adds a listener it cannot remove", function () {
  ["book.js", "blueprint.js"].forEach(function (name) {
    var text = code(name);
    assert.ok(/teardown:\s*teardown/.test(text), name + " must export teardown()");
    assert.ok(/removeEventListener/.test(text), name + " must remove what it adds");
    /* Every installation goes through the tracked on() helper. The only
       literal addEventListener calls left are inside that helper and the
       feature test guarding it. */
    var direct = text.match(/\.addEventListener\(/g) || [];
    assert.ok(direct.length <= 1,
      name + " installs a listener outside on(): " + direct.length + " direct calls");
  });
});

test("scene.css answers prefers-reduced-transparency as well as prefers-reduced-motion", function () {
  var css = source("scene.css");
  assert.ok(/@media \(prefers-reduced-motion: reduce\)/.test(css), "reduced motion is still handled");
  assert.ok(/@media \(prefers-reduced-transparency: reduce\)/.test(css), "reduced transparency is handled");
  /* No blur may survive into the reduced-transparency block, and it must not
     be an empty gesture. */
  var block = /@media \(prefers-reduced-transparency: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css);
  assert.ok(block, "the reduced-transparency block must be the last block in the file");
  assert.ok(!/backdrop-filter/.test(block[1]), "no backdrop blur inside the reduced-transparency block");
  assert.ok(!/rgba\(/.test(block[1]), "no rgba veil inside the reduced-transparency block");
  assert.ok(block[1].indexOf("--scene-parchment-haze: transparent") >= 0, "the haze token is neutralised");
  assert.ok(block[1].indexOf("--scene-honey-soft: transparent") >= 0, "the honey wash token is neutralised");
});

test("the site links /updates/, so the page is not an orphan", function () {
  var home = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  var nav = /<nav\b[^>]*>([\s\S]*?)<\/nav>/.exec(home);
  assert.ok(nav, "the home page must still have a nav");
  assert.ok(/href="\.\/updates\/"/.test(nav[1]), "the nav must link to /updates/");
});
