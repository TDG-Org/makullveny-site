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
        apiUrl: "https://<project>.supabase.co/rest/v1/rpc/tdg_share_read",
        publishableKey: "<the anon/publishable key>"
      };

  NEITHER VALUE IS A SECRET — a publishable key is public by definition and the
  URL is in every request — but neither belongs in git either: committing them
  would tie this public repository to one project and make rotating a key a code
  change. That is why the file exists here EMPTY and is filled in at deploy.

  NEVER put a service-role key, a user token, or anything about a reader or a
  writer in this file. This repository is public and holds viewer code only.
*/
/*
  FILLED IN 2026-09-07. Sharing is live.

  publishableKey is DELIBERATELY LEFT EMPTY, and that is not an oversight.
  mak-share is deployed with verify_jwt OFF, because the readers it exists
  for are anonymous and a JWT check would refuse the only people it serves.
  Measured against the live endpoint: a POST carrying NO apikey and NO
  Authorization header answers 200 with the snapshot, and an unknown token
  answers 404. read.js already sends the key only `if (CONFIG.publishableKey)`,
  so leaving it empty simply sends neither header.

  The result is that THIS PUBLIC REPOSITORY CONTAINS NO KEY OF ANY KIND.
  The apiUrl below is not a secret -- it is the address in every request the
  reader's own browser makes, and read.js refuses to call anything that is
  not in its ALLOWED_API_ORIGINS list anyway.

  The token in the URL fragment is the whole authorization, and the fragment
  is never sent to a server. Behind this endpoint, `anon` holds EXECUTE on
  nothing at all: mak_publication_read is granted to service_role only, and
  the function holds that key server-side.
*/
window.MAKULLVENY_READER_CONFIG = {
  apiUrl: "https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/mak-share",
  publishableKey: ""
};
