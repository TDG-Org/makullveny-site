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
const APP = join(SITE, "..", "Makullveny");
const OUT = join(SITE, "assets", "site");
const SANDBOX = join(tmpdir(), "mak-preview-siteshots");
const PORT = 9333;

/* Every shot lays out at this width, so the app looks like the same app from
   one picture to the next. It is the width the current hero was taken at. */
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
    what: "the dashboard, Today",
    go: `await go("dashboard"); tab('[data-dashboard-tab="today"]');`
  },
  {
    id: "apps",
    to: ["apps-tools.jpg"],
    size: [1500, 958],
    what: "the dashboard, Apps & Tools",
    go: `await go("dashboard"); tab('[data-dashboard-tab="tools"]');`
  },
  {
    id: "board",
    to: ["studyhall.jpg"],
    size: [2120, 1340],
    what: "Study Hall, the board",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="board"]');`
  },
  {
    id: "overview",
    to: ["sh-overview.jpg"],
    size: [1600, 1011],
    what: "Study Hall, Overview",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="overview"]');`
  },
  {
    id: "courses",
    to: ["sh-courses.jpg"],
    size: [2120, 1340],
    what: "Study Hall, Courses (new)",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="courses"]');`
  },
  {
    id: "calendar",
    to: ["sh-calendar.jpg"],
    size: [2120, 1340],
    what: "Study Hall, Calendar (new)",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="schedule"]');`
  },
  {
    id: "cards",
    to: ["flashcards.jpg"],
    size: [1500, 948],
    what: "Study Hall, Flashcards",
    go: `await go("study-review"); await sleep(420); tab('[data-study-review-tab="flashcards"]');`
  },
  /* Selah's sky IS the clock -- that is the whole point of the place -- so the
     two pictures of it are the same shot taken at two different hours. They
     are tagged with the hour they need, and the runner refuses to take them
     on the wrong one rather than quietly shooting an evening scene at noon. */
  {
    id: "selah-am",
    to: ["selah.jpg", "hero-selah-am.jpg"],
    size: [2120, 1340],
    hour: 18,
    what: "Selah: Study Grounds, golden hour",
    go: `await go("dashboard"); await toSelah();`
  },
  {
    id: "selah-pm",
    to: ["selah-night.jpg", "hero-selah-pm.jpg"],
    size: [2120, 1340],
    hour: 22,
    what: "Selah: Study Grounds, night",
    go: `await go("dashboard"); await toSelah();`
  },
  {
    id: "lockin",
    to: ["lockin.jpg"],
    size: [1500, 1118],
    what: "Lock In, the focus timer",
    go: `await go("dashboard"); click("#quickAccessFocusCard, [data-qa-focus='start']"); await sleep(1400);`
  },
  /* A tool opens its OWN window. `tool` tells the runner to go looking for a
     second page once the card is pressed, instead of photographing the
     dashboard the card was on. */
  {
    id: "importdesk",
    to: ["importdesk.jpg"],
    size: [1300, 952],
    tool: "syllabus",
    what: "Import Desk (its own window)",
    go: `await go("dashboard"); tab('[data-dashboard-tab="tools"]'); await sleep(520);
         click('[data-dashboard-tool="syllabus"]');`
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
    const seen = (el) => el && el.offsetParent !== null;
    const gone = [];
    for (let pass = 0; pass < 3; pass += 1) {
      const skip = document.getElementById("onboardingSkipBtn");
      if (seen(skip)) { skip.click(); gone.push("tour"); await sleep(650); continue; }
      const bell = document.getElementById("classBellFloat") || document.getElementById("classBellBar");
      const close = bell && bell.querySelector("button[aria-label], .class-bell-dismiss, button:last-child");
      if (seen(bell) && close) { close.click(); gone.push("class bell"); await sleep(320); continue; }
      break;
    }
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
    return document.body.dataset.view;
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

async function run() {
  if (!existsSync(APP)) throw new Error("Cannot find the app checkout at " + APP);

  console.log("Seeding a throwaway preview profile with the demo student...");
  rmSync(SANDBOX, { recursive: true, force: true });
  const seed = spawnSync(process.execPath, [join(APP, "scripts", "preview-demo-data.js"), SANDBOX], {
    cwd: APP, encoding: "utf8", env: { ...process.env, TZ }
  });
  if (seed.status !== 0) throw new Error("preview-demo-data failed: " + (seed.stderr || seed.stdout));
  console.log("  " + (seed.stdout || "").trim());

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
    [".", `--user-data-dir=${SANDBOX}`, `--remote-debugging-port=${PORT}`],
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

    const chosen = filters.length
      ? SHOTS.filter((s) => filters.some((f) => s.id.includes(f) || s.to.join(" ").includes(f)))
      : SHOTS;

    mkdirSync(OUT, { recursive: true });
    const openPageIds = new Set((await targets()).map((t) => t.id));

    for (const shot of chosen) {
      if (shot.hour !== undefined && shot.hour !== TARGET_HOUR) {
        console.log(`${shot.id.padEnd(10)} skipped -- needs --hour=${shot.hour}, this run is --hour=${TARGET_HOUR}`);
        continue;
      }
      const [width, height] = shot.size;
      const cssHeight = Math.round((CSS_WIDTH * height) / width);
      const scale = width / CSS_WIDTH;

      process.stdout.write(`${shot.id.padEnd(9)} ${shot.what.padEnd(34)}`);

      await cdp.send("Runtime.evaluate", {
        expression: `(async () => { ${HELPERS} ${shot.go} await sleep(900); await clearTheWay(); return document.body.dataset.view; })()`,
        awaitPromise: true,
        returnByValue: true
      });

      /* A tool's card opens a window of its own, so the page to photograph is
         one this connection knows nothing about yet. */
      let target = cdp;
      if (shot.tool) {
        target = await findToolWindow(shot.tool, openPageIds);
        await target.send("Page.enable");
        await wait(1200);
        await target.send("Runtime.evaluate", {
          expression: `(async () => { ${CLEAR_THE_WAY} return await clearTheWay(); })()`,
          awaitPromise: true, returnByValue: true
        });
      }

      /* Metrics AFTER the navigation: several views measure themselves on the
         way in, and a size change mid-transition leaves a half-laid-out card. */
      await target.send("Emulation.setDeviceMetricsOverride", {
        width: CSS_WIDTH, height: cssHeight, deviceScaleFactor: scale, mobile: false
      });
      /* Long enough for the reveal animations and any image in the view. */
      await wait(1400);

      const shotResult = await target.send("Page.captureScreenshot", {
        format: "jpeg", quality: 92, captureBeyondViewport: false
      });
      const bytes = Buffer.from(shotResult.data, "base64");

      for (const name of shot.to) writeFileSync(join(OUT, name), bytes);
      await target.send("Emulation.clearDeviceMetricsOverride");
      if (shot.tool) { try { target.close(); } catch {} }

      console.log(`${width}x${height}  ${(bytes.length / 1024).toFixed(0)} KB  -> ${shot.to.join(", ")}`);
    }

    console.log("\nDone. " + chosen.length + " shots written to assets/site/.");
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
