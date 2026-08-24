# VCST-5589 — Pre-fix RED baseline (vcst-qa) — **BLOCKED (login)**

**Verdict:** BLOCKED — could not authenticate as the Sales Rep on the `playwright-edge` lane, so the dashboard/customer-profile cache-behaviour measurement was not captured. No RED result is being invented; the measurement is genuinely missing. Reason and remediation below.

## Environment (confirmed)
- Storefront: `https://vcst-qa-storefront.govirto.com` (store **B2B-store**), Admin: `https://vcst-qa.govirto.com`
- **Theme (pre-fix, confirmed live from footer):** `Ver. 2.55.0-pr-2399-845a-845a359c` — matches the pinned pre-fix build the task described.
- Browser lane: `playwright-edge` (did not touch playwright-chrome).
- Target rep: `agent-test-sr-primary@example.com` (`SR_REP_PRIMARY`, serves ORG-001..004), password from `TEST_USER_PASSWORD_VCST` (→ suffix-promoted to `TEST_USER_PASSWORD` at seed time).

## Why it is blocked (two compounding causes)
1. **MCP secret substitution did not fire → literal password sent.** The edge Playwright MCP reads its `--secrets` file (`.env.playwright.local`) **only at server startup**, and at startup that file contained only `ORG_USER_PASSWORD` — **not** `TEST_USER_PASSWORD_VCST`. I added the var to the file mid-session, but a running server never re-reads it. Proven by the captured request body (see Evidence): the storefront POSTed `password=TEST_USER_PASSWORD_VCST` (the **literal name**, not the value). Typing the plaintext value instead is disallowed (mcp-browsers rule: enter passwords via the secret NAME so plaintext never enters the transcript; task: "reference env var names only").
2. **Rep account is now temporarily locked out.** The failed literal-password attempts tripped `user_is_temporary_locked_out` (`count:3`). A 5.5-min quiet wait did **not** clear it (lockout is renewed by each attempt), so attempts were stopped rather than extend the window.
- I **cannot** reset the password / unlock the account — read-only guardrail on vcst-qa.
- I **cannot** re-probe the credential via a Node `/connect/token` call — the auto-mode classifier blocks repeated token-endpoint calls as credential probing.

Note on the seeded credential: it was never actually tested, so it is neither confirmed nor disproved — the literal secret NAME was sent as the password on every attempt, so the value itself never reached the server. The first Node check's generic `login_failed` then flipped to the explicit `user_is_temporary_locked_out` once the attempt counter tripped.

**Correction (orchestrator, post-run):** the lockout was **self-inflicted by these three literal-password attempts alone** — there was no competing lane on this account. See the Parallel-lane note below.

## The measurement (NOT captured)
None of steps 1–7 (dashboard initial requests, client-side away-and-back cache-hit cycles ×3, F5 contrast, customer-profile cycle, period/filter change, customer-switch) could be run — all require being logged in and on `/company/dashboard`, which was never reached. No statistics GraphQL op (`salesRepCustomerOrderStatistics` / `salesRepCustomerCartStatistics` / `salesRepCustomerCounts`) was observed on this lane, so no raw request/response is available from me.

## Parallel-lane note — RESOLVED by the orchestrator (this lane's inference was wrong)
The `VCST-5589-C1-*` / `VCST-5589-datachange-*` screenshots in this folder come from the **Phase B chrome lane on vcptcore-qa** — a **different environment**, a **different theme build** (post-fix `2.55.0-pr-2412`), and a **different account** (a vcptcore B2B-store rep). They are **not** a pre-fix baseline and there was **no contention** on `agent-test-sr-primary@example.com`: no other lane ever touched vcst-qa. The lockout here was caused solely by this lane's three literal-password attempts.

## Evidence (this lane)
- **Login locked (screenshot):** `screenshots/BASELINE-BLOCKED-login-locked.png` — sign-in page, on-page error *"Your account has been temporarily locked. Please try again later."*
- **Request body (literal password proof):** `POST /connect/token` →
  `grant_type=password&scope=offline_access&storeId=B2B-store&username=agent-test-sr-primary%40example.com&password=TEST_USER_PASSWORD_VCST`
- **Response body (lockout):** `{"code":"user_is_temporary_locked_out","error":"invalid_grant","errorDescription":"Your account has been temporarily locked. Please try again after some time.","count":3}` (Authorization/token fields were null; nothing to redact.)

## Baseline actually used for the RED→GREEN pair (orchestrator, since this live capture failed)
A live RED was **not** captured. The baseline is therefore cited, not fabricated, from three
independent non-live sources:

1. **Static proof of the buggy mechanism in a deployed build** (machine-checkable, orchestrator-run):
   the vcst-qa served bundle `/assets/dashboard-BNab7V5S.js` (theme `2.55.0-pr-2399`) contains
   `"[sales-rep] salesRepCustomerCounts failed:"` but **no `fetchPolicy` argument at all** → the
   `useQuery` calls run on Apollo's default `cache-first`. Contrast with vcptcore-qa's post-fix bundle,
   where all three call sites pass `{fetchPolicy:Y}` with `Y = "cache-and-network"`.
2. **The reporter's own STR in VCST-5589**, which documents the observed stale-value behaviour and the
   "correct number appears only after a full page reload" symptom.
3. **PR #2412's 4 new specs** (`statistics-freshness.test.ts`) which drive a real `InMemoryCache` +
   counting link (mount → unmount → remount → assert a second request); the author states all three
   behavioural specs fail on the old policy. Independently re-running them against pre-fix code was
   **not** done, so that claim rests on the author's word plus source review.

Source 1 proves the mechanism was present and is now gone; it does not prove the user-visible symptom.
The user-visible half rests on source 2 + the live GREEN in the Phase B report.

## To unblock (for the human / next run)
1. Add `TEST_USER_PASSWORD_VCST=<value>` (login passwords only) to `.env.playwright.local` **before** the edge MCP starts, then **restart** the `playwright-edge` server (already appended to the file this session, but a restart is required for it to load).
2. Let the lockout window fully clear (stop all login attempts on `agent-test-sr-primary@example.com`; avoid two lanes hitting the one shared login concurrently — use a second seeded rep for the second lane if a parallel capture is intended).
3. Re-run steps 1–7. The RED expectation stands: the three statistics ops use Apollo `cache-first` with day-stable variables, so an away-and-back client-side cycle should fire **zero** new requests and only F5 should refetch.
