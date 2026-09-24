/*
  THE VIEWER'S CONFIG — COMMITTED, BECAUSE NOTHING ELSE WOULD FILL IT IN.

  read.js reads `window.MAKULLVENY_READER_CONFIG`. With no apiUrl it shows
  "Shared reading is not open yet."; with one, it posts the link's token to it
  — but only after checking the URL against its own ALLOWED_API_ORIGINS, so
  this file can never point the page anywhere else.

  WHY THE URL IS IN GIT. This site is GitHub Pages served straight from the
  branch: no .github/workflows, no deploy step, nothing that could overwrite
  this file at publish time. The first plan (an empty copy a deploy fills in)
  therefore meant sharing was permanently off. The URL is not a secret — it is
  the address in every request a reader's browser makes — and the one project
  it names is already pinned in read.js's ALLOWED_API_ORIGINS and in
  read/index.html's CSP, so committing it ties this repo to nothing new.
  Pointing sharing at a different project means changing all three together.

  WHAT STILL NEVER GOES IN: a key of any kind. publishableKey stays "" (see
  below), and tests/reader-hardening.test.js fails if it is ever filled, or if
  apiUrl names any origin read.js would refuse. NEVER put a service-role key,
  a user token, or anything about a reader or a writer in this file. This
  repository is public and holds viewer code only.
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
