/*
  A LISTED STUDY TEAM'S PAGE (/team/<slug>) AND ITS SCHOOL'S BOARD
  (/school/<slug>), 2026-10-06. Run with:  node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var ROOT = path.join(__dirname, "..");
var P = require(path.join("..", "team", "page.js"));
var teamHtml = fs.readFileSync(path.join(ROOT, "team", "index.html"), "utf8");
var schoolHtml = fs.readFileSync(path.join(ROOT, "school", "index.html"), "utf8");
var notFound = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
var config = fs.readFileSync(path.join(ROOT, "read", "config.js"), "utf8");

test("the slug is the server's <words>-<key>, read from the fragment and nowhere else", function () {
  assert.equal(P.slugFromHash("#night-owls-k7qm2xpa"), "night-owls-k7qm2xpa");
  assert.equal(P.slugFromHash("#k7qm2xpa"), "k7qm2xpa");
  assert.equal(P.slugFromHash("#caf%C3%A9-k7qm2xpa"), "café-k7qm2xpa");
  assert.equal(P.slugFromHash("#NIGHT-OWLS-K7QM2XPA"), "", "the server only ever makes lower case");
  assert.equal(P.slugFromHash("#night-owls-k7qm2xp1"), "", "1 is not in the key alphabet");
  assert.equal(P.slugFromHash("#ABCD2345"), "", "an invite code is not a page address");
  assert.equal(P.slugFromHash("#a\"><x-k7qm2xpa"), "");
  assert.equal(P.slugFromHash("#%E0%A4%A"), "");
  assert.equal(P.deepLink("night-owls-k7qm2xpa"), "makullveny://team-page/night-owls-k7qm2xpa");
  assert.equal(P.deepLink("nope"), "");
});

test("a team page draws named fields only; a nameless seat stays nameless", function () {
  var team = P.shapeTeam({
    team: {
      name: "TDG", motto: "Teamwork", avatar: "team-candle", slug: "tdg-k4n5pnfg", points: 4316, weekPoints: 3916,
      memberCount: 4, level: { level: 11, from: 3960, to: 4680 }, joinCode: "2MT5CY8K",
      school: { name: "Dryrun Valley High", shortName: "DVHS", kind: "high_school", slug: "dryrun-valley-high-quc4rcza" }
    },
    members: [
      { username: "nm8", owner: true, points: 2759, weekPoints: 2659 },
      { username: "", anonymous: true, points: 557, weekPoints: 457 },
      { username: "<b>", points: 500, weekPoints: 400 }
    ]
  });
  assert.equal(JSON.stringify(team).indexOf("2MT5CY8K"), -1, "never the invite code");
  assert.deepEqual(team.members.map(P.memberLabel), ["@nm8", "Anonymous", "Teammate"]);
  assert.equal(team.school.shortName, "DVHS");
  assert.equal(team.school.slug, "dryrun-valley-high-quc4rcza");
  assert.equal(team.level.level, 11);
  assert.equal(P.shapeTeam({}), null);
  assert.equal(P.artFor("team-candle"), "../assets/teams/mak-team-candle.png");
  assert.equal(P.artFor("owl"), "");
  P.TEAM_ART.forEach(function (key) {
    assert.ok(fs.existsSync(path.join(ROOT, "assets", "teams", "mak-team-" + key + ".png")), key);
  });
});

test("a school board names teams only", function () {
  var board = P.shapeSchoolBoard({
    school: { name: "Lincoln High School", shortName: "LHS", slug: "lincoln-high-school-quc4rcza" },
    teamCount: 1, lockInHoursWeek: 130.54, weekPoints: 3916,
    teams: [{ rank: 1, name: "TDG", slug: "tdg-k4n5pnfg", level: 11, memberCount: 4, weekPoints: 3916, members: [{ username: "nm8" }] }]
  });
  assert.equal(board.lockInHours, 130.5);
  assert.equal(JSON.stringify(board).indexOf("nm8"), -1, "no student name");
  assert.equal(board.teams[0].slug, "tdg-k4n5pnfg");
  assert.equal(P.shapeSchoolBoard({ teams: [] }), null);
});

test("one pinned origin: config, the script and both pages' connect-src agree; no key", function () {
  var sandbox = { window: {} };
  vm.runInNewContext(config, sandbox);
  var api = sandbox.window.MAKULLVENY_READER_CONFIG;
  assert.equal(api.publishableKey, "");
  assert.ok(P.apiOriginAllowed(api.apiUrl));
  assert.equal(P.apiOriginAllowed("https://evil.example/functions/v1/mak-share"), false);
  [teamHtml, schoolHtml].forEach(function (html) {
    var csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, new RegExp("connect-src " + P.ALLOWED_API_ORIGINS[0].replace(/\./g, "\\.") + ";"));
    assert.doesNotMatch(html, /<script>|style="/, "no inline script or style");
    assert.match(html, /<script src="\.\.\/read\/config\.js"><\/script>\s*<script src="\.\.\/team\/page\.js"><\/script>/);
  });
  assert.match(teamHtml, /data-page="team"/);
  assert.match(schoolHtml, /data-page="school"/);
});

test("404.html moves /team/<slug> and /school/<slug> to the fragment, and nothing else", function () {
  var script = /<script>([\s\S]*?)<\/script>/.exec(notFound)[1];
  function route(pathname) {
    var moved = null;
    vm.runInNewContext(script, { window: { location: { pathname: pathname, replace: function (to) { moved = to; } } } });
    return moved;
  }
  assert.equal(route("/team/night-owls-k7qm2xpa"), "/team/#night-owls-k7qm2xpa");
  assert.equal(route("/school/lincoln-high-quc4rcza/"), "/school/#lincoln-high-quc4rcza");
  assert.equal(route("/t/K7QM-W2XP"), "/t/#K7QMW2XP", "the invite route still works");
  assert.equal(route("/team/"), null);
  assert.equal(route("/teams/night-owls-k7qm2xpa"), null);
});
