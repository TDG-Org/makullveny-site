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
  if (raw && !expired) {
    try { location.href = target; } catch (_error) { /* the button is the answer */ }
  }

  /* Said only after the automatic attempt has had its chance, so nobody is
     told to press a button that is about to become unnecessary. */
  setTimeout(function () {
    var fine = document.getElementById("fine");
    if (!fine) return;
    fine.textContent = (errorCode || errorText)
      ? copy.fine
      : "Still here? Your browser may be blocking the hand-off — press the " +
        "button above, or just switch to Makullveny yourself. It checks again " +
        "on its own every time it comes to the front, so you will be let in " +
        "either way. You can close this tab.";
  }, 1600);
})();
