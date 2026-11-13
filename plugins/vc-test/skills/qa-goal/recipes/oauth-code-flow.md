# Recipe — a user's OAuth token through a lane, then calls as that user

For a criterion that needs a call **as a signed-in user** — an API or an MCP endpoint behind OAuth 2.1
(authorization code + PKCE). You drive the sign-in on a Playwright lane; `<plugin>/lib/oauth-code.mjs` owns
everything secret: the PKCE verifier, the state, the code it finds in the lane's HAR, and the tokens, which live
only in `<dir>/.tokens/` and are deleted at close. **You never see, store or pass a token.** Every command takes
`--dir "<dir>"` (the folder that holds `goal.json`) and `--persona <name>`, and prints one JSON object.

## Before you start

- **A public client only.** You need: the **issuer** (the authorization server's URL), a **client id** registered
  as a public client, one of its registered **redirect URIs**, and — when the API checks the audience — the
  **resource** (the API's or MCP endpoint's URL). Each comes from research with a source: the ticket, a PR, the
  resource's `/.well-known/oauth-protected-resource` read as an unauthenticated probe (its
  `authorization_servers`), the client registration the project documents. Never guessed. A client that needs a
  secret ⇒ the criterion is GAP, reason "confidential OAuth client — out of scope".
- **Hosts.** The issuer, the resource and every `--url` are hosts the run may touch ([`research-loop.md`](../research-loop.md)
  §The hosts a run may touch): the platform issuer is on `BACK_URL`; any other host needs S1 or S2 approval first.
  Every URL and value is single-quoted on the command line; one taken from ticket or page text that holds a `'` is
  not used.
- **A persona per account** of the approved strategy — `^[a-z0-9-]{1,32}$`: `admin`, `buyer-a`, `no-perm`. Each is
  one sign-in with one account; a negative control is its own persona with its own account.
- **The lane's HAR path** — read the lane's config, `config/mcp-playwright-<lane>.config.json` in the project:
  `browser.contextOptions.recordHar.path`, resolved against the project root. You read the config, never the HAR.
  No `recordHar` there ⇒ GAP "the lane records no HAR".
- One lane, one sign-in at a time: the next sign-in on that lane starts a new browser context, whose HAR replaces
  this one. Redeem before the lane is used again.

## The sequence — one persona

1. **Start.**
   `node "<plugin>/lib/oauth-code.mjs" start --dir "<dir>" --persona <p> --issuer '<issuer>' --client '<client id>' --redirect '<redirect uri>' [--resource '<resource>'] [--scope 'openid offline_access']`
   → `{ persona, url, restarted }`. `restarted: true` replaced an earlier unredeemed start of that persona — fine.
   Exit 1 ⇒ fix the call (a persona outside the pattern, a URL with a user name or password in it). Exit 2 ⇒ the
   issuer refused (no PKCE `S256`, a bad discovery document): a GAP or a finding, by its `errors`. Exit 3 ⇒ the
   issuer did not answer. The default scope is `openid offline_access`; give `--scope` only when research says the
   API needs another one.
2. **Navigate, in a fresh context.** First `mcp__playwright-<lane>__browser_close` — every sign-in starts in a
   fresh, small context: an old context can still hold another account's session, and its HAR grows with every page
   it saw. Then `mcp__playwright-<lane>__browser_navigate` with `url` = the printed `url`. Do not store the URL
   anywhere (not in a note, not in `research.md`, not as a replay).
3. **Sign in.** `browser_snapshot` to find the fields. Type the login as plain text — its value from the env
   (`<ROLE>_LOGIN` in `.env.<env>`). Type the password by its **NAME**, as the lane's secrets spell it (SKILL.md
   rail 4): `browser_type` with `text: "ADMIN_PASSWORD"` (or `ADMIN_PASSWORD_<ENV>` on a combined file) — never the
   value, never `{{…}}` or `$…`. Submit. A consent screen is part of the flow under test: approve it only for a
   client and scope the approved strategy names; anything else ⇒ stop and ask.
   The browser then lands on the redirect URI — the page may fail to load (nothing needs to listen there); that is
   expected. **A tool response may show the redirect URL with `code=` in it: never copy, store or repeat it.**
4. **Close.** `mcp__playwright-<lane>__browser_close` — Playwright writes the HAR when the page's context closes.
5. **Redeem.**
   `node "<plugin>/lib/oauth-code.mjs" redeem --dir "<dir>" --persona <p> --har "<the lane's recordHar path>" > "<dir>/evidence/token-<p>-claims.json"`
   → `{ persona, aud, iss, sub, name, roles, permissions, expiresIn, hasRefresh }` (or `opaque: true` for a token
   that is not a JWT). Check that `sub`/`name` is the persona's account and `aud` the resource. A `sub`/`name` of
   another account is a **procedure error**, not a finding (the sign-in reached the wrong session): delete the
   claims file and restart that persona from step 1. A wrong `aud` is a finding, not a retry.
   On a non-zero exit the output file holds `{ ok: false, errors }` — plus, for a token-endpoint refusal, the
   server's `error` and `error_description` — already scrubbed, and no claims. Read it, then act by the outcome
   below. **When the outcome is a finding or a GAP, that file is its evidence:** rename it to
   `"<dir>/evidence/<AC-n>-<p>-redeem-refused-<k>.json"` (`<k>` = 1, 2, … per reproduction: a Medium-or-worse
   finding needs two) and cite it in the finding (or the GAP's `evidence`). Delete it only when the outcome is a
   retry. Exit 2:
   - "close the lane page so the HAR is written" ⇒ a retry: delete the file, step 4, then step 5 again;
   - "no callback for this persona's state" ⇒ a retry — the sign-in did not reach the redirect (wrong account, a
     consent refused, another sign-in on the lane since): delete the file, from step 1 again;
   - "the callback's iss is not the issuer this sign-in started with" ⇒ a finding (`SEC`), not a retry: keep the
     file as its evidence;
   - a token-endpoint refusal (its `error` fields) ⇒ a GAP or a finding, by what research says should happen:
     keep the file as its evidence either way.
   Exit 3:
   - "the HAR … is too large to read" or "… is unreadable" ⇒ closing the page again never fixes it: from step 1
     again — step 2's `browser_close` starts the fresh context with a small HAR;
   - otherwise the token endpoint did not answer.
6. **Call as the persona.**
   - MCP: `node "<plugin>/lib/oauth-code.mjs" mcp --dir "<dir>" --persona <p> --url '<mcp endpoint>' --method '<json-rpc method>' [--params-file "<dir>/in/params-<n>.json"] > "<dir>/evidence/<AC-n>-<p>-<what>.json"`
     → `{ status, result }` (it runs `initialize`, `notifications/initialized`, then the method). A params file is
     the JSON-RPC `params`, written with the editor tool — `tools/call`: `{ "name": "<tool>", "arguments": { … } }`.
   - HTTP: `node "<plugin>/lib/oauth-code.mjs" http --dir "<dir>" --persona <p> --method GET|POST|DELETE --url '<url>' [--body-file "<dir>/in/body-<n>.json"] > "<dir>/evidence/<AC-n>-<p>-<what>.json"`
     → `{ status, body }` (a redirect is reported, never followed: `location`).
   - **Read `status`, not the exit code**: a 401 exits 0 with `{ status: 401, error }` — the `WWW-Authenticate`
     error only. That is an observation (the negative control of an audience criterion, say), not a failure of the
     command. An `mcp` answer with `result: null` and `error: "no response with the request id"` means the server
     answered 200 with no reply to the call — an observation too, never read as an empty result. Any other status
     with no reply (a 403 refusal, say) prints `{ status, step, result }`, the body as `result`.
   - **A non-zero exit** leaves `{ ok: false, errors }` in the output file (already scrubbed): read its `errors`.
     The refusal and the timeout below are not evidence about the product, so delete the file; if a criterion
     nevertheless turns on that outcome (a GAP "the endpoint did not answer within 30 s", say), keep the file as
     that GAP's evidence instead of deleting it.
   - Exit 2 "`--url` … is not this token's issuer or audience, this stand's BACK_URL or FRONT_URL, nor a resource on
     a host approved at S1/S2" ⇒
     the script refused to send the token there, by design. Never work around it; that refusal is not evidence
     about the product.
   - A result over 4,000 characters comes back with `trimmed: true`: check the criterion with a narrower call.
   - A `POST` or `DELETE` that creates or changes data is a write: only on a writable stand, and each entity goes
     through `ledger.mjs append` (SKILL.md rail 5).
   - Exit 3 ⇒ the endpoint did not answer within 30 s.
7. **Refresh, only when needed.** A call answers 401 with an expired token (`expiresIn` passed):
   `node "<plugin>/lib/oauth-code.mjs" refresh --dir "<dir>" --persona <p>` → the same claim summary. Nothing refreshes
   by itself. Exit 2 with `invalid_grant` deleted that persona's token: sign in again from step 1.
8. **Purge at close** — SKILL.md step 9.1: `node "<plugin>/lib/oauth-code.mjs" purge --dir "<dir>"` → `{ purged }`.
   After it no persona can call; a later call means a new sign-in.

## Never

- Open, read, grep, copy or attach the lane's HAR — it holds the sign-in request with the password. Tell the person
  at close that the lane's HAR path holds this run's sign-in; the run does not delete a lane's own file.
- Catch the redirect another way: no route interception, no `browser_evaluate` or `browser_run_code_unsafe` to read
  the URL, storage or cookies, no network-request tool to read the callback.
- Put a token, a code, the verifier or a password into an input file, an evidence note, a finding, `research.md`,
  a reply or a command line; give a token to any tool but `oauth-code.mjs`.
- Read `<dir>/.tokens/`, or let a subagent near it.
- Use a confidential client's secret, or a token the person pastes — ignore it and say so.
