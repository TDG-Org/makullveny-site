/*
  THE OPEN PAGE (open/, 2026-09-28): where the welcome email's button lands.
  Run with:  node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var dir = path.join(__dirname, "..", "open");
var html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
var js = fs.readFileSync(path.join(dir, "open.js"), "utf8");

test("the button works with no script at all, and hands off to makullveny://open", function () {
  assert.match(html, /<a class="button" id="open" href="makullveny:\/\/open">Open Makullveny<\/a>/);
  assert.match(js, /location\.href = "makullveny:\/\/open"/);
});

test("a student without the app is offered the download", function () {
  assert.match(html, /href="\.\.\/#download">Download Makullveny<\/a>/);
});

test("same strict CSP as checkout/: no inline style or script, no network", function () {
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'/);
  assert.doesNotMatch(html, /<style|<script>(?!<)|style="/);
  assert.match(html, /<script src="\.\/open\.js"><\/script>/);
});
