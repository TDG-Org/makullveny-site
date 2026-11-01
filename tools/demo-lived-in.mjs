/*
  A FEW WEEKS INTO THE TERM, NOT THE FIRST MORNING.

  scripts/preview-demo-data.js (app repo) seeds a student's classes, work and
  calendar, but not their history: no Lock In has ever been run, so every
  picture of the dashboard said "0 min today", "0 study days" and drew an
  empty grid of day boxes, and the five-stop "Get settled" card sat over the
  top of the Today tab -- a first-launch card the site's pictures were never
  about. Both capture tools call this on the sandbox's prefs before the app
  starts:

    * settings.journey.settledDoneAt -- the moment the student finished
      Get settled (src/studentJourney.js settledVisible() reads exactly this);
    * focusSessions -- six weeks of finished Lock Ins across the demo classes,
      in the shape src/focusSession.js normalizeSessionRecord() keeps, so the
      study rhythm, the Focus card's week and Statistics all have days to draw;
    * flowerGarden -- the flower each of those Lock Ins grew, picked by the
      app's own rule (src/flowerGarden.js flowerForMinutes, passed in as
      `flowers` so this file never guesses the table), for Selah's Collection.

  Deterministic (a fixed seed, no Math.random), so two runs photograph the
  same history. The sandbox only: the profile is a throwaway mak-preview-*.
*/
const CLASSES = ["demo-chem", "demo-math", "demo-psy", "demo-hist", "demo-eng", "demo-theo"];
const TASKS = {
  "demo-chem": ["Problem set 4", "Midterm 1 review", "Lab report"],
  "demo-math": ["Section 2.3 exercises", "Related rates practice"],
  "demo-psy": ["Module 3 quiz prep", "Reading: chapter 4"],
  "demo-hist": ["Map quiz", "Timeline project"],
  "demo-eng": ["Essay draft", "Peer review"],
  "demo-theo": ["Reading reflection 2", "Discussion post"]
};

export function livedIn(prefs, now = new Date(), { flowers = null } = {}) {
  let seed = 20261101;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  prefs.settings = prefs.settings || {};
  prefs.settings.journey = {
    ...(prefs.settings.journey || {}),
    settledDoneAt: new Date(now.getTime() - 34 * 864e5).toISOString()
  };
  const sessions = [];
  for (let back = 42; back >= 1; back -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const weekday = day.getDay();
    /* Most weekdays, fewer weekends, and a run of six days into today --
       the streak the Selah shot's island already claims. */
    const chance = back <= 6 ? 1 : weekday === 0 || weekday === 6 ? 0.35 : 0.78;
    if (rand() > chance) continue;
    const sittings = rand() < 0.45 ? 2 : 1;
    let hour = 15 + Math.floor(rand() * 5);
    for (let s = 0; s < sittings; s += 1) {
      const course = CLASSES[Math.floor(rand() * CLASSES.length)];
      const planned = [25, 25, 30, 45, 50, 60][Math.floor(rand() * 6)];
      const minutes = Math.max(10, planned - (rand() < 0.2 ? Math.floor(rand() * 12) : 0));
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rand() * 50));
      const end = new Date(start.getTime() + minutes * 60000);
      const labels = TASKS[course];
      sessions.push({
        id: `demo-focus-${back}-${s}`,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        plannedMinutes: planned,
        actualMinutes: minutes,
        activeMs: minutes * 60000,
        mode: "gentle",
        courseId: course,
        taskLabel: labels[Math.floor(rand() * labels.length)],
        outcome: minutes >= planned ? "completed" : "interrupted",
        coinsAwarded: minutes,
        surface: "makullveny"
      });
      hour += 2;
    }
  }
  /* normalizeFocusSessions keeps the list newest first. */
  prefs.focusSessions = sessions.reverse();
  if (flowers && typeof flowers.flowerForMinutes === "function") {
    const items = prefs.focusSessions.map((s) => {
      const flower = flowers.flowerForMinutes(s.actualMinutes);
      return flower && { id: "demo-flower-" + s.id.slice(11), flower: flower.key, earnedAt: s.endedAt, minutes: s.actualMinutes };
    }).filter(Boolean);
    prefs.flowerGarden = { version: 1, items, unlockedAt: sessions.length > 4 ? sessions[sessions.length - 5].endedAt : "" };
  }
  return { sessions: sessions.length, minutes: sessions.reduce((sum, s) => sum + s.actualMinutes, 0) };
}
