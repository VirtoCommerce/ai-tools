# VCST-5933 — Storefront verification (locked membership vs org order history)

**Verdict: PASS (storefront layer).** TechFlow orders disappear from the storefront while the membership is locked (3/3 cycles) and come back after unlock.
**Env:** vcst (FRONT_URL/BACK_URL from `config.js`), storefront `2.59.0-pr-2467-1951`, XOrder `3.1013.0-pr-52-a3c9`.
**Date:** 2026-09-23 · **Browser:** playwright-firefox for cycle 1 steps 1–5, then **playwright-edge** from cycle 1 step 6 onward (Firefox lane hit its sticky click stall on the account menu: 3 timeouts, including after a fresh navigation).
**Teardown:** membership `a44e7c12-…` read back `isCurrentlyLocked: false` at the end.

## Fixture
- Buyer `b2bUserEmail` (multi-org), password via MCP secret `MULTI_ORG_USER_PASSWORD`.
- TechFlow = `lockedOrgId`; BuildRight = `unlockedOrgId` (from `test-data/postman/vcst-qa.postman_environment.json`).
- Lock/unlock went through Platform REST using an admin token from a throwaway script, which was deleted afterwards. No token was written to disk.

## Checklist
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Baseline: TechFlow org orders visible while unlocked | PASS | `/account/orders` → "All orders" lists org orders placed by other members. `organizationOrders.totalCount = 96` (req #367, Edge) |
| 2 | Locked: TechFlow org orders NOT visible (3/3) | PASS | c1: reload → `/403`. c2 + c3: in-session "All orders" re-query → `organizationOrders` returns `Forbidden` (`data.organizationOrders: null`) → routed to `/403`. No rows rendered |
| 3 | Locked: Home still loads | PASS | "Home page" CTA → `/` renders fully and the user stays signed in (header `AGENT-TEST-Org-TechFlow-20260310 / AgentTest MultiOrg`), c1 + c2 |
| 4 | Locked: BuildRight orders still visible | BLOCKED (fixture) | The switch to BuildRight succeeded, but it **signed the user out** (see note A). After signing in again, BuildRight shows only "My orders", with the message "There are no orders yet" and no "All orders" toggle. **This is the same while unlocked**, so the fixture role hides it and the lock does not. Org-specificity is already covered GREEN at the API layer |
| 5 | Unlock restores TechFlow orders | PASS | After each unlock, "All orders" lists 10 rows on page 1 (3/3 cycles) |
| 6 | No new console errors beyond the expected Forbidden | PASS | Only error: `ApolloError: Access denied.` (org-scoped query Forbidden). The rest are GA-cookie / WebSocket / preload warnings. No failed network requests apart from 2 `NS_BINDING_ABORTED` caused by the page reload during the org switch |
| 7 | BL-UI: refused state is coherent | PASS | Standard branded 403 page: "403 / Access denied / You do not have permissions to access the requested page" and a "Home page" CTA. Header, nav and footer stay intact. No raw JSON, layout not broken |

## Step-3 observation per cycle
- **Cycle 1 (Firefox):** Lock, then F5 on the page. The page kept showing the list, but the F5 did not produce a real reload (the snapshot tree and toggle state were identical and no new query ran), so it counts as a tool artifact, not a result. Explicit navigation to `/account/orders` → app init → `organization` (GetOrganizationAddresses) `Forbidden` + `pageContext.contact.organization.isLockedForCurrentUser: true` → **`/403 Access denied`**. The header still showed TechFlow as active.
- **Cycle 2 (Edge):** Lock, then in the same mounted SPA click "My orders" → "All orders". The fresh `organizationOrders` request returns **`Forbidden`** and the app routes to **`/403`**. A full reload of `/account/orders` also lands on `/403`. Header: TechFlow.
- **Cycle 3 (Edge):** Same as cycle 2. `organizationOrders` returns `Forbidden` (req #174) → **`/403`**. Header: TechFlow.

Cycles 2–3 exercise the fixed resolver directly. Before the fix, this same in-session query returned the 96-order list.

## Notes (not defects of this fix)
- **A. Switching org while one membership is locked signs the user out.** Locking revokes refresh tokens, and the org switch needs a token refresh, so the user lands on `/sign-in?returnUrl=…`. This matches the known behaviour "org lock revokes tokens, does not evict a live session" and is not caused by XOrder#52. Signing in again works and lands on BuildRight.
- **B.** `/company/orders` is a 404. Org orders live under `/account/orders` → "All orders".

## Screenshots (`screenshots/`)
- `c1-01-baseline-techflow-all-orders-unlocked.png`
- `c1-03-locked-orders-reload-403.png`
- `c1-04-locked-home-loads.png`
- `c1-05-locked-buildright-orders-page.png`
- `c1-06-unlocked-techflow-orders-restored.png`
- `c2-03-locked-insession-allorders-403.png`
- `c3-03-locked-insession-allorders-403.png`
