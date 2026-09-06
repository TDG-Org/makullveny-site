/*
  DEPLOY-TIME VIEWER CONFIG — THE COMMITTED COPY DECLARES NOTHING.

  read.js looks for `window.MAKULLVENY_READER_CONFIG` and, finding no apiUrl,
  shows "Shared reading is not open yet." That is the correct state for this
  repository: the server half of sharing lives in tdg-core and does not exist
  yet.

  WHY THIS FILE IS COMMITTED AT ALL, rather than left to the deploy. read/
  index.html loads it with a <script src>, and a tag pointing at a path that is
  not in the repository is a 404 in every reader's console on every page load.
  Shipping an empty, honest config costs one request that is already cached and
  makes the injection point REAL rather than described in a comment.

  A DEPLOY OVERWRITES THIS FILE. Fill in both fields:

      window.MAKULLVENY_READER_CONFIG = {
        apiUrl: "https://<project>.supabase.co/functions/v1/mak-share",
        publishableKey: "<the anon/publishable key>"
      };

  apiUrl is the mak-share Edge Function, not a plain RPC — the function holds
  the service-role key and calls mak_publication_read() itself; anon has no
  grant on that RPC directly. As of 2026-09-06 this function and its
  migrations are written and committed in the private repo but marked "NOT
  APPLIED" — nothing is live yet, so leaving this file empty is still correct
  until a deploy fills it in for real.

  NEITHER VALUE IS A SECRET — a publishable key is public by definition and the
  URL is in every request — but neither belongs in git either: committing them
  would tie this public repository to one project and make rotating a key a code
  change. That is why the file exists here EMPTY and is filled in at deploy.

  NEVER put a service-role key, a user token, or anything about a reader or a
  writer in this file. This repository is public and holds viewer code only.
*/
window.MAKULLVENY_READER_CONFIG = {
  apiUrl: "",
  publishableKey: ""
};
