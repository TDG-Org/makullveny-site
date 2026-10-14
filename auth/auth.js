/*
  THE AUTH RETURN PAGE's script. See index.html for why this page exists and
  for the security rules the markup enforces.

  WHAT IT DOES, in the order it matters:
    1. read the fragment GoTrue put on the URL (it is a fragment and not a
       query on purpose -- a fragment is never sent to a server, not even in
       the request that loads this page);
    2. strip it from the address bar immediately;
    3. say, in plain words, which of the five things just happened;
    4. offer the hand-off back into the app, carrying the fragment so the
       desktop app can adopt the session without the student typing anything.

  IT NEVER CLAIMS SOMEBODY IS SIGNED IN TO THE APP. It cannot know that. It
  says the LINK worked, which is exactly what it does know.
*/
(function () {
  "use strict";

  var APP_LINK = "makullveny://auth-callback";

  /* GoTrue puts everything after the '#'. Read it before anything else can
     navigate, and keep the RAW string as well as the parsed values -- the app
     wants the original fragment, byte for byte, not a re-encoded guess at it. */
  var raw = String(location.hash || "").replace(/^#/, "");
  var params = new URLSearchParams(raw);

  var type = String(params.get("type") || "").toLowerCase();
  var errorCode = String(params.get("error_code") || "");
  var errorText = String(params.get("error_description") || params.get("error") || "").replace(/\+/g, " ");
  var hasSession = Boolean(params.get("access_token") && params.get("refresh_token"));
  var accessToken = String(params.get("access_token") || "");

  /* STRIP IT FROM THE ADDRESS BAR. A session in a visible URL is a session
     somebody can photograph, paste into a chat, or leave on a shared screen.
     The variables above already hold what this page needs. Wrapped because
     replaceState is unavailable in a few embedded browsers, and failing to
     tidy the URL must never cost the student the page. */
  try {
    if (raw && window.history && typeof history.replaceState === "function") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (_error) { /* the copy below still works */ }

  /* THE FIVE OUTCOMES, and one of them is not an error even though it looks
     like one: a RECOVERY link is not a sign-in, it is permission to choose a
     new password, and telling somebody "you're signed in" there would be a
     lie that sends them looking for the wrong thing. */
  var expired = /expired|invalid/i.test(errorText) || errorCode === "otp_expired";
  var copy;

  if (errorCode || errorText) {
    copy = expired
      ? {
          mark: "↻",
          title: "That link has expired",
          lead:
            "Email links only last a short while, and each one can be used once. " +
            "Open Makullveny and ask for a new one — it takes a second.",
          fine:
            "Nothing is wrong with your account. If you were signing up, your " +
            "account was still created — just ask for a fresh link, or log in."
        }
      : {
          mark: "!",
          title: "That link did not work",
          lead: errorText
            ? "The account server said: " + errorText
            : "The account server would not accept that link.",
          fine: "Open Makullveny and try again. If it keeps happening, ask for a new link."
        };
  } else if (type === "recovery" && hasSession) {
    /* FINISHED HERE (2026-10-14): the new password is set on this page, so a
       phone, or a browser that refuses makullveny://, is not a dead end. The
       app hand-off stays below as the other way. */
    copy = {
      mark: "✦",
      title: "Choose a new password",
      lead: "Type it twice, then log in to Makullveny with it.",
      fine: "Rather do it in the app? Press Set it in the app instead."
    };
  } else if (type === "recovery") {
    copy = {
      mark: "✦",
      title: "Let’s set a new password",
      lead: "Go back to Makullveny — it’s ready for your new password.",
      fine: "You can close this tab once the app is open."
    };
  } else if (type === "email_change") {
    copy = {
      mark: "✦",
      title: "Email address confirmed",
      lead: "Go back to Makullveny — your new address is on your account.",
      fine: "You can close this tab."
    };
  } else if (!raw) {
    /* NOTHING ON THE URL AT ALL. Somebody typed the address, followed a stale
       bookmark, or a browser dropped the fragment across a redirect. This page
       has been told NOTHING, so it must claim nothing: saying "you're signed
       in" here is exactly what this file's own header forbids, and it would
       send somebody back to the app expecting to find themselves logged in.

       Found by opening the page with no fragment -- which is the first thing a
       real person does when they are curious about a URL, and the first thing
       a stale bookmark does by itself. */
    copy = {
      mark: "\u2726",
      title: "Nothing to finish here",
      lead:
        "This is where email links from Makullveny land. Open the link we sent " +
        "you, or just open the app and carry on.",
      fine: "Signing up or resetting a password? Check your inbox for the link."
    };
  } else {
    /* signup / magiclink / invite, and the no-type case a provider return
       produces. All four mean the same thing to a student: it worked. */
    copy = {
      mark: "✦",
      title: "You’re all set",
      lead: "Go back to Makullveny — you’re signed in.",
      fine: "You can close this tab."
    };
  }

  document.title = "Makullveny — " + copy.title;
  document.getElementById("mark").textContent = copy.mark;
  document.getElementById("title").textContent = copy.title;
  document.getElementById("lead").textContent = copy.lead;
  document.getElementById("fine").textContent = copy.fine;
  if (errorCode || errorText) document.body.setAttribute("data-state", "error");

  /* THE HAND-OFF carries the original fragment, so the app gets exactly what
     GoTrue sent. On an expired link there is nothing worth carrying, and the
     app's own message is better than this one -- so it goes home empty and
     lets the app say it. */
  var button = document.getElementById("open");
  var target = raw && !expired ? APP_LINK + "#" + raw : APP_LINK;
  button.href = target;

  /* Try once, automatically. Browsers increasingly want a user gesture before
     following a custom scheme and some show a prompt, so this is an
     OPTIMISATION and never the mechanism -- the button is in the static HTML
     precisely so a script error still leaves a working way back.

     NOT tried at all when there is no app to hand anything to: a phone that
     has never had Makullveny installed would show an ugly "cannot open" sheet
     over a page that is already telling the student the good news. There is no
     way to detect that, so the compromise is to attempt it only when we
     actually have something for the app to use. */
  /* A RECOVERY LINK IS FINISHED ON THIS PAGE, so it is not handed off on
     its own: the form is the main path and the button the other way. */
  var finishesHere = type === "recovery" && hasSession && !(errorCode || errorText);
  if (raw && !expired && !finishesHere) {
    try { location.href = target; } catch (_error) { /* the button is the answer */ }
  }
  if (finishesHere) setUpNewPassword();

  /* Said only after the automatic attempt has had its chance, so nobody is
     told to press a button that is about to become unnecessary. */
  setTimeout(function () {
    var fine = document.getElementById("fine");
    if (!fine || finishesHere) return;
    fine.textContent = (errorCode || errorText)
      ? copy.fine
      : "Still here? Your browser may be blocking the hand-off — press the " +
        "button above, or just switch to Makullveny yourself. It checks again " +
        "on its own every time it comes to the front, so you will be let in " +
        "either way. You can close this tab.";
  }, 1600);

  /* THE NEW PASSWORD (2026-10-14). The token and the password go to ONE pinned
     origin -- the project's own mak-web-signup function, the door account/
     uses -- which does GoTrue's update-user as the student and ends the
     recovery session. No key on this page; nothing stored; the token never
     goes anywhere else (connect-src names that origin alone). */
  function setUpNewPassword() {
    var ENDPOINT = "https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-web-signup";
    var MIN = 6;
    var MAX = 72;
    var form = document.getElementById("newpass");
    var one = document.getElementById("pw1");
    var two = document.getElementById("pw2");
    var note = document.getElementById("pwnote");
    var save = document.getElementById("pwsave");
    if (!form || !one || !two || !note || !save) return;
    form.hidden = false;
    document.body.setAttribute("data-state", "recovery");
    button.textContent = "Set it in the app instead";
    var said = {
      link_expired: "That link has expired. Open Makullveny and ask for a new one.",
      same_password: "That is your current password. Choose a different one.",
      weak_password: "That password is too easy to guess. Try a longer one.",
      short_password: "Use at least " + MIN + " characters.",
      long_password: "That is too long. " + MAX + " characters at most.",
      rate_limited: "Too many tries from here. Wait a few minutes and try again.",
      offline: "Could not reach TDG. Check your connection and try again.",
      server_error: "Something went wrong on our side. Try again in a minute."
    };
    function tell(text, bad) {
      note.textContent = text;
      if (bad) note.setAttribute("data-tone", "bad"); else note.removeAttribute("data-tone");
    }
    try { one.focus(); } catch (_error) { /* a page without focus still works */ }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var password = String(one.value || "");
      if (password.length < MIN) return tell(said.short_password, true);
      if (password.length > MAX) return tell(said.long_password, true);
      if (password !== String(two.value || "")) return tell("The two do not match. Type them again.", true);
      save.disabled = true;
      tell("Saving…", false);
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_password", accessToken: accessToken, password: password }),
        credentials: "omit",
        referrerPolicy: "no-referrer"
      })
        .then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (answer) {
          if (answer && answer.ok === true) {
            one.value = "";
            two.value = "";
            form.hidden = true;
            document.body.removeAttribute("data-state");
            document.getElementById("mark").textContent = "✓";
            document.getElementById("title").textContent = "Password changed";
            document.getElementById("lead").textContent = "Open Makullveny and log in with your new password.";
            document.getElementById("fine").textContent = "You can close this tab.";
            document.title = "Makullveny — Password changed";
            /* The recovery session is over (the function ended it), so the
               app gets nothing but "open". */
            button.href = APP_LINK;
            button.textContent = "Open Makullveny";
            return;
          }
          save.disabled = false;
          var code = answer && answer.error;
          tell(said[code] || said.server_error, true);
        })
        .catch(function () {
          save.disabled = false;
          tell(said.offline, true);
        });
    });
  }
})();
