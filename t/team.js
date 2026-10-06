/*
  A STUDY TEAM INVITE (t/, 2026-10-06). Reads the code from the fragment,
  checks it against the app's own team-code alphabet, and points the Join
  button at makullveny://team/<CODE>.

  THE ALPHABET IS THE APP'S: src/studyTeamsModel.js normalizeCode in the
  Makullveny repo (8 characters, A-Z and 2-9 without I, O, 0 and 1; dashes,
  spaces and case are forgiven). tests/team-invite.test.js pins it. Anything
  else is never put into a link.
*/
(function () {
  "use strict";

  var CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
  var DEEP_LINK_BASE = "makullveny://team/";

  /* "abcd-efgh" -> "ABCDEFGH"; "" when it is not a team code. */
  function normalizeCode(value) {
    var raw = typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    return CODE_PATTERN.test(raw) ? raw : "";
  }

  /* "#ABCD-EFGH" (or "#abcdefgh") -> "ABCDEFGH". */
  function codeFromHash(hash) {
    var text = typeof hash === "string" ? hash.replace(/^#/, "") : "";
    try { text = decodeURIComponent(text); } catch (error) { return ""; }
    return text.length <= 12 ? normalizeCode(text) : "";
  }

  function formatCode(code) {
    var clean = normalizeCode(code);
    return clean ? clean.slice(0, 4) + "-" + clean.slice(4) : "";
  }

  function deepLink(code) {
    var clean = normalizeCode(code);
    return clean ? DEEP_LINK_BASE + clean : "";
  }

  function paint(doc, hash) {
    var code = codeFromHash(hash);
    var codeNode = doc.getElementById("code");
    var open = doc.getElementById("open");
    var lead = doc.getElementById("lead");
    var paste = doc.getElementById("paste");
    if (!code) {
      if (codeNode) codeNode.hidden = true;
      if (lead) lead.textContent = "This invite link is missing its code. Ask your teammate to copy it again.";
      if (open) { open.href = "makullveny://open"; open.textContent = "Open Makullveny"; }
      if (paste) paste.textContent = "Already have the code? Paste it in Community.";
      return "";
    }
    if (codeNode) { codeNode.textContent = formatCode(code); codeNode.hidden = false; }
    if (open) { open.href = deepLink(code); open.textContent = "Join in Makullveny"; }
    if (lead) lead.textContent = "Open Makullveny to see the team, then press Join.";
    if (paste) paste.textContent = "Already have it? Paste this code in Community.";
    return code;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CODE_PATTERN: CODE_PATTERN, DEEP_LINK_BASE: DEEP_LINK_BASE, normalizeCode: normalizeCode, codeFromHash: codeFromHash, formatCode: formatCode, deepLink: deepLink, paint: paint };
    return;
  }
  if (typeof document === "undefined") return;
  paint(document, window.location.hash);
  window.addEventListener("hashchange", function () { paint(document, window.location.hash); });
})();
