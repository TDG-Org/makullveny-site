/*
  THE RETURN PAGE Stripe Checkout redirects to. Ported from the private app's
  docs/checkout-return/index.html verbatim in behavior; only the markup split
  (external CSS/JS instead of inline) changed, so this page can carry a CSP
  with no 'unsafe-inline'.

  WHAT THIS PAGE MUST NEVER DO IS PROMISE ANYTHING. It knows only which URL
  Stripe redirected to, and a URL is not a receipt -- anyone can type one. The
  webhook is the sole authority for what an account owns, and the app re-asks
  the server when it comes forward. So the success copy says a payment was
  taken and is being confirmed; it never says a purchase is unlocked.
*/
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  /* Anything that is not literally "success" is treated as a cancel. An
     unrecognised value must fall to the side that claims LESS. */
  var success = params.get("outcome") === "success";

  var copy = success
    ? {
        title: "Payment received",
        lead:
          "Thank you. Makullveny is confirming the payment with Stripe now — " +
          "what you bought appears in the app as soon as that check clears, " +
          "usually within a few seconds.",
        link: "makullveny://checkout/success"
      }
    : {
        title: "Checkout cancelled",
        lead:
          "No payment was taken and nothing has changed on your account. " +
          "You can pick up right where you left off.",
        link: "makullveny://checkout/cancel"
      };

  document.title = "Makullveny — " + copy.title;
  document.getElementById("title").textContent = copy.title;
  document.getElementById("lead").textContent = copy.lead;

  var button = document.getElementById("open");
  button.href = copy.link;

  /* Try the hand-off once, automatically. Browsers increasingly require a user
     gesture before following a custom scheme, and some show a permission
     prompt -- so this is an OPTIMISATION, never the mechanism. The button
     above is always present and always works, which is why it is rendered in
     the static HTML rather than created here: a script error must still leave
     a working way back. */
  try {
    location.href = copy.link;
  } catch (error) {
    /* Blocked. The button is the answer. */
  }

  /* Said only after the automatic attempt has had its chance, so the student
     is not told to press a button that is about to become unnecessary. */
  setTimeout(function () {
    document.getElementById("fine").textContent =
      "Still here? Your browser may be blocking the hand-off. Press the button " +
      "above, or just switch back to Makullveny yourself — it checks again on " +
      "its own every time it comes to the front. You can close this tab.";
  }, 1500);
})();
