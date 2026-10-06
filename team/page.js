/*
  A LISTED STUDY TEAM'S PAGE (/team/<slug>) AND ITS SCHOOL'S BOARD
  (/school/<slug>). One script for both; <body data-page="team|school">
  picks which. 2026-10-06, Phase 10.

  WHAT IS ON THEM, AND WHAT NEVER IS. The app's mak-share edge function
  ("team" / "school" actions -> mak_team_page / mak_school_page) answers only
  teams whose owner LISTED them; anything else is "This Study Team isn't
  public." A team page names a member only when they are already on the
  public Everyone board and their profile is not private; an anonymous board
  name stays anonymous. The school board names TEAMS only, never a student
  (schools include high schools). Never an account id, a display name or the
  invite code -- the server does not send them, and this page re-shapes every
  field it draws (shapeTeam / shapeSchool) and sets every string with
  textContent.

  SAME RULES AS u/ and g/: no key of any kind, ONE POST to one function at
  one pinned origin (read/config.js, ALLOWED_API_ORIGINS, the connect-src in
  both index.html files -- tests/team-page.test.js checks all three), and the
  slug in the fragment. /team/<slug> and /school/<slug> are GitHub Pages'
  404; ../404.html moves them to /team/#<slug> and /school/#<slug>, and this
  page puts the canonical address back. NO BUILD STEP.
*/
(function () {
  "use strict";

  var hasWindow = typeof window !== "undefined";
  var CONFIG = { apiUrl: "" };
  if (hasWindow && window.MAKULLVENY_READER_CONFIG && window.MAKULLVENY_READER_CONFIG.apiUrl) {
    CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
  }

  /* KEEP IN STEP with read/read.js, u/profile.js and g/group.js. */
  var ALLOWED_API_ORIGINS = ["https://ddbksawvchsauiuiwvrl.supabase.co"];

  function apiOriginAllowed(url) {
    var parsed;
    try { parsed = new URL(String(url || "")); } catch (error) { return false; }
    return parsed.protocol === "https:" && ALLOWED_API_ORIGINS.indexOf(parsed.origin) >= 0;
  }

  /* The server's address shape, "<words>-<key>" (the app's studyTeamsModel
     cleanSlug): lower-case letters/numbers in single-dash words, then 8 of
     a-z 2-9 without the look-alikes. */
  var SLUG_PATTERN = /^(?:[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*-)?[a-hj-km-np-z2-9]{8}$/u;

  function cleanSlug(value) {
    var text = typeof value === "string" ? value.trim() : "";
    return text.length <= 60 && SLUG_PATTERN.test(text) ? text : "";
  }

  function slugFromHash(hashOverride) {
    var raw = hashOverride != null ? hashOverride : (hasWindow ? window.location.hash : "");
    var text = String(raw || "").replace(/^#/, "").replace(/\/+$/, "");
    try { text = decodeURIComponent(text); } catch (error) { return ""; }
    return cleanSlug(text);
  }

  /* The team pictures the site carries (assets/teams/, the app's own art,
     192 px). Any other mascot key is drawn as a coloured disc. */
  var TEAM_ART = ["grapes", "shapes", "books", "lantern", "candle", "heart", "tea", "galaxy", "acorn",
    "moon", "cloud", "mountain", "compass", "pine", "paper-plane", "sunflower", "seashell", "honey"];

  function artFor(avatar, root) {
    var key = typeof avatar === "string" ? avatar.replace(/^team-/, "") : "";
    return avatar && avatar.indexOf("team-") === 0 && TEAM_ART.indexOf(key) >= 0
      ? (root || "../") + "assets/teams/mak-team-" + key + ".png" : "";
  }

  function text(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
  }

  function whole(value, max) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max || 1e12) : 0;
  }

  function shapeSchool(raw) {
    if (!raw || typeof raw !== "object" || !text(raw.name, 80)) return null;
    return {
      name: text(raw.name, 80),
      shortName: /^[A-Za-z0-9&.-]{2,12}$/.test(text(raw.shortName, 12)) ? text(raw.shortName, 12) : "",
      kind: raw.kind === "high_school" ? "high_school" : "college",
      place: [text(raw.city, 60), text(raw.region, 60)].filter(Boolean).join(", "),
      slug: cleanSlug(raw.slug)
    };
  }

  function shapeTeamBase(raw) {
    var t = raw && typeof raw === "object" ? raw : {};
    return {
      name: text(t.name, 32) || "Study Team",
      motto: text(t.motto, 80),
      avatar: /^[a-z][a-z-]{1,30}$/.test(String(t.avatar || "")) ? t.avatar : "",
      slug: cleanSlug(t.slug),
      points: whole(t.points),
      weekPoints: whole(t.weekPoints),
      memberCount: whole(t.memberCount, 10)
    };
  }

  function shapeTeam(payload) {
    var source = payload && typeof payload === "object" ? payload : {};
    var t = source.team && typeof source.team === "object" ? source.team : null;
    if (!t) return null;
    var team = shapeTeamBase(t);
    var lv = t.level && typeof t.level === "object" ? t.level : {};
    team.level = { level: whole(lv.level, 99), from: whole(lv.from), to: whole(lv.to) };
    team.school = shapeSchool(t.school);
    var list = Array.isArray(source.members) ? source.members.slice(0, 10) : [];
    team.members = list.map(function (m) {
      m = m && typeof m === "object" ? m : {};
      var name = /^[A-Za-z0-9_]{3,20}$/.test(String(m.username || "")) ? String(m.username) : "";
      return {
        username: name,
        anonymous: m.anonymous === true,
        owner: m.owner === true,
        counting: m.counting !== false,
        points: whole(m.points),
        weekPoints: whole(m.weekPoints)
      };
    });
    return team;
  }

  function shapeSchoolBoard(payload) {
    var source = payload && typeof payload === "object" ? payload : {};
    var school = shapeSchool(source.school);
    if (!school) return null;
    var hours = Number(source.lockInHoursWeek);
    return {
      school: school,
      teamCount: whole(source.teamCount),
      lockInHours: Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 10) / 10 : 0,
      teams: (Array.isArray(source.teams) ? source.teams.slice(0, 50) : []).map(function (raw) {
        var team = shapeTeamBase(raw);
        team.rank = whole(raw && raw.rank, 1e6);
        team.level = whole(raw && raw.level, 99);
        return team;
      })
    };
  }

  function memberLabel(member) {
    if (member.username) return "@" + member.username;
    return member.anonymous ? "Anonymous" : "Teammate";
  }

  function grouped(n) {
    return whole(n).toLocaleString("en-US");
  }

  function deepLink(slug) {
    var clean = cleanSlug(slug);
    return clean ? "makullveny://team-page/" + encodeURIComponent(clean) : "";
  }

  // ------------------------------------------------------------- drawing ---

  function el(tag, className, words) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (words != null) node.textContent = String(words);
    return node;
  }

  function mascot(avatar, name, size) {
    var src = artFor(avatar);
    var disc = el("span", "mascot");
    disc.style.setProperty("--size", size + "px");
    if (src) {
      var img = el("img");
      img.src = src; img.alt = ""; img.width = size; img.height = size;
      disc.append(img);
    } else {
      disc.textContent = (name || "?").charAt(0).toUpperCase();
    }
    return disc;
  }

  function schoolPill(school) {
    if (!school) return null;
    var words = school.shortName || school.name;
    var pill = school.slug ? el("a", "pill", words) : el("span", "pill", words);
    if (school.slug) pill.href = "../school/" + encodeURIComponent(school.slug);
    pill.title = school.name;
    pill.setAttribute("aria-label", school.name + (school.slug ? " school board" : ""));
    return pill;
  }

  function ring(level) {
    var box = el("div", "ring");
    var span = Math.max(1, level.to - level.from);
    var into = level.level >= 99 ? 1 : Math.min(1, Math.max(0, ((level.points || 0) - level.from) / span));
    box.style.setProperty("--fill", Math.round(into * 360) + "deg");
    box.append(el("span", "ring-num", level.level), el("span", "ring-word", "Level"));
    return box;
  }

  function stat(value, label) {
    var box = el("div", "stat");
    box.append(el("strong", "", value), el("span", "", label));
    return box;
  }

  function barChart(team) {
    var box = el("section", "chart");
    box.append(el("h2", "", "Who brought what · all time"));
    var top = Math.max.apply(null, [1].concat(team.members.map(function (m) { return m.points; })));
    team.members.forEach(function (m) {
      var row = el("div", "hbar");
      var fill = el("i", "hbar-fill");
      fill.style.setProperty("--w", (m.counting ? Math.max(2, Math.round(m.points / top * 100)) : 0) + "%");
      var track = el("span", "hbar-track");
      track.append(fill);
      row.append(el("span", "hbar-name" + (m.username ? "" : " is-quiet"), memberLabel(m) + (m.owner ? " ♛" : "")), track,
        el("span", "hbar-num", m.counting ? grouped(m.points) : "—"));
      box.append(row);
    });
    return box;
  }

  function weekChart(team) {
    var box = el("section", "chart");
    box.append(el("h2", "", "This week"));
    var top = Math.max.apply(null, [1].concat(team.members.map(function (m) { return m.weekPoints; })));
    var cols = el("div", "cols");
    team.members.forEach(function (m) {
      var col = el("span", "col");
      var bar = el("i", "col-bar");
      bar.style.setProperty("--h", (m.weekPoints ? Math.max(4, Math.round(m.weekPoints / top * 100)) : 0) + "%");
      col.append(el("span", "col-num", m.weekPoints ? grouped(m.weekPoints) : ""), bar,
        el("span", "col-name" + (m.username ? "" : " is-quiet"), memberLabel(m)));
      cols.append(col);
    });
    box.append(cols);
    return box;
  }

  function people(team) {
    var box = el("div", "people");
    team.members.forEach(function (m) {
      var face = el("span", "face" + (m.username ? "" : " is-quiet"), m.username ? m.username.charAt(0).toUpperCase() : "");
      face.title = memberLabel(m);
      box.append(face);
    });
    box.append(el("span", "people-count", team.memberCount + (team.memberCount === 1 ? " member" : " members")));
    return box;
  }

  function drawTeam(main, team) {
    document.title = team.name + " — a Study Team on Makullveny";
    var head = el("header", "team-head");
    var words = el("div", "team-words");
    words.append(el("p", "kicker", "Study Team"), el("h1", "", team.name));
    if (team.motto) words.append(el("p", "motto", team.motto));
    var pill = schoolPill(team.school);
    if (pill) words.append(pill);
    team.level.points = team.points;
    head.append(mascot(team.avatar, team.name, 96), words, ring(team.level));
    var stats = el("div", "stats");
    stats.append(stat(grouped(team.weekPoints), "Focus Points this week"), stat(grouped(team.points), "Focus Points all time"),
      stat(String(team.memberCount), team.memberCount === 1 ? "member" : "members"));
    var charts = el("div", "charts");
    charts.append(barChart(team), weekChart(team));
    main.append(head, stats, people(team), charts, joinBlock(team));
  }

  function joinBlock(team) {
    var box = el("section", "join");
    box.append(el("p", "lead", "This team is open. Open it in Makullveny, then press Join."));
    var open = el("a", "button", "Open in Makullveny");
    open.href = deepLink(team.slug) || "makullveny://open";
    box.append(open);
    var fine = el("p", "fine");
    var get = el("a", "", "Get Makullveny");
    get.href = "../#download";
    fine.append(document.createTextNode("Don’t have the app? "), get, document.createTextNode(" — it is free. Only public profiles show a name here."));
    box.append(fine);
    return box;
  }

  function drawSchool(main, board) {
    var s = board.school;
    document.title = s.name + " — Study Teams on Makullveny";
    var head = el("header", "school-head");
    head.append(el("p", "kicker", "School board"), el("h1", "", s.name));
    var sub = el("p", "motto");
    if (s.shortName) sub.append(el("span", "pill", s.shortName), document.createTextNode(" "));
    sub.append(document.createTextNode(s.place || (s.kind === "high_school" ? "High school" : "College")));
    head.append(sub);
    var stats = el("div", "stats");
    stats.append(stat(board.lockInHours.toLocaleString("en-US"), "Lock In hours this week"),
      stat(String(board.teamCount), board.teamCount === 1 ? "listed Study Team" : "listed Study Teams"));
    var list = el("ol", "board");
    if (!board.teams.length) list.append(el("li", "board-empty", "No listed Study Teams here yet. Start one in Makullveny."));
    board.teams.forEach(function (t) {
      var row = el("li", "board-row");
      var name = t.slug ? el("a", "board-name", t.name) : el("span", "board-name", t.name);
      if (t.slug) name.href = "../team/" + encodeURIComponent(t.slug);
      var words = el("span", "board-words");
      words.append(name, el("span", "board-fine", "Level " + t.level + " · " + t.memberCount + (t.memberCount === 1 ? " member" : " members")));
      row.append(el("span", "board-rank", "#" + (t.rank || 1)), mascot(t.avatar, t.name, 44), words,
        el("span", "board-num", grouped(t.weekPoints)));
      list.append(row);
    });
    var note = el("p", "fine", "Teams only, ranked by Focus Points this week (Monday on). No student is named here. Lock In hours count listed teams only.");
    main.append(head, stats, el("h2", "", "Ranked by Focus Points this week"), list, note);
  }

  function setState(main, words, lead) {
    main.textContent = "";
    main.append(el("p", "kicker", "Makullveny"), el("h1", "", words));
    if (lead) main.append(el("p", "lead", lead));
  }

  function canonical(kind, slug) {
    if (!hasWindow || !window.history || typeof window.history.replaceState !== "function") return;
    try { window.history.replaceState(null, "", "/" + kind + "/" + encodeURIComponent(slug)); } catch (error) { /* file:// preview */ }
  }

  function load(kind, slug, done) {
    var request = new XMLHttpRequest();
    request.open("POST", CONFIG.apiUrl, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.timeout = 20000;
    request.onload = function () {
      var said = null;
      try { said = JSON.parse(request.responseText); } catch (error) { said = null; }
      done(request.status === 200 ? said : null, request.status, said && said.error);
    };
    request.onerror = function () { done(null, 0, ""); };
    request.ontimeout = function () { done(null, 0, ""); };
    request.send(JSON.stringify({ action: kind, slug: slug }));
  }

  function boot() {
    var main = document.getElementById("page");
    var kind = document.body.getAttribute("data-page") === "school" ? "school" : "team";
    var slug = slugFromHash();
    var gone = kind === "team" ? "This Study Team isn’t public." : "We couldn’t find that school.";
    if (!slug) { setState(main, gone, "Check the link and try again."); return; }
    if (!CONFIG.apiUrl || !apiOriginAllowed(CONFIG.apiUrl)) { setState(main, "Team pages are not open yet."); return; }
    setState(main, "Opening…");
    load(kind, slug, function (payload, status, error) {
      if (status === 429) { setState(main, "Lots of people are looking right now.", "Try again in a few minutes."); return; }
      if (status === 0) { setState(main, "This page could not be reached.", "Check your connection and try again."); return; }
      var shaped = payload ? (kind === "team" ? shapeTeam(payload) : shapeSchoolBoard(payload)) : null;
      if (!shaped) {
        setState(main, error === "not_public" || kind === "team" ? "This Study Team isn’t public." : gone,
          kind === "team" ? "Only teams whose owner listed them have a page." : "Check the link and try again.");
        return;
      }
      main.textContent = "";
      if (kind === "team") drawTeam(main, shaped); else drawSchool(main, shaped);
      canonical(kind, (kind === "team" ? shaped.slug : shaped.school.slug) || slug);
    });
  }

  if (hasWindow && typeof document !== "undefined" && document.getElementById && document.getElementById("page")) {
    boot();
    // A new address pasted over this one is a new page.
    window.addEventListener("hashchange", function () { window.location.reload(); });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
      apiOriginAllowed: apiOriginAllowed,
      cleanSlug: cleanSlug,
      slugFromHash: slugFromHash,
      artFor: artFor,
      shapeTeam: shapeTeam,
      shapeSchoolBoard: shapeSchoolBoard,
      memberLabel: memberLabel,
      deepLink: deepLink,
      TEAM_ART: TEAM_ART
    };
  }
})();
