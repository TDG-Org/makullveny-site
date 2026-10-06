/*
  THE STUDY TEAM INVITE PAGE (t/, 2026-10-06). The app copies
  https://www.makullveny.com/t/#<CODE>; until this page existed every one of
  those links landed on the 404.
  Run with:  node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var ROOT = path.join(__dirname, "..");
var T = require(path.join("..", "t", "team.js"));
var html = fs.readFileSync(path.join(ROOT, "t", "index.html"), "utf8");

test("the code alphabet is the app's: 8 of A-Z and 2-9 without I, O, 0, 1", function () {
  assert.equal(T.normalizeCode("abcd-efgh"), "ABCDEFGH");
  assert.equal(T.normalizeCode(" K7QM W2XP "), "K7QMW2XP");
  assert.equal(T.normalizeCode("ABCDEFGI"), "", "I is not in the alphabet");
  assert.equal(T.normalizeCode("ABCDEFG0"), "", "0 is not in the alphabet");
  assert.equal(T.normalizeCode("ABCDEFG"), "");
  assert.equal(T.normalizeCode("ABCDEFGHJ"), "");
  assert.equal(String(T.CODE_PATTERN), "/^[A-HJ-NP-Z2-9]{8}$/");
});

test("the code comes from the fragment, and nothing else becomes a link", function () {
  assert.equal(T.codeFromHash("#K7QMW2XP"), "K7QMW2XP");
  assert.equal(T.codeFromHash("#k7qm-w2xp"), "K7QMW2XP");
  assert.equal(T.codeFromHash("#K7QM%2DW2XP"), "K7QMW2XP");
  assert.equal(T.codeFromHash("#K7QMW2XP\"><x"), "");
  assert.equal(T.codeFromHash("#%E0%A4%A"), "");
  assert.equal(T.codeFromHash(""), "");
  assert.equal(T.deepLink("k7qm-w2xp"), "makullveny://team/K7QMW2XP");
  assert.equal(T.deepLink("nope"), "");
  assert.equal(T.formatCode("K7QMW2XP"), "K7QM-W2XP");
});

function fakeDoc() {
  var nodes = {};
  ["code", "open", "lead", "paste"].forEach(function (id) { nodes[id] = { id: id, hidden: id === "code", textContent: "", href: "" }; });
  return { nodes: nodes, getElementById: function (id) { return nodes[id] || null; } };
}

test("a good link shows the code big and points Join at the app", function () {
  var doc = fakeDoc();
  assert.equal(T.paint(doc, "#K7QMW2XP"), "K7QMW2XP");
  assert.equal(doc.nodes.code.textContent, "K7QM-W2XP");
  assert.equal(doc.nodes.code.hidden, false);
  assert.equal(doc.nodes.open.href, "makullveny://team/K7QMW2XP");
  assert.equal(doc.nodes.open.textContent, "Join in Makullveny");
  assert.match(doc.nodes.paste.textContent, /Paste this code in Community/);
});

test("a broken link says so, and the button only opens the app", function () {
  var doc = fakeDoc();
  assert.equal(T.paint(doc, "#<script>"), "");
  assert.equal(doc.nodes.code.hidden, true);
  assert.equal(doc.nodes.open.href, "makullveny://open");
  assert.match(doc.nodes.lead.textContent, /missing its code/);
});

test("the page offers the download and the paste-the-code way in", function () {
  assert.match(html, /You&#8217;re invited to a Study Team/);
  assert.match(html, /href="\.\.\/#download">Get Makullveny<\/a>/);
  assert.match(html, /Already have it\? Paste this code in Community\./);
  assert.match(html, /<a class="button" id="open" href="makullveny:\/\/open">Join in Makullveny<\/a>/);
});

test("same strict CSP as open/: no inline style or script, no network", function () {
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; connect-src 'none'/);
  assert.doesNotMatch(html, /<style|<script>(?!<)|style="/);
  assert.match(html, /<script src="\.\/team\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/team\.css">/);
});

test("404.html moves /t/<CODE> to /t/#<CODE>, and nothing that is not a code", function () {
  var notFound = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  var code = /<script>([\s\S]*?)<\/script>/.exec(notFound)[1];
  function run(pathname) {
    var moved = null;
    vm.runInNewContext(code, { window: { location: { pathname: pathname, replace: function (to) { moved = to; } } } });
    return moved;
  }
  assert.equal(run("/t/K7QMW2XP"), "/t/#K7QMW2XP");
  assert.equal(run("/t/k7qm-w2xp/"), "/t/#K7QMW2XP");
  assert.equal(run("/t/short"), null);
  assert.equal(run("/t/K7QMW2XP/extra"), null);
  assert.equal(run("/t/K7QM\"><x"), null);
});
