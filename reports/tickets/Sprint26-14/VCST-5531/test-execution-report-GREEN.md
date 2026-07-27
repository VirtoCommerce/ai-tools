# VCST-5531 — GREEN Fix-Verification (Admin SPA false unsaved-changes dialog)

**Verdict: PASS — false-dialog bug is FIXED and genuine dirty behaviour is INTACT.**

- **Env:** vcst-qa (https://vcst-qa.govirto.com) @ Platform 3.1046.0, **Customer (Companies and Contacts) 3.1017.0-pr-310-9165** (the fix build)
- **Fix:** PR VirtoCommerce/vc-module-customer#310 — `isDirty()` now requires `blade.origEntity` before comparing, so the dirty-check is a no-op while the member detail is still loading.
- **Browser:** playwright-edge · admin/Administrator · 2026-07-23

## Bundle / cache preflight (mandatory)
Verified the deployed version in More → Modules = `3.1017.0-pr-310-9165` (screenshot 00). Did a full page reload with a cache-buster; network confirmed a FRESH fetch of the Customer bundle `modules/$(VirtoCommerce.Customer)/dist/app.js` → 200. Conclusion drawn against the new bundle, not a cached one.

**Test org:** `[E2E Test] Contoso Ltd.` — resolved live from the Contacts list (11 members). Used [E2E Test] Employee 1-5 / Maintainer / Store Manager as members A/B/C, plus the "le na" edge-case member noted in baseline.

## Per-condition results

| # | Condition | Result | Evidence |
|---|-----------|--------|----------|
| **C2** | **Double-click a member while another is open** (reliable RED trigger) — 6 trials: Emp2, Emp3, Emp4, "le na", Emp5, Maintainer | **PASS** — NO false "contact has been modified / save changes?" dialog on any trial | screenshot 02; each dbl-click fired **two** `GET /api/members/{id}` (e.g. Emp2 at net #178 + #189) → both 200 — exactly the double-load that used to pop the false dialog |
| **C1** | Fast-switch single-clicks A→B→C (Purchasing Agent → Store Admin → Store Manager) | **PASS** — no false dialog. *Caveat:* the sub-second `members.get()` race is hard to force via tool cadence; C2's double-clicks (two loads each) are the definitive superset trigger and passed. | net #369/#386/#404 all 200 |
| **C3** | **Genuine dirty MUST still prompt** — open Store Manager, wait full load, edit First name, close blade | **PASS** — genuine prompt appeared: *"Save changes — This contact has been modified. Do you want to save changes?"* (Yes/No/Cancel). Guard does NOT over-suppress real edits. Chose **No** to discard. | screenshot 03 (dirty edit, Full name auto-updated), 04 (prompt) |
| **C4** | Open member, wait full load, close WITHOUT editing | **PASS** — no prompt, blade closed cleanly | — |
| **C5** | Save persists / Reset reverts, no drift | **PASS** — Reset reverted "RESETTEST" edit with no save; Save wrote `PUT /api/members → 204` (net #457) and persisted (list + blade showed "SAVETEST", buttons cleared). Reverted the edit + Saved again (`PUT → 204`, net #463). | screenshot 05 (clean, reverted) |

**Data drift:** NONE. C3 edit discarded via No; C5 SAVETEST written then reverted (two self-cancelling PUT 204s). Store Manager left as original: First name "[E2E Test]", Full name "[E2E Test] Store Manager".

## Adjacent exploratory (brief, Medium)
Double-click / fast-switch across **Organization** detail blades (Lone Star Outfitters, "Müller" % Schmidt GmbH) and rapid switching in Contacts: **no false save-changes prompt, no stacked-blade breakage observed** (screenshot 06). No new issues.

## Evidence: console & network
- **Console:** 7 errors total, all pre-existing/benign — 1× `GET /api/order/dashboardStatistics 500` (known baseline, unrelated) + repeated module-logo 404s (`/apps/*/logo.svg`). **Zero JS exceptions and zero dirty-check errors** across all double-clicks, fast-switches, save/reset and the dialog.
- **Network:** every `GET /api/members/{id}`, `POST /api/members/search`, and both `PUT /api/members` returned 200/204. No member-endpoint 4xx/5xx during open/switch/close.

## Conclusion
The false "This contact has been modified" dialog no longer appears on double-click or fast-switch before load completes (C1/C2). The genuine unsaved-changes prompt still fires correctly on a real edit (C3), stays silent with no edit (C4), and Save/Reset persist/revert correctly (C5). The `origEntity` guard fixes the race without over-suppressing legitimate edits. **VCST-5531 verified fixed on vcst-qa.**

Screenshots: `reports/tickets/Sprint26-14/VCST-5531/screenshots/` (00 version, 01 org, 02 C2, 03/04 C3, 05 C5, 06 exploratory).
