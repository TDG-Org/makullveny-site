/*
  THE SIGN-UP FORM's script. See index.html for why this page exists and why
  it holds no key.

  One function, two actions:
    { action: "check",  username }                              -> { ok, available }
    { action: "signup", email, password, username, displayName } -> { ok, next: "confirm" }

  The function answers a NEW address and one that already has an account
  identically, so this page never says "that email is taken" -- it cannot
  know, and must not guess. A taken USERNAME is said out loud: handles are
  public by design.

  The password lives in the input and in one request body, and nowhere else:
  nothing is written to storage, to the URL, or to a log.
*/
(function () {
  "use strict";

  var hasWindow = typeof window !== "undefined";

  var CONFIG = { apiUrl: "" };
  if (hasWindow && window.MAKULLVENY_READER_CONFIG && window.MAKULLVENY_READER_CONFIG.apiUrl) {
    CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
  }

  /* KEEP IN STEP with read/read.js, u/profile.js and the connect-src in
     index.html. The function is named here, not in config.js: config.js
     names the project, and the project is what the origin pin protects. */
  var ALLOWED_API_ORIGINS = ["https://ddbksawvchsauiuiwvrl.supabase.co"];
  var FUNCTION_PATH = "/functions/v1/mak-web-signup";

  var USERNAME = /^[A-Za-z0-9_]{3,20}$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var MIN_PASSWORD = 6;

  function endpoint(apiUrl) {
    var parsed;
    try { parsed = new URL(String(apiUrl || "")); } catch (_error) { return ""; }
    if (parsed.protocol !== "https:") return "";
    for (var i = 0; i < ALLOWED_API_ORIGINS.length; i += 1) {
      if (parsed.origin === ALLOWED_API_ORIGINS[i]) return parsed.origin + FUNCTION_PATH;
    }
    return "";
  }

  var MESSAGES = {
    bad_email: "That email does not look right.",
    bad_username: "Usernames are 3–20 letters, numbers or _.",
    username_taken: "That username is taken. If it is yours from another TDG app, just sign in with it.",
    short_password: "Use at least " + MIN_PASSWORD + " characters.",
    long_password: "That password is too long. 72 characters at most.",
    weak_password: "That password is too easy to guess. Try a longer one.",
    rate_limited: "Too many tries from here. Wait a few minutes and try again.",
    signup_closed: "New accounts are paused for a moment. Try again later, or sign up inside the app.",
    offline: "Could not reach TDG. Check your connection and try again.",
    server_error: "Something went wrong on our side. Try again in a minute."
  };

  function messageFor(code) {
    return MESSAGES[code] || MESSAGES.server_error;
  }

  /* Validation the page can do before anything is sent. Returns
     { field, message } for the first problem, or null. */
  function validate(values) {
    var username = String(values.username || "").trim().replace(/^@+/, "");
    if (!USERNAME.test(username)) return { field: "username", message: MESSAGES.bad_username };
    if (!EMAIL.test(String(values.email || "").trim())) return { field: "email", message: MESSAGES.bad_email };
    var password = String(values.password || "");
    if (password.length < MIN_PASSWORD) return { field: "password", message: MESSAGES.short_password };
    if (password.length > 72) return { field: "password", message: MESSAGES.long_password };
    return null;
  }

  function post(url, body) {
    return new Promise(function (resolve) {
      var request = new XMLHttpRequest();
      request.open("POST", url, true);
      request.setRequestHeader("Content-Type", "application/json");
      request.timeout = 15000;
      request.onload = function () {
        var data = null;
        try { data = JSON.parse(request.responseText || "null"); } catch (_error) { data = null; }
        resolve({ status: request.status, data: data });
      };
      request.onerror = function () { resolve({ status: 0, data: null }); };
      request.ontimeout = function () { resolve({ status: 0, data: null }); };
      request.send(JSON.stringify(body));
    });
  }

  function start() {
    var $ = function (id) { return document.getElementById(id); };
    var form = $("acForm");
    var submit = $("acSubmit");
    var status = $("acStatus");
    var hint = $("acUsernameHint");
    var fields = { username: $("acUsername"), displayName: $("acName"), email: $("acEmail"), password: $("acPassword") };
    var done = $("acDone");
    var url = endpoint(CONFIG.apiUrl);
    var HINT = hint.textContent;

    function say(text, kind) {
      status.textContent = text || "";
      status.setAttribute("data-kind", kind || "");
    }

    if (!url) {
      say("Sign-up on the website is not open yet. You can make an account inside the app.", "error");
      return;
    }
    submit.disabled = false;
    say("", "");

    /* Show / hide the password. */
    $("acShow").addEventListener("click", function () {
      var shown = fields.password.type === "text";
      fields.password.type = shown ? "password" : "text";
      this.textContent = shown ? "Show" : "Hide";
      this.setAttribute("aria-pressed", shown ? "false" : "true");
    });

    /* The username check, as they type, after a pause. The last question
       asked is the only one whose answer is shown. */
    var checkTimer = 0;
    var checkSeq = 0;
    fields.username.addEventListener("input", function () {
      clearTimeout(checkTimer);
      var name = fields.username.value.trim().replace(/^@+/, "");
      hint.textContent = HINT;
      hint.removeAttribute("data-kind");
      if (!name) return;
      if (!USERNAME.test(name)) {
        hint.textContent = MESSAGES.bad_username;
        hint.setAttribute("data-kind", "error");
        return;
      }
      checkTimer = setTimeout(function () {
        var seq = ++checkSeq;
        post(url, { action: "check", username: name }).then(function (reply) {
          if (seq !== checkSeq) return;
          var available = reply.data && reply.data.ok ? reply.data.available : null;
          if (available === true) {
            hint.textContent = "@" + name + " is free.";
            hint.setAttribute("data-kind", "ok");
          } else if (available === false) {
            hint.textContent = "@" + name + " is taken.";
            hint.setAttribute("data-kind", "error");
          }
        });
      }, 450);
    });

    var busy = false;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;
      var values = {
        username: fields.username.value.trim().replace(/^@+/, ""),
        displayName: fields.displayName.value.trim(),
        email: fields.email.value.trim(),
        password: fields.password.value
      };
      var problem = validate(values);
      if (problem) {
        say(problem.message, "error");
        fields[problem.field].focus();
        return;
      }
      busy = true;
      submit.disabled = true;
      submit.textContent = "Creating…";
      say("", "");
      post(url, {
        action: "signup",
        email: values.email,
        password: values.password,
        username: values.username,
        displayName: values.displayName
      }).then(function (reply) {
        busy = false;
        submit.disabled = false;
        submit.textContent = "Create account";
        if (reply.data && reply.data.ok === true) {
          fields.password.value = "";
          $("acDoneText").textContent =
            "We sent a link to " + values.email + ". Press it to confirm, then open Makullveny " +
            "and sign in as @" + values.username + " (or with your email).";
          form.hidden = true;
          done.hidden = false;
          done.focus();
          return;
        }
        var code = reply.status === 0 ? "offline" : (reply.data && reply.data.error) || "server_error";
        say(messageFor(code), "error");
        if (code === "username_taken" || code === "bad_username") fields.username.focus();
        else if (code === "bad_email") fields.email.focus();
        else if (/password/.test(code)) fields.password.focus();
      });
    });

    $("acAgain").addEventListener("click", function () {
      done.hidden = true;
      form.hidden = false;
      fields.email.focus();
    });
  }

  if (hasWindow && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  /* For tests/account-page.test.js. */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { endpoint: endpoint, validate: validate, messageFor: messageFor, ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS, FUNCTION_PATH: FUNCTION_PATH };
  }
})();
