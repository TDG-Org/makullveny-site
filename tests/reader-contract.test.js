/*
  Pure-logic tests for read/read.js, run with Node's own built-in test runner
  — zero dependencies, matching this repo's no-build-step, no-devDependency
  rule. Covers the DOM-free surface: token parsing, the accent name->color
  lookup, schema/format classification, and HTTP-status -> reader-state
  mapping.

  WHAT THIS SUITE DOES NOT COVER, AND WHY THAT IS FINE: the DOMParser-based
  sanitizer (book pages) and the SVG-building blueprint renderer both need a
  real DOM, which this repo deliberately has no framework to fake (no jsdom
  dependency here — see AGENTS.md/README.md on staying build-free). That
  coverage exists two other ways: (1) the private Makullveny app's own test
  suite already runs 33+ hostile-markup cases through this exact sanitizer
  logic under jsdom (tests/publicReaderSecurity.test.js there), because the
  two repos share no code and that is the one place a real DOM is already a
  dependency; (2) this session hand-verified both renderers in a real browser
  against fixture snapshots — including the exact hostile payload
  `<script>window.hacked=true</script><img src=x onerror=alert(1)>` — and
  confirmed neither executed. See the completion report for what was checked.

  Run with: node --test tests/
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");

var R = require(path.join("..", "read", "read.js"));

test("tokenFromHash: accepts a bare token", function () {
  assert.equal(R.tokenFromHash("#abcdefghijklmnop"), "abcdefghijklmnop");
});

test("tokenFromHash: takes the LAST segment of a decorated hash", function () {
  assert.equal(R.tokenFromHash("#@nate/marsh-trail/abcdefghijklmnop"), "abcdefghijklmnop");
});

test("tokenFromHash: rejects too-short, too-long, and characters outside [a-z2-9]", function () {
  assert.equal(R.tokenFromHash("#short"), "");
  assert.equal(R.tokenFromHash("#" + "a".repeat(65)), "");
  assert.equal(R.tokenFromHash("#ABCDEFGHIJKLMNOP"), ""); // uppercase not allowed
  assert.equal(R.tokenFromHash("#abcdefghijklmno1"), ""); // digit 1 excluded (base32-ish alphabet)
});

test("tokenFromHash: empty or missing hash yields no token", function () {
  assert.equal(R.tokenFromHash(""), "");
  assert.equal(R.tokenFromHash("#"), "");
});

test("safeColor: accepts hex and rgb()/rgba(), rejects everything else", function () {
  assert.equal(R.safeColor("#abc", "fallback"), "#abc");
  assert.equal(R.safeColor("#aabbcc", "fallback"), "#aabbcc");
  assert.equal(R.safeColor("rgb(10, 20, 30)", "fallback"), "rgb(10, 20, 30)");
  assert.equal(R.safeColor("rgba(10, 20, 30, 0.5)", "fallback"), "rgba(10, 20, 30, 0.5)");
  assert.equal(R.safeColor("url(javascript:alert(1))", "fallback"), "fallback");
  assert.equal(R.safeColor("expression(alert(1))", "fallback"), "fallback");
  assert.equal(R.safeColor("red; background:url(x)", "fallback"), "fallback");
  assert.equal(R.safeColor("", "fallback"), "fallback");
});

test("accentFromName: deterministic (same name -> same color every time)", function () {
  var a = R.accentFromName("walnut");
  var b = R.accentFromName("walnut");
  assert.deepEqual(a, b);
});

test("accentFromName: always resolves to one of the reader's own palette entries, never an arbitrary string", function () {
  ["walnut", "totally-unknown-name", "", "a".repeat(32), "UPPERCASE-rejected"].forEach(function (name) {
    var accent = R.accentFromName(name);
    var isKnown = R.ACCENT_PALETTE.some(function (p) { return p.base === accent.base && p.edge === accent.edge; });
    assert.ok(isKnown, "accentFromName(" + JSON.stringify(name) + ") must return a palette entry");
  });
});

test("clampNumber / clampInt: bound and fall back on non-finite input", function () {
  assert.equal(R.clampNumber(5, 0, 10, 1), 5);
  assert.equal(R.clampNumber(50, 0, 10, 1), 10);
  assert.equal(R.clampNumber(-5, 0, 10, 1), 0);
  assert.equal(R.clampNumber(NaN, 0, 10, 1), 1);
  assert.equal(R.clampNumber(undefined, 0, 10, 1), 1);
  assert.equal(R.clampInt(2.7, 0, 10, 0), 3);
});

test("classifySnapshot: accepts the exact committed contract shapes", function () {
  assert.equal(R.classifySnapshot({ format: "makullveny-share@1", schemaVersion: 1, itemKind: "book" }), "book");
  assert.equal(R.classifySnapshot({ format: "makullveny-blueprint@1", schemaVersion: 1, itemKind: "blueprint" }), "blueprint");
});

test("classifySnapshot: refuses honestly on any mismatch (never guesses)", function () {
  assert.equal(R.classifySnapshot({ format: "makullveny-share@1", schemaVersion: 2, itemKind: "book" }), null, "wrong schemaVersion");
  assert.equal(R.classifySnapshot({ format: "makullveny-share@2", schemaVersion: 1, itemKind: "book" }), null, "unrecognized format string");
  assert.equal(R.classifySnapshot({ format: "makullveny-share@1", schemaVersion: 1, itemKind: "blueprint" }), null, "itemKind disagrees with format");
  assert.equal(R.classifySnapshot({}), null, "empty snapshot");
  assert.equal(R.classifySnapshot(null), null, "null snapshot");
  assert.equal(R.classifySnapshot(undefined), null, "undefined snapshot");
});

test("stateForStatus: every distinct server state maps to a message, and 404-family states are indistinguishable from each other", function () {
  var notFound = R.stateForStatus(404);
  var badRequest = R.stateForStatus(400);
  var rateLimited = R.stateForStatus(429);
  var paused = R.stateForStatus(503);
  var upstream1 = R.stateForStatus(502);
  var upstream2 = R.stateForStatus(500);

  assert.equal(notFound.tone, "refused");
  assert.equal(rateLimited.tone, "retry");
  assert.equal(paused.tone, "retry");
  assert.equal(upstream1.message, upstream2.message, "502 and 500 should read the same to a visitor");
  assert.notEqual(notFound.message, rateLimited.message);
  assert.notEqual(notFound.message, paused.message);
  assert.ok(!/plan|delivery|quota|egress/i.test(paused.message), "must never leak the owner's internal pause reason");
  assert.notEqual(badRequest.message, notFound.message);
});

test("clampText: bounds length and never throws on null/undefined/non-string", function () {
  assert.equal(R.clampText("hello", 3), "hel");
  assert.equal(R.clampText("hi", 10), "hi");
  assert.equal(R.clampText(null, 10), "");
  assert.equal(R.clampText(undefined, 10), "");
  assert.equal(R.clampText(12345, 3), "123", "coerces non-string input rather than throwing");
});

test("clampCredits: bounds both array length and each entry's length, defensively — server limits are 40 credits / 120 chars each", function () {
  var overLong = "x".repeat(500);
  var manyCredits = [];
  for (var i = 0; i < 100; i += 1) manyCredits.push(overLong);
  var result = R.clampCredits(manyCredits, 40, 120);
  assert.equal(result.length, 40, "a hostile payload claiming 100 credits is capped at 40");
  result.forEach(function (c) { assert.ok(c.length <= 120, "each credit capped at 120 chars"); });
  assert.deepEqual(R.clampCredits(null, 40, 120), [], "non-array input yields an empty list, not a crash");
  assert.deepEqual(R.clampCredits(["a", "b"], 40, 120), ["a", "b"]);
});

test("SUPPORTED_FORMATS: exactly the two committed item kinds at schemaVersion 1", function () {
  assert.deepEqual(Object.keys(R.SUPPORTED_FORMATS).sort(), ["makullveny-blueprint@1", "makullveny-share@1"]);
  assert.equal(R.SUPPORTED_FORMATS["makullveny-share@1"].schemaVersion, 1);
  assert.equal(R.SUPPORTED_FORMATS["makullveny-blueprint@1"].schemaVersion, 1);
});
