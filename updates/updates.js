/*
  WHAT'S NEW — the rendering. Reads window.MAKULLVENY_UPDATES (updates-data.js)
  and builds the list with textContent only — this is our own first-party
  data, not user content, but there is no reason for it to ever touch
  innerHTML either. No build step, no framework, no dependency.
*/
(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    var host = document.getElementById("updatesList");
    var entries = Object.prototype.toString.call(window.MAKULLVENY_UPDATES) === "[object Array]"
      ? window.MAKULLVENY_UPDATES : [];

    if (!entries.length) {
      host.appendChild(el("p", "updates-empty", "Nothing published yet — check back soon."));
      return;
    }

    entries.forEach(function (entry, index) {
      var item = el("article", "update-entry" + (index === 0 ? " update-entry-current" : ""));

      var head = el("div", "update-entry-head");
      var badge = el("span", "update-version", "v" + entry.version);
      head.appendChild(badge);
      if (index === 0) head.appendChild(el("span", "update-current-tag", "Current"));
      if (entry.date) {
        var time = document.createElement("time");
        time.className = "update-date";
        time.setAttribute("datetime", entry.date);
        time.textContent = formatDate(entry.date);
        head.appendChild(time);
      }
      item.appendChild(head);

      var highlights = Object.prototype.toString.call(entry.highlights) === "[object Array]" ? entry.highlights : [];
      if (highlights.length) {
        var list = el("ul", "update-highlights");
        highlights.forEach(function (line) { list.appendChild(el("li", null, String(line))); });
        item.appendChild(list);
      }

      var links = Object.prototype.toString.call(entry.links) === "[object Array]" ? entry.links : [];
      if (links.length) {
        var linkRow = el("p", "update-links");
        links.forEach(function (link, i) {
          if (!link || typeof link.href !== "string") return;
          if (i > 0) linkRow.appendChild(document.createTextNode(" · "));
          var a = document.createElement("a");
          a.href = link.href;
          a.textContent = String(link.label || link.href);
          linkRow.appendChild(a);
        });
        if (linkRow.childNodes.length) item.appendChild(linkRow);
      }

      host.appendChild(item);
    });
  }

  function formatDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!parts) return String(iso || "");
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var month = months[parseInt(parts[2], 10) - 1];
    if (!month) return String(iso);
    return month + " " + parseInt(parts[3], 10) + ", " + parts[1];
  }

  render();
})();
