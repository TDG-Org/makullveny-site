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
    invalid_credentials: "That username or email and password do not match.",
    email_not_confirmed: "Confirm your email first — press the link we sent you, then sign in.",
    bad_request: "Enter your username or email, and your password.",
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

    /* Show / hide a password. */
    function showToggle(button, input) {
      button.addEventListener("click", function () {
        var shown = input.type === "text";
        input.type = shown ? "password" : "text";
        button.textContent = shown ? "Show" : "Hide";
        button.setAttribute("aria-pressed", shown ? "false" : "true");
      });
    }
    showToggle($("acShow"), fields.password);

    /* ── the two faces, and the signed-in one ─────────────────────────── */
    var signin = $("acSignin");
    var meBox = $("acMe");
    var tabs = { signup: $("acTabUp"), signin: $("acTabIn") };
    /* THE FACES CROSS-FADE (owner, 2026-09-27: "smoother and cleaner"): the
       words on the left and the card's contents fade out together, swap, and
       fade back in while the card eases to its new height. The tab pill
       slides on its own. Under reduced motion it is an instant swap. */
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var card = form.parentNode;
    var sayUp = $("acSayUp");
    var sayIn = $("acSayIn");
    var tabRow = tabs.signup.parentNode;
    [form, signin, done, meBox].forEach(function (n) { n.classList.add("ac-swap"); });
    var current = "";
    var swapTimer = 0;

    function apply(which, me) {
      form.hidden = which !== "signup";
      signin.hidden = which !== "signin";
      done.hidden = true;
      meBox.hidden = which !== "me";
      tabRow.hidden = which === "me";
      sayUp.hidden = which !== "signup";
      sayIn.hidden = which === "signup";
      tabRow.setAttribute("data-on", which === "signin" ? "signin" : "signup");
      tabs.signup.setAttribute("aria-selected", String(which === "signup"));
      tabs.signin.setAttribute("aria-selected", String(which === "signin"));
      if (which === "me") showMe(me);
    }
    function visible() {
      return [sayUp, sayIn, form, signin, done, meBox].filter(function (n) { return !n.hidden; });
    }
    function face(which) {
      var me = window.MakullvenyMe && window.MakullvenyMe.get();
      if (me) which = "me";
      if (which === current && done.hidden) return;
      var first = !current;
      current = which;
      clearTimeout(swapTimer);
      if (first || reduceMotion) { apply(which, me); return; }

      // Tabs answer at once; the content follows the fade.
      tabRow.setAttribute("data-on", which === "signin" ? "signin" : "signup");
      var from = card.offsetHeight;
      card.classList.add("is-sizing");
      card.style.height = from + "px";
      var leaving = visible();
      leaving.forEach(function (n) { n.classList.remove("is-entering"); n.classList.add("is-leaving"); });
      swapTimer = setTimeout(function () {
        leaving.forEach(function (n) { n.classList.remove("is-leaving"); });
        apply(which, me);
        card.style.height = "auto";
        var to = card.offsetHeight;
        card.style.height = from + "px";
        void card.offsetHeight;
        card.style.height = to + "px";
        visible().forEach(function (n) { n.classList.add("is-entering"); });
        swapTimer = setTimeout(function () {
          card.style.height = "";
          card.classList.remove("is-sizing");
          visible().forEach(function (n) { n.classList.remove("is-entering"); });
        }, 360);
      }, 170);
    }
    function showMe(me) {
      var box = $("acMeDisc");
      box.replaceChildren(window.MakullvenyMe.disc(me));
      $("acMeName").textContent = me.displayName ? "Hi, " + me.displayName : "You’re signed in";
      var url = window.MakullvenyMe.profileUrl(me);
      var link = $("acMeProfile");
      link.hidden = !url;
      if (url) link.href = url;
      $("acMeText").textContent = url
        ? "Signed in as @" + me.username + ". Your avatar is in the top bar on every page of this site — press it to open your TDG profile."
        : "Signed in. Pick a username in the Makullveny app to get a TDG profile page.";
    }
    tabs.signup.addEventListener("click", function () { face("signup"); });
    tabs.signin.addEventListener("click", function () { face("signin"); });
    [].slice.call(document.querySelectorAll("[data-go]")).forEach(function (b) {
      b.addEventListener("click", function () { face(b.getAttribute("data-go")); });
    });
    $("acMeOut").addEventListener("click", function () {
      window.MakullvenyMe.clear();
      face("signin");
    });
    window.addEventListener("storage", function () { face(signin.hidden ? "signup" : "signin"); });

    /* ── sign in ──────────────────────────────────────────────────────── */
    var ident = $("acIdent");
    var pass2 = $("acPass2");
    var submit2 = $("acSubmit2");
    var status2 = $("acStatus2");
    showToggle($("acShow2"), pass2);
    submit2.disabled = false;
    var busy2 = false;
    signin.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy2) return;
      var who = ident.value.trim();
      if (!who || !pass2.value) {
        status2.textContent = "Enter your username or email, and your password.";
        status2.setAttribute("data-kind", "error");
        (who ? pass2 : ident).focus();
        return;
      }
      busy2 = true;
      submit2.disabled = true;
      submit2.textContent = "Signing in…";
      status2.textContent = "";
      post(url, { action: "signin", identifier: who, password: pass2.value }).then(function (reply) {
        busy2 = false;
        submit2.disabled = false;
        submit2.textContent = "Sign in";
        pass2.value = "";
        if (reply.data && reply.data.ok === true && reply.data.profile && window.MakullvenyMe.save(reply.data.profile)) {
          face("me");
          meBox.focus();
          return;
        }
        var code = reply.status === 0 ? "offline" : (reply.data && reply.data.error) || "server_error";
        status2.textContent = messageFor(code);
        status2.setAttribute("data-kind", "error");
        pass2.focus();
      });
    });

    face(/signin/.test(location.hash) ? "signin" : "signup");

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
