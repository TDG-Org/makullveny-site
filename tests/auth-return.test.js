/*
  THE AUTH RETURN PAGE's contract. Sibling to reader-hardening.test.js, and
  written the same way: node:test only, no dependency, no build step.

  This page is the one place on this PUBLIC site whose URL can carry a real
  session token, so most of what is checked here is about what the page must
  NEVER do. The rest is copy, because the copy IS the feature -- the owner
  asked for "a clean 'go back to the app, are you signed in!'" and a page that
  says the wrong sentence at the wrong moment is a broken page even when every
  byte of its script is correct.

  Run with:  node --test
*/
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var dir = path.join(__dirname, "..", "auth");
var html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
var js = fs.readFileSync(path.join(dir, "auth.js"), "utf8");
var css = fs.readFileSync(path.join(dir, "auth.css"), "utf8");

/* The page's decision, lifted out of the browser so every branch can be driven
   without one. It mirrors auth.js's own order exactly; the test below that
   compares the two is what stops this becoming a second, drifting copy. */
function outcomeFor(fragment) {
  var params = new URLSearchParams(String(fragment || "").replace(/^#/, ""));
  var type = String(params.get("type") || "").toLowerCase();
  var errorCode = String(params.get("error_code") || "");
  var errorText = String(params.get("error_description") || params.get("error") || "");
  var expired = /expired|invalid/i.test(errorText) || errorCode === "otp_expired";
  if (errorCode || errorText) return expired ? "expired" : "error";
  if (type === "recovery") return "recovery";
  if (type === "email_change") return "email_change";
  if (!String(fragment || "").replace(/^#/, "")) return "bare";
  return "signed-in";
}

test("the five things GoTrue can send are each told apart", function () {
  assert.equal(outcomeFor("#access_token=a&refresh_token=b&type=signup"), "signed-in");
  assert.equal(outcomeFor("#access_token=a&refresh_token=b&type=magiclink"), "signed-in");
  assert.equal(outcomeFor("#access_token=a&refresh_token=b&type=invite"), "signed-in");
  assert.equal(outcomeFor("#access_token=a&refresh_token=b&type=recovery"), "recovery");
  assert.equal(outcomeFor("#access_token=a&refresh_token=b&type=email_change"), "email_change");
  assert.equal(
    outcomeFor("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    "expired"
  );
});

test("a RECOVERY link is never called a sign-in", function () {
  // It is not one. It is permission to choose a new password, and telling
  // somebody they are signed in there sends them looking for the wrong thing.
  assert.notEqual(outcomeFor("#type=recovery&access_token=a&refresh_token=b"), "signed-in");
  assert.match(js, /Let\\u2019s set a new password|Let’s set a new password/);
});

test("an empty URL claims NOTHING", function () {
  // Somebody typed the address, or followed a stale bookmark, or a browser
  // dropped the fragment across a redirect. The page has been told nothing, so
  // it must say nothing -- claiming a sign-in here is a lie that sends a
  // student back to the app expecting to be logged in. Caught by opening the
  // page with no fragment, which is the first thing a curious person does.
  assert.equal(outcomeFor(""), "bare");
  assert.equal(outcomeFor("#"), "bare");
  assert.match(js, /Nothing to finish here/);
});

test("the page's own order matches the table above", function () {
  // Guards against this file becoming a second, drifting copy of the decision.
  var order = ["errorCode || errorText", "recovery", "email_change", "!raw"];
  var at = order.map(function (needle) { return js.indexOf(needle); });
  assert.ok(at.every(function (i) { return i > -1; }), "auth.js no longer branches the way this test assumes");
  assert.ok(at[0] < at[1], "errors must be decided before the link types");
  assert.ok(at[3] > at[2], "the empty case must be decided after the named types");
});

test("the token never leaves the page", function () {
  // The fragment can be a real session. The CSP is what makes that safe, and
  // it is stated in the markup rather than trusted to a script that could be
  // wrong: nothing here may open a socket, submit a form, or frame anything.
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /frame-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /default-src 'none'/);
  // No inline anything, so the CSP needs no 'unsafe-inline' to function.
  assert.doesNotMatch(html, /unsafe-inline/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, "an inline script would need unsafe-inline");
});

test("the token is not left in the address bar, or in any store", function () {
  assert.match(js, /history\.replaceState/);
  // A session in a visible URL is one somebody can photograph or paste.
  assert.match(js, /location\.pathname \+ location\.search/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/);
});

test("the page is never indexed and never leaks a referrer", function () {
  assert.match(html, /name="robots" content="noindex/);
  assert.match(html, /name="referrer" content="no-referrer"/);
});

test("an expired link hands the app nothing, and says so kindly", function () {
  // There is no session on an expired link, so carrying the fragment would
  // hand the app a token it can only refuse. And nothing is actually wrong
  // with the account, which is the sentence a worried student needs.
  assert.match(js, /raw && !expired/);
  assert.match(js, /your account was still created|account was still created/);
});

test("a script that fails still leaves a working way back", function () {
  // Every word the script writes is already in the markup, and so is the
  // button -- so a load failure or a throw degrades to a real page rather than
  // a blank one. This is the same rule the checkout return page next door has.
  assert.match(html, /id="title"/);
  assert.match(html, /id="lead"/);
  assert.match(html, /id="fine"/);
  assert.match(html, /<a class="button" id="open" href="makullveny:\/\/auth-callback">/);
});

test("the automatic hand-off is an optimisation, never the mechanism", function () {
  // Browsers increasingly want a gesture before following a custom scheme.
  assert.match(js, /try \{ location\.href = target; \} catch/);
  assert.match(js, /the button is the answer|OPTIMISATION/);
});

test("the error face is amber, not red, and is a real stylesheet arm", function () {
  // An expired link is an ordinary thing that happens to everybody.
  assert.match(js, /setAttribute\("data-state", "error"\)/);
  assert.match(css, /body\[data-state="error"\]/);
});

test("404 exists at the repository root, where Pages actually looks", function () {
  // A nested 404.html is never served. And it must stand alone: a broken
  // stylesheet on the page that explains a broken link is a bad joke.
  var notFound = fs.readFileSync(path.join(__dirname, "..", "404.html"), "utf8");
  assert.match(notFound, /<style>/, "the 404 must not depend on an external stylesheet");
  assert.doesNotMatch(notFound, /<script/i, "the 404 needs no script");
  assert.match(notFound, /That page isn/);
});
