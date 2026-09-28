/*
  A STUDENT'S PROFILE PAGE: the fetch, the shape check and the drawing for
  https://www.makullveny.com/u/#<token>. No build step, no framework, no
  dependency; ES5-compatible like read/read.js.

  IT MAKES EXACTLY ONE REQUEST: a POST of { action: "profile", token } to the
  mak-share function (the URL comes from read/config.js, and its ORIGIN must be
  in ALLOWED_API_ORIGINS -- the same pinned list read.js holds, and the same
  connect-src u/index.html carries). No key: mak-share runs with verify_jwt
  off, and the token in the fragment is the whole authorization.

  WHAT COMES BACK is re-checked field by field here (shapeProfile) even though
  the server already shapes it: a name, an @username, an avatar DIGIT (1-7,
  mapped to this site's own pictures -- never a URL from the network), and,
  only when the student chose them, a bio, class and event items of exactly
  {t, s, e} (title, epoch minutes), and an achievements count. Every string is
  set with textContent; nothing from the network is ever parsed as markup or
  used as a URL or a colour.

  THE TOKEN is read from the fragment (never sent to a web server, never in a
  Referer) and goes in the POST body, never a query string. Unlike a book link
  the fragment is left in the address bar on purpose: a profile is something a
  friend bookmarks and comes back to, and the student can switch the link off
  from the app at any time.
*/
(function () {
  "use strict";

  var hasWindow = typeof window !== "undefined";

  var CONFIG = { apiUrl: "" };
  if (hasWindow && window.MAKULLVENY_READER_CONFIG && window.MAKULLVENY_READER_CONFIG.apiUrl) {
    CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
  }

  /* KEEP IN STEP with read/read.js ALLOWED_API_ORIGINS and the connect-src in
     u/index.html. */
  var ALLOWED_API_ORIGINS = ["https://ddbksawvchsauiuiwvrl.supabase.co"];

  function apiOriginAllowed(url) {
    var raw = String(url == null ? "" : url);
    if (!raw) return false;
    var parsed;
    try { parsed = new URL(raw); } catch (error) { return false; }
    if (parsed.protocol !== "https:") return false;
    for (var i = 0; i < ALLOWED_API_ORIGINS.length; i += 1) {
      if (parsed.origin === ALLOWED_API_ORIGINS[i]) return true;
    }
    return false;
  }

  var TOKEN_PATTERN = /^[a-z2-9]{16,64}$/;

  function tokenFromHash(hashOverride) {
    var raw = hashOverride != null ? hashOverride : (hasWindow ? window.location.hash : "");
    var parts = String(raw || "").replace(/^#/, "").split("/");
    var last = "";
    for (var i = 0; i < parts.length; i += 1) if (parts[i]) last = parts[i];
    last = last.toLowerCase();
    return TOKEN_PATTERN.test(last) ? last : "";
  }

  /* The site's own avatar pictures, by the digit the account stores
     (src/avatarChoices.js in the app is the owner of this order). */
  var AVATARS = {
    1: { file: "mak-avatar-1-turtle-duck.png", label: "Turtle duck" },
    2: { file: "mak-avatar-2-frog.png", label: "Frog" },
    3: { file: "mak-avatar-3-duck-on-water.png", label: "Duck on water" },
    4: { file: "mak-avatar-4-glider.png", label: "Glider" },
    5: { file: "mak-avatar-5-tree.png", label: "Tree" },
    6: { file: "mak-avatar-6-jellyfish.png", label: "Jellyfish" },
    7: { file: "mak-avatar-7-mushroom.png", label: "Mushroom" }
  };
  var AVATAR_BASE = "../assets/site/avatars/";

  function text(value, max) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, max) : "";
  }

  function items(value) {
    var out = [];
    if (Object.prototype.toString.call(value) !== "[object Array]") return out;
    for (var i = 0; i < value.length && out.length < 300; i += 1) {
      var raw = value[i];
      if (!raw || typeof raw !== "object") continue;
      var t = text(raw.t, 40);
      var s = raw.s;
      var e = raw.e;
      if (!t || typeof s !== "number" || typeof e !== "number" || Math.floor(s) !== s || Math.floor(e) !== e) continue;
      if (e <= s || e - s > 1440) continue;
      out.push({ t: t, s: s, e: e });
    }
    return out;
  }

  /* Everything this page will draw, and nothing else. */
  function shapeProfile(payload) {
    var p = payload && typeof payload === "object" ? payload : {};
    var avatar = typeof p.avatarId === "number" && AVATARS[p.avatarId] ? p.avatarId : 0;
    var username = text(p.username, 40).replace(/[^A-Za-z0-9_.-]/g, "");
    var out = {
      displayName: text(p.displayName, 60) || (username ? "@" + username : "A Makullveny student"),
      username: username,
      avatarId: avatar
    };
    if (typeof p.bio === "string") out.bio = text(p.bio, 160);
    if (Object.prototype.toString.call(p.classes) === "[object Array]") out.classes = items(p.classes);
    if (Object.prototype.toString.call(p.events) === "[object Array]") out.events = items(p.events);
    if (typeof p.achievements === "number" && isFinite(p.achievements)) out.achievements = Math.max(0, Math.min(1000, Math.floor(p.achievements)));
    return out;
  }

  function classCount(list) {
    var seen = {};
    var n = 0;
    for (var i = 0; i < (list || []).length; i += 1) {
      var key = list[i].t.toLowerCase();
      if (!seen[key]) { seen[key] = true; n += 1; }
    }
    return n;
  }

  /* ── the week ───────────────────────────────────────────────────────────── */

  function midnightOf(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function dayStart(startMs, index) {
    var d = new Date(startMs);
    d.setDate(d.getDate() + index);
    return d.getTime();
  }

  /*
    Lay the items out on the NEXT SEVEN DAYS, today first, in THIS browser's
    time zone. Not Monday-to-Sunday: the app sends what is coming up (the next
    14 days), so a calendar week viewed on a Thursday would show Monday and
    Tuesday empty when they were not. A Saturday or Sunday column appears only
    when something is on it. Titled "This week" when the first column is a Monday.
    Returns { label, days: [{ start, dow }], hours, firstHour, lastHour, blocks }
    where block.day is the COLUMN. Pure (nowMs is passed in), so tests/ pin it.
  */
  function weekLayout(classes, events, nowMs) {
    var all = [];
    var i;
    for (i = 0; i < (classes || []).length; i += 1) all.push({ t: classes[i].t, s: classes[i].s, e: classes[i].e, kind: "class" });
    for (i = 0; i < (events || []).length; i += 1) all.push({ t: events[i].t, s: events[i].s, e: events[i].e, kind: "event" });

    var start = midnightOf(nowMs);
    var end = dayStart(start, 7);

    var raw = [];
    var used = {};
    for (i = 0; i < all.length; i += 1) {
      var item = all[i];
      var sMs = item.s * 60000;
      if (!(item.e * 60000 > start && sMs < end)) continue;
      /* The calendar day the item STARTS on (DST-safe); an item that began
         before today's midnight is drawn from midnight. */
      var offset = 0;
      for (var d = 0; d < 7; d += 1) {
        if (sMs >= dayStart(start, d) && sMs < dayStart(start, d + 1)) { offset = d; break; }
      }
      var dayOrigin = dayStart(start, offset);
      var startMin = Math.max(0, Math.round((sMs - dayOrigin) / 60000));
      var endMin = Math.min(1440, Math.round((item.e * 60000 - dayOrigin) / 60000));
      if (endMin <= startMin) continue;
      used[offset] = true;
      raw.push({ t: item.t, kind: item.kind, offset: offset, startMin: startMin, endMin: endMin, s: item.s, e: item.e });
    }

    /* Weekdays always; a weekend day only when something is on it. */
    var days = [];
    var column = {};
    for (i = 0; i < 7; i += 1) {
      var dayMs = dayStart(start, i);
      var dow = new Date(dayMs).getDay();
      if ((dow === 0 || dow === 6) && !used[i]) continue;
      column[i] = days.length;
      days.push({ start: dayMs, dow: dow });
    }
    /* Monday first (today is Monday, or a quiet weekend was skipped) reads as
       a week; anything else is honestly "the next 7 days". */
    var label = days.length && days[0].dow === 1 ? "This week" : "Next 7 days";
    var blocks = [];
    for (i = 0; i < raw.length; i += 1) {
      raw[i].day = column[raw[i].offset];
      blocks.push(raw[i]);
    }

    var firstHour = 8;
    var lastHour = 17;
    if (blocks.length) {
      firstHour = 23;
      lastHour = 1;
      for (i = 0; i < blocks.length; i += 1) {
        firstHour = Math.min(firstHour, Math.floor(blocks[i].startMin / 60));
        lastHour = Math.max(lastHour, Math.ceil(blocks[i].endMin / 60));
      }
      if (lastHour - firstHour < 6) lastHour = Math.min(24, firstHour + 6);
      if (lastHour - firstHour < 6) firstHour = Math.max(0, lastHour - 6);
    }

    var hours = [];
    for (i = firstHour; i < lastHour; i += 1) hours.push(i);

    /* Side by side when two things overlap on one day. */
    blocks.sort(function (a, b) { return a.day - b.day || a.startMin - b.startMin || a.endMin - b.endMin; });
    var cluster = [];
    var clusterEnd = -1;
    var clusterDay = -1;
    function closeCluster() {
      var lanes = [];
      for (var c = 0; c < cluster.length; c += 1) {
        var b = cluster[c];
        var lane = 0;
        while (lane < lanes.length && lanes[lane] > b.startMin) lane += 1;
        lanes[lane] = b.endMin;
        b.lane = lane;
      }
      for (var k = 0; k < cluster.length; k += 1) cluster[k].lanes = lanes.length;
      cluster = [];
    }
    for (i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (cluster.length && (block.day !== clusterDay || block.startMin >= clusterEnd)) closeCluster();
      if (!cluster.length) { clusterDay = block.day; clusterEnd = block.endMin; }
      cluster.push(block);
      clusterEnd = Math.max(clusterEnd, block.endMin);
    }
    if (cluster.length) closeCluster();

    return { label: label, start: start, days: days, hours: hours, firstHour: firstHour, lastHour: lastHour, blocks: blocks };
  }

  function clock(totalMinutes, withSuffix) {
    var h = Math.floor(totalMinutes / 60) % 24;
    var m = totalMinutes % 60;
    var h12 = h % 12 === 0 ? 12 : h % 12;
    var out = h12 + ":" + (m < 10 ? "0" : "") + m;
    return withSuffix ? out + (h < 12 ? " AM" : " PM") : out;
  }

  function hourLabel(h) {
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (h < 12 || h === 24 ? " AM" : " PM");
  }

  var DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* A class keeps its colour all week: picked from THIS page's own palette by
     a hash of its name, never from the network. */
  var CLASS_COLOURS = ["#6fae7a", "#6c9bd2", "#e0a458", "#d98080", "#5fb3a8", "#b194d8", "#c9a15a", "#8fb0c9"];
  function colourFor(title) {
    var h = 5381;
    var s = String(title || "").toLowerCase();
    for (var i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return CLASS_COLOURS[h % CLASS_COLOURS.length];
  }

  /* One sentence per state; revoked, unknown and malformed read the same. */
  function stateForStatus(status) {
    if (status === 429) return "This page is getting a lot of visits right now. Wait a moment and try again.";
    if (status === 502 || status === 500 || status === 503) return "Something went wrong on Makullveny's end. Try again shortly.";
    return "This profile is not available. The link may have been turned off, or it never existed.";
  }

  /* ── drawing ────────────────────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function make(tag, className, words) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (words != null) node.textContent = words;
    return node;
  }

  function setState(message) {
    var node = el("ppState");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  var PX_PER_MIN = 1;

  function drawWeek(profile, nowMs) {
    var section = el("ppWeek");
    var hasClasses = Object.prototype.toString.call(profile.classes) === "[object Array]";
    var hasEvents = Object.prototype.toString.call(profile.events) === "[object Array]";
    if (!hasClasses && !hasEvents) { section.hidden = true; return; }
    section.hidden = false;
    var week = weekLayout(profile.classes || [], profile.events || [], nowMs);
    el("ppWeekTitle").textContent = week.label;
    var grid = el("ppGrid");
    var list = el("ppList");
    grid.replaceChildren();
    list.replaceChildren();
    el("ppEmpty").hidden = week.blocks.length > 0;
    if (!week.blocks.length) {
      grid.hidden = true;
      list.hidden = true;
      return;
    }
    grid.hidden = false;
    list.hidden = false;

    var head = make("div", "pp-grid-days");
    for (var d = 0; d < week.days.length; d += 1) {
      var date = new Date(week.days[d].start);
      var dayHead = make("div", "pp-grid-day");
      dayHead.append(make("span", "pp-grid-day-name", DAY_NAMES[week.days[d].dow]), make("span", "pp-grid-day-date", String(date.getDate())));
      head.append(dayHead);
    }
    var body = make("div", "pp-grid-body");
    body.style.setProperty("height", ((week.lastHour - week.firstHour) * 60 * PX_PER_MIN) + "px");
    for (var h = 0; h < week.hours.length; h += 1) {
      var line = make("div", "pp-grid-hour");
      line.style.setProperty("top", (h * 60 * PX_PER_MIN) + "px");
      line.append(make("span", "pp-grid-hour-label", hourLabel(week.hours[h])));
      body.append(line);
    }
    var lanes = make("div", "pp-grid-lanes");
    var width = 100 / week.days.length;
    for (var b = 0; b < week.blocks.length; b += 1) {
      var block = week.blocks[b];
      var node = make("div", "pp-block pp-block-" + block.kind);
      var laneWidth = width / (block.lanes || 1);
      node.style.setProperty("left", (block.day * width + (block.lane || 0) * laneWidth) + "%");
      node.style.setProperty("width", laneWidth + "%");
      node.style.setProperty("top", ((block.startMin - week.firstHour * 60) * PX_PER_MIN) + "px");
      node.style.setProperty("height", Math.max(24, (block.endMin - block.startMin) * PX_PER_MIN) + "px");
      if (block.kind === "class") node.style.setProperty("--pp-c", colourFor(block.t));
      var inner = make("div", "pp-block-inner");
      inner.append(make("span", "pp-block-title", block.t), make("span", "pp-block-time", clock(block.startMin) + "–" + clock(block.endMin)));
      inner.title = block.t + ", " + clock(block.startMin, true) + " to " + clock(block.endMin, true);
      node.append(inner);
      lanes.append(node);
    }
    body.append(lanes);
    grid.append(head, body);

    /* The phone view: the same week as a list, one day at a time. */
    for (var day = 0; day < week.days.length; day += 1) {
      var todays = week.blocks.filter(function (x) { return x.day === day; });
      if (!todays.length) continue;
      var when = new Date(week.days[day].start);
      var group = make("li", "pp-list-day");
      group.append(make("h3", "pp-list-day-name", DAY_LONG[week.days[day].dow] + ", " + MONTHS[when.getMonth()] + " " + when.getDate()));
      var rows = make("ul", "pp-list-rows");
      for (var r = 0; r < todays.length; r += 1) {
        var row = make("li", "pp-list-row pp-block-" + todays[r].kind);
        if (todays[r].kind === "class") row.style.setProperty("--pp-c", colourFor(todays[r].t));
        row.append(make("span", "pp-list-time", clock(todays[r].startMin, true) + " – " + clock(todays[r].endMin, true)), make("span", "pp-list-title", todays[r].t));
        rows.append(row);
      }
      group.append(rows);
      list.append(group);
    }
  }

  function render(payload, nowMs) {
    var profile = shapeProfile(payload);
    el("ppName").textContent = profile.displayName;
    document.title = profile.displayName + " on Makullveny";
    var handle = el("ppHandle");
    handle.hidden = !profile.username;
    handle.textContent = profile.username ? "@" + profile.username : "";

    var avatar = el("ppAvatar");
    avatar.setAttribute("data-avatar", String(profile.avatarId));
    var old = avatar.querySelector("img");
    if (old) old.remove();
    el("ppInitial").textContent = profile.avatarId ? "" : profile.displayName.replace(/^@/, "").charAt(0).toUpperCase();
    if (profile.avatarId) {
      var img = document.createElement("img");
      img.alt = "";
      img.src = AVATAR_BASE + AVATARS[profile.avatarId].file;
      avatar.append(img);
    }

    var bio = el("ppBio");
    bio.hidden = !profile.bio;
    bio.textContent = profile.bio || "";

    var stats = el("ppStats");
    stats.replaceChildren();
    function stat(value, label) {
      var box = make("div", "pp-stat");
      box.append(make("span", "pp-stat-value", String(value)), make("span", "pp-stat-label", label));
      stats.append(box);
    }
    if (profile.classes) {
      var n = classCount(profile.classes);
      stat(n, n === 1 ? "class" : "classes");
    }
    if (typeof profile.achievements === "number") stat(profile.achievements, profile.achievements === 1 ? "achievement" : "achievements");
    stats.hidden = !stats.childNodes.length;

    var add = el("ppAdd");
    add.hidden = !profile.username;
    if (profile.username) {
      add.replaceChildren();
      add.append(document.createTextNode("Have Makullveny? Add "), make("b", "", "@" + profile.username), document.createTextNode(" in Friends."));
    }

    drawWeek(profile, nowMs);
    setState("");
    el("ppProfile").hidden = false;
  }

  function open() {
    /* A LOCAL PREVIEW ONLY. A page script can set this global before
       profile.js runs (tools and screenshots do); a URL cannot, so there is
       nothing here for a crafted link to switch on. */
    if (window.MAKULLVENY_PROFILE_FIXTURE && typeof window.MAKULLVENY_PROFILE_FIXTURE === "object") {
      render(window.MAKULLVENY_PROFILE_FIXTURE, typeof window.MAKULLVENY_PROFILE_NOW === "number" ? window.MAKULLVENY_PROFILE_NOW : Date.now());
      return;
    }
    var token = tokenFromHash();
    if (!token) {
      setState("This link is not complete. Ask whoever sent it for the full address.");
      return;
    }
    if (!CONFIG.apiUrl || !apiOriginAllowed(CONFIG.apiUrl)) {
      setState("Profile links are not open yet.");
      return;
    }
    setState("Opening…");
    var request = new XMLHttpRequest();
    request.open("POST", CONFIG.apiUrl, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = function () {
      if (request.status !== 200) { setState(stateForStatus(request.status)); return; }
      var payload = null;
      try { payload = JSON.parse(request.responseText); } catch (error) { payload = null; }
      if (!payload || payload.ok !== true) { setState(stateForStatus(404)); return; }
      render(payload, Date.now());
    };
    request.onerror = function () { setState("This page could not be reached. Check your connection and try again."); };
    request.timeout = 20000;
    request.ontimeout = function () { setState("This is taking too long to open. Check your connection and reload the page."); };
    request.send(JSON.stringify({ action: "profile", token: token }));
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      tokenFromHash: tokenFromHash,
      apiOriginAllowed: apiOriginAllowed,
      shapeProfile: shapeProfile,
      weekLayout: weekLayout,
      classCount: classCount,
      colourFor: colourFor,
      stateForStatus: stateForStatus,
      clock: clock,
      ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
      AVATARS: AVATARS
    };
  }

  if (hasWindow && typeof document !== "undefined" && document.getElementById && document.getElementById("ppMain")) {
    window.addEventListener("hashchange", function () { window.location.reload(); });
    open();
  }
})();
