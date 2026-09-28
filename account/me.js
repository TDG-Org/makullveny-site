/*
  WHO IS SIGNED IN ON THIS WEBSITE -- shared by every page.

  Signing in on the website (account/) checks the password on the server and
  hands back three public facts: username, display name, avatar number. That
  is ALL this browser ever keeps -- no password, no token, no email -- so there
  is no session here to steal. The server ends the session it made before it
  answers (supabase/functions/mak-web-signup in the app repo).

  With those facts, every page's top bar swaps its "Sign up" button for the
  student's avatar, which opens their TDG profile page, and a small sign-out
  button that simply forgets them in this browser.

  Everything from storage is re-checked before use (a username must still be
  3-20 letters, digits or _; an avatar must be 1-7) and set with textContent,
  because storage is just another input.
*/
(function () {
  "use strict";

  var KEY = "makullveny.me.v1";
  var USERNAME = /^[A-Za-z0-9_]{3,20}$/;
  var PROFILE_BASE = "https://tdg-org.github.io/TDG-Site/#/user/";
  var AVATARS = ["", "turtle-duck", "frog", "duck-on-water", "glider", "tree", "jellyfish", "mushroom"];

  function clean(raw) {
    if (!raw || typeof raw !== "object") return null;
    var username = USERNAME.test(String(raw.username || "")) ? String(raw.username) : "";
    var displayName = String(raw.displayName || "").replace(/\s+/g, " ").trim().slice(0, 80);
    var avatarId = Number(raw.avatarId);
    if (!(avatarId >= 1 && avatarId <= 7 && Math.floor(avatarId) === avatarId)) avatarId = 0;
    if (!username && !displayName) return null;
    return { username: username, displayName: displayName, avatarId: avatarId };
  }

  function get() {
    try { return clean(JSON.parse(window.localStorage.getItem(KEY) || "null")); } catch (_e) { return null; }
  }
  function save(profile) {
    var me = clean(profile);
    if (!me) return null;
    try { window.localStorage.setItem(KEY, JSON.stringify(me)); } catch (_e) { /* shown once, not remembered */ }
    render(me);
    return me;
  }
  function clear() {
    try { window.localStorage.removeItem(KEY); } catch (_e) { /* nothing kept anyway */ }
    render(null);
  }
  function profileUrl(me) {
    return me && me.username ? PROFILE_BASE + encodeURIComponent(me.username) : "";
  }
  function avatarSrc(base, id) {
    return id >= 1 && id <= 7 ? base + "assets/site/avatars/mak-avatar-" + id + "-" + AVATARS[id] + ".png" : "";
  }

  /* The site root, from this script's own address (it lives in account/). */
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/account\/me\.js(\?.*)?$/, "") : "./";
  })();

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /* The avatar disc on its own: the picture, or the first letter. */
  function disc(me, size) {
    var d = el("span", "me-disc");
    d.setAttribute("data-avatar", String(me.avatarId));
    if (size) d.style.width = d.style.height = size + "px";
    var src = avatarSrc(BASE, me.avatarId);
    if (src) {
      var img = el("img");
      img.src = src;
      img.alt = "";
      img.width = img.height = 64;
      d.appendChild(img);
    } else {
      d.appendChild(el("span", "me-initial", (me.displayName || me.username || "?").charAt(0).toUpperCase()));
    }
    return d;
  }

  var signUp = null;   // the page's own Sign up link, kept to put back
  var mounted = [];
  function render(me) {
    var nav = document.querySelector(".topbar nav") || document.querySelector(".ac-top");
    if (!nav) return;
    if (!signUp) signUp = nav.querySelector('a[href*="account/"]');
    mounted.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    mounted = [];
    if (!me) {
      if (signUp) signUp.style.display = "";
      return;
    }
    if (signUp) signUp.style.display = "none";

    var url = profileUrl(me);
    var chip = el("a", "me-chip");
    chip.href = url || BASE + "account/";
    if (url) { chip.target = "_blank"; chip.rel = "noopener noreferrer"; }
    chip.title = url ? "Your TDG profile" : "Your account";
    chip.setAttribute("aria-label", (url ? "Your TDG profile: @" + me.username : "Your account") + " (opens in a new tab)");
    chip.appendChild(disc(me));
    chip.appendChild(el("span", "me-name", me.username ? "@" + me.username : me.displayName));

    var out = el("button", "me-out");
    out.type = "button";
    out.title = "Sign out of this website";
    out.setAttribute("aria-label", "Sign out of this website");
    out.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 4.5h3a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3M10.5 16.5 6 12l4.5-4.5M6 12h9.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    out.addEventListener("click", clear);

    var anchor = signUp || nav.querySelector(".btn-primary, .ac-get");
    nav.insertBefore(chip, anchor);
    nav.insertBefore(out, anchor);
    mounted = [chip, out];
  }

  window.MakullvenyMe = { get: get, save: save, clear: clear, profileUrl: profileUrl, disc: disc, base: BASE };

  function start() { render(get()); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  /* Signed in or out in another tab: follow it. */
  window.addEventListener("storage", function (e) { if (e.key === KEY) render(get()); });
})();
