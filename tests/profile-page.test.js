/*
  Pure-logic tests for u/profile.js -- a student's profile link page. Node's
  own test runner, no dependency, like the reader's tests.

  Run with: node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var P = require(path.join("..", "u", "profile.js"));
var R = require(path.join("..", "read", "read.js"));
var ROOT = path.join(__dirname, "..");

test("tokenFromHash: the bare token, lower-cased; anything else is empty", function () {
  assert.equal(P.tokenFromHash("#abcdefghijkmnpqrst"), "abcdefghijkmnpqrst");
  assert.equal(P.tokenFromHash("#ABCDEFGHIJKMNPQRST"), "abcdefghijkmnpqrst");
  assert.equal(P.tokenFromHash("#short"), "");
  assert.equal(P.tokenFromHash("#abcdefghijkmnpqrs0"), "");
  assert.equal(P.tokenFromHash(""), "");
});

test("the page talks to exactly the reader's one pinned origin", function () {
  assert.deepEqual(P.ALLOWED_API_ORIGINS, R.ALLOWED_API_ORIGINS);
  assert.equal(P.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share"), true);
  assert.equal(P.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co.evil.com/functions/v1/mak-share"), false);
  assert.equal(P.apiOriginAllowed("http://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share"), false);
  var html = fs.readFileSync(path.join(ROOT, "u", "index.html"), "utf8");
  assert.match(html, /connect-src https:\/\/ddbksawvchsauiuiwvrl\.supabase\.co;/);
  assert.match(html, /<script src="\.\.\/read\/config\.js"><\/script>/);
});

test("shapeProfile keeps only what the page draws, and never an id, email or room", function () {
  var shaped = P.shapeProfile({
    ok: true,
    displayName: "  Maya   Reyes ",
    username: "maya<reads>",
    avatarId: 3,
    bio: "Bio major.",
    classes: [{ t: "BIO 110", s: 100, e: 150, l: "Room 4" }, { t: "", s: 1, e: 2 }, { t: "Long", s: 1, e: 5000 }],
    events: "not a list",
    achievements: 12.7,
    owner_id: "d0ff8af3-6fe2-4cb6-8de1-c537357e7e64",
    email: "someone@example.com"
  });
  assert.deepEqual(shaped, {
    displayName: "Maya Reyes",
    username: "mayareads",
    avatarId: 3,
    bio: "Bio major.",
    classes: [{ t: "BIO 110", s: 100, e: 150 }],
    achievements: 12
  });
});

test("an avatar digit outside 1..7 draws no picture", function () {
  assert.equal(P.shapeProfile({ avatarId: 9 }).avatarId, 0);
  assert.equal(P.shapeProfile({ avatarId: "3" }).avatarId, 0);
});

test("the week: the next seven days from today, weekend only when used, hours fitted", function () {
  // Wednesday 2026-09-30 12:00 local: Wed Thu Fri (Sat, Sun skipped) Mon Tue.
  var now = new Date(2026, 8, 30, 12, 0).getTime();
  var wed9 = new Date(2026, 8, 30, 9, 0).getTime() / 60000;
  var fri13 = new Date(2026, 9, 2, 13, 0).getTime() / 60000;
  var mon10 = new Date(2026, 9, 5, 10, 0).getTime() / 60000;
  var week = P.weekLayout(
    [{ t: "BIO 110", s: wed9, e: wed9 + 50 }, { t: "ENG 101", s: fri13, e: fri13 + 75 }, { t: "MATH 151", s: mon10, e: mon10 + 75 }],
    [],
    now
  );
  assert.equal(week.label, "Next 7 days");
  assert.deepEqual(week.days.map(function (d) { return d.dow; }), [3, 4, 5, 1, 2]);
  assert.equal(week.firstHour, 9);
  assert.equal(week.lastHour, 15);
  assert.deepEqual(week.blocks.map(function (b) { return [b.t, b.day, b.startMin, b.endMin]; }), [
    ["BIO 110", 0, 540, 590],
    ["ENG 101", 2, 780, 855],
    ["MATH 151", 3, 600, 675]
  ]);
  var saturday = new Date(2026, 9, 3, 10, 0).getTime() / 60000;
  var withGame = P.weekLayout([], [{ t: "Game", s: saturday, e: saturday + 60 }], now);
  assert.deepEqual(withGame.days.map(function (d) { return d.dow; }), [3, 4, 5, 6, 1, 2]);
  assert.equal(withGame.blocks[0].day, 3);
});

test("a Monday visit is titled This week, and nothing past the seventh day shows", function () {
  var monday = new Date(2026, 9, 5, 8, 0).getTime();
  var nextMonday = new Date(2026, 9, 12, 9, 0).getTime() / 60000;
  var week = P.weekLayout([{ t: "BIO 110", s: nextMonday, e: nextMonday + 50 }], [], monday);
  assert.equal(week.label, "This week");
  assert.equal(week.blocks.length, 0);
  assert.deepEqual(week.days.map(function (d) { return d.dow; }), [1, 2, 3, 4, 5]);
});

test("two things at once on one day sit side by side", function () {
  var now = new Date(2026, 8, 30, 12, 0).getTime();
  var at = new Date(2026, 9, 1, 10, 0).getTime() / 60000;
  var week = P.weekLayout([{ t: "A", s: at, e: at + 60 }], [{ t: "B", s: at + 30, e: at + 90 }], now);
  assert.deepEqual(week.blocks.map(function (b) { return [b.t, b.lane, b.lanes]; }), [["A", 0, 2], ["B", 1, 2]]);
});

test("revoked, unknown and malformed all read the same sentence", function () {
  assert.equal(P.stateForStatus(404), P.stateForStatus(400));
  assert.equal(P.stateForStatus(404), P.stateForStatus(0));
  assert.doesNotMatch(P.stateForStatus(404), /revoked|expired|banned/i);
});

test("a class keeps one colour, from this page's own palette", function () {
  assert.equal(P.colourFor("BIO 110"), P.colourFor("bio 110"));
  assert.match(P.colourFor("anything"), /^#[0-9a-f]{6}$/);
});

test("the page holds no key and renders nothing as markup", function () {
  var source = fs.readFileSync(path.join(ROOT, "u", "profile.js"), "utf8");
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /service_role|sk_live_|eyJ[A-Za-z0-9_-]{10}/);
  assert.doesNotMatch(source, /\?token=|\?p_token=/);
  assert.match(source, /request\.send\(JSON\.stringify\(\{ action: "profile", token: token \}\)\)/);
});

test("every avatar the page can draw exists on this site", function () {
  Object.keys(P.AVATARS).forEach(function (id) {
    assert.ok(fs.existsSync(path.join(ROOT, "assets", "site", "avatars", P.AVATARS[id].file)), P.AVATARS[id].file);
  });
});

test("opened with no link while signed in, the page draws the student's own card", function () {
  var html = fs.readFileSync(path.join(ROOT, "u", "index.html"), "utf8");
  // me.js must run before profile.js, which asks it who is signed in.
  assert.ok(html.indexOf('src="../account/me.js"') > 0);
  assert.ok(html.indexOf('src="../account/me.js"') < html.indexOf('src="./profile.js"'));
  assert.match(P.ownNote({ username: "maya_r" }), /@maya_r/);
  assert.doesNotMatch(P.ownNote({ username: "", displayName: "Maya" }), /@/);
});
