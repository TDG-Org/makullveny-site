"use strict";
// The download section says what is true of the Mac file it hands out: the
// signed build starts after v2.94.2 (2026-10-13), and an Intel .dmg is never
// what the Apple silicon button falls back to.
const test = require("node:test");
const assert = require("node:assert/strict");
const download = require("../download.js");

test("a Mac release after v2.94.2 is the signed one; v2.94.2 and older are not", () => {
  assert.equal(download.macBuildIsSigned("v2.94.2"), false);
  assert.equal(download.macBuildIsSigned("v2.94.1"), false);
  assert.equal(download.macBuildIsSigned("v1.99.9"), false);
  assert.equal(download.macBuildIsSigned("v2.94.3"), true);
  assert.equal(download.macBuildIsSigned("v2.103.0"), true);
  assert.equal(download.macBuildIsSigned("3.0.0"), true);
  assert.equal(download.macBuildIsSigned(""), true);
});

test("the Mac button never falls back to an Intel disk image", () => {
  const groups = { macosIntel: { name: "Makullveny-2.0.0-x64.dmg", url: "x" } };
  assert.equal(download.resolveSlot(groups, "macosArm"), null);
  assert.equal(download.resolveSlot(groups, "macos"), null);
});
