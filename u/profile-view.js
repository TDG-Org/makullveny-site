/*
  A STUDENT'S PROFILE PAGE -- THE ONE RENDERER (2026-09-28, "profile parity").

  The owner: "the user's profile page ... should look exactly like what they
  see and edit on the makullveny app." So there is ONE file that draws it,
  and it is COPIED BYTE FOR BYTE:

    app   src/publicProfileView.js      -> the My profile page (src/profilePage.js)
    site  MakullvenySite/u/profile-view.js -> https://www.makullveny.com/u/#<token>

  with its stylesheet, src/styles/modules/public-profile-view.css <->
  u/profile-view.css. tests/publicProfileParity.test.js fails the app suite
  when the two copies differ. The same pattern as src/publicBookScene.js.

  WHAT IT DRAWS: a sidebar (avatar, name, @username, bio) and the widgets
  the student chose -- Calendar (the week), Classes, Achievements, Selah -- in
  the student's order, some of them wide. The HOST draws the page around it:
  the theme's background, the brand bar on the site, the edit controls in the
  app. Nothing here knows which of the two it is running in.

  SAFE BY CONSTRUCTION, the rules u/profile.js always kept: shapeProfile()
  rebuilds a payload from named keys; every string from the network or from
  the student is set with textContent (and carries data-i18n-skip so the
  app's translator never rewrites a name). Nothing is ever parsed as markup
  -- even the icons are drawn node by node from a constant table. No URL, no colour
  and no class name ever comes from data: pictures come from the host's
  avatar() / stageArt() callbacks, keyed by a small integer.

  NO BUILD STEP, NO DEPENDENCY. Plain ES2017, a window global and a
  module.exports, like publicBookScene.js.
*/
(function () {
  "use strict";

  var WIDGETS = ["calendar", "classes", "selah", "achievements"];
  var DEFAULT_LOOK = { v: 1, theme: "cozy-cabin", bg: true, order: WIDGETS.slice(), wide: ["calendar"] };
  var SELAH_LIMITS = { stage: 9, stages: 9, level: 99, points: 1e9, coins: 1e9, diamonds: 1e7, sapphires: 1e7, streak: 10000 };
  var MAX_ITEMS = 300;
  var MAX_CLASS_ROWS = 8;

  /* Every sentence this file shows, in English. A host passes t() to
     translate them (the app's src/i18n.js has the Spanish); {name} slots are
     filled after translation. */
  var WORDS = {
    calendar: "Calendar",
    classes: "Classes",
    achievements: "Achievements",
    selah: "Selah",
    thisWeek: "This week",
    next7: "Next 7 days",
    yourTime: "Times in your time zone",
    weekEmpty: "Nothing on the calendar this week.",
    classesEmpty: "No classes this week.",
    moreClasses: "+{count} more",
    earnedOne: "achievement earned",
    earnedMany: "achievements earned",
    earnedNone: "No achievements yet.",
    libraryFallback: "The library",
    stageOf: "Stage {stage} of {stages}",
    level: "Level {level}",
    coins: "Coins",
    diamonds: "Diamonds",
    sapphires: "Sapphires",
    focusPoints: "Focus Points",
    streak: "Day streak",
    anonymous: "A Makullveny student"
  };

  /* The icons, as DATA: [tag, attributes] pairs drawn with createElementNS,
     so this file never parses a string as markup. Stroke icons unless
     "fill" is set. */
  var ICONS = {
    calendar: [["rect", { x: "3.5", y: "5", width: "17", height: "15", rx: "3" }], ["path", { d: "M3.5 10h17M8 3v4M16 3v4" }]],
    classes: [["path", { d: "M2.5 9 12 4.5 21.5 9 12 13.5z" }], ["path", { d: "M6.5 11v4.6c0 1.4 2.5 2.9 5.5 2.9s5.5-1.5 5.5-2.9V11M21.5 9v5" }]],
    achievements: [["path", { d: "M8 4h8v5a4 4 0 0 1-8 0z" }], ["path", { d: "M8 6H4.5a3 3 0 0 0 3.6 3.4M16 6h3.5a3 3 0 0 1-3.6 3.4M12 13v3.5M8.5 20h7M10 16.5h4" }]],
    selah: [["path", { d: "M3.5 20.5h17M5 20.5V11l7-5.5 7 5.5v9.5" }], ["path", { d: "M10 20.5v-5h4v5M9 11h6" }]],
    star: "fill",
    coins: [["path", { d: "M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8" }], ["path", { d: "M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8" }]],
    diamonds: [["path", { d: "M12 3.2 21 9.4 12 20.8 3 9.4z" }], ["path", { d: "M3 9.4h18M8.6 3.2 12 9.4l3.4-6.2" }]],
    sapphires: [["path", { d: "M7 4h10l4 5-9 11L3 9z" }], ["path", { d: "M3 9h18M12 20 9 9l3-5 3 5z" }]],
    points: [["path", { d: "M12 3v4M12 17v4M3 12h4M17 12h4" }], ["path", { d: "m12 8 1.3 2.7L16 12l-2.7 1.3L12 16l-1.3-2.7L8 12l2.7-1.3z" }]],
    streak: [["path", { d: "M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.7 3-5.6 3.6-9.8 2.6 1.5 4.1 3.9 4.3 6.4.9-.7 1.4-1.9 1.5-3.2 2 1.6 3.6 4 3.6 6.6 0 3.6-2.6 6.2-6.5 6.2z" }]]
  };
  var STAR_PATH = "m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z";
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* A class keeps its colour everywhere: picked from THIS palette by a hash
     of its name, never from the network (the link carries no colour). */
  var CLASS_COLOURS = ["#6fae7a", "#6c9bd2", "#e0a458", "#d98080", "#5fb3a8", "#b194d8", "#c9a15a", "#8fb0c9"];

  function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !isArray(value);
  }

  function text(value, max) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, max) : "";
  }

  function fill(template, vars) {
    var out = String(template == null ? "" : template);
    if (!vars) return out;
    Object.keys(vars).forEach(function (key) {
      out = out.split("{" + key + "}").join(String(vars[key]));
    });
    return out;
  }

  function items(value) {
    var out = [];
    if (!isArray(value)) return out;
    for (var i = 0; i < value.length && out.length < MAX_ITEMS; i += 1) {
      var raw = value[i];
      if (!isObject(raw)) continue;
      var t = text(raw.t, 40);
      var s = raw.s;
      var e = raw.e;
      if (!t || typeof s !== "number" || typeof e !== "number" || Math.floor(s) !== s || Math.floor(e) !== e) continue;
      if (e <= s || e - s > 1440) continue;
      out.push({ t: t, s: s, e: e });
    }
    return out;
  }

  function widgetKeys(value) {
    var out = [];
    if (!isArray(value)) return out;
    for (var i = 0; i < value.length && i < 8; i += 1) {
      if (WIDGETS.indexOf(value[i]) >= 0 && out.indexOf(value[i]) < 0) out.push(value[i]);
    }
    return out;
  }

  /* The look, from named keys; anything missing is the first-time look. */
  function shapeLook(value) {
    var look = isObject(value) ? value : {};
    var order = widgetKeys(look.order);
    for (var i = 0; i < WIDGETS.length; i += 1) if (order.indexOf(WIDGETS[i]) < 0) order.push(WIDGETS[i]);
    var out = {
      v: 1,
      theme: typeof look.theme === "string" && /^[a-z0-9-]{1,40}$/.test(look.theme) ? look.theme : DEFAULT_LOOK.theme,
      bg: look.bg !== false,
      order: order,
      wide: isArray(look.wide) ? widgetKeys(look.wide) : DEFAULT_LOOK.wide.slice()
    };
    if (look.accent === "pink" || look.accent === "blue") out.accent = look.accent;
    return out;
  }

  function shapeSelah(value) {
    if (!isObject(value)) return null;
    var out = { name: text(value.name, 40) };
    Object.keys(SELAH_LIMITS).forEach(function (key) {
      var n = value[key];
      out[key] = typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(SELAH_LIMITS[key], Math.floor(n))) : 0;
    });
    if (!out.stages) out.stages = 5;
    out.stage = Math.max(1, Math.min(out.stages, out.stage || 1));
    out.level = Math.max(1, out.level || 1);
    return out;
  }

  /* Everything this page will draw, and nothing else. */
  function shapeProfile(payload) {
    var p = isObject(payload) ? payload : {};
    var avatar = typeof p.avatarId === "number" && p.avatarId >= 1 && p.avatarId <= 7 && Math.floor(p.avatarId) === p.avatarId ? p.avatarId : 0;
    var username = text(p.username, 40).replace(/[^A-Za-z0-9_.-]/g, "");
    var out = {
      displayName: text(p.displayName, 60) || (username ? "@" + username : ""),
      username: username,
      avatarId: avatar,
      look: shapeLook(p.look)
    };
    if (typeof p.bio === "string") out.bio = text(p.bio, 160);
    if (isArray(p.classes)) out.classes = items(p.classes);
    if (isArray(p.events)) out.events = items(p.events);
    if (typeof p.achievements === "number" && isFinite(p.achievements)) out.achievements = Math.max(0, Math.min(1000, Math.floor(p.achievements)));
    var selah = shapeSelah(p.selah);
    if (selah) out.selah = selah;
    return out;
  }

  /* Which widgets a profile CAN draw: the data it carries decides. */
  function has(profile, key) {
    if (!profile) return false;
    if (key === "calendar") return isArray(profile.events);
    if (key === "classes") return isArray(profile.classes);
    if (key === "achievements") return typeof profile.achievements === "number";
    if (key === "selah") return isObject(profile.selah);
    return false;
  }

  function colourFor(title) {
    var h = 5381;
    var s = String(title || "").toLowerCase();
    for (var i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return CLASS_COLOURS[h % CLASS_COLOURS.length];
  }

  /* ── time ─────────────────────────────────────────────────────────────── */

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

  function clockAt(ms, locale) {
    try {
      return new Date(ms).toLocaleTimeString(locale || undefined, { hour: "numeric", minute: "2-digit" });
    } catch (error) {
      return new Date(ms).toLocaleTimeString();
    }
  }

  function dayName(ms, locale, style) {
    try {
      return new Date(ms).toLocaleDateString(locale || undefined, { weekday: style || "short" });
    } catch (error) {
      return "";
    }
  }

  function hourLabel(h, locale) {
    var d = new Date(2026, 0, 5, h % 24, 0, 0, 0);
    try {
      return d.toLocaleTimeString(locale || undefined, { hour: "numeric" });
    } catch (error) {
      return String(h);
    }
  }

  /*
    Lay the items out on the NEXT SEVEN DAYS, today first, in THIS computer's
    time zone. Not Monday-to-Sunday: the app sends what is coming up (the
    next 14 days), so a calendar week viewed on a Thursday would show Monday
    and Tuesday empty when they were not. A Saturday or Sunday column appears
    only when something is on it. "This week" when the first column is a
    Monday, else "Next 7 days". Pure (nowMs is passed in).
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

    var days = [];
    var column = {};
    for (i = 0; i < 7; i += 1) {
      var dayMs = dayStart(start, i);
      var dow = new Date(dayMs).getDay();
      if ((dow === 0 || dow === 6) && !used[i]) continue;
      column[i] = days.length;
      days.push({ start: dayMs, dow: dow });
    }
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

  /* Each class once: its days this week and its first start time. */
  function classRows(classes, nowMs, locale) {
    var byKey = {};
    var order = [];
    var list = (classes || []).slice().sort(function (a, b) { return a.s - b.s; });
    var from = midnightOf(nowMs);
    var to = dayStart(from, 7);
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      var key = item.t.toLowerCase();
      if (!byKey[key]) {
        byKey[key] = { t: item.t, colour: colourFor(item.t), days: [], dayKeys: {}, firstS: null };
        order.push(key);
      }
      var row = byKey[key];
      var ms = item.s * 60000;
      if (ms >= from && ms < to) {
        var dow = new Date(ms).getDay();
        if (!row.dayKeys[dow]) {
          row.dayKeys[dow] = true;
          row.days.push({ dow: dow, ms: ms });
        }
        if (row.firstS === null) row.firstS = item.s;
      }
    }
    return order.map(function (key) {
      var row = byKey[key];
      row.days.sort(function (a, b) { return ((a.dow + 6) % 7) - ((b.dow + 6) % 7); });
      return {
        t: row.t,
        colour: row.colour,
        days: row.days.map(function (d) { return dayName(d.ms, locale, "short"); }).join(" · "),
        time: row.firstS === null ? "" : clockAt(row.firstS * 60000, locale)
      };
    });
  }

  function grouped(n, locale) {
    try {
      return Number(n).toLocaleString(locale || undefined);
    } catch (error) {
      return String(n);
    }
  }

  /* ── drawing ──────────────────────────────────────────────────────────── */

  function maker(doc) {
    function make(tag, className, words) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (words != null) node.textContent = words;
      return node;
    }
    make.doc = doc;
    return make;
  }

  function speaker(options) {
    var t = options && typeof options.t === "function" ? options.t : function (s) { return s; };
    return function say(key, vars) {
      var english = WORDS[key] != null ? WORDS[key] : key;
      var said = english;
      try { said = t(english); } catch (error) { said = english; }
      return fill(said, vars);
    };
  }

  // A name, a bio, a class: the student's own words. Never translated.
  function mine(node) {
    node.setAttribute("data-i18n-skip", "true");
    return node;
  }

  function svgIcon(doc, key, size) {
    var svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (ICONS[key] === "fill") {
      var star = doc.createElementNS(SVG_NS, "path");
      star.setAttribute("d", STAR_PATH);
      star.setAttribute("fill", "currentColor");
      svg.appendChild(star);
      return svg;
    }
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    (ICONS[key] || []).forEach(function (part) {
      var node = doc.createElementNS(SVG_NS, part[0]);
      Object.keys(part[1]).forEach(function (name) { node.setAttribute(name, part[1][name]); });
      svg.appendChild(node);
    });
    return svg;
  }

  function icon(make, key) {
    var span = make("span", "pv-icon pv-icon-" + key);
    span.setAttribute("aria-hidden", "true");
    span.appendChild(svgIcon(make.doc, key, WIDGETS.indexOf(key) >= 0 ? 18 : 16));
    return span;
  }

  function buildSidebar(doc, profile, options) {
    var make = maker(doc);
    var say = speaker(options);
    var opts = options || {};
    var side = make("aside", "pv-side");
    var card = make("div", "pv-card pv-who");
    var avatar = make("div", "pv-avatar");
    avatar.setAttribute("data-avatar", String(profile.avatarId || 0));
    var picture = profile.avatarId && typeof opts.avatar === "function" ? opts.avatar(profile.avatarId) : null;
    if (picture && picture.ground) avatar.style.setProperty("--pv-ground", picture.ground);
    if (picture && picture.src) {
      var img = make("img", "pv-avatar-img");
      img.alt = "";
      img.src = picture.src;
      img.setAttribute("draggable", "false");
      avatar.append(img);
    } else {
      var name0 = String(profile.displayName || profile.username || "?").replace(/^@/, "");
      var initial = make("span", "pv-avatar-initial", (name0.charAt(0) || "?").toUpperCase());
      initial.setAttribute("aria-hidden", "true");
      avatar.append(initial);
    }
    var name = mine(make("h1", "pv-name", profile.displayName || say("anonymous")));
    var handle = mine(make("p", "pv-handle", profile.username ? "@" + profile.username : ""));
    handle.hidden = !profile.username;
    card.append(avatar, name, handle);
    if (typeof profile.bio === "string" && profile.bio) {
      card.append(mine(make("p", "pv-bio", profile.bio)));
    }
    side.append(card);
    return { side: side, card: card, avatar: avatar, name: name, handle: handle };
  }

  function widgetShell(make, say, key, wide) {
    var section = make("section", "pv-card pv-widget");
    section.setAttribute("data-widget", key);
    section.setAttribute("data-wide", wide ? "true" : "false");
    var head = make("header", "pv-widget-head");
    var title = make("h2", "pv-widget-title", say(key));
    head.append(icon(make, key), title);
    var body = make("div", "pv-widget-body");
    section.append(head, body);
    return { section: section, head: head, title: title, body: body };
  }

  function drawWeek(make, say, body, profile, nowMs, locale, shell) {
    var week = weekLayout(profile.classes || [], profile.events || [], nowMs);
    shell.title.textContent = say(week.label === "This week" ? "thisWeek" : "next7");
    shell.head.append(make("span", "pv-widget-note", say("yourTime")));
    if (!week.blocks.length) {
      body.append(make("p", "pv-empty", say("weekEmpty")));
      return;
    }
    var grid = make("div", "pv-week-grid");
    var headRow = make("div", "pv-week-days");
    for (var d = 0; d < week.days.length; d += 1) {
      var date = new Date(week.days[d].start);
      var dayHead = make("div", "pv-week-day");
      dayHead.append(make("span", "pv-week-day-name", dayName(week.days[d].start, locale, "short")), make("span", "pv-week-day-date", String(date.getDate())));
      headRow.append(dayHead);
    }
    var gridBody = make("div", "pv-week-body");
    var hourPx = 44;
    gridBody.style.setProperty("height", ((week.lastHour - week.firstHour) * hourPx) + "px");
    for (var h = 0; h < week.hours.length; h += 1) {
      var line = make("div", "pv-week-hour");
      line.style.setProperty("top", (h * hourPx) + "px");
      line.append(make("span", "pv-week-hour-label", hourLabel(week.hours[h], locale)));
      gridBody.append(line);
    }
    var lanes = make("div", "pv-week-lanes");
    var width = 100 / week.days.length;
    for (var b = 0; b < week.blocks.length; b += 1) {
      var block = week.blocks[b];
      var node = make("div", "pv-block pv-block-" + block.kind);
      var laneWidth = width / (block.lanes || 1);
      node.style.setProperty("left", (block.day * width + (block.lane || 0) * laneWidth) + "%");
      node.style.setProperty("width", laneWidth + "%");
      node.style.setProperty("top", ((block.startMin - week.firstHour * 60) * hourPx / 60) + "px");
      node.style.setProperty("height", Math.max(22, (block.endMin - block.startMin) * hourPx / 60) + "px");
      if (block.kind === "class") node.style.setProperty("--pv-c", colourFor(block.t));
      var inner = make("div", "pv-block-inner");
      var from = clockAt(block.s * 60000, locale);
      var until = clockAt(block.e * 60000, locale);
      inner.append(mine(make("span", "pv-block-title", block.t)), make("span", "pv-block-time", from + " – " + until));
      inner.title = block.t + ", " + from + " – " + until;
      node.append(inner);
      lanes.append(node);
    }
    gridBody.append(lanes);
    grid.append(headRow, gridBody);

    /* The narrow view: the same week as a list, one day at a time. */
    var list = make("ol", "pv-week-list");
    for (var day = 0; day < week.days.length; day += 1) {
      var todays = week.blocks.filter(function (x) { return x.day === day; });
      if (!todays.length) continue;
      var group = make("li", "pv-list-day");
      var when = new Date(week.days[day].start);
      var dayWords = dayName(week.days[day].start, locale, "long");
      var dateWords = "";
      try { dateWords = when.toLocaleDateString(locale || undefined, { month: "short", day: "numeric" }); } catch (error) { dateWords = String(when.getDate()); }
      group.append(make("h3", "pv-list-day-name", dayWords + ", " + dateWords));
      var rows = make("ul", "pv-list-rows");
      for (var r = 0; r < todays.length; r += 1) {
        var row = make("li", "pv-list-row pv-block-" + todays[r].kind);
        if (todays[r].kind === "class") row.style.setProperty("--pv-c", colourFor(todays[r].t));
        row.append(make("span", "pv-list-time", clockAt(todays[r].s * 60000, locale)), mine(make("span", "pv-list-title", todays[r].t)));
        rows.append(row);
      }
      group.append(rows);
      list.append(group);
    }
    body.append(grid, list);
  }

  function drawClasses(make, say, body, profile, nowMs, locale) {
    var rows = classRows(profile.classes || [], nowMs, locale);
    if (!rows.length) {
      body.append(make("p", "pv-empty", say("classesEmpty")));
      return;
    }
    var list = make("ul", "pv-class-list");
    rows.slice(0, MAX_CLASS_ROWS).forEach(function (row) {
      var li = make("li", "pv-class");
      li.style.setProperty("--pv-c", row.colour);
      var dot = make("span", "pv-class-dot");
      dot.setAttribute("aria-hidden", "true");
      var words = make("span", "pv-class-words");
      words.append(mine(make("span", "pv-class-name", row.t)));
      var when = [row.days, row.time].filter(Boolean).join("  ");
      if (when) words.append(make("span", "pv-class-when", when));
      li.append(dot, words);
      list.append(li);
    });
    body.append(list);
    if (rows.length > MAX_CLASS_ROWS) body.append(make("p", "pv-more", say("moreClasses", { count: rows.length - MAX_CLASS_ROWS })));
  }

  function drawAchievements(make, say, body, profile, locale) {
    var n = profile.achievements || 0;
    if (!n) {
      body.append(make("p", "pv-empty", say("earnedNone")));
      return;
    }
    var big = make("div", "pv-trophy");
    big.append(make("span", "pv-trophy-value", grouped(n, locale)), make("span", "pv-trophy-label", say(n === 1 ? "earnedOne" : "earnedMany")));
    var stars = make("div", "pv-stars");
    stars.setAttribute("aria-hidden", "true");
    for (var i = 0; i < Math.min(n, 12); i += 1) stars.append(icon(make, "star"));
    body.append(big, stars);
  }

  function drawSelah(make, say, body, profile, locale, options) {
    var s = profile.selah;
    var world = make("div", "pv-selah");
    var art = make("div", "pv-selah-art");
    var src = typeof options.stageArt === "function" ? options.stageArt(s.stage) : "";
    if (src) {
      var img = make("img", "pv-selah-img");
      img.alt = "";
      img.src = src;
      img.setAttribute("draggable", "false");
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      art.append(img);
    }
    var info = make("div", "pv-selah-info");
    info.append(mine(make("p", "pv-selah-name", s.name || say("libraryFallback"))));
    var line = [say("stageOf", { stage: s.stage, stages: s.stages }), say("level", { level: s.level })].join(" · ");
    info.append(make("p", "pv-selah-stage", line));
    var meter = make("div", "pv-selah-meter");
    meter.setAttribute("aria-hidden", "true");
    var fillBar = make("i");
    fillBar.style.setProperty("width", Math.round((s.stage / Math.max(1, s.stages)) * 100) + "%");
    meter.append(fillBar);
    info.append(meter);
    var stats = make("ul", "pv-selah-stats");
    [["coins", s.coins], ["diamonds", s.diamonds], ["sapphires", s.sapphires], ["points", s.points], ["streak", s.streak]].forEach(function (pair) {
      if (pair[0] === "streak" && !pair[1]) return;
      if (pair[0] === "sapphires" && !pair[1]) return;
      var name = say(pair[0] === "points" ? "focusPoints" : pair[0]);
      var li = make("li", "pv-selah-stat");
      li.setAttribute("data-stat", pair[0]);
      li.title = name;
      var value = make("b", "pv-selah-value", grouped(pair[1], locale));
      li.append(icon(make, pair[0]), value, make("span", "pv-selah-label", name));
      stats.append(li);
    });
    info.append(stats);
    world.append(art, info);
    body.append(world);
  }

  /* One widget, from whatever profile it is handed. */
  function buildWidget(doc, key, profile, options) {
    var opts = options || {};
    var make = maker(doc);
    var say = speaker(opts);
    var look = profile.look || DEFAULT_LOOK;
    var shell = widgetShell(make, say, key, look.wide.indexOf(key) >= 0);
    var nowMs = typeof opts.now === "number" ? opts.now : Date.now();
    if (key === "calendar") drawWeek(make, say, shell.body, profile, nowMs, opts.locale, shell);
    else if (key === "classes") drawClasses(make, say, shell.body, profile, nowMs, opts.locale);
    else if (key === "achievements") drawAchievements(make, say, shell.body, profile, opts.locale);
    else if (key === "selah" && profile.selah) drawSelah(make, say, shell.body, profile, opts.locale, opts);
    return shell;
  }

  /* The whole page for a visitor: the sidebar and every widget the profile
     carries, in the student's order. Returns the parts so a host can add
     its own things (the site's "add me" line, the app's edit controls). */
  function buildPage(doc, profile, options) {
    var make = maker(doc);
    var look = profile.look || DEFAULT_LOOK;
    var host = make("div", "pv-host");
    var page = make("div", "pv-page");
    var sidebar = buildSidebar(doc, profile, options);
    var main = make("div", "pv-main");
    var widgets = {};
    look.order.forEach(function (key) {
      if (!has(profile, key)) return;
      var shell = buildWidget(doc, key, profile, options);
      widgets[key] = shell;
      main.append(shell.section);
    });
    main.hidden = !main.childNodes.length;
    page.setAttribute("data-alone", main.hidden ? "true" : "false");
    page.append(sidebar.side, main);
    host.append(page);
    return { host: host, page: page, sidebar: sidebar, main: main, widgets: widgets };
  }

  var api = {
    WIDGETS: WIDGETS,
    WORDS: WORDS,
    DEFAULT_LOOK: DEFAULT_LOOK,
    shapeProfile: shapeProfile,
    shapeLook: shapeLook,
    shapeSelah: shapeSelah,
    has: has,
    weekLayout: weekLayout,
    classRows: classRows,
    colourFor: colourFor,
    buildSidebar: buildSidebar,
    buildWidget: buildWidget,
    buildPage: buildPage
  };

  if (typeof window !== "undefined") window.MakullvenyProfileView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
