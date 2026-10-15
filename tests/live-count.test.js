/*
  live-count.js -- "students locked in right now" under the hero.
  Node's own test runner, no dependency.

  Run with: node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var L = require(path.join("..", "live-count.js"));
var R = require(path.join("..", "read", "read.js"));
var ROOT = path.join(__dirname, "..");

test("it talks to the one pinned origin, the counter function, with no key", function () {
  assert.deepEqual(L.ALLOWED_API_ORIGINS, R.ALLOWED_API_ORIGINS);
  assert.equal(L.ENDPOINT, "https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-locked-in-now");
  assert.equal(L.apiOriginAllowed(L.ENDPOINT), true);
  assert.equal(L.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co.evil.com/x"), false);
  var source = fs.readFileSync(path.join(ROOT, "live-count.js"), "utf8");
  assert.doesNotMatch(source, /apikey|Authorization|sb_publishable|eyJ/);
  assert.match(source, /credentials: "omit"/);
});

test("a number at or above 3 shows; anything else shows nothing", function () {
  assert.equal(L.FLOOR, 3);
  assert.equal(L.countFrom({ count: 12 }), 12);
  assert.equal(L.countFrom({ count: 3 }), 3);
  assert.equal(L.countFrom({ count: 2 }), null);
  assert.equal(L.countFrom({ count: 0 }), null);
  assert.equal(L.countFrom({ count: null }), null);
  assert.equal(L.countFrom({ count: "40" }), null);
  assert.equal(L.countFrom(null), null);
  assert.equal(L.words(1204), "1,204 students locked in right now");
});

test("paint hides the line for null and fills it for a number", function () {
  var node = {
    hidden: true,
    text: { textContent: "" },
    querySelector: function () { return this.text; }
  };
  L.paint(node, 7);
  assert.equal(node.hidden, false);
  assert.equal(node.text.textContent, "7 students locked in right now");
  L.paint(node, null);
  assert.equal(node.hidden, true);
});

test("ask answers null on an error or a refusal, never a 0", async function () {
  assert.equal(await L.ask(function () { return Promise.reject(new Error("offline")); }), null);
  assert.equal(await L.ask(function () { return Promise.resolve({ ok: false }); }), null);
  assert.equal(await L.ask(function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ count: 1 }); } }); }), null);
  assert.equal(await L.ask(function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ count: 25 }); } }); }), 25);
});

test("the homepage carries it hidden, loads the script, and has no CSP that would block the origin", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<p class="live-count" data-live-count hidden>/);
  assert.match(html, /<script src="\.\/live-count\.js" defer><\/script>/);
  var csp = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  if (csp) assert.match(csp[1], /connect-src[^;]*https:\/\/ddbksawvchsauiuiwvrl\.supabase\.co/);
  // The design source keeps it too, so the next build does not drop it.
  var design = fs.readFileSync(path.join(ROOT, "design", "Main.dc.html"), "utf8");
  assert.match(design, /data-live-count hidden/);
  assert.match(fs.readFileSync(path.join(ROOT, "tools", "build-site.mjs"), "utf8"), /live-count\.js/);
});
