/*
  Tests for account/ -- the sign-up page. Node's own test runner, no
  dependency, like the reader's tests.

  Run with: node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var A = require(path.join("..", "account", "account.js"));
var R = require(path.join("..", "read", "read.js"));
var ROOT = path.join(__dirname, "..");

test("the form posts to exactly the reader's one pinned origin, at mak-web-signup", function () {
  assert.deepEqual(A.ALLOWED_API_ORIGINS, R.ALLOWED_API_ORIGINS);
  var base = "https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share";
  assert.equal(A.endpoint(base), "https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-web-signup");
  assert.equal(A.endpoint("https://ddbksawvchsauiuiwvrl.supabase.co.evil.com/x"), "");
  assert.equal(A.endpoint("http://ddbksawvchsauiuiwvrl.supabase.co/x"), "");
  assert.equal(A.endpoint(""), "");
});

test("the page holds no key, allows one connect origin and no form action", function () {
  var html = fs.readFileSync(path.join(ROOT, "account", "index.html"), "utf8");
  var js = fs.readFileSync(path.join(ROOT, "account", "account.js"), "utf8");
  assert.match(html, /connect-src https:\/\/ddbksawvchsauiuiwvrl\.supabase\.co;/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /<script src="\.\.\/read\/config\.js"><\/script>/);
  for (var source of [html, js]) {
    assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{10}|sb_publishable_|sb_secret_|service_role_key|apikey\s*[:=]/i);
  }
  // Nothing about the password is ever kept.
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie|console\./);
});

test("validate: the app's own rules, in the order the form reads them", function () {
  var ok = { username: "maya_r", email: "maya@example.com", password: "hunter22" };
  assert.equal(A.validate(ok), null);
  assert.equal(A.validate(Object.assign({}, ok, { username: "@maya_r" })), null);
  assert.equal(A.validate(Object.assign({}, ok, { username: "ma" })).field, "username");
  assert.equal(A.validate(Object.assign({}, ok, { username: "maya r" })).field, "username");
  assert.equal(A.validate(Object.assign({}, ok, { username: "a".repeat(21) })).field, "username");
  assert.equal(A.validate(Object.assign({}, ok, { email: "maya" })).field, "email");
  assert.equal(A.validate(Object.assign({}, ok, { password: "12345" })).field, "password");
  assert.equal(A.validate(Object.assign({}, ok, { password: "x".repeat(73) })).field, "password");
});

test("every error code the function sends has words, and an unknown one never shows raw", function () {
  for (var code of ["bad_email", "bad_username", "username_taken", "short_password", "long_password",
    "weak_password", "rate_limited", "signup_closed", "offline", "server_error"]) {
    assert.ok(A.messageFor(code).length > 10, code);
  }
  assert.equal(A.messageFor("<script>"), A.messageFor("server_error"));
});

/* account/me.js runs in a browser; this gives it just enough of one. */
function loadMe() {
  var vm = require("node:vm");
  var store = {};
  var ctx = {
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    addEventListener: function () {},
    document: {
      readyState: "complete",
      currentScript: { src: "https://www.makullveny.com/account/me.js" },
      querySelector: function () { return null; },
      addEventListener: function () {}
    }
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "account", "me.js"), "utf8"), ctx);
  return { me: ctx.MakullvenyMe, store: store };
}

test("me.js keeps three public facts and nothing else, whatever it is handed", function () {
  var t = loadMe();
  t.me.save({ username: "maya_r", displayName: "  Maya  ", avatarId: 3, access_token: "eyJhbGciOiJIUzI1NiJ9", email: "maya@example.com", password: "hunter22" });
  var kept = JSON.parse(t.store["makullveny.me.v1"]);
  assert.deepEqual(kept, { username: "maya_r", displayName: "Maya", avatarId: 3 });
  assert.equal(t.me.base, "https://www.makullveny.com/");
});

test("me.js re-checks what it reads back: a bad handle, a bad avatar", function () {
  var t = loadMe();
  t.store["makullveny.me.v1"] = JSON.stringify({ username: "<img src=x>", displayName: "Eve", avatarId: 99 });
  var me = t.me.get();
  assert.equal(me.username, "");
  assert.equal(me.avatarId, 0);
  assert.equal(t.me.profileUrl(me), "");
  t.store["makullveny.me.v1"] = "not json";
  assert.equal(t.me.get(), null);
});

test("the avatar opens the TDG profile page for that handle", function () {
  var t = loadMe();
  assert.equal(t.me.profileUrl({ username: "maya_r" }), "https://tdg-org.github.io/TDG-Site/#/user/maya_r");
  t.me.clear();
  assert.equal(t.store["makullveny.me.v1"], undefined);
});
