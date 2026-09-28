/*
  Shoot the Friends, Share and Lock In pictures this site ships.

      node tools/capture-social-shots.mjs              # every shot, then the Lock In loop
      node tools/capture-social-shots.mjs friends      # only the steps whose id matches
      node tools/capture-social-shots.mjs --no-flow    # skip the Lock In recording

  Steps: friends, profile, jump, share, month, lockin, flow (flow also writes
  lockin-window.jpg -- the study window only exists once a session runs).

  ── THE SAME APPROACH AS capture-app-shots.mjs, ITS OWN RUN ─────────────────
  That file drives the real app over CDP in a throwaway demo sandbox; read its
  header for why. This one does the same on its OWN port and its OWN sandbox
  (9334, %TEMP%/mak-preview-socialshots), so the two can run side by side
  without one killing the other's window or wiping the other's profile.

  ── FRIENDS COME FROM TDG, AND THE SANDBOX IS SIGNED OUT ────────────────────
  Every friend, profile and shared week is a server answer, and a demo
  profile has no account -- so the real Friends sheet can only ever say
  "Sign in". src/friendsSheet.js documents the way round it for exactly this:
  "Probes and tests build a second sheet over a fake api with
  createFriendsSheet({ api })". That is what happens here. The fake api
  answers in the shapes tests/friendsSheet.test.js and
  tests/friendProfile.test.js use, with INVENTED people (FAKE_SOCIAL below);
  every pixel of the sheet, the profile and the week panel is the app's own
  code drawing those answers. Quick Jump's "Friends in class" reads the
  renderer's in-memory copy of the same answer (state.prefs.friendCalendar
  and friendScheduleFriends in src/renderer.js), so it is given the same
  invented week there. Nothing is written to a server, nothing leaves the
  sandbox.

  ── THE SHARE PICTURES ARE THE APP'S OWN PNGs ───────────────────────────────
  src/shareImage.js paints the picture and shows it in its preview as a blob:
  <img>. The page's CSP will not let fetch() read a blob: URL, so the <img> is
  drawn onto a canvas at its natural size and re-encoded -- a lossless PNG
  round trip of the exact pixels Download PNG would save. Over 600 KB it is
  encoded as JPEG instead (Chromium's own encoder), at the same pixel size.

  ── ANIMATIONS NEED A PERSON AT THE DESK ────────────────────────────────────
  src/appRuntime.js's power governor adds body.power-idle after 90 s with no
  input and every CSS animation pauses -- including the Lock In sheet's
  180 ms rise, which then photographs as an empty scrim with a padlock
  floating over it. A capture run never touches the mouse, so it wiggles
  one (Input.dispatchMouseEvent, a real input event) before anything moves.

  ── THE LOOP IS REAL FRAMES ─────────────────────────────────────────────────
  lockin-flow.* is Page.startScreencast of the main window while the sheet
  opens, two choices are pressed and Lock In runs its padlock, then the real
  study window's own frames laid over the right-hand edge of that window --
  where main.js's focusCompanionPlacement() opens it. Assembled with the
  app's bundled ffmpeg (ffmpeg-static). No frame is drawn by this file.
*/
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.env.MAK_APP || join(SITE, "..", "Makullveny");
const OUT = join(SITE, "assets", "site");
const SANDBOX = join(tmpdir(), "mak-preview-socialshots");
/* Frames and the assembly's scratch files. Never the repo. */
const WORK = join(tmpdir(), "mak-socialshots-work");
const PORT = 9334;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const filters = argv.filter((a) => !a.startsWith("-"));
const wanted = (id) => !filters.length || filters.some((f) => id.includes(f));

/* The same invented afternoon capture-app-shots.mjs uses: the seed and the
   renderer both get a timezone where it is early afternoon, so a friend is
   "in class" and the Lock In sheet has a next class to walk to, whatever
   hour this runs. */
const HOUR_ARG = argv.find((a) => a.startsWith("--hour="));
const TARGET_HOUR = HOUR_ARG ? Number(HOUR_ARG.slice(7)) : 13;
function timezoneForHour(hour) {
  const utcHour = new Date().getUTCHours();
  let offset = ((hour - utcHour) % 24 + 24) % 24;
  if (offset > 12) offset -= 24;
  return offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}
const TZ = timezoneForHour(TARGET_HOUR);

/* ── CDP, small and by hand (as in capture-app-shots.mjs), plus events ── */
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", (e) => reject(new Error("CDP socket failed: " + (e.message || "error"))));
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(method + ": " + message.error.message));
      else resolve(message.result);
    } else if (message.method && listeners.has(message.method)) {
      listeners.get(message.method).forEach((fn) => fn(message.params));
    }
  });
  return {
    ready,
    close: () => socket.close(),
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
    off(method) { listeners.delete(method); },
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, method });
        socket.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(method + " timed out")); }
        }, 90000);
      });
    }
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

async function findMainWindow() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const pages = (await targets()).filter((t) => t.type === "page" && t.webSocketDebuggerUrl && /index\.html/i.test(t.url));
      for (const page of pages) {
        const cdp = connect(page.webSocketDebuggerUrl);
        try {
          await cdp.ready;
          const probe = await cdp.send("Runtime.evaluate", {
            expression: `(() => {
              const b = document.body;
              if (!b) return "";
              if (b.dataset.popoutModule) return "popout";
              if (!b.classList.contains("app-ready")) return "loading";
              if (document.documentElement.classList.contains("frw-curtain")) return "curtain";
              return "ready";
            })()`,
            returnByValue: true
          });
          if (probe.result.value === "ready") return cdp;
          cdp.close();
        } catch { cdp.close(); }
      }
    } catch { /* the port is not listening yet */ }
    await wait(1000);
  }
  throw new Error("The app window never reported app-ready. Is the app starting?");
}

/* The study window is its own BrowserWindow loading src/focusCompanion.html
   (main.js openFocusCompanionWindow), so it is its own CDP target. */
async function findPage(pathPattern, tries = 60) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const page = (await targets()).find((t) => t.type === "page" && t.webSocketDebuggerUrl && pathPattern.test(t.url));
      if (page) {
        const cdp = connect(page.webSocketDebuggerUrl);
        await cdp.ready;
        return cdp;
      }
    } catch { /* not yet */ }
    await wait(150);
  }
  return null;
}

async function run(cdp, body) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `(async () => { ${HELPERS}\n${body}\n})()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error("in the page: " + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
  }
  return result.result.value;
}

/* A real mouse move, so the power governor sees a person (see the header). */
async function wake(cdp) {
  const x = 700 + Math.round(Math.random() * 20);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: 6 });
}

async function setSize(cdp, [width, height], cssWidth) {
  const css = cssWidth || width;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: css, height: Math.round((css * height) / width), deviceScaleFactor: width / css, mobile: false
  });
}

async function shoot(cdp, name, size, cssWidth, settle = 1300) {
  await setSize(cdp, size, cssWidth);
  await wake(cdp);
  await wait(settle);
  const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, captureBeyondViewport: false });
  const bytes = Buffer.from(shot.data, "base64");
  writeFileSync(join(OUT, name), bytes);
  report(name, `${size[0]}x${size[1]}`, bytes.length);
  return bytes;
}

const written = [];
function report(name, px, length) {
  written.push({ name, px, kb: Math.round(length / 1024) });
  console.log(`  ${name.padEnd(22)} ${px.padEnd(10)} ${(length / 1024).toFixed(0)} KB`);
}

/* ── in the page ─────────────────────────────────────────────────────────── */
/* CLEAR THE WAY: capture-app-shots.mjs's version (tour, class bell, radio
   dock) plus the three more a fresh sandbox shows on the dashboard: the
   "What's new" card, the developers' notice and the "nudge before class"
   invitation. Each is dismissed with the control the app gives a student. */
const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const seen = (el) => el && el.offsetParent !== null;
  const $ = (sel) => document.querySelector(sel);
  const click = (sel) => { const el = typeof sel === "string" ? $(sel) : sel; if (el) { el.click(); return true; } return false; };
  const waitFor = async (test, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(120); } return null; };
  const clearTheWay = async () => {
    const gone = [];
    for (let pass = 0; pass < 4; pass += 1) {
      const skip = document.getElementById("onboardingSkipBtn");
      if (seen(skip)) { skip.click(); gone.push("tour"); await sleep(650); continue; }
      const gotIt = document.getElementById("whatsNewGotItBtn");
      if (seen(gotIt)) { gotIt.click(); gone.push("what's new"); await sleep(500); continue; }
      const notice = document.querySelector(".dev-notice button[aria-label], .dev-notice-close");
      if (seen(notice)) { notice.click(); gone.push("dev notice"); await sleep(400); continue; }
      const nudge = document.querySelector(".mk-notice-close");
      if (seen(nudge)) { nudge.click(); gone.push("nudge"); await sleep(400); continue; }
      break;
    }
    /* The floating class bell and the radio dock are fixed over every frame;
       hidden, not closed, so no preference changes (as capture-app-shots). */
    /* The two toast hosts ("Your term is on the desk", "First Lock In") are
       hidden the same way: each is a one-off note, not the screen. */
    if (!document.getElementById("socialShotsQuiet")) {
      const style = document.createElement("style");
      style.id = "socialShotsQuiet";
      style.textContent = ".mk-achievement-host,.mk-moment-toast-host{visibility:hidden!important}";
      document.head.append(style);
    }
    ["globalRadioDock", "classBellFloat"].forEach((id) => {
      const node = document.getElementById(id);
      if (node && node.style.visibility !== "hidden") { node.style.visibility = "hidden"; gone.push(id); }
    });
    return gone.join(", ") || "nothing";
  };
  const home = async () => {
    if (document.body.dataset.view !== "dashboard") { click("#cabinLogoBtn"); await sleep(700); }
    await clearTheWay();
  };
`;

/* INVENTED PEOPLE. First names and handles made up for this page; the
   avatars are the app's own seven (src/avatarChoices.js) and the themes the
   app's own keys. Times are built around "now" so the chips read the same
   whatever hour the run is. Ids are UUID-shaped because src/friendCalendar.js
   drops anything else. */
const FAKE_SOCIAL = `
  const MIN = 60000;
  const now = Date.now();
  const nowMin = Math.floor(now / MIN);
  const floorTo = (m, step) => Math.floor(m / step) * step;
  const ceilTo = (m, step) => Math.ceil(m / step) * step;
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const at = (day, h, m) => { const d = new Date(monday); d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0); return Math.round(d.getTime() / MIN); };
  const todayIdx = (new Date(now).getDay() + 6) % 7;
  const wallOf = (min) => { const d = new Date(min * MIN); return [d.getHours(), d.getMinutes()]; };
  const expires = new Date(now + 5 * 86400000).toISOString();
  const fetchedAt = new Date(now - 60000).toISOString();
  /* A weekly class on its days, skipping today -- today's meeting is the live one. */
  const weekly = (t, days, h, m, mins, l) => days.filter((d) => d !== todayIdx).map((d) => ({ t, s: at(d, h, m), e: at(d, h, m) + mins, ...(l ? { l } : {}) }));
  /* A class meeting NOW, and the same class at the same wall time on its other days. */
  const liveClass = (t, startMin, mins, days, l) => {
    const [h, m] = wallOf(startMin);
    return [{ t, s: startMin, e: startMin + mins, ...(l ? { l } : {}) }, ...weekly(t, days, h, m, mins, l)];
  };
  const alt = (d) => [...new Set([d, (d + 2) % 5, (d + 4) % 5])];
  const pair = (d) => [...new Set([d, (d + 2) % 5])];
  const id = (n) => "5a17c0de-0000-4000-8000-00000000000" + n;
  const F = {
    priya: { id: id(1), username: "priya_reads", name: "Priya Nair", avatarId: 3, theme: "cherry-blossom", nickname: "" },
    jonah: { id: id(2), username: "jonah.w", name: "Jonah Whitaker", avatarId: 2, theme: "snow-cabin", nickname: "" },
    lena: { id: id(3), username: "lena_m", name: "Lena Morales", avatarId: 6, theme: "aurora-glasshouse", nickname: "" },
    theo: { id: id(4), username: "theo_b", name: "Theo Brandt", avatarId: 5, theme: "woodland-library", nickname: "" },
    ari: { id: id(5), username: "aricast", name: "Ari Castellano", avatarId: 7, theme: "rainy-cafe", nickname: "" },
    sam: { id: id(6), username: "sam_ellery", name: "Sam Ellery", avatarId: 1, theme: "lantern-study", nickname: "" }
  };
  const ME = { id: id(9), username: "jordan_studies", name: "Jordan", avatarId: 4 };
  const NIA = { id: id(7), username: "nia_h", name: "Nia Holloway", avatarId: 4 };
  const jonahOut = ceilTo(nowMin + 6, 5);
  const entry = (f, classes, events) => ({ ownerId: f.id, name: f.name, classes, events: events || [], classesExpireAt: expires, eventsExpireAt: expires, fetchedAt });
  const schedules = [
    entry(F.priya, [
      ...liveClass("BIO 110", floorTo(nowMin - 30, 15), 75, alt(todayIdx), "Hume 104"),
      ...weekly("STAT 200", [1, 3], 11, 0, 75, "Lyle 210"),
      ...weekly("CHEM 210", [1, 3], 9, 30, 75, "Science 204"),
      ...liveClass("SPAN 201", ceilTo(nowMin + 150, 15), 50, pair(todayIdx))
    ], [{ t: "Study group", s: at(3, 18, 0), e: at(3, 19, 30) }]),
    entry(F.jonah, [
      { t: "CHEM 210 Lab", s: jonahOut - 110, e: jonahOut, l: "Lab B" },
      ...weekly("CHEM 210", [1, 3], 9, 30, 75, "Science 204"),
      ...weekly("HIST 101", [0, 2, 4], 11, 0, 50)
    ]),
    entry(F.lena, [
      ...weekly("ART 140", [1, 3], 9, 30, 110),
      ...liveClass("ECON 101", ceilTo(nowMin + 125, 15), 75, pair(todayIdx))
    ]),
    entry(F.theo, [
      ...liveClass("MATH 151", floorTo(nowMin - 20, 15), 75, pair(todayIdx)),
      ...weekly("PHYS 121", [0, 2, 4], 8, 0, 50)
    ]),
    entry(F.ari, [...liveClass("MUS 105", floorTo(nowMin - 10, 15), 90, pair(todayIdx))]),
    entry(F.sam, [...liveClass("PSY 100", floorTo(nowMin - 25, 5), 55, [todayIdx], "Hume 210")])
  ];
  const friends = [F.priya, F.jonah, F.lena, F.theo, F.ari, F.sam];
  const overview = () => ({ ok: true, signedIn: true, offline: false, extras: true, limits: { friends: 150, pendingSent: 50 },
    me: { ...ME }, friends: friends.map((f) => ({ ...f })), incoming: [{ ...NIA }], outgoing: [], blocked: [] });
  const bios = {
    [F.priya.id]: "Pre-med, cold brew, and far too many flashcards. Library third floor most afternoons.",
    [F.jonah.id]: "Chem lab survivor. Ask me about study playlists.",
    [F.lena.id]: "Art and econ. I sketch in the margins.",
    [F.theo.id]: "Physics, early mornings, long walks.",
    [F.ari.id]: "Music major. Always up for a quiet study session.",
    [F.sam.id]: ""
  };
  const counts = { [F.priya.id]: 4, [F.jonah.id]: 2, [F.lena.id]: 2, [F.theo.id]: 2, [F.ari.id]: 1, [F.sam.id]: 1 };
  const api = {
    socialOverview: async () => overview(),
    socialLookup: async () => ({ ok: true, found: false }),
    socialSearch: async () => ({ ok: true, available: true, results: [] }),
    socialMyProfile: async () => ({ ok: true, signedIn: true, available: true, bio: "Psych major. Lock In buddy, any time.", showClassCount: true }),
    socialSaveProfile: async (p) => ({ ok: true, available: true, bio: p.bio, showClassCount: p.showClassCount }),
    socialFriendProfile: async (p) => ({ ok: true, available: true, bio: bios[p.userId] || "", showClassCount: true, classCount: counts[p.userId] || 0, waveNextAt: "" }),
    socialWave: async () => ({ ok: true, sent: true, nextAt: new Date(Date.now() + 15 * MIN).toISOString() }),
    socialNickname: async () => ({ ...overview(), ok: true }),
    friendCalendarSchedules: async () => ({ ok: true, friendCalendar: { version: 1, schedules }, friends }),
    writeClipboardText: async () => true,
    onAuthStateChanged: () => () => {}
  };
  ["request", "accept", "decline", "cancel", "remove", "block", "unblock"].forEach((verb) => {
    api["social" + verb[0].toUpperCase() + verb.slice(1)] = async () => ({ ...overview(), done: verb, outcome: verb });
  });
  window.__socialShots = { api, schedules, friends, F };
`;

/* The preview's finished picture, as bytes (see the header for the canvas). */
async function readSharePicture(cdp, layout) {
  const info = await run(cdp, `
    const want = ${JSON.stringify(layout)};
    if (want) {
      const input = document.querySelector('.mk-share-layout-input[value="' + want + '"]');
      if (input && !input.checked) input.click();
    }
    const img = await waitFor(() => {
      const node = document.querySelector(".mk-share-picture");
      return node && node.complete && node.naturalWidth && (!want || node.dataset.shareLayout === want) ? node : null;
    }, 60000);
    if (!img) return null;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const toB64 = async (type, q) => {
      const blob = await new Promise((r) => canvas.toBlob(r, type, q));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    };
    let b64 = await toB64("image/png");
    let ext = "png";
    if (b64.length * 0.75 > 600 * 1024) { b64 = await toB64("image/jpeg", 0.9); ext = "jpg"; }
    window.__shareBytes = b64;
    return { ext, len: b64.length, px: img.naturalWidth + "x" + img.naturalHeight };
  `);
  if (!info) throw new Error("the share picture never appeared" + (layout ? " (" + layout + ")" : ""));
  /* In slices: one multi-megabyte CDP reply was measured to drop the socket. */
  let b64 = "";
  for (let i = 0; i < info.len; i += 1_000_000) {
    const part = await cdp.send("Runtime.evaluate", { expression: `window.__shareBytes.slice(${i}, ${i + 1_000_000})`, returnByValue: true });
    b64 += part.result.value;
  }
  return { ...info, bytes: Buffer.from(b64, "base64") };
}

function saveShare(base, picture) {
  const name = `${base}.${picture.ext}`;
  writeFileSync(join(OUT, name), picture.bytes);
  report(name, picture.px, picture.bytes.length);
}

/* ── the steps ───────────────────────────────────────────────────────────── */
async function stepFriends(cdp) {
  await run(cdp, `await home(); ${FAKE_SOCIAL}
    const sheet = window.MakullvenyFriendsSheet.createFriendsSheet({ api: window.__socialShots.api, hooks: {} });
    window.__socialSheet = sheet;
    await sheet.open({}).ready;
    await sleep(1400);
    /* Scrolled to the student's own handle, so all six friends fit under it
       -- and never halfway through a box. */
    const scroll = document.querySelector("#friendsOverlay .friends-scroll");
    const mine = document.querySelector("#friendsOverlay .friends-mine");
    if (scroll && mine) scroll.scrollTop += mine.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;`);
  await shoot(cdp, "friends.jpg", [1600, 1120], 1480);
}

async function stepProfile(cdp) {
  await run(cdp, `
    if (!window.__socialSheet || !window.__socialSheet.isOpen()) { await home(); ${FAKE_SOCIAL}
      window.__socialSheet = window.MakullvenyFriendsSheet.createFriendsSheet({ api: window.__socialShots.api, hooks: {} });
      await window.__socialSheet.open({}).ready; await sleep(900); }
    click('[data-friends-profile="' + window.__socialShots.F.priya.id + '"]');
    await waitFor(() => document.querySelector(".fp-chip"), 6000);
    await sleep(600);
    click(".fp-tile-calendar");
    await waitFor(() => document.querySelector(".fp-overlay .fp-week-block"), 6000);
    await sleep(700);`);
  await shoot(cdp, "friend-profile.jpg", [1600, 1120], 1480);
  await run(cdp, `window.__socialSheet.close(); await sleep(700);`);
}

async function stepJump(cdp) {
  await run(cdp, `await home();
    if (!window.__socialShots) { ${FAKE_SOCIAL} }
    if (!window.MakullvenyFriendCalendar) await window.MakullvenyScriptLoader.loadGroup(["./friendCalendar.js"]);
    state.prefs.friendCalendar = { ...(state.prefs.friendCalendar || {}), version: 1, schedules: window.__socialShots.schedules };
    friendScheduleFriends = window.__socialShots.friends;
    click("#quickAccessRailToggle");
    await waitFor(() => document.querySelector(".qa-friends-item"), 5000);
    await sleep(500);`);
  await shoot(cdp, "friends-in-class.jpg", [1500, 1000], 1240);
  await run(cdp, `click("#quickAccessRailClose"); await sleep(500);`);
}

async function stepShare(cdp) {
  await run(cdp, `await home();
    click('[data-dashboard-open="study-review"]'); await sleep(1200); await clearTheWay();
    click('[data-study-review-tab="courses"]'); await sleep(1500); await clearTheWay();
    click('[data-course-action="share-classes"]');`);
  for (const layout of ["list", "timetable", "cards"]) {
    saveShare(`share-${layout}`, await readSharePicture(cdp, layout));
  }
  /* The picker itself, on List: the one layout whose whole picture fits the
     preview, so the rail and the finished picture are both in the frame. */
  await readSharePicture(cdp, "list");
  await shoot(cdp, "share-picker.jpg", [1600, 1060], 1500);
  await run(cdp, `click("[data-share-image-close]"); await sleep(500);`);
}

async function stepMonth(cdp) {
  await run(cdp, `
    if (document.body.dataset.view !== "study-review") { await home(); click('[data-dashboard-open="study-review"]'); await sleep(1200); }
    await clearTheWay();
    click('[data-study-review-tab="schedule"]'); await sleep(1800); await clearTheWay();
    click(".schedule-home-wk-share");`);
  saveShare("calendar-share", await readSharePicture(cdp, ""));
  await run(cdp, `click("[data-share-image-close]"); await sleep(500);`);
}

const OPEN_LOCK_IN = `await home();
  click("#readyDeskLockInBtn");
  await waitFor(() => document.getElementById("lockInStartBtn"), 6000);`;

async function stepLockIn(cdp) {
  await wake(cdp);
  await run(cdp, `${OPEN_LOCK_IN} await sleep(700);
    /* "Your setup" opened, so its questions show too. */
    const change = [...document.querySelectorAll(".lock-in-sheet button")].find((b) => /^change$/i.test(b.textContent.trim()));
    if (change) change.click();
    await sleep(700);`);
  await shoot(cdp, "lockin.jpg", [1500, 1240], 1400);
  await run(cdp, `const no = [...document.querySelectorAll(".lock-in-sheet button")].find((b) => /^not now$/i.test(b.textContent.trim()));
    if (no) no.click(); await sleep(900);`);
}

/* ── the recording ───────────────────────────────────────────────────────── */
/* 1250 css tall so the open padlock above the sheet is never cut off, even
   with "Your setup" unfolded. */
const FLOW = { css: [1500, 1250], out: [1200, 1000], fps: 15 };

async function stepFlow(cdp, ffmpeg) {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "main"), { recursive: true });
  mkdirSync(join(WORK, "comp"), { recursive: true });
  const scale = FLOW.out[0] / FLOW.css[0];
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: FLOW.css[0], height: FLOW.css[1], deviceScaleFactor: scale, mobile: false });
  /* The study window's two first-run tips (the pin, the notes) are one-off
     overlays, not the feature: marked seen the way the window itself marks
     them (settings.focusCompanionTourSeen, src/renderer.js). */
  await run(cdp, `await home();
    if (state.prefs && state.prefs.settings) state.prefs.settings.focusCompanionTourSeen = true;`);
  await wake(cdp);
  await wait(900);

  /* Main-window frames, each stamped with the compositor's own time. */
  const mainFrames = [];
  cdp.on("Page.screencastFrame", (frame) => {
    mainFrames.push({ t: frame.metadata.timestamp * 1000, data: frame.data });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  const t0 = Date.now();
  /* A heartbeat of real mouse moves keeps the governor awake and the
     compositor producing frames for the whole take. */
  const beat = setInterval(() => { wake(cdp).catch(() => {}); }, 400);
  const mark = {};
  try {
    await wait(700);
    await run(cdp, `click("#readyDeskLockInBtn"); await waitFor(() => document.getElementById("lockInStartBtn"), 6000);`);
    await wait(1100);
    await run(cdp, `const b = [...document.querySelectorAll(".lock-in-sheet button, .lock-in-sheet [role=radio]")].find((n) => /^45\\s*min$/i.test(n.textContent.replace(/\\s+/g, " ").trim()) || n.textContent.replace(/\\s+/g, "").trim() === "45min"); if (b) b.click();`);
    await wait(800);
    await run(cdp, `click("#lockInSetupToggle");`);
    await wait(800);
    await run(cdp, `const paper = [...document.querySelectorAll(".lock-in-sheet label, .lock-in-sheet button, .lock-in-sheet [role=radio]")].find((n) => /real paper/i.test(n.textContent)); if (paper) paper.click();`);
    await wait(800);
    await run(cdp, `click("#lockInSetupToggle");`);
    await wait(700);
    await run(cdp, `click("#lockInStartBtn");`);
    mark.pressed = Date.now() - t0;
    /* The padlock takes 980 ms; the study window is asked for after it. */
    const comp = await findPage(/focusCompanion\.html/i, 80);
    if (!comp) throw new Error("the study window never opened");
    mark.companion = Date.now() - t0;
    await comp.send("Page.enable");
    await comp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 680, deviceScaleFactor: scale, mobile: false });
    await comp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } }).catch(() => {});
    /* Its frames by polling: a small page, ~40 ms a capture. */
    const compFrames = [];
    const until = Date.now() + 2700;
    while (Date.now() < until) {
      const shot = await comp.send("Page.captureScreenshot", { format: "png" });
      compFrames.push({ t: Date.now() - t0, data: shot.data });
      await wait(30);
    }
    mark.end = Date.now() - t0;
    await cdp.send("Page.stopScreencast");
    clearInterval(beat);

    /* The still of the study window, at its real 400x680 shape, 2x. */
    await comp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 680, deviceScaleFactor: 2, mobile: false });
    await wait(900);
    const still = await comp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(WORK, "window.png"), Buffer.from(still.data, "base64"));
    await comp.send("Emulation.clearDeviceMetricsOverride");
    comp.close();

    /* Resample both to a steady FLOW.fps: each output tick takes the latest
       frame at or before it, which is how a screen recorder sees a screen. */
    if (!mainFrames.length) throw new Error("the screencast produced no frames");
    const base = mainFrames[0].t;
    mainFrames.forEach((f) => { f.t -= base; });
    /* The screencast stamps frames in wall-clock seconds; ours are ms from t0. */
    const toOurs = (t) => t + (base - t0);
    /* "No study window yet" is a fully transparent frame the study window's
       size -- one size for the whole sequence, which ffmpeg's image2 wants. */
    const first = Buffer.from(compFrames[0].data, "base64");
    const blank = join(WORK, "blank.png");
    ff(ffmpeg, ["-f", "lavfi", "-i", `color=c=black@0.0:s=${first.readUInt32BE(16)}x${first.readUInt32BE(20)},format=rgba`, "-frames:v", "1", blank], "blank");
    const blankBytes = readFileSync(blank);
    const step = 1000 / FLOW.fps;
    const length = mark.end;
    let mi = 0; let ci = -1; let n = 0;
    for (let t = 0; t <= length; t += step, n += 1) {
      while (mi + 1 < mainFrames.length && toOurs(mainFrames[mi + 1].t) <= t) mi += 1;
      writeFileSync(join(WORK, "main", `f${String(n).padStart(4, "0")}.jpg`), Buffer.from(mainFrames[mi].data, "base64"));
      while (ci + 1 < compFrames.length && compFrames[ci + 1].t <= t) ci += 1;
      const c = ci >= 0 ? compFrames[ci] : null;
      writeFileSync(join(WORK, "comp", `f${String(n).padStart(4, "0")}.png`), c ? Buffer.from(c.data, "base64") : blankBytes);
    }
    mark.frames = n;
    mark.compFrom = Math.max(0, Math.floor(compFrames[0].t / step));
  } finally {
    clearInterval(beat);
    cdp.off("Page.screencastFrame");
    try { await cdp.send("Page.stopScreencast"); } catch {}
    await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  }
  console.log(`  recorded ${mark.frames} frames: Lock In pressed at ${(mark.pressed / 1000).toFixed(1)} s, study window at ${(mark.companion / 1000).toFixed(1)} s`);
  assemble(ffmpeg, mark);
}

function ff(ffmpeg, args, label) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg (${label}) failed: ${result.stderr}`);
}

function assemble(ffmpeg, mark) {
  const scale = FLOW.out[0] / FLOW.css[0];
  const compW = Math.round(400 * scale);
  const compH = Math.round(680 * scale);
  /* main.js focusCompanionPlacement: the right-hand edge, 24 px in,
     vertically centred. */
  const x = FLOW.out[0] - compW - Math.round(24 * scale);
  const y = Math.round((FLOW.out[1] - compH) / 2);
  const fadeAt = (mark.compFrom / FLOW.fps).toFixed(3);
  /* The window casts a soft shadow, as an OS window does; the pixels over it
     are the study window's own. */
  const graph = [
    `[1:v]scale=${compW}:${compH}:flags=lanczos,format=rgba,fade=t=in:st=${fadeAt}:d=0.18:alpha=1,split[win][sh]`,
    `[sh]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.55,pad=${compW + 60}:${compH + 60}:30:30:color=black@0,boxblur=14:2[shadow]`,
    `[0:v]scale=${FLOW.out[0]}:${FLOW.out[1]}:flags=lanczos[bg]`,
    `[bg][shadow]overlay=${x - 30}:${y - 22}[bg2]`,
    `[bg2][win]overlay=${x}:${y},format=yuv420p[v]`
  ].join(";");
  const inputs = ["-framerate", String(FLOW.fps), "-i", join(WORK, "main", "f%04d.jpg"),
    "-framerate", String(FLOW.fps), "-i", join(WORK, "comp", "f%04d.png")];
  const composed = join(WORK, "composed.mp4");
  ff(ffmpeg, [...inputs, "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-an", composed], "compose");

  const mp4 = join(OUT, "lockin-flow.mp4");
  ff(ffmpeg, ["-i", composed, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-an", mp4], "mp4");
  report("lockin-flow.mp4", `${FLOW.out[0]}x${FLOW.out[1]}`, statSync(mp4).size);

  const webm = join(OUT, "lockin-flow.webm");
  ff(ffmpeg, ["-i", composed, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", "-deadline", "good", "-an", webm], "webm");
  report("lockin-flow.webm", `${FLOW.out[0]}x${FLOW.out[1]}`, statSync(webm).size);

  /* The poster: the frame where the study window has just landed beside the
     locked sheet's hand-over -- the whole story in one picture. */
  const poster = join(OUT, "lockin-flow.jpg");
  ff(ffmpeg, ["-sseof", "-0.3", "-i", composed, "-frames:v", "1", "-q:v", "3", poster], "poster");
  report("lockin-flow.jpg", `${FLOW.out[0]}x${FLOW.out[1]}`, statSync(poster).size);

  /* A GIF only if it earns its place: 800 wide, 12 fps, its own palette,
     and kept only when it is 4 MB or less. */
  const gif = join(WORK, "lockin-flow.gif");
  ff(ffmpeg, ["-i", composed, "-vf", "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", gif], "gif");
  const gifSize = statSync(gif).size;
  if (gifSize <= 4 * 1024 * 1024) {
    copyFileSync(gif, join(OUT, "lockin-flow.gif"));
    report("lockin-flow.gif", "800 wide", gifSize);
  } else {
    console.log(`  lockin-flow.gif        skipped -- ${(gifSize / 1048576).toFixed(1)} MB is over 4 MB`);
  }

  /* The study window still: its rounded corners are transparent, and a JPEG
     has no alpha, so it sits on the window's own dark ground. */
  const still = join(OUT, "lockin-window.jpg");
  ff(ffmpeg, ["-f", "lavfi", "-i", "color=c=0x1a130e:s=800x1360", "-i", join(WORK, "window.png"),
    "-filter_complex", "[0:v][1:v]overlay=0:0,format=yuvj444p", "-frames:v", "1", "-q:v", "2", still], "window still");
  report("lockin-window.jpg", "800x1360", statSync(still).size);
}

/* ── the run ─────────────────────────────────────────────────────────────── */
async function main() {
  if (!existsSync(APP)) throw new Error("Cannot find the app checkout at " + APP);
  const appRequire = createRequire(join(APP, "package.json"));
  const ffmpeg = appRequire("ffmpeg-static");

  console.log("Seeding a throwaway preview profile with the demo student...");
  rmSync(SANDBOX, { recursive: true, force: true });
  const seed = spawnSync(process.execPath, [join(APP, "scripts", "preview-demo-data.js"), SANDBOX], {
    cwd: APP, encoding: "utf8", env: { ...process.env, TZ }
  });
  if (seed.status !== 0) throw new Error("preview-demo-data failed: " + (seed.stderr || seed.stdout));
  console.log("  " + (seed.stdout || "").trim());

  /* The electron BINARY, never npx, so the pid held here is Electron's own
     and the tree kill at the end is exact (capture-app-shots.mjs explains). */
  const electron = spawn(
    appRequire("electron"),
    [".", "--makullveny-quiet", `--user-data-dir=${SANDBOX}`, `--remote-debugging-port=${PORT}`],
    { cwd: APP, stdio: "ignore", env: { ...process.env, TZ } }
  );

  let cdp;
  try {
    cdp = await findMainWindow();
    await cdp.send("Page.enable");
    try { await cdp.send("Emulation.setTimezoneOverride", { timezoneId: TZ }); } catch {}
    try { await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }); } catch {}
    const clock = await cdp.send("Runtime.evaluate", {
      expression: `new Date().toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })`, returnByValue: true
    });
    console.log(`  the app's clock reads ${clock.result.value}  (${TZ})`);
    console.log("  letting the launch greeting finish...");
    await wait(6500);
    console.log(`  dismissed: ${await run(cdp, "return await clearTheWay();")}\n`);
    mkdirSync(OUT, { recursive: true });

    const steps = [
      ["friends", () => stepFriends(cdp)],
      ["profile", () => stepProfile(cdp)],
      ["jump", () => stepJump(cdp)],
      ["share", () => stepShare(cdp)],
      ["month", () => stepMonth(cdp)],
      ["lockin", () => stepLockIn(cdp)],
      ["flow", () => (flag("--no-flow") ? null : stepFlow(cdp, ffmpeg))]
    ];
    for (const [id, step] of steps) {
      if (!wanted(id)) continue;
      console.log(id);
      await step();
    }
    console.log(`\nDone. ${written.length} files written to assets/site/.`);
  } finally {
    try { cdp?.close(); } catch {}
    electron.kill();
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(electron.pid)], { stdio: "ignore" });
    }
  }
}

main().catch((error) => {
  console.error("\n" + error.message);
  process.exit(1);
});
