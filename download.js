/*
  Makullveny downloads.

  Reads the latest public release once per page load and rewrites the
  download card with what actually exists. The card already contains a
  working link to the releases page before this file runs, so a visitor
  without JavaScript still has a way in.

  Rules this file keeps:
    - one network call per page load, never a poll
    - a missing release (HTTP 404) is a normal state, not an error
    - never render a button for a file that is not in the release
    - never show updater plumbing (.blockmap, latest*.yml, the mac .zip)
*/
(function () {
  "use strict";

  var RELEASES_PAGE = "https://github.com/TDG-Org/makullveny-releases/releases";
  var LATEST_API = "https://api.github.com/repos/TDG-Org/makullveny-releases/releases/latest";
  var REQUEST_TIMEOUT_MS = 9000;

  /* Middle dot, built from its code point so this file stays plain ASCII. */
  var META_SEPARATOR = " " + String.fromCharCode(183) + " ";

  var WINDOWS_NOTE =
    "Windows builds are not code-signed, so Windows may show an Unknown publisher notice. " +
    "Choose More info, then Run anyway.";

  /* ---------------------------------------------------------------- data */

  /*
    electron-builder names its files from a template and the version, so the
    exact strings change every release. Match on shape, not on a remembered
    filename.
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

  /* ------------------------------------------------------------ rendering */

  var PLATFORM_LABELS = {
    windowsInstaller: "Windows installer",
    windowsPortable: "Windows portable",
    macos: "macOS",
    linux: "Linux"
  };

  function makeElement(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  function makeLink(doc, className, href, text) {
    var link = makeElement(doc, "a", className, text);
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer");
    return link;
  }

  function makeReleasesLink(doc, className, text) {
    return makeLink(doc, className, RELEASES_PAGE, text);
  }

  function clear(panel) {
    while (panel.firstChild) {
      panel.removeChild(panel.firstChild);
    }
  }

  function describeAsset(asset) {
    var size = formatSize(asset.size);
    return size ? asset.name + " (" + size + ")" : asset.name;
  }

  function downloadLabel(slot, isPrimary) {
    if (!isPrimary) {
      return PLATFORM_LABELS[slot];
    }
    if (slot === "windowsInstaller") {
      return "Download for Windows";
    }
    if (slot === "windowsPortable") {
      return "Download for Windows (portable)";
    }
    if (slot === "macos") {
      return "Download for macOS";
    }
    return "Download for Linux";
  }

  function makeDownloadRow(doc, asset, isPrimary) {
    var row = makeElement(doc, "div", "download-row" + (isPrimary ? " is-primary" : ""));
    var link = makeLink(
      doc,
      "button " + (isPrimary ? "primary" : "secondary"),
      asset.url,
      downloadLabel(asset.slot, isPrimary)
    );
    link.setAttribute("download", "");
    row.appendChild(link);
    row.appendChild(makeElement(doc, "p", "download-file", describeAsset(asset)));
    return row;
  }

  function slotOrder(groups) {
    var order = ["windowsInstaller", "windowsPortable", "macos", "linux"];
    var available = [];
    for (var i = 0; i < order.length; i += 1) {
      if (groups[order[i]]) {
        available.push(order[i]);
      }
    }
    return available;
  }

  function primarySlotFor(family, groups) {
    if (family === "windows") {
      if (groups.windowsInstaller) {
        return "windowsInstaller";
      }
      return groups.windowsPortable ? "windowsPortable" : null;
    }
    if (family === "macos") {
      return groups.macos ? "macos" : null;
    }
    if (family === "linux") {
      return groups.linux ? "linux" : null;
    }
    return null;
  }

  function offersWindows(slots) {
    for (var i = 0; i < slots.length; i += 1) {
      if (slots[i] === "windowsInstaller" || slots[i] === "windowsPortable") {
        return true;
      }
    }
    return false;
  }

  function setBusy(panel, busy) {
    panel.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function renderLoading(panel) {
    var doc = panel.ownerDocument;
    clear(panel);
    setBusy(panel, true);
    panel.appendChild(makeElement(doc, "p", "download-lede", "Checking the latest release."));
    panel.appendChild(makeReleasesLink(doc, "download-more-link", "All releases and release notes"));
  }

  function renderNoRelease(panel) {
    var doc = panel.ownerDocument;
    clear(panel);
    setBusy(panel, false);
    panel.appendChild(makeElement(doc, "p", "download-eyebrow eyebrow", "Not yet"));
    panel.appendChild(
      makeElement(
        doc,
        "p",
        "download-lede",
        "There is no public build to download yet. Makullveny is still being polished, and the first release will appear on the releases page."
      )
    );
    panel.appendChild(
      makeElement(
        doc,
        "p",
        "download-note",
        "Watching that page is the quietest way to hear about it. Nothing on this site will email you."
      )
    );
    var actions = makeElement(doc, "div", "download-actions");
    actions.appendChild(makeReleasesLink(doc, "button secondary", "Watch the releases page"));
    panel.appendChild(actions);
  }

  function renderUnavailable(panel) {
    var doc = panel.ownerDocument;
    clear(panel);
    setBusy(panel, false);
    panel.appendChild(
      makeElement(doc, "p", "download-lede", "The release list could not be read just now.")
    );
    panel.appendChild(
      makeElement(
        doc,
        "p",
        "download-note",
        "The releases page on GitHub always has whatever is published, along with the release notes."
      )
    );
    var actions = makeElement(doc, "div", "download-actions");
    actions.appendChild(makeReleasesLink(doc, "button secondary", "Open the releases page"));
    panel.appendChild(actions);
  }

  function appendMeta(panel, release) {
    var doc = panel.ownerDocument;
    var parts = [];
    var tag = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    var published = formatDate(release.published_at);

    if (tag) {
      parts.push("Version " + tag);
    }
    if (published) {
      parts.push("Published " + published);
    }
    if (parts.length) {
      panel.appendChild(
        makeElement(doc, "p", "download-eyebrow eyebrow", parts.join(META_SEPARATOR))
      );
    }
  }

  function renderRelease(panel, release, family) {
    var doc = panel.ownerDocument;
    var groups = groupAssets(release && release.assets);
    var slots = slotOrder(groups);
    var restSlots = [];
    var primarySlot = null;
    var i;

    clear(panel);
    setBusy(panel, false);
    appendMeta(panel, release || {});

    if (!slots.length) {
      panel.appendChild(
        makeElement(
          doc,
          "p",
          "download-lede",
          "This release is published, but it does not carry an app file this page can offer."
        )
      );
      var emptyActions = makeElement(doc, "div", "download-actions");
      emptyActions.appendChild(makeReleasesLink(doc, "button secondary", "Open the releases page"));
      panel.appendChild(emptyActions);
      return;
    }

    primarySlot = family === "mobile" ? null : primarySlotFor(family, groups);
    for (i = 0; i < slots.length; i += 1) {
      if (slots[i] !== primarySlot) {
        restSlots.push(slots[i]);
      }
    }

    if (family === "mobile") {
      panel.appendChild(
        makeElement(
          doc,
          "p",
          "download-lede",
          "Makullveny is desktop software. It does not run on a phone or a tablet, so open this page on a computer to install it. These are the builds in this release."
        )
      );
    } else if (primarySlot) {
      panel.appendChild(
        makeElement(doc, "p", "download-lede", "Makullveny for desktop, ready for this computer.")
      );
      panel.appendChild(makeDownloadRow(doc, groups[primarySlot], true));
    } else if (family === "unknown") {
      panel.appendChild(
        makeElement(
          doc,
          "p",
          "download-lede",
          "Makullveny is desktop software. Pick the build that matches your computer."
        )
      );
    } else {
      panel.appendChild(
        makeElement(
          doc,
          "p",
          "download-lede",
          "This release does not include a build for your system. These are the builds it does include."
        )
      );
    }

    if (restSlots.length) {
      panel.appendChild(
        makeElement(
          doc,
          "h3",
          "download-subhead",
          primarySlot ? "Other systems" : "Desktop builds in this release"
        )
      );
      var list = makeElement(doc, "ul", "download-list");
      for (i = 0; i < restSlots.length; i += 1) {
        var item = makeElement(doc, "li");
        item.appendChild(makeDownloadRow(doc, groups[restSlots[i]], false));
        list.appendChild(item);
      }
      panel.appendChild(list);
    }

    if (offersWindows(slots)) {
      panel.appendChild(makeElement(doc, "p", "download-note", WINDOWS_NOTE));
    }

    panel.appendChild(makeReleasesLink(doc, "download-more-link", "All releases and release notes"));
  }

  /* ----------------------------------------------------------------- flow */

  function start(options) {
    var settings = options || {};
    var panel = settings.panel;

    if (!panel || !panel.ownerDocument) {
      return null;
    }

    var fetchImpl = settings.fetchImpl;
    if (typeof fetchImpl !== "function") {
      /* No fetch available: leave the plain releases link that shipped in the HTML. */
      return null;
    }

    var family = detectPlatform(settings.nav);
    var settled = false;
    var timer = null;

    function finish(render) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      render();
    }

    function fail() {
      finish(function () {
        renderUnavailable(panel);
      });
    }

    renderLoading(panel);

    timer = setTimeout(fail, typeof settings.timeoutMs === "number" ? settings.timeoutMs : REQUEST_TIMEOUT_MS);

    return fetchImpl(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (response) {
        if (!response) {
          fail();
          return null;
        }
        /* Nothing published yet. Expected today, not a failure. */
        if (response.status === 404) {
          finish(function () {
            renderNoRelease(panel);
          });
          return null;
        }
        if (!response.ok) {
          fail();
          return null;
        }
        return response.json();
      })
      .then(function (data) {
        if (settled) {
          return;
        }
        if (!data || typeof data !== "object") {
          fail();
          return;
        }
        finish(function () {
          renderRelease(panel, data, family);
        });
      })
      .catch(fail);
  }

  function boot() {
    var panel = document.getElementById("download-panel");
    if (!panel) {
      return;
    }
    start({
      panel: panel,
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
      detectPlatform: detectPlatform,
      formatSize: formatSize,
      formatDate: formatDate,
      start: start
    };
  }
})();
