# VCST-5850 — Testing checklist, round 2 (delta re-check, Artifact B)

**Ticket:** [Sales Rep hub] Send push/email to multiple customers · Story · Testing · parent VCST-5142
**Env:** vcptcore-qa (`TEST_ENV=vcptcore`) · store `B2B-store`
**Path:** FAST delta re-check, operator-scoped 2026-10-06. Round 1: FULL run, `reports/tickets/Sprint26-19/VCST-5850/` (PASS WITH NOTES).
**Build delta since round 1:** backend unchanged (SalesRep `3.1012.0-pr-21-8964`, XCart `3.1038.0-pr-141-b404`,
Cart `3.1011.0-pr-194-8331`, all probed live). Theme `2.59.0-pr-2476-0abb` → **`2.59.0-pr-2476-43b1`**
(vc-deploy-dev@vcptcore-qa, 2026-10-06T11:01Z). The new head 43b1a918 only merges `dev`: VCST-6100 (search dropdown),
VCST-6096 (VcButton keeps its accessible name while loading), VCST-5945 (top header on one line at 1280), VCST-6176 (Returns icon outline).
**Nothing in the delta touches Sales Rep communication code.** This round re-checks the three send entry points for regressions
from the shared primitives (VcButton, top header) and re-confirms the standing finding.

**Oracles:** `{SPEC}` = round-1 contract (PR #21 / #2476) · BL-UI-003/004/005 · BL-A11Y (accessible name) · ECL ch. 7, 15.
**Data:** rep `@td(SR_REP_PRIMARY)`; reader `@td(ACME_BUYER)`; orgs `@td(ORG_ACME)`, `@td(ORG_TECHFLOW)`.
Each message body carries a unique `AGENT-TEST-5850-R2-<case>-<rand>` marker. Lists are created in the case and deleted in Cleanup.

**Result (2026-10-06 11:19–11:32Z): 8/8 PASS, verdict PASS WITH NOTES. No regression from 43b1; the To-Be multi-select is still not implemented.**

| # | Condition | Lane | Verdict | Evidence |
|---|---|---|---|---|
| B0 | Build marker: the storefront serves 43b1. The Returns icon in the account menu renders outline (VCST-6176 is in this build) | FE | PASS | Storefront footer reads Ver. 2.59.0-pr-2476-43b1-43b1a918, and 43b1 contains #2544. The icon itself can't be observed: this account has no Returns surface (/account/returns 404, KB-D61EEFF8) |
| D1 | Profile → Quick actions → Send email: modal fields still Title · Message* · Send via*, with **no Customers multi-select** (To-Be AC 1, 2.1–2.3, 3 still unimplemented; a standing finding, not a FAIL) | FE | PASS (standing finding) | Title · Message* · Send via* (Email, Push notification). There is no Customers multi-select, so To-Be ACs 1, 2.1–2.3 and 3 remain unimplemented — fe-D1-profile-send-modal.png |
| D2 | Profile send (Email+Push): Send keeps its accessible name while loading (VCST-6096) and does not shift layout (BL-UI-003); request = `sendCustomerCommunication` with `organizationIds:[<this org>]` (exactly one); success toast; modal closes | FE | PASS | organizationIds:[ACME] only, email + push, legacy arg not sent. Response all true in 2.5 s; toast shown, modal closes, focus returns to the tile, no layout shift — fe-D2-profile-send-toast.png. The loading-state name was not snapshotted here because the MCP click waits for the request to finish; the same VcButton still read "Share" while busy in D5 |
| D3 | The D2 marker reaches an ACME member's `pushMessages`; the rep does not receive it | FE→BE | PASS | Admin read via /api/push-message/search-recipients: D2 marker k3420 went to 13 recipients, @td(ACME_BUYER) among them. @td(SR_REP_PRIMARY) is absent for all 4 markers and has 0 hits in the rep's pushMessages. Checked via REST because the buyer's UI login failed (env credential) |
| D4 | My customers → envelope on row X, cancel, then row Y → subtitle Y; push-only send → `organizationIds:[Y]`, `sendEmail:false`, success toast | FE | PASS | BuildRight draft → cancel → TechFlow: subtitle shows TechFlow and the field is empty. organizationIds:[TechFlow], sendEmail:false; 5 recipients, rep absent — fe-D4-row-Y-subtitle-no-stale.png |
| D5 | List Share → Specific customers, 2 orgs + message → ONE `sendCustomerCommunication` with both `organizationIds`; toast "List shared with 2 customers."; the Save/Share button keeps its accessible name while loading | FE | PASS | ONE ChangeWishlist + ONE send with organizationIds ACME + TechFlow. 16 recipients = the union, with the 2 members of both orgs counted once. The busy dialog kept the "Share" name; toast "List shared with 2 customers." — fe-D5-share-toast.png |
| D6 | Rep signed in: top header on one line at 1280 and 1920, no overlap or wrap (VCST-5945); the ship-to / organization selector opens (BL-UI-004/005) | FE | PASS | 1280: 40 px single line; the left group ends at x=527 and the right group starts at x=539. 1920: single line. The ship-to and org selectors open (5 orgs) — fe-D6-header-1280.png, fe-D6-header-1920.png |
| D7 | No new app console errors; no 4xx/5xx and no GraphQL `errors[]` in the send flows (known env 401s excepted) | FE | PASS | No app console errors. 110 GraphQL POSTs with 0 errors[]; no 4xx/5xx in the send flows. Outside them: firebase-messaging-sw.js 404 (env) and the buyer token 400 (D3) |

**Not re-run (unchanged backend; round-1 evidence stands):** the GraphQL contract matrix (dedup, cap 1000/1001, Forbidden on unserved org,
NoRecipients, legacy `organizationId`), email journal counts, and the S-series edge cases (S4–S7).
