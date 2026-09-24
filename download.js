/*
  Makullveny downloads.

  WHAT CHANGED, AND WHY IT MATTERS. This file used to clear #download-panel and
  build the whole download card from the releases feed. It does not any more.
  The download section is real HTML now -- a numbered trail through the install,
  with a working link to the releases page in every step-one button and the
  platform picker driven by radio inputs and a CSS sibling selector. All of it
  reads and switches with this script blocked.

  So this file only fills in what the markup CANNOT know on its own:

    - the direct URL of the file for the reader's own system
    - its name, its size, and the version they are about to get
    - which platform trail to open first
    - and, on a phone, a word that this is desktop software

  Every one of those is an ENHANCEMENT of markup that already said something
  true. A blocked script costs the reader the file name; it never costs them
  the way in.

  Rules this file keeps:
    - one network call per page load, never a poll
    - a missing release (HTTP 404) is a normal state, not an error
    - never point a button at a file that is not in the release
    - never show updater plumbing (.blockmap, latest*.yml, the mac .zip)
*/
(function () {
  "use strict";

  var RELEASES_PAGE = "https://github.com/TDG-Org/makullveny-releases/releases";
  var LATEST_API = "https://api.github.com/repos/TDG-Org/makullveny-releases/releases/latest";
  var REQUEST_TIMEOUT_MS = 9000;

  /* Middle dot, built from its code point so this file stays plain ASCII. */
  var META_SEPARATOR = " " + String.fromCharCode(183) + " ";

  /* ---------------------------------------------------------------- data */

  /*
    electron-builder names its files from a template and the version, so the
    exact strings change every release. Match on shape, not on a remembered
    filename.

    The two Mac builds are told apart here rather than lumped together: the
    page offers Apple Silicon by default and Intel as the alternative, and it
    can only keep that promise if the two are separate slots.
  */
  function classifyAsset(name) {
    var lower = String(name || "").toLowerCase();

    if (!lower) {
      return null;
    }
    if (/\.blockmap$/.test(lower)) {
      return null;
    }
    if (/\.ya?ml$/.test(lower)) {
      return null;
    }
    if (/\.zip$/.test(lower)) {
      return null;
    }
    if (/\.exe$/.test(lower)) {
      return lower.indexOf("setup") === -1 ? "windowsPortable" : "windowsInstaller";
    }
    if (/\.dmg$/.test(lower)) {
      if (/arm64|aarch64|apple[-_.]?silicon/.test(lower)) {
        return "macosArm";
      }
      if (/x64|x86[-_]?64|intel/.test(lower)) {
        return "macosIntel";
      }
      return "macos";
    }
    if (/\.appimage$/.test(lower)) {
      return "linux";
    }
    return null;
  }

  function isSafeDownloadUrl(url) {
    return typeof url === "string" && url.indexOf("https://") === 0;
  }

  function groupAssets(assets) {
    var groups = {
      windowsInstaller: null,
      windowsPortable: null,
      macosArm: null,
      macosIntel: null,
      macos: null,
      linux: null
    };

    if (!assets || typeof assets.length !== "number") {
      return groups;
    }

    for (var i = 0; i < assets.length; i += 1) {
      var asset = assets[i];
      if (!asset || !isSafeDownloadUrl(asset.browser_download_url)) {
        continue;
      }
      var slot = classifyAsset(asset.name);
      if (slot && !groups[slot]) {
        groups[slot] = {
          slot: slot,
          name: String(asset.name),
          url: asset.browser_download_url,
          size: typeof asset.size === "number" ? asset.size : null
        };
      }
    }

    return groups;
  }

  /*
    A release that does not carry the exact build a button asked for is a
    normal thing -- an untagged .dmg instead of an arm64 one, a portable .exe
    in a release with no installer. Each slot names what it will accept
    instead, in order, before the button gives up and stays pointed at the
    releases page.
  */
  var FALLBACK = {
    windowsInstaller: ["windowsInstaller", "windowsPortable"],
    windowsPortable: ["windowsPortable", "windowsInstaller"],
    macosArm: ["macosArm", "macos", "macosIntel"],
    macosIntel: ["macosIntel", "macos"],
    macos: ["macos", "macosArm", "macosIntel"],
    linux: ["linux"]
  };

  function resolveSlot(groups, slot) {
    var chain = FALLBACK[slot] || [slot];
    for (var i = 0; i < chain.length; i += 1) {
      if (groups[chain[i]]) {
        return groups[chain[i]];
      }
    }
    return null;
  }

  function detectPlatform(nav) {
    var agentData = nav && nav.userAgentData;
    var userAgent = (nav && typeof nav.userAgent === "string" ? nav.userAgent : "").toLowerCase();
    var touchPoints = nav && typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0;
    var hinted = "";

    if (agentData && typeof agentData.platform === "string") {
      hinted = agentData.platform.toLowerCase();
    }

    if (hinted) {
      if (/android|ios|iphone|ipad/.test(hinted)) {
        return "mobile";
      }
      if (agentData.mobile === true) {
        return "mobile";
      }
      if (/win/.test(hinted)) {
        return "windows";
      }
      if (/mac/.test(hinted)) {
        return "macos";
      }
      if (/linux/.test(hinted)) {
        return "linux";
      }
      return "unknown";
    }

    if (agentData && agentData.mobile === true) {
      return "mobile";
    }

    if (!userAgent) {
      return "unknown";
    }
    if (/android|iphone|ipod|ipad/.test(userAgent)) {
      return "mobile";
    }
    /* iPadOS reports a desktop Macintosh string; the touch points give it away. */
    if (/macintosh/.test(userAgent) && touchPoints > 1) {
      return "mobile";
    }
    if (/windows|win32|win64/.test(userAgent)) {
      return "windows";
    }
    if (/macintosh|mac os x/.test(userAgent)) {
      return "macos";
    }
    if (/cros/.test(userAgent)) {
      return "unknown";
    }
    if (/linux|x11|freebsd/.test(userAgent)) {
      return "linux";
    }
    return "unknown";
  }

  /* The picker's three trails, keyed the way the markup keys them. */
  var TRAIL_FOR = { windows: "win", macos: "mac", linux: "lin" };
  var TRAIL_NAME = { win: "Windows", mac: "macOS", lin: "Linux" };

  function formatSize(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes) || bytes <= 0) {
      return "";
    }
    var megabytes = bytes / (1024 * 1024);
    if (megabytes < 1) {
      return Math.max(1, Math.round(bytes / 1024)) + " KB";
    }
    return megabytes.toFixed(1) + " MB";
  }

  function formatDate(value) {
    if (typeof value !== "string" || !value) {
      return "";
    }
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      return "";
    }
    try {
      return parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch (error) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  /* --------------------------------------------------------------- filling */

  function setText(root, selector, text) {
    var node = root.querySelector(selector);
    if (node) {
      node.textContent = text;
    }
  }

  /*
    The file name is drawn inside the illustration of the browser's download
    list and inside the SmartScreen App: line, because a reader comparing the
    picture to their own screen should be comparing the same string. Those are
    <text> nodes, so this is a text swap, not an image swap.
  */
  function nameTheShots(scope, fileName) {
    var shots = scope.querySelectorAll("[data-dl-shotfile]");
    for (var i = 0; i < shots.length; i += 1) {
      shots[i].textContent = fileName;
    }
  }

  function fillButton(button, groups, versionLabel) {
    var stop = button.closest ? button.closest(".dl-stop") : null;
    var scope = stop || button.parentNode;
    var asset = resolveSlot(groups, button.getAttribute("data-dl-slot"));

    if (!asset) {
      /* Leave the releases-page link exactly as the HTML shipped it. */
      button.classList.add("is-missing");
      setText(scope, "[data-dl-file]", "Not in the latest release");
      setText(scope, "[data-dl-size]", "");
      setText(scope, "[data-dl-ver]", versionLabel);
      return;
    }

    button.classList.remove("is-missing");
    button.setAttribute("href", asset.url);
    button.setAttribute("download", "");
    /* The markup opens the releases PAGE in a new tab, which is right for a
       page. For the file itself it is wrong: the browser jumps to a new tab
       while site.js opens the install guide on this one, behind it. A direct
       file downloads in place, so the reader stays where the guide is. */
    button.removeAttribute("target");
    setText(scope, "[data-dl-file]", asset.name);
    setText(scope, "[data-dl-size]", formatSize(asset.size));
    setText(scope, "[data-dl-ver]", versionLabel);

    var trail = button.closest ? button.closest(".dl-trail") : null;
    if (trail) {
      nameTheShots(trail, asset.name);
    }
  }

  /*
    THE SECOND BUILD IS OFFERED ONLY IF IT EXISTS. Releases do not all carry
    both: v1.20.3 shipped an Apple Silicon disk image and no Intel one. A line
    reading "Using an Intel Mac? Intel build" beside a release that has no
    Intel build is a promise this page cannot keep, so when the feed does not
    have it, the offer and its separator are taken away rather than left
    pointing hopefully at the releases page.
  */
  function fillAlternate(link, groups) {
    var asset = resolveSlot(groups, link.getAttribute("data-dl-alt"));
    var wrap = link.closest ? link.closest("[data-dl-altwrap]") : null;

    if (!asset) {
      if (wrap) {
        wrap.hidden = true;
        var separator = wrap.nextElementSibling;
        if (separator && separator.hasAttribute("data-dl-altsep")) {
          separator.hidden = true;
        }
      }
      return;
    }

    link.setAttribute("href", asset.url);
    link.setAttribute("download", "");
  }

  function applyRelease(root, release, groups) {
    var tag = release && typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    var published = formatDate(release && release.published_at);
    var versionLabel = "";

    if (tag) {
      versionLabel = /^v/i.test(tag) ? tag.replace(/^v/i, "Version ") : "Version " + tag;
    }
    if (versionLabel && published) {
      versionLabel += META_SEPARATOR + published;
    }

    var buttons = root.querySelectorAll("[data-dl-get]");
    for (var i = 0; i < buttons.length; i += 1) {
      fillButton(buttons[i], groups, versionLabel);
    }

    var alts = root.querySelectorAll("[data-dl-alt]");
    for (var j = 0; j < alts.length; j += 1) {
      fillAlternate(alts[j], groups);
    }
  }

  /* Nothing published yet. Expected today, and not a failure. */
  function applyNoRelease(root) {
    var buttons = root.querySelectorAll("[data-dl-get]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].classList.add("is-missing");
      buttons[i].setAttribute("href", RELEASES_PAGE);
      var stop = buttons[i].closest ? buttons[i].closest(".dl-stop") : root;
      setText(stop, "[data-dl-file]", "No public build yet");
      setText(stop, "[data-dl-size]", "");
      setText(stop, "[data-dl-ver]", "Watching the releases page is the quietest way to hear");
    }
  }

  /*
    Open the trail that matches this computer. The markup ships with Windows
    checked, which is a guess; this makes it an observation. A phone is told
    plainly that Makullveny is desktop software rather than being handed a
    file that cannot run there.
  */
  function openTrailFor(root, family) {
    if (family === "mobile") {
      var note = root.querySelector("[data-dl-mobile]");
      if (note) {
        note.hidden = false;
      }
      return;
    }

    var key = TRAIL_FOR[family];
    if (!key) {
      return;
    }

    var radio = root.querySelector('[data-dl-plat="' + key + '"]');
    if (radio && !radio.checked) {
      radio.checked = true;
    }

    var hint = root.querySelector("[data-dl-hint]");
    if (hint) {
      hint.textContent = "";
      hint.appendChild(document.createTextNode("We think you are on "));
      var strong = document.createElement("b");
      strong.textContent = TRAIL_NAME[key];
      hint.appendChild(strong);
      hint.appendChild(
        document.createTextNode(" " + String.fromCharCode(8212) + " press another if that is wrong.")
      );
      hint.hidden = false;
    }
  }

  /* ----------------------------------------------------------------- flow */

  function start(options) {
    var settings = options || {};
    var root = settings.root;

    if (!root || !root.querySelector) {
      return null;
    }

    var family = detectPlatform(settings.nav);
    openTrailFor(root, family);

    var fetchImpl = settings.fetchImpl;
    if (typeof fetchImpl !== "function") {
      /* No fetch: the links the HTML shipped with are already correct. */
      return null;
    }

    var settled = false;
    var timer = null;

    function finish(apply) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      apply();
    }

    /* The feed being unreadable leaves the markup alone, which already works. */
    function giveUp() {
      finish(function () {});
    }

    timer = setTimeout(
      giveUp,
      typeof settings.timeoutMs === "number" ? settings.timeoutMs : REQUEST_TIMEOUT_MS
    );

    return fetchImpl(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (response) {
        if (!response) {
          giveUp();
          return null;
        }
        if (response.status === 404) {
          finish(function () {
            applyNoRelease(root);
          });
          return null;
        }
        if (!response.ok) {
          giveUp();
          return null;
        }
        return response.json();
      })
      .then(function (data) {
        if (settled) {
          return;
        }
        if (!data || typeof data !== "object") {
          giveUp();
          return;
        }
        finish(function () {
          applyRelease(root, data, groupAssets(data.assets));
        });
      })
      .catch(giveUp);
  }

  /*
    The hero's Download button names the reader's own system. The markup
    ships a neutral label, so a blocked script or an unrecognised system
    still reads correctly; a phone is pointed at a computer, since that is
    what the section it lands on will tell them anyway.
  */
  var HERO_LABEL = {
    windows: "Download for Windows",
    macos: "Download for macOS",
    linux: "Download for Linux",
    mobile: "Get it for your computer"
  };

  function labelHero(doc, family) {
    var label = doc.querySelector("[data-dl-hero-label]");
    var text = HERO_LABEL[family];
    if (label && text) {
      label.textContent = text;
    }
  }

  function boot() {
    labelHero(document, detectPlatform(typeof navigator === "undefined" ? null : navigator));
    var root = document.getElementById("download");
    if (!root) {
      return;
    }
    start({
      root: root,
      nav: typeof navigator === "undefined" ? null : navigator,
      fetchImpl:
        typeof window !== "undefined" && typeof window.fetch === "function"
          ? window.fetch.bind(window)
          : null
    });
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  if (typeof module === "object" && module && module.exports) {
    module.exports = {
      RELEASES_PAGE: RELEASES_PAGE,
      LATEST_API: LATEST_API,
      classifyAsset: classifyAsset,
      groupAssets: groupAssets,
      resolveSlot: resolveSlot,
      detectPlatform: detectPlatform,
      labelHero: labelHero,
      formatSize: formatSize,
      formatDate: formatDate,
      start: start
    };
  }
})();
