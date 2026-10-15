/*
  "Students locked in right now" -- one calm number under the hero
  (2026-10-15).

  It asks ONE function, mak-locked-in-now, on the one pinned project origin
  every other page here talks to, with NO key and no credentials: the
  function holds the project key server-side and answers only
  { "count": <number> } or { "count": null }. The number is a count and
  nothing else -- never a name, a school or a team.

  Calm by design:
    * below 3 the function answers null, and so does this file, so nothing
      shows at all (no "only 1 person is studying" at 3 a.m.);
    * an error, a slow answer or a blocked request shows nothing, never a 0;
    * it asks once on load and then every two minutes only while the tab is
      in front (the function caches a minute anyway);
    * no motion: the dot is still.

  Node's test runner loads it too (tests/live-count.test.js).
*/
(function (root) {
  "use strict";

  var ENDPOINT = "https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-locked-in-now";
  var ALLOWED_API_ORIGINS = ["https://ddbksawvchsauiuiwvrl.supabase.co"];
  var FLOOR = 3;
  var REFRESH_MS = 120000;
  var TIMEOUT_MS = 6000;

  function apiOriginAllowed(url) {
    try {
      return ALLOWED_API_ORIGINS.indexOf(new URL(url).origin) >= 0;
    } catch (_error) {
      return false;
    }
  }

  // A whole number at or above the floor, or null. Anything else is null.
  function countFrom(body) {
    if (!body || typeof body !== "object") return null;
    var value = body.count;
    if (typeof value !== "number" || !isFinite(value)) return null;
    var n = Math.floor(value);
    return n >= FLOOR && n <= 1000000 ? n : null;
  }

  function words(n) {
    return n.toLocaleString("en-US") + " students locked in right now";
  }

  function paint(node, n) {
    if (!node) return;
    var text = node.querySelector("[data-live-count-text]");
    if (n === null) {
      node.hidden = true;
      return;
    }
    if (text) text.textContent = words(n);
    node.hidden = false;
  }

  function ask(fetchImpl) {
    if (!apiOriginAllowed(ENDPOINT) || typeof fetchImpl !== "function") return Promise.resolve(null);
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : 0;
    return fetchImpl(ENDPOINT, {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res && res.ok ? res.json() : null;
    }).then(countFrom, function () {
      return null;
    }).then(function (n) {
      if (timer) clearTimeout(timer);
      return n;
    });
  }

  function start(doc, win) {
    var node = doc && doc.querySelector("[data-live-count]");
    if (!node || !win || typeof win.fetch !== "function") return;
    var timer = 0;
    var refresh = function () {
      ask(win.fetch.bind(win)).then(function (n) { paint(node, n); });
    };
    var schedule = function () {
      if (timer) win.clearInterval(timer);
      timer = 0;
      if (doc.visibilityState !== "hidden") timer = win.setInterval(refresh, REFRESH_MS);
    };
    doc.addEventListener("visibilitychange", function () {
      if (doc.visibilityState !== "hidden") refresh();
      schedule();
    });
    refresh();
    schedule();
  }

  var api = {
    ENDPOINT: ENDPOINT,
    ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
    FLOOR: FLOOR,
    apiOriginAllowed: apiOriginAllowed,
    countFrom: countFrom,
    words: words,
    paint: paint,
    ask: ask
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) start(root.document, root);
})(typeof window !== "undefined" ? window : null);
