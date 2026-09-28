/*
  Re-shoot the app screenshots this site ships.

      node tools/capture-app-shots.mjs            # every shot
      node tools/capture-app-shots.mjs --list     # what it would take, and where
      node tools/capture-app-shots.mjs dash selah # only shots whose id matches
      node tools/capture-app-shots.mjs --probe    # dump what is on screen, take nothing

  ── WHY IT DRIVES THE REAL APP OVER CDP ────────────────────────────────────
  The obvious approach -- a throwaway Electron script that opens src/index.html
  itself, the way scripts/capture-luke.js does for the Luke sidebar -- cannot
  work for the whole app: the renderer asks the main process for every class,
  assignment and preference over IPC, and a second main process does not have
  those handlers. It would photograph an empty app.

  So this starts the app EXACTLY as a person does (the same `electron .` the
  preview shortcut runs) with `--remote-debugging-port`, and talks to the
  window it opens over the Chrome DevTools Protocol. Nothing in the app is
  modified, stubbed or special-cased; what is photographed is what ships.

  ── WHY THE SIZES COME OUT EXACT, AND SHARP ────────────────────────────────
  `Emulation.setDeviceMetricsOverride` takes a FRACTIONAL deviceScaleFactor, so
  every shot is laid out at 1060 CSS px -- the width the existing hero-dash.jpg
  was taken at, which is what keeps the new pictures looking like the old ones
  -- and rendered at whatever scale lands on the exact pixel size this site
  already declares in its <img width/height>. That is a native render at the
  final size: nothing is resampled afterwards, so nothing is soft. Chromium
  also encodes the JPEG itself, which is why this file needs no image library.

  ── THE DATA IS THE PREVIEW SANDBOX ────────────────────────────────────────
  scripts/preview-demo-data.js in the app repo fills a throwaway profile with a
  believable student's week -- six classes, sixteen assignments, five calendar
  events, built around the day it is run. That is the same fake student the
  owner's own preview shortcut uses. A real profile is never opened: the
  sandbox lives in the system temp folder, is wiped first, and the seeding
  script itself refuses any directory not named mak-preview-*.
*/
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
/* The app checkout. A sibling directory is the common case, but this machine
   keeps the working copy elsewhere and a release shoot wants a worktree on a
   specific tag rather than whatever branch happens to be checked out. MAK_APP
   overrides it; the sibling stays the default so the plain command is short. */
const APP = process.env.MAK_APP || join(SITE, "..", "Makullveny");
/* MAK_SHOTS_OUT sends a trial run somewhere else, so a bad frame is looked
   at and thrown away instead of landing over the good one in the site. */
const OUT = process.env.MAK_SHOTS_OUT || join(SITE, "assets", "site");
const SANDBOX = join(tmpdir(), "mak-preview-siteshots");
const PORT = 9333;

/* The DEFAULT layout width. This is the zoom control, and it is the opposite
   of what it looks like: a SMALLER css width is a MORE zoomed picture, because
   the app lays itself out in a smaller window and then gets scaled up to the
   output size. 1060 was the width the first hero was taken at, and at that
   width the wider screens -- the dashboard with its widget wall, Apps & Tools,
   Courses, the calendar week -- are cropped so tightly you cannot see what the
   screen actually is. Those shots set their own `css` below; the ones that
   were already right keep this. */
const CSS_WIDTH = 1060;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const filters = argv.filter((a) => !a.startsWith("-"));

/* ── THE CLOCK THE PICTURES ARE TAKEN ON ─────────────────────────────────
   The demo week is built around the moment it is seeded, and the dashboard
   reads the moment it is looked at, so a capture run at half past one in the
   morning produces a dashboard that says "Right now: In Intro to Psychology,
   until 1:32 AM". Every word of that is working correctly and none of it is
   how a student's day looks.

   So both halves of the run are moved to the same invented afternoon: the
   seeding script gets a TZ where it is early afternoon, and the app's renderer
   is put in that timezone too. Nothing is faked -- the app is told a timezone
   and does its own honest arithmetic in it -- and the pictures come out the
   same whatever hour the owner happens to run this. --hour changes it. */
const HOUR_ARG = argv.find((a) => a.startsWith("--hour="));
const TARGET_HOUR = HOUR_ARG ? Number(HOUR_ARG.slice(7)) : 13;

function timezoneForHour(hour) {
  const utcHour = new Date().getUTCHours();
  /* Etc/GMT zones have INVERTED signs: Etc/GMT-5 is UTC+5. */
  let offset = ((hour - utcHour) % 24 + 24) % 24;
  if (offset > 12) offset -= 24;
  return offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}
const TZ = timezoneForHour(TARGET_HOUR);

/* ── what to photograph ──────────────────────────────────────────────────
   `to` is every file that receives this shot. Several site images are byte
   for byte the same picture used twice (the hero and the section below it),
   and writing both from one capture is what keeps them that way. */
const SHOTS = [
  {
    id: "dash",
    to: ["hero-dash.jpg"],
    size: [2120, 1340],
    css: 1500,
    what: "the dashboard, Today",
    go: `await go("dashboard"); tab('[data-dashboard-tab="today"]');`
  },
  /* THE WHOLE DESK, not the top of it. This is the tall picture in the
     dashboard section, and the point of it is the widget WALL -- every card
     the reader can rearrange. A 1060-wide window showed the first two rows
     enormously and cut the rest off, which made the one picture that is
     supposed to say "this is all yours to move" say "here is a timer". */
  {
    id: "widgetdash",
    to: ["widgetdash.jpg"],
    size: [1900, 2080],
    css: 1500,
    what: "the dashboard, every widget",
    go: `await go("dashboard"); tab('[data-dashboard-tab="today"]');`
  },
  /* Apps & Tools is the redesigned page: the apps panel on the left, the
     tools on a dotted arc of medallions to the right. At 1500 css the whole
     arc -- Import Desk down to Friends -- fits; rendered at 2120 so the small
     NEW / Beta tags stay crisp. Same shape as the old 1500x958. */
  {
    id: "apps",
    to: ["apps-tools.jpg"],
    size: [2120, 1354],
    css: 1500,
    what: "the dashboard, Apps & Tools",
    go: `await go("dashboard"); tab('[data-dashboard-tab="tools"]');`
  },
  {
    id: "overview",
    to: ["sh-overview.jpg"],
    size: [2120, 1340],
    css: 1500,
    what: "Study Hall, Overview",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="overview"]');`
  },
  /* THE BOARD, LIVED IN. The demo seed files all fourteen open tasks under
     To do, which photographs as one full column and three empty ones. A few
     are moved along first -- through the Stage menu on each row of the All
     assignments table, the control a student uses -- so every column has
     something in it. "This week" rather than "Today", so To do is full too. */
  {
    id: "board",
    to: ["studyhall.jpg"],
    size: [2120, 1340],
    css: 1500,
    what: "Study Hall, the board",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="board"]'); await sleep(900);
         await moveAlong(); window.scrollTo(0, 0); await sleep(300);
         click('[data-action="set-board-scope"][data-scope="week"]'); await sleep(700);`
  },
  /* Where assignments live now: the All assignments table under the Board
     (filters down the left, Class / Due / Stage per row). Reached with the
     "All assignments" card at the top of the Board, the way a student gets
     there. */
  {
    id: "assignments",
    to: ["assignments.jpg"],
    size: [2120, 1340],
    css: 1500,
    what: "Study Hall, All assignments",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="board"]'); await sleep(900);
         await moveAlong(); window.scrollTo(0, 0); await sleep(300);
         [...document.querySelectorAll('#studyReviewPanelBoard [data-action="jump-section"]')]
           .find((b) => /All assignments/.test(b.textContent))?.click();
         await sleep(900);
         /* The jump can also scroll the table inside itself, and lands the
            heading under the nav. Put the table back at its first row and
            the section a little below the nav, so the list starts at Today. */
         const heading = [...document.querySelectorAll("#studyReviewPanelBoard h2, #studyReviewPanelBoard h3")]
           .find((h) => /All assignments/.test(h.textContent));
         const section = heading && heading.closest("section") || heading;
         if (section) {
           section.querySelectorAll("*").forEach((el) => { if (el.scrollTop > 0) el.scrollTop = 0; });
           window.scrollTo(0, scrollY + section.getBoundingClientRect().top - 118);
         }
         await sleep(400);`
  },
  /* Courses and Calendar moved out of Study Hall into their own module,
     Classes (data-dashboard-open="classes"). Same panels, new door. */
  {
    id: "courses",
    to: ["sh-courses.jpg"],
    size: [2120, 1340],
    css: 1560,
    what: "Classes, Courses",
    go: `await go("classes"); await sleep(420); tab('[data-study-review-tab="courses"]');`
  },
  {
    id: "calendar",
    to: ["sh-calendar.jpg"],
    size: [2120, 1340],
    css: 1560,
    what: "Classes, Calendar",
    go: `await go("classes"); await sleep(420); tab('[data-study-review-tab="schedule"]');`
  },
  /* A PHOTO OF INDEX CARDS, READ BY THE APP. The feature is Library Desk's
     "Extract text" (src/imageOcr.js -> logic/localOcr.js): the operating
     system's own OCR, on this computer, nothing uploaded. The photo is a
     page of six handwritten-look index cards rendered by headless Chrome
     from CARD_PHOTO_HTML below -- into the temp folder, never the repo --
     then put on a fresh page through the editor's own Image picker.

     The frame is the sheet the app shows: the words it read, editable, over
     the page with the photo on it. Windows' OCR misreads three words of the
     handwriting ("Hi ocam us" for Hippocampus, "sti((" for still, and it drops
     "cell"); those are fixed in the box, which is exactly what the sheet asks
     for ("fix anything it misread"), and a blank line goes between cards so
     each becomes its own paragraph. */
  {
    id: "photo-cards",
    to: ["importdesk-cards.jpg"],
    size: [2120, 1340],
    css: 1500,
    what: "Library Desk, Extract text from a photo",
    upload: { before: `await photoPage();`, input: "#imageFileInput", file: "cardPhoto" },
    go: `await readPhoto();`
  },
  /* THE CARDS THAT PHOTO MADE. Each paragraph the sheet inserted is
     highlighted and made a card with the editor's Card button, then tidied
     in the Flashcards editor (term as the prompt, the definition as the
     answer, deck "Intro to Psychology") -- the two steps a student takes.
     Needs photo-cards first in the same run; the runner orders it so. */
  {
    id: "cards",
    to: ["flashcards.jpg"],
    size: [2120, 1340],
    css: 1400,
    needs: "photo-cards",
    what: "Study Hall, Flashcards (cards from the photo)",
    go: `await cardsFromPhoto(); await go("study-review"); await sleep(420);
         tab('[data-study-review-tab="flashcards"]'); await sleep(900); await tidyCards();`
  },
  /* Selah's sky IS the clock -- that is the whole point of the place -- so the
     two pictures of it are the same shot taken at two different hours. They
     are tagged with the hour they need, and the runner refuses to take them
     on the wrong one rather than quietly shooting an evening scene at noon.

     AND THE MEADOW HAS PEOPLE ON IT NOW (src/game/selah-villagers.js). They
     arrive about once a minute on their own, so the runner does not wait for
     luck: `villagers` asks the controller's own spawnWalker() -- the same
     spawnOne() the arrival timer calls -- for a few, then photographs the
     meadow every couple of seconds and keeps the frame with the most of them
     out on the grass in clear view (not inside, not under the HUD). */
  {
    id: "selah-am",
    to: ["selah.jpg", "hero-selah-am.jpg"],
    size: [2120, 1340],
    hour: 18,
    villagers: true,
    what: "Selah: Study Grounds, golden hour",
    go: `await go("dashboard"); await toSelah(); await demoIsland(); await clearTheWay();`
  },
  {
    id: "selah-pm",
    to: ["selah-night.jpg", "hero-selah-pm.jpg"],
    size: [2120, 1340],
    hour: 22,
    villagers: true,
    what: "Selah: Study Grounds, night",
    go: `await go("dashboard"); await toSelah(); await demoIsland(); await clearTheWay();`
  },
  // lockin.jpg is owned by tools/capture-social-shots.mjs now (the v2.106 Lock In sheet) -- not shot here.
  /* Import Desk opens INSIDE the app now (view "syllabus"), not in a window
     of its own, so this is an ordinary shot. 1300 css keeps the old picture's
     framing; rendered at 1.5x for sharpness, same shape as the old 1300x952. */
  {
    id: "importdesk",
    to: ["importdesk.jpg"],
    size: [1950, 1428],
    css: 1300,
    what: "Import Desk",
    go: `await go("dashboard"); tab('[data-dashboard-tab="tools"]'); await sleep(520);
         click('[data-dashboard-tool="syllabus"]'); await sleep(900);`
  }
];

/* ── CDP, small and by hand ──────────────────────────────────────────────
   One socket, one id counter, one map of pending replies. A CDP client is
   about thirty lines and a dependency is forever. */
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", (e) => reject(new Error("CDP socket failed: " + (e.message || "error"))));
  });

  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.method + ": " + message.error.message));
      else resolve(message.result);
    }
  });

  return {
    ready,
    close: () => socket.close(),
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

/* The main window is the one page that is NOT a pop-out: tool windows and
   module windows load the very same document, so the URL cannot tell them
   apart -- only the app can, and it says so on <body>. */
async function findMainWindow() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const pages = (await targets()).filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
      for (const page of pages) {
        const cdp = connect(page.webSocketDebuggerUrl);
        try {
          await cdp.ready;
          await cdp.send("Runtime.enable");
          const probe = await cdp.send("Runtime.evaluate", {
            /* app-ready is not the same moment as "there is nothing on top of
               the app". The first paint is covered by a curtain
               (src/firstRunCurtain.js, a frw-curtain class on <html> that
               src/renderer.js takes off) and then by the launch greeting, and
               a capture taken between the two photographs the logo instead of
               the dashboard. Wait for the curtain to lift, and for anything
               still sitting over the page to go. */
            expression: `(() => {
              const b = document.body;
              if (!b) return "";
              if (b.dataset.popoutModule) return "popout";
              if (!b.classList.contains("app-ready")) return "loading";
              if (document.documentElement.classList.contains("frw-curtain")) return "curtain";
              const veil = document.querySelector(".first-run-welcome-curtain, .first-run-welcome");
              if (veil && veil.offsetParent !== null) return "welcome";
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

/* Helpers injected into the page before every navigation snippet. Clicking is
   how the app itself is driven -- main.js's own --visual-test does the same --
   because a view change runs through the same code a person's click does, and
   a view poked into place some other way is a view that was never really
   opened.

   go() always returns to the dashboard first. The app's modules are reached
   from their card there, so "open Study Hall" from inside Library Desk is two
   moves, not one, exactly as it is for a person. */
/* CLEAR THE WAY, BEFORE EVERY SHOT AND NOT JUST ONCE.

   The sandbox is a profile nobody has ever opened, so the app quite rightly
   offers its nine-step guided tour and dims the whole window behind it -- and
   it offers it when a view is first ENTERED, not at launch. Dismissing it once
   after boot therefore clears the dashboard and nothing else: the first Study
   Hall picture comes back as a photograph of the tour. The class bell's toast
   is the same problem in the corner, and it returns on its own schedule.

   Both are real parts of the app, and both are dismissed here the way a
   student dismisses them -- by pressing the control the app provides. */
const CLEAR_THE_WAY = `
  const clearTheWay = async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    /* NOT offsetParent: that is null for every position:fixed element, and the
       class bell's float is fixed -- so it always read as "not there". */
    const seen = (el) => Boolean(el && !el.closest("[hidden]") && el.getClientRects().length &&
      getComputedStyle(el).visibility !== "hidden");
    /* WAKE THE POWER GOVERNOR. 90 s without input adds body.power-idle
       (src/appRuntime.js), which PAUSES every animation -- including the
       fade a Study Hall tab comes in on, so the panel photographs at
       opacity 0: an empty room. The governor wakes on any pointermove. */
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await sleep(60);
    const gone = [];
    for (let pass = 0; pass < 8; pass += 1) {
      const skip = document.getElementById("onboardingSkipBtn");
      if (seen(skip)) { skip.click(); gone.push("tour"); await sleep(650); continue; }
      /* What's New waits for the tour to clear (src/whatsNew.js
         presentWhenClear), so it is only there on the pass AFTER the skip. */
      const gotIt = document.getElementById("whatsNewGotItBtn");
      if (seen(gotIt)) { gotIt.click(); gone.push("what's new"); await sleep(500); continue; }
      /* Its OWN close, by class. The old "button[aria-label]" matched the
         bell's body first -- itself a button -- and that opens the class. */
      const bell = document.getElementById("classBellFloat") || document.getElementById("classBellBar");
      const close = bell && bell.querySelector(".class-bell-close");
      if (seen(bell) && seen(close)) { close.click(); gone.push("class bell"); await sleep(320); continue; }
      /* "Thank you for testing" -- the tester notice in the top-left corner. */
      const dev = [...document.querySelectorAll(".dev-notice-close")].find(seen);
      if (dev) { dev.click(); gone.push("tester notice"); await sleep(320); continue; }
      /* Selah's own welcome, button tour and first steps: all three wear
         .selah-welcome-skip (src/game/selah-guide.js). The tour comes up a
         beat AFTER the welcome is skipped, so it is caught here, not once. */
      const selahSkip = [...document.querySelectorAll(".selah-welcome-skip")].find(seen);
      if (selahSkip) { selahSkip.click(); gone.push("selah guide"); await sleep(600); continue; }
      /* The in-app notice stack ("Want a nudge before class?"), bottom centre. */
      const notice = [...document.querySelectorAll("#inAppNoticeStack .mk-notice-close")].find(seen);
      if (notice) { notice.click(); gone.push("notice"); await sleep(420); continue; }
      break;
    }
    /* THE RADIO DOCK IS NOT PART OF THE SCREEN BEING PHOTOGRAPHED. It is
       fixed to the bottom of the window, so it lands in every shot -- and
       because the frame ends where the picture ends rather than where the
       dock does, it arrives as a pale half-panel hanging off the bottom
       edge that reads as a rendering fault. The site photographs the radio
       properly in its own section; here it just gets out of the way.
       Hidden, not clicked shut: closing it is a preference the app would
       then remember for the rest of the run. */
    const dock = document.getElementById("globalRadioDock");
    if (dock && dock.style.visibility !== "hidden") {
      dock.style.visibility = "hidden";
      gone.push("radio dock");
    }
    /* Anything else still FIXED over the frame is in the picture whether it
       was asked for or not. Reported by name so the next person does not
       have to guess from a JPEG what the pale shape was. */
    const stuck = [...document.querySelectorAll("body *")].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.visibility === "hidden") return false;
      if (parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 24) return false;
      return r.bottom > innerHeight - 220 && r.top < innerHeight;
    }).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
      (el.className ? "." + String(el.className).trim().split(/\s+/).slice(0, 3).join(".") : ""));
    if (stuck.length) gone.push("STILL FIXED AT THE BOTTOM: " + [...new Set(stuck)].slice(0, 4).join(" | "));
    return gone.length ? [...new Set(gone)].join(", ") : "nothing in the way";
  };
`;

const HELPERS = CLEAR_THE_WAY + `
  /* SELAH IS NOT A VIEW, IT IS THE PANEL NEXT DOOR.

     The study grounds and the dashboard are two 1433px panels of one
     .selah-track inside .app-shell, Selah first. body.dataset.view never
     changes between them -- which is why clicking .selah-sign did nothing
     useful (read the class list: selah-RETURN, it is the way back) and why
     every "Selah" capture came out as another photograph of the dashboard.

     The track is moved with a transform rather than scrolled, so scrollLeft
     reports 0 while the scene sits 1433px off to the left. Moving it is
     therefore a style change, not a scroll, and the transition is turned off
     first so the shot is not taken mid-slide. */
  const toSelah = async () => {
    /* The app's own doorway. Moving .selah-track by hand does slide the scene
       into view, but the HUD -- the level, the coins, Ready to Focus, the shop
       and the mailbox -- stays hidden, because the app does not think anybody
       went to Selah. A picture of the world without its HUD is a picture of
       the wallpaper. Selah.open() is what the visit button calls. */
    if (window.Selah && typeof window.Selah.open === "function") {
      window.Selah.open();
      await sleep(3200);
      /* First visit to the Grounds puts a four-page "Welcome to Selah" card
         over the whole world. Skip it the way a returning student would. */
      for (let pass = 0; pass < 4; pass += 1) {
        const skip = [...document.querySelectorAll("button, a")].find(
          (el) => el.offsetParent !== null && /^(skip|close|done)$/i.test((el.textContent || "").trim())
        );
        if (!skip) break;
        skip.click();
        await sleep(600);
      }
      await sleep(1600);
      const hud = document.querySelector(".selah-hud");
      return hud && hud.offsetParent !== null ? "selah, HUD up" : "selah, no HUD";
    }
    return "no Selah api";
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (sel) => { const el = document.querySelector(sel); if (el) { el.click(); return true; } return false; };
  const tab = click;
  const go = async (view) => {
    if (document.body.dataset.view !== "dashboard") {
      document.getElementById("cabinLogoBtn")?.click();
      await sleep(420);
    }
    if (view === "dashboard") return "dashboard";
    if (!click('[data-dashboard-open="' + view + '"]')) {
      click('[data-dashboard-tab="tools"]');
      await sleep(320);
      if (!click('[data-dashboard-open="' + view + '"]')) return "missing:" + view;
    }
    await sleep(760);
    /* Every view starts at the top. The page scroll is the window's, and it
       carries over between views -- an Overview taken after a scrolled page
       came out with its heading under the nav. */
    window.scrollTo(0, 0);
    await sleep(200);
    return document.body.dataset.view;
  };

  /* Typing, the way the page receives it: execCommand fires the same input
     events a keyboard does, so the app saves it like anything typed. */
  const typeInto = (el, text) => {
    el.focus();
    if (typeof el.select === "function") el.select();
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  /* MOVE A FEW TASKS ALONG, through each row's Stage menu in the All
     assignments table (src/assignmentManager.js, data-list-field="column").
     Idempotent: a row already in place is left alone, so the Board shot and
     the assignments shot can both call it. */
  const moveAlong = async () => {
    const want = { "Problem set 4": "started", "Section 2.3 exercises": "started",
      "Reading reflection 2": "almost", "Discussion post": "done" };
    let moved = 0;
    for (const [title, value] of Object.entries(want)) {
      const row = [...document.querySelectorAll(".assignment-manager-row")]
        .find((r) => (r.textContent || "").includes(title));
      const stage = row && row.querySelector('select[data-list-field="column"]');
      if (!stage || stage.value === value) continue;
      stage.value = value;
      stage.dispatchEvent(new Event("change", { bubbles: true }));
      moved += 1;
      await sleep(500);
    }
    /* Finishing one raises a toast; it runs itself out. */
    if (moved) await sleep(4500);
    return moved;
  };

  /* The six terms on the photo, in the order Windows' OCR reads them. */
  const CARD_TERMS = ["Classical conditioning", "Cognitive dissonance", "Nature vs. nurture",
    "Hippocampus", "Placebo", "Neuron"];

  /* A fresh Library Desk page for the photo. New page opens Page setup, which
     is where a page is named -- and the name is what the cards file under. */
  const photoPage = async () => {
    await go("home"); await sleep(1500); await clearTheWay();
    click("#newPageBtn"); await sleep(1200);
    const title = document.getElementById("pageTitleInput");
    if (title && title.getClientRects().length) { typeInto(title, "PSY 100 flashcards"); await sleep(300); }
    click("#pageSettingsCloseBtn"); await sleep(500);
    await clearTheWay();
    const editor = document.getElementById("editor");
    editor.focus();
    const sel = getSelection(); sel.selectAllChildren(editor); sel.collapseToEnd();
    document.execCommand("formatBlock", false, "h2");
    document.execCommand("insertText", false, "PSY 100 flashcards");
    document.execCommand("insertParagraph");
    document.execCommand("formatBlock", false, "p");
    document.execCommand("insertText", false, "Photo of my index cards from Friday.");
    document.execCommand("insertParagraph");
    await sleep(300);
    return "page ready";
  };

  /* The picture is on the page (the runner handed the Image picker the
     file). Widen it with the picture's own Width slider, then press Extract
     text and wait for the local engine. */
  const readPhoto = async () => {
    await sleep(1500);
    const img = document.querySelector("#editor img.note-image");
    if (!img) return "no picture on the page";
    img.click(); await sleep(700);
    const width = document.getElementById("imageWidthRange");
    if (width) {
      width.value = "640";
      width.dispatchEvent(new Event("input", { bubbles: true }));
      width.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(400);
    }
    document.getElementById("imageExtractTextBtn")?.click();
    let box = null;
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      box = document.querySelector(".image-ocr-card textarea");
      if (box && box.value) break;
    }
    if (!box || !box.value) return "the OCR sheet came back empty";
    /* The student's fixes (see the shot's comment), then a blank line
       before each card after the first. */
    let text = box.value.replace("A that sends signa(s", "A cell that sends signals")
      .replace("Hi ocam us", "Hippocampus").replace("sti((", "still");
    for (const term of CARD_TERMS) text = text.replace("\\n" + term + "\\n", "\\n\\n" + term + "\\n");
    typeInto(box, text);
    box.setSelectionRange(0, 0); box.scrollTop = 0;
    await sleep(400);
    return "read " + text.split("\\n\\n").length + " cards";
  };

  /* Insert below image, then one card per paragraph with the Card button. */
  const cardsFromPhoto = async () => {
    const insert = document.querySelector(".image-ocr-card [data-ocr-insert]");
    if (insert && insert.getClientRects().length) { insert.click(); await sleep(900); }
    const editor = document.getElementById("editor");
    if (!editor) return 0;
    const paras = [...editor.querySelectorAll("p")].filter((p) => !p.querySelector("img") && p.querySelector("br"));
    for (const p of paras) {
      editor.focus();
      const sel = getSelection(); sel.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(p); sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await sleep(300);
      click("#makeFlashcardBtn");
      await sleep(700);
    }
    getSelection().removeAllRanges();
    await sleep(3500);
    return paras.length;
  };

  /* A card made from a selection keeps the whole paragraph as its answer.
     The Flashcards editor is where a student splits it: term up front,
     definition behind, and a deck named for the class. */
  const tidyCards = async () => {
    const $ = (id) => document.getElementById(id);
    if (!$("flashcardMenuBtn")) return 0;
    $("flashcardAllBtn")?.click(); await sleep(500);
    const count = Number($("flashcardCount")?.textContent) || 0;
    let tidied = 0;
    for (let i = 0; i < count; i += 1) {
      $("flashcardMenuBtn").click(); await sleep(250);
      $("flashcardEditBtn").click(); await sleep(400);
      const back = $("flashcardBackInput").value.trim();
      const term = CARD_TERMS.find((t) => back.startsWith(t) && back.length > t.length + 2);
      if (term) {
        typeInto($("flashcardDeckInput"), "Intro to Psychology");
        typeInto($("flashcardFrontInput"), term);
        typeInto($("flashcardBackInput"), back.slice(term.length).trim());
        $("flashcardSaveEditBtn").click(); tidied += 1;
        await sleep(700);
      } else {
        $("flashcardCancelEditBtn").click(); await sleep(300);
      }
      $("flashcardNextBtn").click(); await sleep(500);
    }
    $("flashcardDueBtn")?.click();
    await sleep(3800);
    return tidied;
  };

  /* A SANDBOX ISLAND A FEW WEEKS IN. A fresh profile is a stage-1 cabin and
     level 1; the library the site is about needs 40,000 lifetime coins
     (stage 3, about twenty hours of focus). SelahState.adoptSave is the door
     the cloud mirror comes in by -- migrate, validate, normalise, persist --
     so the island that results is one the app itself accepts, HUD and
     meadow and door tiles and all. The sandbox only: this is a throwaway
     profile. */
  const demoIsland = async () => {
    const state = window.SelahState;
    if (!state || typeof state.adoptSave !== "function" || !state.getSave()) return "no Selah state";
    const save = JSON.parse(JSON.stringify(state.getSave()));
    delete save.persistError; delete save.CONFIG;
    Object.assign(save, { lifetime: 48000, coins: 8520, diamonds: 12, stage: 3,
      streak: { current: 6, longest: 11 } });
    save.xp = { ...save.xp, total: 1545 };
    state.adoptSave(save);
    await sleep(2500);
    return "island at stage " + state.getSave().stage;
  };

  /* How many villagers are out on the grass, in clear view -- not inside,
     not stepping through the door, not under the HUD's panels. Stage px
     (SelahScene.GRID) mapped through .selah-stage's own transform. */
  const villagersInView = () => {
    const v = window.Selah?.getModules?.()?.villagers;
    const stage = document.querySelector(".selah-stage");
    if (!v || !stage) return { score: 0, what: "no meadow" };
    const box = stage.getBoundingClientRect();
    const k = box.width / stage.offsetWidth;
    const out = v.getWalkers().filter((w) => !/^(inside|enter|exit)$/.test(w.mode)).map((w) => {
      const x = box.left + w.x * k, y = box.top + w.y * k;
      const body = document.elementFromPoint(x, y - 14 * k);
      const clear = x > 30 && x < innerWidth - 30 && y > 140 && y < innerHeight - 20 &&
        !(body && body.closest(".selah-hud"));
      return { mode: w.mode, clear };
    });
    const clear = out.filter((w) => w.clear);
    return { score: clear.length + 0.5 * clear.filter((w) => w.mode === "pause").length,
      what: out.map((w) => w.mode + (w.clear ? "" : "(hidden)")).join(" ") || "nobody out" };
  };
`;


/* A tool window is a second page in the same Electron process, loading the
   same document with a pop-out id stamped on <body>. It appears a beat after
   its card is pressed, so this waits for it rather than assuming. */
async function findToolWindow(toolId, alreadyOpen) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(400);
    let pages = [];
    try { pages = (await targets()).filter((t) => t.type === "page" && t.webSocketDebuggerUrl); }
    catch { continue; }
    for (const page of pages) {
      if (alreadyOpen.has(page.id)) continue;
      const cdp = connect(page.webSocketDebuggerUrl);
      try {
        await cdp.ready;
        await cdp.send("Runtime.enable");
        const probe = await cdp.send("Runtime.evaluate", {
          expression: `[location.pathname, document.body ? (document.body.dataset.popoutModule || document.body.dataset.toolId || "") : ""].join("|")`,
          returnByValue: true
        });
        const seen = String(probe.result.value || "");
        if (/toolWindow\.html/i.test(seen) || seen.split("|")[1]) return cdp;
        cdp.close();
      } catch { cdp.close(); }
    }
  }
  throw new Error("the " + toolId + " window never appeared");
}

/* ── THE PHOTO OF INDEX CARDS ────────────────────────────────────────────
   Six ruled index cards on a desk, in Segoe Print, which Windows' own OCR
   reads nearly clean (Ink Free, tried too, came back as noise). Drawn by
   headless Chrome or Edge into the temp folder -- never into the repo, and
   never shown in the app except as the picture a student would add. */
const CARD_PHOTO_HTML = `<!doctype html><html><head><style>
html,body{margin:0;width:1600px;height:880px;overflow:hidden}
body{background:radial-gradient(ellipse at 30% 20%,rgba(255,230,190,.35),transparent 60%),
 repeating-linear-gradient(92deg,#7a5230 0 14px,#6f4a2a 14px 30px,#825a36 30px 41px,#6a4527 41px 60px);
 font-family:"Segoe Print","Ink Free",cursive}
.grid{position:absolute;inset:56px 64px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:46px 44px}
.card{border-radius:6px;box-shadow:0 10px 22px rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.3);
 background:linear-gradient(#fbf8ef 0 62px,#e0625e 62px 64px,transparent 64px),repeating-linear-gradient(#fbf8ef 0 42px,#9dc0df 42px 43.5px);
 padding:10px 26px 20px;box-sizing:border-box;color:#1d2a52}
.card h2{margin:4px 0 20px;font-size:34px;line-height:48px;font-weight:700}
.card p{margin:0;font-size:27px;line-height:43px}
.c1{transform:rotate(-1.6deg)}.c2{transform:rotate(1.1deg)}.c3{transform:rotate(-.6deg)}
.c4{transform:rotate(.9deg)}.c5{transform:rotate(-1.2deg)}.c6{transform:rotate(1.5deg)}
</style></head><body><div class="grid">
<div class="card c1"><h2>Neuron</h2><p>A cell that sends signals through the nervous system.</p></div>
<div class="card c2"><h2>Hippocampus</h2><p>The part of the brain that helps form new memories.</p></div>
<div class="card c3"><h2>Placebo</h2><p>A fake treatment that can still make people feel better.</p></div>
<div class="card c4"><h2>Classical conditioning</h2><p>Learning by pairing two stimuli together.</p></div>
<div class="card c5"><h2>Cognitive dissonance</h2><p>Discomfort from holding two beliefs that conflict.</p></div>
<div class="card c6"><h2>Nature vs. nurture</h2><p>Genes versus environment in shaping who we are.</p></div>
</div></body></html>`;

let cardPhotoPath;
function cardPhotoFile() {
  if (cardPhotoPath !== undefined) return cardPhotoPath;
  cardPhotoPath = "";
  const browsers = [process.env.MAK_CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
  const browser = browsers.find((b) => existsSync(b));
  if (!browser) return cardPhotoPath;
  const dir = join(tmpdir(), "mak-siteshots-card-photo");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cards.html"), CARD_PHOTO_HTML);
  const png = join(dir, "index-cards.png");
  spawnSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`,
    "--window-size=1600,880", `--screenshot=${png}`, "file:///" + join(dir, "cards.html").replace(/\\/g, "/")],
    { stdio: "ignore", timeout: 60000 });
  if (existsSync(png)) cardPhotoPath = png;
  return cardPhotoPath;
}

async function run() {
  if (!existsSync(APP)) throw new Error("Cannot find the app checkout at " + APP);

  console.log("Seeding a throwaway preview profile with the demo student...");
  rmSync(SANDBOX, { recursive: true, force: true });
  const seed = spawnSync(process.execPath, [join(APP, "scripts", "preview-demo-data.js"), SANDBOX], {
    cwd: APP, encoding: "utf8", env: { ...process.env, TZ }
  });
  if (seed.status !== 0) throw new Error("preview-demo-data failed: " + (seed.stderr || seed.stdout));
  console.log("  " + (seed.stdout || "").trim());

  /* THE CLASS NAME ON EACH ASSIGNMENT. The demo seed files every card under
     a courseId but leaves classTitle empty -- and the card face and the All
     assignments table read classTitle, so every Class cell came out "—".
     This writes the one field the app itself writes when a student picks a
     class in the card editor (src/studyHallBoard.js: classTitle = the
     course's name), through the app's own prefs module, in the sandbox only. */
  const prefsStore = createRequire(join(APP, "package.json"))("./logic/preferences.js");
  const prefs = prefsStore.readPrefs(SANDBOX);
  const courseName = new Map((prefs.courses?.items || []).map((c) => [c.id, c.name]));
  for (const card of prefs.studyHallBoard?.cards || []) {
    if (!card.classTitle && courseName.has(card.courseId)) card.classTitle = courseName.get(card.courseId);
  }
  prefsStore.writePrefs(SANDBOX, prefs);

  /* The electron BINARY, not `npx electron`. Through npx the pid this script
     holds is the npx wrapper's, so killing it at the end leaves the real
     Electron -- and its renderers -- running, holding a lock on the sandbox
     that makes the NEXT run fail. Worse, the only way out then is killing
     Electron by name, which also closes whatever else the owner had open.
     Spawned directly, the pid is Electron's own and the tree kill below is
     exact. */
  console.log("Starting the app with the debugger open...");
  const electronBinary = createRequire(join(APP, "package.json"))("electron");
  const electron = spawn(
    electronBinary,
    // --makullveny-quiet (app v2.97.0+): the window stays off-screen, off the
    // taskbar and never takes focus, so a capture run does not take over the
    // owner's screen. CDP screenshots are unaffected.
    [".", "--makullveny-quiet", `--user-data-dir=${SANDBOX}`, `--remote-debugging-port=${PORT}`],
    { cwd: APP, stdio: "ignore", env: { ...process.env, TZ } }
  );

  let cdp;
  try {
    cdp = await findMainWindow();
    console.log("  connected to the main window.");
    await cdp.send("Page.enable");
    /* The launch greeting -- the mark, the app's name and the weekday, over a
       dimmed dashboard -- runs itself out rather than answering a query, so
       this is a plain wait. It is the difference between a screenshot of the
       app and a screenshot of its opening title card. */
    /* The env var covers the seeding and, on most platforms, Electron itself;
       this covers the renderer where it does not. Belt and braces, because a
       disagreement between the two is the exact bug this is here to prevent. */
    try { await cdp.send("Emulation.setTimezoneOverride", { timezoneId: TZ }); } catch {}
    const clock = await cdp.send("Runtime.evaluate", {
      expression: `new Date().toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })`,
      returnByValue: true
    });
    console.log(`  the app's clock reads ${clock.result.value}  (${TZ})`);
    console.log("  letting the launch greeting finish...");
    await wait(6000);

    const cleared = await cdp.send("Runtime.evaluate", {
      expression: `(async () => { ${CLEAR_THE_WAY} return await clearTheWay(); })()`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log(`  dismissed: ${cleared.result.value}\n`);

    if (flag("--probe")) {
      const report = await cdp.send("Runtime.evaluate", {
        expression: `(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const id = (el) => el ? el.tagName.toLowerCase()+(el.id?"#"+el.id:"")+(el.className?"."+String(el.className).trim().split(/\s+/).join("."):"") : null;
          const out = { probes: [] };
          // The little cabin handle sits on the left edge, a third of the way down.
          for (const [x, y] of [[20,300],[24,315],[30,330],[40,300],[18,280]]) {
            const el = document.elementFromPoint(x, y);
            out.probes.push({ at: [x,y], el: id(el), parent: id(el && el.parentElement) });
          }
          const track = document.querySelector(".selah-track");
          out.track = track ? { scrollLeft: track.scrollLeft, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth,
            children: [...track.children].map((c) => id(c) + " @" + Math.round(c.offsetLeft) + " w" + Math.round(c.offsetWidth)) } : null;
          // Try the handle we just found, then report whether the scene arrived.
          const handle = document.elementFromPoint(24, 315);
          if (handle) { handle.click(); await sleep(2800); }
          const scene = document.querySelector(".selah-scene");
          out.afterHandleClick = { sceneLeft: scene ? Math.round(scene.getBoundingClientRect().left) : null,
            trackScrollLeft: track ? track.scrollLeft : null };
          return JSON.stringify(out, null, 1);
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log(report.result.value);
      return;
    }

    /* A shot that `needs` another runs after it, and pulls it in when only
       the dependant was asked for: the Flashcards picture is of the cards the
       photo shot made, and without it the deck is empty. */
    let chosen = filters.length
      ? SHOTS.filter((s) => filters.some((f) => s.id.includes(f) || s.to.join(" ").includes(f)))
      : SHOTS.slice();
    for (const shot of chosen.slice()) {
      const need = shot.needs && SHOTS.find((s) => s.id === shot.needs);
      if (need && !chosen.includes(need)) chosen.splice(chosen.indexOf(shot), 0, need);
    }

    mkdirSync(OUT, { recursive: true });
    const openPageIds = new Set((await targets()).map((t) => t.id));
    const evaluate = async (target, expression) => {
      const r = await target.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").split("\n")[0]);
      return r.result.value;
    };
    const inPage = (body) => `(async () => { ${HELPERS} ${body} })()`;

    for (const shot of chosen) {
      if (shot.hour !== undefined && shot.hour !== TARGET_HOUR) {
        console.log(`${shot.id.padEnd(10)} skipped -- needs --hour=${shot.hour}, this run is --hour=${TARGET_HOUR}`);
        continue;
      }
      const [width, height] = shot.size;
      const cssWidth = shot.css || CSS_WIDTH;
      const cssHeight = Math.round((cssWidth * height) / width);
      const scale = width / cssWidth;

      process.stdout.write(`${shot.id.padEnd(11)} ${shot.what.padEnd(44)}`);

      /* A FILE FOR A PICKER. A page cannot fill an <input type=file> itself
         -- that is the browser keeping pages honest -- so the runner does it
         with DOM.setFileInputFiles, which is the file a person would choose
         in the dialog, and the app's own change handler takes it from there. */
      if (shot.upload) {
        const file = shot.upload.file === "cardPhoto" ? cardPhotoFile() : shot.upload.file;
        if (!file) { console.log("skipped -- no headless Chrome/Edge to draw the photo"); continue; }
        await evaluate(cdp, inPage(`${shot.upload.before} return true;`));
        const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: shot.upload.input });
        if (!nodeId) throw new Error(shot.id + ": no " + shot.upload.input + " on the page");
        await cdp.send("DOM.setFileInputFiles", { nodeId, files: [file] });
      }

      await evaluate(cdp, inPage(`${shot.go} await sleep(900); await clearTheWay(); return document.body.dataset.view;`));

      /* A tool's card opens a window of its own, so the page to photograph is
         one this connection knows nothing about yet. (No shot here does that
         any more -- Import Desk moved inside the app -- but the Backpack and
         others still can.) */
      let target = cdp;
      if (shot.tool) {
        target = await findToolWindow(shot.tool, openPageIds);
        await target.send("Page.enable");
        await wait(1200);
        await evaluate(target, `(async () => { ${CLEAR_THE_WAY} return await clearTheWay(); })()`);
      }

      /* Metrics AFTER the navigation: several views measure themselves on the
         way in, and a size change mid-transition leaves a half-laid-out card. */
      await target.send("Emulation.setDeviceMetricsOverride", {
        width: cssWidth, height: cssHeight, deviceScaleFactor: scale, mobile: false
      });
      /* Long enough for the reveal animations and any image in the view. */
      await wait(1400);

      const capture = async () => Buffer.from((await target.send("Page.captureScreenshot", {
        format: "jpeg", quality: 90, captureBeyondViewport: false
      })).data, "base64");

      let bytes;
      let note = "";
      if (shot.villagers) {
        /* A few arrivals, a few seconds apart so they do not all step out of
           the same tree, then the best of a run of frames. */
        await evaluate(target, inPage(`const v = window.Selah.getModules().villagers;
          for (let i = 0; i < 3; i += 1) { v.spawnWalker(); await sleep(3500); } return true;`));
        let best = { score: -1 };
        const keep = process.env.MAK_SHOTS_CANDIDATES;
        if (keep) mkdirSync(keep, { recursive: true });
        for (let frame = 0; frame < 18; frame += 1) {
          await evaluate(target, inPage(`await clearTheWay(); return true;`));
          const seen = await evaluate(target, inPage(`return villagersInView();`));
          const shotBytes = await capture();
          if (keep) writeFileSync(join(keep, `${shot.id}-${String(frame).padStart(2, "0")}.jpg`), shotBytes);
          if (seen.score > best.score) best = { ...seen, bytes: shotBytes, frame };
          if (best.score >= 3.5) break;
          await wait(2200);
        }
        bytes = best.bytes;
        note = `  [frame ${best.frame}: ${best.what}]`;
      } else {
        bytes = await capture();
      }

      for (const name of shot.to) writeFileSync(join(OUT, name), bytes);
      await target.send("Emulation.clearDeviceMetricsOverride");
      if (shot.tool) { try { target.close(); } catch {} }

      console.log(`${width}x${height}  ${(bytes.length / 1024).toFixed(0)} KB  -> ${shot.to.join(", ")}${note}`);
    }

    console.log("\nDone. " + chosen.length + " shots written to " + OUT + ".");
  } finally {
    try { cdp?.close(); } catch {}
    electron.kill();
    /* Electron on Windows leaves the renderer behind when the parent is killed. */
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(electron.pid)], { stdio: "ignore" });
    }
  }
}

if (flag("--list")) {
  for (const shot of SHOTS) {
    console.log(`${shot.id.padEnd(9)} ${String(shot.size.join("x")).padEnd(10)} ${shot.what.padEnd(34)} -> ${shot.to.join(", ")}`);
  }
} else {
  run().catch((error) => {
    console.error("\n" + error.message);
    process.exit(1);
  });
}
