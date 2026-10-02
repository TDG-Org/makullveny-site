/*
  A FRIEND GROUP'S CALENDAR, SHARED BY LINK: https://www.makullveny.com/g/#<token>

  The group's owner made this link in the Makullveny app (Calendar > the
  group > Share link). Anyone holding it can LOOK at the group's week (or
  month): each person's classes and the events they added, in that person's
  colour. Nobody can change anything here, and nothing here can reach the
  group. The owner can turn the link off in the app at any time.

  WHAT IS ON IT, AND WHAT NEVER IS. The server function (mak-share's "group"
  action -> mak_group_link_read, service_role only) sends the group's name and
  theme KEY, the span, and per JOINED member a DISPLAY NAME, a colour slot
  (0-9), the colour they PICKED in the app if they did (`color`, a whole
  number 0-9) and their items {t, s, e, k, c?} around now. Never an account id, a
  username, an email, a room or an assignment -- the app never publishes an
  assignment, the database drops a room from a public read, and the function
  forwards named fields only. This page re-checks every field again
  (shapeGroup) and draws nothing it did not name.

  SAME RULES AS u/ AND read/: no key of any kind, exactly ONE POST of
  { action: "group", token } to one function at one pinned origin (the same
  read/config.js, the same ALLOWED_API_ORIGINS, the same connect-src in
  g/index.html), the token in the FRAGMENT so no server and no Referer ever
  sees it, and every string from the network set with textContent. A colour
  from the network is never used: a person's colour is looked up HERE, from
  the number they picked (MEMBER_COLOURS) or else from their slot
  (PERSON_COLOURS). The network only ever names an index. NO BUILD STEP.

  An old link of the form /g/<token> (the app made those until 2026-09-30) is
  GitHub Pages' 404; ../404.html turns it into /g/#<token> and lands here.
*/
(function () {
  "use strict";

  var hasWindow = typeof window !== "undefined";

  var CONFIG = { apiUrl: "" };
  if (hasWindow && window.MAKULLVENY_READER_CONFIG && window.MAKULLVENY_READER_CONFIG.apiUrl) {
    CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
  }

  /* KEEP IN STEP with read/read.js and u/profile.js ALLOWED_API_ORIGINS and
     the connect-src in g/index.html (tests/group-page.test.js checks all). */
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

  /* Every theme ../u/themes.css paints (the same list as u/profile.js). A key
     not on it is drawn as Cozy Cabin; the key only ever selects one of these. */
  var THEMES = [
    "cozy-cabin", "snow-cabin", "terminal-hacker", "cherry-blossom", "rainy-cafe",
    "garden-of-eden", "woodland-library", "lantern-study", "moonlit-observatory",
    "on-the-rock", "cotton-candy", "skyline-loft", "abyssal-aquarium", "gilded-arcana",
    "aurora-glasshouse", "crimson-atelier", "ink-and-ivory"
  ];

  /* THE TEN COLOURS A MEMBER CAN PICK, by the number the app stores
     (mak_group_calendar_members.color 0..9): red, orange, gold, green, teal,
     blue, violet, pink, stone, brown. GENERATED, not hand-picked: printed by
     a node script that require()s the app's own model
     (Makullveny/src/groupCalendarModel.js, memberColour(index, "dark" |
     "light") -- MEMBER_COLOURS at MEMBER_TONE, stone at chroma 0, brown at
     its own darker tones), then pasted here. The ORDER is the server's, so it
     never changes; regenerate from the app if the app's tones ever move. */
  var MEMBER_COLOURS = {
    dark: ["#fd968f", "#f0a556", "#cbb94c", "#80cd82", "#21d1ca", "#71bfff", "#b6aaff", "#ee95d1", "#b7b7b7", "#c39b81"],
    light: ["#ab413e", "#955905", "#776a0a", "#267d30", "#007974", "#036eae", "#6a57b3", "#9b4382", "#696969", "#613f27"]
  };
  /* THE TEN SLOT COLOURS: the fallback for someone who has not picked, by the
     colour SLOT the server hands out (colorIndex 0..9). Not a second palette:
     slot s IS member colour SLOT_ORDER[s] (the app's SLOT_ORDER -- orange,
     teal, violet, pink first, the four hues the old four-seat page had), so
     PERSON_COLOURS below is the app's personColour(slot, tone), the same
     generated values in slot order. */
  var SLOT_ORDER = [1, 4, 6, 7, 3, 5, 2, 0, 9, 8];
  var PERSON_COLOURS = {
    dark: SLOT_ORDER.map(function (index) { return MEMBER_COLOURS.dark[index]; }),
    light: SLOT_ORDER.map(function (index) { return MEMBER_COLOURS.light[index]; })
  };
  var INK_DARK = "#1b1426";
  var INK_LIGHT = "#ffffff";

  var MAX_MEMBERS = 10;
  var MAX_ITEMS = 600;
  var MINUTE = 60000;

  function text(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
  }

  function shapeItems(value) {
    var out = [];
    if (!Array.isArray(value)) return out;
    for (var i = 0; i < value.length && out.length < MAX_ITEMS; i += 1) {
      var raw = value[i];
      if (!raw || typeof raw !== "object") continue;
      var t = text(raw.t, 60);
      var s = Number(raw.s);
      var e = Number(raw.e);
      var k = raw.k === "class" || raw.k === "event" ? raw.k : "";
      if (!t || !k || !Number.isInteger(s) || !Number.isInteger(e) || e <= s || e - s > 1440) continue;
      out.push({ t: t, s: s, e: e, k: k });
    }
    out.sort(function (a, b) { return (a.s - b.s) || (a.e - b.e); });
    return out;
  }

  /* The public shape, rebuilt key by key. A course colour (c) is dropped on
     purpose: here a block is its PERSON's colour. */
  function shapeGroup(payload) {
    var source = payload && typeof payload === "object" ? payload : {};
    var members = [];
    var seen = {};
    var picked = {};
    var list = Array.isArray(source.members) ? source.members : [];
    for (var i = 0; i < list.length && members.length < MAX_MEMBERS; i += 1) {
      var raw = list[i];
      if (!raw || typeof raw !== "object") continue;
      var slot = Number(raw.colorIndex);
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_MEMBERS || seen[slot]) continue;
      seen[slot] = true;
      var member = { name: text(raw.name, 60) || "Friend", slot: slot, items: shapeItems(raw.items) };
      /* The picked colour: a whole NUMBER 0-9 that nobody before them wears.
         A string, a hex, a fraction or anything else is ignored. */
      var own = raw.color;
      if (typeof own === "number" && Number.isInteger(own) && own >= 0 && own < MEMBER_COLOURS.dark.length && !picked[own]) {
        picked[own] = true;
        member.colour = own;
      }
      members.push(member);
    }
    members.sort(function (a, b) { return a.slot - b.slot; });
    /* Someone who has not picked keeps their slot colour -- unless a member
       PICKED that colour (or, failing that, an earlier member already took
       it); then they take the first slot colour, in slot order, that nobody
       wears yet. Ten colours, at most ten people: there is always one free,
       and nobody on the page ever shares a colour. */
    var taken = {};
    Object.keys(picked).forEach(function (key) { taken[key] = true; });
    var moved = [];
    members.forEach(function (m) {
      if (m.colour !== undefined) return;
      var twin = SLOT_ORDER[m.slot];
      if (taken[twin]) { moved.push(m); return; }
      taken[twin] = true;
    });
    moved.forEach(function (m) {
      for (var i = 0; i < SLOT_ORDER.length; i += 1) {
        var c = SLOT_ORDER[i];
        if (!taken[c]) { taken[c] = true; m.colour = c; return; }
      }
    });
    var theme = typeof source.theme === "string" && THEMES.indexOf(source.theme) >= 0 ? source.theme : "cozy-cabin";
    return {
      name: text(source.name, 40) || "A group calendar",
      theme: theme,
      span: source.span === "month" ? "month" : "week",
      members: members
    };
  }

  /* ── colour ─────────────────────────────────────────────────────────── */

  function parseColour(value) {
    var raw = String(value || "").trim().toLowerCase();
    var m = /^#([0-9a-f]{6})$/.exec(raw);
    if (m) return [0, 2, 4].map(function (at) { return parseInt(m[1].slice(at, at + 2), 16); });
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(raw);
    if (m) return [1, 2, 3].map(function (at) { return Math.max(0, Math.min(255, Math.round(Number(m[at])))); });
    return null;
  }

  function luminance(value) {
    var rgb = parseColour(value);
    if (!rgb) return null;
    var c = rgb.map(function (part) {
      var v = part / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    if (la === null || lb === null) return 1;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* The app's inkFor: dark or white, whichever reads better; pure black if
     neither clears 4.5:1 and black does better (never needed by the twenty
     colours here -- tests/group-page.test.js measures them -- but kept so the
     page and the app can never disagree). */
  function inkFor(fill) {
    var dark = contrast(fill, INK_DARK);
    var light = contrast(fill, INK_LIGHT);
    if (Math.max(dark, light) < 4.5 && contrast(fill, "#000000") > Math.max(dark, light)) return "#000000";
    return dark >= light ? INK_DARK : INK_LIGHT;
  }

  /* "light" when the panel ink is dark (a light theme). */
  function toneFor(panelText) {
    var l = luminance(panelText);
    return l !== null && l < 0.3 ? "light" : "dark";
  }

  function personColour(slot, tone) {
    var set = PERSON_COLOURS[tone === "light" ? "light" : "dark"];
    return set[Math.max(0, Math.min(set.length - 1, Number(slot) || 0))];
  }

  /* A member's fill: the colour they picked (or were moved to), else their
     slot's. Only ever an index into one of the two tables above. */
  function memberFill(member, tone) {
    var own = member ? member.colour : undefined;
    if (Number.isInteger(own) && own >= 0 && own < MEMBER_COLOURS.dark.length) return MEMBER_COLOURS[tone === "light" ? "light" : "dark"][own];
    return personColour(member ? member.slot : 0, tone);
  }

  /* Every member's fill by slot, for one render. Items and list rows carry
     only the slot, so they are painted through this. */
  function paletteFor(group, tone) {
    var fills = {};
    group.members.forEach(function (member) { fills[member.slot] = memberFill(member, tone); });
    return fills;
  }

  /* ── time ───────────────────────────────────────────────────────────── */

  function midnight(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addDays(ms, n) {
    var d = new Date(ms);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  /* One person's items cut to one local day, in minutes from that midnight. */
  function itemsOnDay(items, dayStartMs) {
    var dayEnd = addDays(dayStartMs, 1);
    var out = [];
    for (var i = 0; i < items.length; i += 1) {
      var sMs = items[i].s * MINUTE;
      var eMs = items[i].e * MINUTE;
      if (!(eMs > dayStartMs && sMs < dayEnd)) continue;
      out.push({
        t: items[i].t,
        k: items[i].k,
        startMin: Math.max(0, Math.round((sMs - dayStartMs) / MINUTE)),
        endMin: Math.min(1440, Math.round((eMs - dayStartMs) / MINUTE))
      });
    }
    return out;
  }

  /* Overlaps inside one lane sit side by side (greedy columns per cluster). */
  function layoutLane(items) {
    var sorted = items.slice().sort(function (a, b) { return (a.startMin - b.startMin) || (a.endMin - b.endMin) || ((a.slot || 0) - (b.slot || 0)); });
    var out = [];
    var cluster = [];
    var clusterEnd = -1;
    function close() {
      var ends = [];
      cluster.forEach(function (item) {
        var col = -1;
        for (var c = 0; c < ends.length; c += 1) if (ends[c] <= item.startMin) { col = c; break; }
        if (col < 0) { col = ends.length; ends.push(0); }
        ends[col] = item.endMin;
        item.col = col;
      });
      cluster.forEach(function (item) { item.cols = Math.max(1, ends.length); out.push(item); });
      cluster = [];
    }
    sorted.forEach(function (item) {
      if (cluster.length && item.startMin >= clusterEnd) close();
      cluster.push(Object.assign({}, item));
      clusterEnd = cluster.length === 1 ? item.endMin : Math.max(clusterEnd, item.endMin);
    });
    close();
    return out;
  }

  /* THE WEEK: seven days from today, hours fitted to what is there (never
     narrower than 8am-5pm). Everyone's items share each day's column and
     split it only where they overlap in time, so a class alone gets the whole
     width and its title can be read; the colour says whose it is. */
  function weekLayout(members, nowMs) {
    var start = midnight(nowMs);
    var earliest = 8 * 60;
    var latest = 17 * 60;
    var days = [];
    for (var d = 0; d < 7; d += 1) {
      var dayStart = addDays(start, d);
      var all = [];
      members.forEach(function (member) {
        itemsOnDay(member.items, dayStart).forEach(function (item) {
          earliest = Math.min(earliest, item.startMin);
          latest = Math.max(latest, item.endMin);
          item.slot = member.slot;
          item.name = member.name;
          all.push(item);
        });
      });
      all.sort(function (a, b) { return (a.startMin - b.startMin) || (a.slot - b.slot); });
      days.push({ start: dayStart, items: layoutLane(all) });
    }
    var startMin = Math.max(0, Math.floor(earliest / 60) * 60);
    var endMin = Math.min(1440, Math.max(startMin + 60, Math.ceil(latest / 60) * 60));
    var count = 0;
    days.forEach(function (day) { count += day.items.length; });
    return { days: days, startMin: startMin, endMin: endMin, count: count };
  }

  /* THE MONTH: five weeks from the Sunday of this week -- what is coming,
     not the calendar month, which on the 30th would be one row of days
     already gone. Days before today are drawn faint and not counted (the
     server only sends a month around now anyway). */
  var MONTH_WEEKS = 5;

  function monthLayout(members, nowMs) {
    var today = midnight(nowMs);
    var gridStart = addDays(today, -new Date(today).getDay());
    var weeks = [];
    var count = 0;
    for (var w = 0; w < MONTH_WEEKS; w += 1) {
      var week = [];
      for (var d = 0; d < 7; d += 1) {
        var dayStart = addDays(gridStart, w * 7 + d);
        var entries = [];
        members.forEach(function (member) {
          itemsOnDay(member.items, dayStart).forEach(function (item) {
            entries.push({ slot: member.slot, name: member.name, t: item.t, k: item.k, startMin: item.startMin, endMin: item.endMin });
          });
        });
        entries.sort(function (a, b) { return (a.startMin - b.startMin) || (a.slot - b.slot); });
        var past = dayStart < today;
        if (!past) count += entries.length;
        week.push({ start: dayStart, past: past, isToday: dayStart === today, entries: entries });
      }
      weeks.push(week);
    }
    return { weeks: weeks, count: count, from: gridStart, to: addDays(gridStart, MONTH_WEEKS * 7 - 1) };
  }

  function clock(minutes, locale) {
    var d = new Date(2026, 0, 1, Math.floor(minutes / 60) % 24, minutes % 60);
    try {
      return d.toLocaleTimeString(locale || undefined, { hour: "numeric", minute: "2-digit" });
    } catch (error) {
      return String(Math.floor(minutes / 60)) + ":" + String(minutes % 60).padStart(2, "0");
    }
  }

  function range(startMin, endMin, locale) {
    return clock(startMin, locale) + " – " + clock(endMin, locale);
  }

  function hourLabel(minutes) {
    var h = Math.floor(minutes / 60) % 24;
    var hour = h % 12 === 0 ? 12 : h % 12;
    return hour + (h < 12 ? "am" : "pm");
  }

  function dayName(ms, style, locale) {
    try {
      return new Date(ms).toLocaleDateString(locale || undefined, style === "long" ? { weekday: "long", month: "long", day: "numeric" } : { weekday: "short" });
    } catch (error) {
      return "";
    }
  }

  /* One sentence per state; revoked, unknown and malformed read the same. */
  function stateForStatus(status) {
    if (status === 429) return "This calendar is getting a lot of visits right now. Wait a moment and try again.";
    if (status === 502 || status === 500 || status === 503) return "Something went wrong on Makullveny's end. Try again shortly.";
    return "This group calendar is not available. The link may have been turned off, or it never existed.";
  }

  /* ── drawing ────────────────────────────────────────────────────────── */

  var HOUR_PX = 52;

  function make(tag, className, words) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (words != null) node.textContent = words;
    return node;
  }

  function setState(message) {
    var node = document.getElementById("gcState");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function currentTone() {
    try {
      return toneFor(window.getComputedStyle(document.documentElement).getPropertyValue("--panel-text"));
    } catch (error) {
      return "dark";
    }
  }

  function paint(node, slot, palette) {
    var fill = palette[slot] || personColour(slot, "dark");
    node.style.setProperty("--gp-person", fill);
    node.style.setProperty("--gp-ink", inkFor(fill));
  }

  function initial(name) {
    var m = String(name || "").match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : "?";
  }

  function drawKey(group, palette) {
    var key = make("div", "gp-key");
    key.setAttribute("role", "list");
    key.setAttribute("aria-label", "Who is which colour");
    group.members.forEach(function (member) {
      var chip = make("span", "gp-key-chip");
      chip.setAttribute("role", "listitem");
      var swatch = make("span", "gp-key-swatch");
      swatch.setAttribute("aria-hidden", "true");
      paint(swatch, member.slot, palette);
      chip.append(swatch, make("span", "gp-key-name", member.name));
      key.append(chip);
    });
    var note = make("span", "gp-key-note", "Filled = a class · outlined = an event");
    key.append(note);
    return key;
  }

  function drawWeek(group, nowMs, palette, locale) {
    var week = weekLayout(group.members, nowMs);
    var wrap = make("div", "gp-week-wrap");
    var grid = make("div", "gp-week");
    var head = make("div", "gp-week-head");
    head.append(make("span", "gp-week-corner"));
    week.days.forEach(function (day) {
      var cell = make("div", "gp-week-day");
      if (day.start === midnight(nowMs)) cell.dataset.today = "true";
      cell.append(make("span", "gp-week-dayname", dayName(day.start, "short", locale)), make("span", "gp-week-date", String(new Date(day.start).getDate())));
      head.append(cell);
    });
    grid.append(head);
    var body = make("div", "gp-week-body");
    var hours = (week.endMin - week.startMin) / 60;
    body.style.height = hours * HOUR_PX + "px";
    var ruler = make("div", "gp-week-ruler");
    for (var h = 0; h < hours; h += 1) {
      var label = make("span", "gp-week-hour", hourLabel(week.startMin + h * 60));
      label.style.top = h * HOUR_PX + "px";
      ruler.append(label);
    }
    body.append(ruler);
    week.days.forEach(function (day) {
      var col = make("div", "gp-week-col");
      for (var h2 = 1; h2 < hours; h2 += 1) {
        var line = make("span", "gp-week-line");
        line.style.top = h2 * HOUR_PX + "px";
        col.append(line);
      }
      day.items.forEach(function (item) {
        var left = (item.col * 100) / item.cols;
        var width = 100 / item.cols;
        var top = ((Math.max(item.startMin, week.startMin) - week.startMin) / 60) * HOUR_PX;
        var tall = Math.max(16, ((Math.min(item.endMin, week.endMin) - Math.max(item.startMin, week.startMin)) / 60) * HOUR_PX - 2);
        var block = make("div", "gp-block");
        block.dataset.kind = item.k;
        paint(block, item.slot, palette);
        block.style.left = "calc(" + left + "% + 1px)";
        block.style.width = "calc(" + width + "% - 2px)";
        block.style.top = top + 1 + "px";
        block.style.height = tall + "px";
        var words = item.name + ": " + item.t + ", " + (item.k === "class" ? "class" : "event") + ", " + dayName(day.start, "long", locale) + " " + range(item.startMin, item.endMin, locale);
        block.title = words;
        block.setAttribute("role", "img");
        block.setAttribute("aria-label", words);
        var dot = make("span", "gp-block-dot", initial(item.name));
        dot.setAttribute("aria-hidden", "true");
        var head = make("span", "gp-block-head");
        head.append(dot, make("span", "gp-block-title", item.t));
        block.append(head);
        if (tall >= 36) block.append(make("span", "gp-block-time", range(item.startMin, item.endMin, locale)));
        col.append(block);
      });
      body.append(col);
    });
    grid.append(body);
    wrap.append(grid);
    return { node: wrap, count: week.count, days: week.days };
  }

  /* The same week (or month) as a list, one day under the other: what a
     phone shows instead of the grid. */
  function drawList(days, palette, locale, emptyWords) {
    var list = make("div", "gp-list");
    var any = false;
    days.forEach(function (day) {
      if (!day.entries.length) return;
      any = true;
      var box = make("section", "gp-list-day");
      box.append(make("h3", "gp-list-date", dayName(day.start, "long", locale)));
      day.entries.forEach(function (entry) {
        var row = make("div", "gp-list-row");
        row.dataset.kind = entry.k;
        paint(row, entry.slot, palette);
        var swatch = make("span", "gp-list-swatch");
        swatch.setAttribute("aria-hidden", "true");
        var words = make("span", "gp-list-words");
        words.append(make("span", "gp-list-title", entry.t), make("span", "gp-list-meta", entry.name + " · " + range(entry.startMin, entry.endMin, locale) + (entry.k === "event" ? " · event" : "")));
        row.append(swatch, words);
        box.append(row);
      });
      list.append(box);
    });
    if (!any) list.append(make("p", "gp-empty", emptyWords));
    return list;
  }

  function weekListDays(group, nowMs) {
    var start = midnight(nowMs);
    var out = [];
    for (var d = 0; d < 7; d += 1) {
      var dayStart = addDays(start, d);
      var entries = [];
      group.members.forEach(function (member) {
        itemsOnDay(member.items, dayStart).forEach(function (item) {
          entries.push({ slot: member.slot, name: member.name, t: item.t, k: item.k, startMin: item.startMin, endMin: item.endMin });
        });
      });
      entries.sort(function (a, b) { return (a.startMin - b.startMin) || (a.slot - b.slot); });
      out.push({ start: dayStart, entries: entries });
    }
    return out;
  }

  function drawMonth(group, nowMs, palette, locale) {
    var month = monthLayout(group.members, nowMs);
    var wrap = make("div", "gp-month");
    var head = make("div", "gp-month-head");
    for (var d = 0; d < 7; d += 1) head.append(make("span", "gp-month-weekday", dayName(month.weeks[0][d].start, "short", locale)));
    wrap.append(head);
    var gridNode = make("div", "gp-month-grid");
    month.weeks.forEach(function (week) {
      week.forEach(function (day) {
        var cell = make("div", "gp-month-cell");
        if (day.past) cell.dataset.outside = "true";
        if (day.isToday) cell.dataset.today = "true";
        cell.append(make("span", "gp-month-num", String(new Date(day.start).getDate())));
        day.entries.slice(0, 3).forEach(function (entry) {
          var line = make("span", "gp-month-entry");
          line.dataset.kind = entry.k;
          paint(line, entry.slot, palette);
          line.title = entry.name + ": " + entry.t + ", " + range(entry.startMin, entry.endMin, locale);
          line.append(make("span", "gp-month-dot"), make("span", "gp-month-text", clock(entry.startMin, locale).replace(/:00(?=\s|$)/, "") + " " + entry.t));
          cell.append(line);
        });
        if (day.entries.length > 3) {
          var more = make("span", "gp-month-more");
          more.append(make("span", "gp-month-more-words", "+" + (day.entries.length - 3) + " more"));
          var shown = {};
          day.entries.slice(3).forEach(function (entry) {
            if (shown[entry.slot]) return;
            shown[entry.slot] = true;
            var dot = make("span", "gp-month-more-dot");
            dot.setAttribute("aria-hidden", "true");
            paint(dot, entry.slot, palette);
            more.append(dot);
          });
          more.title = day.entries.slice(3).map(function (entry) { return entry.name + ": " + entry.t; }).join("\n");
          cell.append(more);
        }
        gridNode.append(cell);
      });
    });
    wrap.append(gridNode);
    var listDays = [];
    month.weeks.forEach(function (week) { week.forEach(function (day) { if (!day.past) listDays.push(day); }); });
    return { node: wrap, count: month.count, listDays: listDays };
  }

  function render(payload, nowMs) {
    var group = shapeGroup(payload);
    document.documentElement.setAttribute("data-theme", group.theme);
    document.documentElement.setAttribute("data-bg", "on");
    document.title = group.name + " — a group calendar on Makullveny";
    var palette = paletteFor(group, currentTone());
    var locale = (typeof navigator !== "undefined" && navigator.language) || undefined;
    var host = document.getElementById("gcGroup");
    var card = make("section", "gp-card");
    var head = make("div", "gp-head");
    head.append(make("p", "gp-kicker", "Group calendar"), make("h1", "gp-title", group.name));
    var spanWords;
    if (group.span === "month") {
      spanWords = "The next 5 weeks";
    } else {
      spanWords = "The next 7 days";
    }
    head.append(make("p", "gp-sub", spanWords + " · " + group.members.length + (group.members.length === 1 ? " person" : " people")));
    card.append(head, drawKey(group, palette));
    var empty = group.span === "month" ? "Nothing on this calendar this month." : "Nothing on this calendar in the next 7 days.";
    if (group.span === "month") {
      var month = drawMonth(group, nowMs, palette, locale);
      var mPanel = make("div", "gp-panel gp-desktop");
      mPanel.append(month.node);
      card.append(mPanel, drawList(month.listDays, palette, locale, empty));
    } else {
      var week = drawWeek(group, nowMs, palette, locale);
      var wPanel = make("div", "gp-panel gp-desktop");
      wPanel.append(week.node);
      if (!week.count) wPanel.append(make("p", "gp-empty", empty));
      card.append(wPanel, drawList(weekListDays(group, nowMs), palette, locale, empty));
    }
    card.append(make("p", "gp-private", "Look only: nobody can change this calendar from here. Assignments are never on it."));
    host.replaceChildren(card, drawInvite());
    setState("");
    host.hidden = false;
    return group;
  }

  /* For someone WITHOUT the app: what this is and where to get it. For
     someone WITH it: open it (the group lives in Calendar there). */
  function drawInvite() {
    var box = make("aside", "gp-invite");
    box.append(make("h2", "gp-invite-title", "Plan your week with your friends"));
    box.append(make("p", "gp-invite-text", "Makullveny is a free study app. Put your classes in, make a group with up to nine friends, and see when you are all free."));
    var actions = make("div", "gp-invite-actions");
    var get = make("a", "gp-btn gp-btn-main", "Get Makullveny");
    get.href = "../#download";
    var open = make("a", "gp-btn", "I have it — open Makullveny");
    open.href = "makullveny://open";
    actions.append(get, open);
    box.append(actions);
    return box;
  }

  function open() {
    /* A LOCAL PREVIEW ONLY. A page script can set this global before
       group.js runs (tools and screenshots do); a URL cannot, so there is
       nothing here for a crafted link to switch on. */
    if (window.MAKULLVENY_GROUP_FIXTURE && typeof window.MAKULLVENY_GROUP_FIXTURE === "object") {
      render(window.MAKULLVENY_GROUP_FIXTURE, typeof window.MAKULLVENY_GROUP_NOW === "number" ? window.MAKULLVENY_GROUP_NOW : Date.now());
      return;
    }
    var token = tokenFromHash();
    if (!token) {
      setState("This link is not complete. Ask whoever sent it for the full address.");
      return;
    }
    if (!CONFIG.apiUrl || !apiOriginAllowed(CONFIG.apiUrl)) {
      setState("Group calendar links are not open yet.");
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
    request.send(JSON.stringify({ action: "group", token: token }));
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      tokenFromHash: tokenFromHash,
      apiOriginAllowed: apiOriginAllowed,
      shapeGroup: shapeGroup,
      weekLayout: weekLayout,
      monthLayout: monthLayout,
      itemsOnDay: itemsOnDay,
      personColour: personColour,
      memberFill: memberFill,
      paletteFor: paletteFor,
      inkFor: inkFor,
      contrast: contrast,
      toneFor: toneFor,
      stateForStatus: stateForStatus,
      ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
      THEMES: THEMES,
      PERSON_COLOURS: PERSON_COLOURS,
      SLOT_ORDER: SLOT_ORDER,
      MAX_MEMBERS: MAX_MEMBERS,
      MEMBER_COLOURS: MEMBER_COLOURS
    };
  }

  if (hasWindow && typeof document !== "undefined" && document.getElementById && document.getElementById("gcMain")) {
    window.addEventListener("hashchange", function () { window.location.reload(); });
    open();
  }
})();
