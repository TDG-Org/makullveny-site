/*
  OPEN THE APP. Tries the hand-off once; the button in the static HTML is the
  real mechanism (browsers may ask first, or block a scheme without a click),
  so a script error still leaves a working way in.
*/
(function () {
  "use strict";
  try {
    location.href = "makullveny://open";
  } catch (error) {
    /* Blocked. The button is the answer. */
  }
  setTimeout(function () {
    var title = document.getElementById("title");
    if (title) title.textContent = "Open Makullveny";
  }, 1500);
})();
