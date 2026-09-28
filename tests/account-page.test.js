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
