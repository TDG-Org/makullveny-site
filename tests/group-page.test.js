/*
  Pure-logic tests for g/group.js -- a friend group's calendar, shared by
  link (https://www.makullveny.com/g/#<token>). Node's own test runner, no
  dependency, like the reader's and the profile page's tests.

  Run with: node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var G = require(path.join("..", "g", "group.js"));
var P = require(path.join("..", "u", "profile.js"));
var R = require(path.join("..", "read", "read.js"));
var ROOT = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(ROOT, "g", "index.html"), "utf8");
var src = fs.readFileSync(path.join(ROOT, "g", "group.js"), "utf8");

/* Epoch MINUTES for a local wall-clock time, the way the app sends them. */
function at(y, mo, d, h, mi) {
  return Math.round(new Date(y, mo - 1, d, h, mi || 0).getTime() / 60000);
}
var NOW = new Date(2026, 8, 30, 9, 0).getTime(); /* Wed 30 Sep 2026, 9am local */

test("tokenFromHash: the bare token, lower-cased; anything else is empty", function () {
  assert.equal(G.tokenFromHash("#abcdefghijkmnpqrstuvwxyz2"), "abcdefghijkmnpqrstuvwxyz2");
  assert.equal(G.tokenFromHash("#ABCDEFGHIJKMNPQRSTUVWXYZ2"), "abcdefghijkmnpqrstuvwxyz2");
  assert.equal(G.tokenFromHash("#short"), "");
  assert.equal(G.tokenFromHash("#abcdefghijkmnpqrs0"), "", "0 and 1 are not in the alphabet");
  assert.equal(G.tokenFromHash(""), "");
});

test("the page talks to exactly the reader's one pinned origin, with no key", function () {
  assert.deepEqual(G.ALLOWED_API_ORIGINS, R.ALLOWED_API_ORIGINS);
  assert.deepEqual(G.ALLOWED_API_ORIGINS, P.ALLOWED_API_ORIGINS);
  assert.equal(G.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share"), true);
  assert.equal(G.apiOriginAllowed("https://ddbksawvchsauiuiwvrl.supabase.co.evil.com/functions/v1/mak-share"), false);
  assert.equal(G.apiOriginAllowed("http://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share"), false);
  assert.equal(G.apiOriginAllowed(""), false);
  assert.match(html, /connect-src https:\/\/ddbksawvchsauiuiwvrl\.supabase\.co;/);
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.ok(html.indexOf('<script src="../read/config.js"></script>') < html.indexOf('<script src="./group.js"></script>'));
  assert.doesNotMatch(html, /<script>(?!<)|style="/, "no inline script or style");
  assert.doesNotMatch(src, /apikey|Authorization|publishableKey/, "no key of any kind");
  assert.match(src, /JSON\.stringify\(\{ action: "group", token: token \}\)/);
  assert.doesNotMatch(src, /\?token=|[?&]t=/, "the token never goes in a query string");
});

test("shapeGroup keeps only what the page draws: never an id, a username, a room or a course colour", function () {
  var shaped = G.shapeGroup({
    ok: true,
    name: "  Study   Crew ",
    theme: "snow-cabin",
    span: "week",
    owner_id: "d0ff8af3-6fe2-4cb6-8de1-c537357e7e64",
    members: [
      { name: "Maya Reyes", colorIndex: 1, username: "maya", user_id: "x", items: [{ t: "BIO 110", s: 100, e: 150, k: "class", c: "#123456", l: "Room 4" }] },
      { name: "", colorIndex: 0, items: [{ t: "Movie", s: 10, e: 70, k: "event" }, { t: "Homework", s: 1, e: 2, k: "assignment" }, { t: "", s: 1, e: 2, k: "class" }, { t: "Long", s: 1, e: 5000, k: "class" }] },
      { name: "Dup", colorIndex: 1, items: [] },
      { name: "Bad slot", colorIndex: 10, items: [] },
      { name: "Bad slot too", colorIndex: -1, items: [] }
    ]
  });
  assert.deepEqual(shaped, {
    name: "Study Crew",
    theme: "snow-cabin",
    span: "week",
    members: [
      { name: "Friend", slot: 0, items: [{ t: "Movie", s: 10, e: 70, k: "event" }] },
      { name: "Maya Reyes", slot: 1, items: [{ t: "BIO 110", s: 100, e: 150, k: "class" }] }
    ]
  });
});

test("a theme key only ever picks one of the site's own themes", function () {
  assert.deepEqual(G.THEMES, P.THEMES);
  assert.equal(G.shapeGroup({ theme: "url(x)" }).theme, "cozy-cabin");
  assert.equal(G.shapeGroup({ theme: "gilded-arcana" }).theme, "gilded-arcana");
  assert.equal(G.shapeGroup({ span: "year" }).span, "week");
  assert.equal(G.shapeGroup({ span: "month" }).span, "month");
  assert.equal(G.MAX_MEMBERS, 10);
  assert.equal(G.shapeGroup({ members: new Array(14).fill(0).map(function (_, i) { return { name: "P" + i, colorIndex: i }; }) }).members.length, 10);
  assert.equal(G.shapeGroup({ members: new Array(14).fill(0).map(function (_, i) { return { name: "P" + i, colorIndex: i % 10 }; }) }).members.length, 10);
});

/* THE APP'S OWN OUTPUT, 2026-10-02: memberColour(i, tone) and
   personColour(slot, tone) printed by require()ing
   Makullveny/src/groupCalendarModel.js. If the app's tones move, regenerate
   both here and in g/group.js. */
var APP_MEMBER = {
  dark: ["#fd968f", "#f0a556", "#cbb94c", "#80cd82", "#21d1ca", "#71bfff", "#b6aaff", "#ee95d1", "#b7b7b7", "#c39b81"],
  light: ["#ab413e", "#955905", "#776a0a", "#267d30", "#007974", "#036eae", "#6a57b3", "#9b4382", "#696969", "#613f27"]
};
var APP_SLOT = {
  dark: ["#f0a556", "#21d1ca", "#b6aaff", "#ee95d1", "#80cd82", "#71bfff", "#cbb94c", "#fd968f", "#c39b81", "#b7b7b7"],
  light: ["#955905", "#007974", "#6a57b3", "#9b4382", "#267d30", "#036eae", "#776a0a", "#ab413e", "#613f27", "#696969"]
};

test("the colours are the app's, exactly: ten picks and ten slots, both tones", function () {
  ["dark", "light"].forEach(function (tone) {
    assert.deepEqual(G.MEMBER_COLOURS[tone], APP_MEMBER[tone], tone + " picks");
    assert.deepEqual(G.PERSON_COLOURS[tone], APP_SLOT[tone], tone + " slots");
    for (var slot = 0; slot < 10; slot += 1) assert.equal(G.personColour(slot, tone), APP_SLOT[tone][slot]);
  });
  assert.deepEqual(G.SLOT_ORDER, [1, 4, 6, 7, 3, 5, 2, 0, 9, 8]);
  /* stone is grey (no chroma), brown its own darker tone */
  assert.equal(G.MEMBER_COLOURS.dark[8], "#b7b7b7");
  assert.equal(G.MEMBER_COLOURS.light[8], "#696969");
  assert.equal(G.MEMBER_COLOURS.light[9], "#613f27");
  assert.match(src, /var INK_DARK = "#1b1426";/);
});

test("all twenty fills on each tone are distinct per table, and their ink reads >= 4.5:1", function () {
  ["dark", "light"].forEach(function (tone) {
    var all = G.MEMBER_COLOURS[tone].concat(G.PERSON_COLOURS[tone]);
    assert.equal(all.length, 20);
    assert.equal(new Set(G.MEMBER_COLOURS[tone]).size, 10);
    assert.equal(new Set(G.PERSON_COLOURS[tone]).size, 10);
    all.forEach(function (fill) {
      assert.match(fill, /^#[0-9a-f]{6}$/);
      assert.ok(G.contrast(fill, G.inkFor(fill)) >= 4.5, tone + " " + fill + " " + G.contrast(fill, G.inkFor(fill)).toFixed(2));
    });
  });
  assert.equal(G.toneFor("#fff1d2"), "dark");
  assert.equal(G.toneFor("#1f333c"), "light");
  /* never a colour from the network */
  assert.doesNotMatch(src, /\.c\b(?!\w)/);
});

test("a colour the member PICKED (0-9) wins; anything else falls back to the slot", function () {
  var shaped = G.shapeGroup({
    members: [
      { name: "Maya", colorIndex: 0, color: 5, items: [] },
      { name: "Leo", colorIndex: 1, color: 5, items: [] },
      { name: "Ana", colorIndex: 2, color: "#ff0000", items: [] },
      { name: "Sam", colorIndex: 3, color: "url(x)", items: [] },
      { name: "Kit", colorIndex: 4, color: 8, items: [] },
      { name: "Ivy", colorIndex: 5, color: 9, items: [] }
    ]
  });
  assert.deepEqual(shaped.members.map(function (m) { return m.colour; }), [5, undefined, undefined, undefined, 8, 9],
    "a good pick is kept (stone and brown too); a second claim, a hex and junk are not");
  ["dark", "light"].forEach(function (tone) {
    assert.equal(G.memberFill(shaped.members[0], tone), G.MEMBER_COLOURS[tone][5]);
    assert.equal(G.memberFill(shaped.members[1], tone), G.personColour(1, tone));
    assert.equal(G.memberFill(shaped.members[4], tone), APP_MEMBER[tone][8], "stone");
    assert.equal(G.memberFill(shaped.members[5], tone), APP_MEMBER[tone][9], "brown");
    var palette = G.paletteFor(shaped, tone);
    assert.equal(palette[0], G.MEMBER_COLOURS[tone][5]);
    assert.equal(palette[3], G.personColour(3, tone));
  });
  [10, -1, 2.5, "3", null, NaN, Infinity].forEach(function (bad) {
    assert.equal(G.shapeGroup({ members: [{ name: "X", colorIndex: 0, color: bad }] }).members[0].colour, undefined, String(bad));
  });
  assert.equal(G.shapeGroup({ members: [{ name: "X", colorIndex: 0, color: 0 }] }).members[0].colour, 0, "zero is a real pick");
  assert.equal(G.shapeGroup({ members: [{ name: "X", colorIndex: 9, color: 9 }] }).members[0].colour, 9);
});

test("someone who did not pick is moved off a slot colour another member picked", function () {
  /* slot 0 is orange; Maya picked orange (1), so Leo, unpicked in slot 0, moves */
  var shaped = G.shapeGroup({
    members: [
      { name: "Leo", colorIndex: 0, items: [] },
      { name: "Maya", colorIndex: 1, color: 1, items: [] },
      { name: "Ana", colorIndex: 2, items: [] }
    ]
  });
  assert.equal(shaped.members[1].colour, 1);
  assert.equal(shaped.members[0].colour, 4, "the first slot colour nobody wears: teal, free since Maya picked orange");
  assert.equal(shaped.members[2].colour, undefined, "violet slot, nobody picked violet: unchanged");
  ["dark", "light"].forEach(function (tone) {
    var fills = shaped.members.map(function (m) { return G.memberFill(m, tone); });
    assert.equal(new Set(fills).size, 3, tone);
  });
});

test("ten people, every mix of picks and slots: ten different colours, both tones", function () {
  function distinct(members) {
    var shaped = G.shapeGroup({ members: members });
    assert.equal(shaped.members.length, members.length);
    ["dark", "light"].forEach(function (tone) {
      var fills = shaped.members.map(function (m) { return G.memberFill(m, tone); });
      assert.equal(new Set(fills).size, fills.length, tone + " " + JSON.stringify(fills));
    });
    return shaped;
  }
  /* nobody picked: each keeps their own slot colour */
  var plain = distinct(new Array(10).fill(0).map(function (_, i) { return { name: "P" + i, colorIndex: i }; }));
  plain.members.forEach(function (m) { assert.equal(m.colour, undefined); });
  /* everyone picked something different */
  distinct(new Array(10).fill(0).map(function (_, i) { return { name: "P" + i, colorIndex: i, color: 9 - i }; }));
  /* half picked exactly the colours the other half's slots wear */
  var clash = distinct([
    { name: "A", colorIndex: 0 }, { name: "B", colorIndex: 1 }, { name: "C", colorIndex: 2 }, { name: "D", colorIndex: 3 }, { name: "E", colorIndex: 4 },
    { name: "F", colorIndex: 5, color: 1 }, { name: "G", colorIndex: 6, color: 4 }, { name: "H", colorIndex: 7, color: 6 }, { name: "I", colorIndex: 8, color: 9 }, { name: "J", colorIndex: 9, color: 8 }
  ]);
  /* A, B, C lost orange, teal, violet to picks; D (pink) and E (green) keep
     theirs; the moved take the free slot colours in slot order: blue, gold, red. */
  assert.deepEqual(clash.members.slice(0, 5).map(function (m) { return m.colour; }), [5, 2, 0, undefined, undefined]);
  /* a second claim on stone is dropped (B keeps teal); C's slot colour is
     stone, which A picked, so C takes the first free one: orange */
  var twice = distinct([
    { name: "A", colorIndex: 0, color: 8 }, { name: "B", colorIndex: 1, color: 8 }, { name: "C", colorIndex: 9 }
  ]);
  assert.deepEqual(twice.members.map(function (m) { return m.colour; }), [8, undefined, 1]);
});

test("the week: seven days from today, everyone in one column, overlaps side by side, hours fitted", function () {
  var group = G.shapeGroup({
    members: [
      { name: "Nate", colorIndex: 0, items: [
        { t: "Calc", s: at(2026, 9, 30, 9), e: at(2026, 9, 30, 10), k: "class" },
        { t: "Lab", s: at(2026, 9, 30, 9, 30), e: at(2026, 9, 30, 11), k: "class" },
        { t: "Too old", s: at(2026, 9, 20, 9), e: at(2026, 9, 20, 10), k: "class" }
      ] },
      { name: "Maya", colorIndex: 1, items: [
        { t: "Choir", s: at(2026, 10, 2, 19), e: at(2026, 10, 2, 21), k: "event" },
        { t: "Next week", s: at(2026, 10, 8, 9), e: at(2026, 10, 8, 10), k: "class" }
      ] }
    ]
  });
  var week = G.weekLayout(group.members, NOW);
  assert.equal(week.days.length, 7);
  assert.equal(new Date(week.days[0].start).getDate(), 30);
  assert.equal(week.count, 3);
  var today = week.days[0].items;
  assert.deepEqual(today.map(function (i) { return [i.t, i.slot, i.col, i.cols]; }), [["Calc", 0, 0, 2], ["Lab", 0, 1, 2]]);
  assert.equal(week.startMin, 8 * 60);
  assert.equal(week.endMin, 21 * 60, "fitted to Choir's end");
  /* A class alone on its day gets the whole column; the colour says whose. */
  assert.deepEqual(week.days[2].items.map(function (i) { return [i.t, i.name, i.slot, i.cols]; }), [["Choir", "Maya", 1, 1]]);
});

test("the month: five weeks from this week's Sunday, everyone's items per day, past days not counted", function () {
  var group = G.shapeGroup({
    span: "month",
    members: [
      { name: "Nate", colorIndex: 0, items: [{ t: "Calc", s: at(2026, 9, 30, 9), e: at(2026, 9, 30, 10), k: "class" }, { t: "Gone", s: at(2026, 9, 28, 9), e: at(2026, 9, 28, 10), k: "class" }] },
      { name: "Maya", colorIndex: 2, items: [{ t: "Bio", s: at(2026, 9, 30, 8), e: at(2026, 9, 30, 9), k: "class" }, { t: "October", s: at(2026, 10, 20, 8), e: at(2026, 10, 20, 9), k: "class" }] }
    ]
  });
  var month = G.monthLayout(group.members, NOW);
  assert.equal(month.weeks.length, 5);
  assert.equal(new Date(month.weeks[0][0].start).getDay(), 0);
  assert.equal(new Date(month.weeks[0][0].start).getDate(), 27);
  var cells = [].concat.apply([], month.weeks);
  var today = cells.filter(function (day) { return day.isToday; });
  assert.equal(today.length, 1);
  assert.deepEqual(today[0].entries.map(function (e) { return [e.t, e.slot]; }), [["Bio", 2], ["Calc", 0]]);
  assert.equal(cells.filter(function (day) { return day.past; }).length, 3);
  assert.equal(month.count, 3, "Monday's class is drawn faint, not counted; late October is in");
});

test("one sentence per state; revoked, unknown and malformed read the same", function () {
  assert.equal(G.stateForStatus(404), G.stateForStatus(400));
  assert.equal(G.stateForStatus(404), G.stateForStatus(0));
  assert.doesNotMatch(G.stateForStatus(404), /revoked|expired|banned|owner/i);
  assert.match(G.stateForStatus(429), /a lot of visits/);
});

test("nothing from the network is parsed as markup, and no fixture ships", function () {
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(src, /console\.|localStorage|sessionStorage|postMessage/);
  assert.equal(fs.existsSync(path.join(ROOT, "g", "_fixture.js")), false);
});

test("it looks like u/: the same themes, the same frame, and the app is offered both ways", function () {
  assert.match(html, /<link rel="stylesheet" href="\.\.\/u\/themes\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/u\/profile\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\.\/group\.css">/);
  assert.match(html, /href="\.\.\/#download">Get the app<\/a>/);
  assert.match(src, /get\.href = "\.\.\/#download"/);
  assert.match(src, /open\.href = "makullveny:\/\/open"/);
});

/* THE OLD LINK SHAPE: /g/<token> is Pages' 404, and the 404 moves exactly
   that shape (and nothing else) to /g/#<token>. Run the real inline script. */
test("404.html moves an old /g/<token> link to /g/#<token>, and nothing else", function () {
  var notFound = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  var code = /<script>([\s\S]*?)<\/script>/.exec(notFound)[1];
  function run(pathname) {
    var moved = null;
    vm.runInNewContext(code, { window: { location: { pathname: pathname, replace: function (to) { moved = to; } } } });
    return moved;
  }
  assert.equal(run("/g/abcdefghijkmnpqrstuvwxyz2"), "/g/#abcdefghijkmnpqrstuvwxyz2");
  assert.equal(run("/g/ABCDEFGHIJKMNPQRSTUVWXYZ2/"), "/g/#abcdefghijkmnpqrstuvwxyz2");
  assert.equal(run("/g/short"), null);
  assert.equal(run("/g/abc/def"), null);
  assert.equal(run("/read/abcdefghijkmnpqrstuvwxyz2"), null);
  assert.equal(run("/nope"), null);
  assert.equal(run("/g/abcdefghijkmnpqrst\"><x"), null);
});
