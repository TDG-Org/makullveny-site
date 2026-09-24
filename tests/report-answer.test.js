/*
  A WRONG CODE MUST SAY "WRONG CODE" (2026-09-24).

  mak-share answers a wrong or malformed report code with HTTP 401 / 400 and
  `{ "error": "bad_code" }`. book-scene.js's post() turned EVERY non-2xx into
  report_transport_failed, so a reader who mistyped one digit was told "That
  could not be sent" and the scene's own "That code did not match" sentence
  (REPORT_REFUSAL.BAD_CODE) could never appear. reportAnswer() is the one
  mapping from a reply to what the scene is told, and it is pure, so it is
  pinned here without a browser.
*/
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function load() {
  var window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "read", "book-scene.js"), "utf8"), { window: window, document: {} });
  var B = window.MakullvenyBookReader;
  /* The file runs in its own realm; plain copies compare by value. */
  return { reportAnswer: B && B.reportAnswer ? function (s, t) { return JSON.parse(JSON.stringify(B.reportAnswer(s, t))); } : undefined };
}

test("a wrong or malformed code is report_bad_code, not a transport failure", function () {
  var B = load();
  assert.equal(typeof B.reportAnswer, "function");
  assert.deepEqual(B.reportAnswer(401, JSON.stringify({ error: "bad_code" })), { ok: false, code: "report_bad_code" });
  assert.deepEqual(B.reportAnswer(400, JSON.stringify({ error: "bad_code" })), { ok: false, code: "report_bad_code" });
});

test("everything else maps as before", function () {
  var B = load();
  assert.deepEqual(B.reportAnswer(200, JSON.stringify({ ok: true })), { ok: true });
  assert.deepEqual(B.reportAnswer(429, ""), { ok: false, code: "report_rate_limited" });
  assert.deepEqual(B.reportAnswer(500, JSON.stringify({ error: "bad_code" })), { ok: false, code: "report_transport_failed" });
  assert.deepEqual(B.reportAnswer(401, JSON.stringify({ error: "other" })), { ok: false, code: "report_transport_failed" });
  assert.deepEqual(B.reportAnswer(401, "not json"), { ok: false, code: "report_transport_failed" });
  assert.deepEqual(B.reportAnswer(200, JSON.stringify({ ok: false, code: "report_not_ready" })), { ok: false, code: "report_not_ready" });
  assert.deepEqual(B.reportAnswer(200, "{"), { ok: false, code: "report_transport_failed" });
});
