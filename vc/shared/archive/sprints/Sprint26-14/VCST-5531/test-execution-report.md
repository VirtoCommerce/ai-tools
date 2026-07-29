# VCST-5531 — Baseline (RED) Test Execution — Admin SPA Contacts false dirty-check

**Verdict: BUG REPRODUCED on the old build (RED baseline captured).** [P2 — Admin UI, functional]

**Env:** vcptcore-qa (`https://vcptcore-qa.govirto.com`) — VirtoCommerce.Customer **3.1016.0** (old, pre-fix build), Platform 3.1046.0-pr-3056. Browser: playwright-edge. Date: 2026-07-23.
**Fix under test (NOT applied on this build):** vc-module-customer#310 — `blade.origEntity &&` guard in member-detail `isDirty()`.

## Important environment note (baseline premise shifted mid-session)
The task targeted vcst-qa on the assumption it still ran the old build. During the session the fix was deployed there — **vcst-qa now serves Customer `3.1017.0-pr-310-9165` (the FIXED build)** (verified via `/api/platform/modules`), so vcst-qa can no longer serve as a RED baseline. On the user's suggestion I pivoted to **vcptcore-qa, which is still Customer 3.1016.0**, and captured the clean RED baseline there. (A brief pre-pivot double-click attempt on vcst-qa produced no dialog — inconclusive as baseline given the build was already the fixed one.)

**Target data (resolved live):** Org `[E2E Test] Contoso Ltd.` → 3 members: *AGENT-TEST Qqqqqqqqqq SalesRep*, *AgentTest RMain*, *SmokeTest Runner*.

## Results

| ID | Condition | Result | Notes |
|----|-----------|--------|-------|
| **C1** | Fast-switch members during load | **NOT reproduced via slow sequential clicks** (2 rounds) | Agent tool cadence (~12s/click) lets each detail blade fully load before switching, so the sub-second race window is never hit. NOT evidence the bug is absent — identical root cause as C2, which reproduces. |
| **C2** | **Double-click a member during load** | **REPRODUCED — RED (2/2)** | False *"This contact has been modified. Do you want to save changes?"* dialog appeared with **zero edits**. Trigger: with member A open, double-click member B → click-1 opens B (async `members.get` in flight), click-2 closes+reopens B while `origEntity` is still undefined → `isDirty()` returns true → false dialog. Screenshot below. |
| **C3** | Genuine edit still prompts on close | **PASS** | Edited First name, closed (×) → correct save-changes prompt shown (screenshot). Confirms the prompt is not globally suppressed. Discarded via "No" (no mutation). |
| **C4** | Clean open + close, no edit | **PASS** | Waited for full load, closed (×) → no prompt. |
| **C5** | Save persists / Reset reverts | **PASS** | Edit → **Save** persisted (grid + title updated to "SmokeTestEDIT Runner", `PUT /api/members` 204); re-edit → **Reset** reverted to last saved. Original value restored afterward. |

## Root-cause corroboration (evidence)
- The false dialog carries **no JS exception** — console during the race shows only pre-existing noise (logo 404s, GA). It is a silent client-side logic false-positive, not an error path.
- **All member API calls succeeded**: `GET /api/members/{id}` = 200 across every open/switch, `POST /api/members/search` = 200, the two C5 saves `PUT /api/members` = 204. **No 4xx/5xx.** So the `members.get` completes fine — the dialog fires because the blade closes *before* the successful callback assigns `origEntity`, exactly the race PR #310 guards. Matches `BL-AUTH`/Admin-CRUD dirty-check expectations.

## Evidence
- `screenshots/VCST-5531-C2-FAIL-false-save-dialog-doubleclick.png` — RED: false "Save changes" dialog after double-click, detail blade fully loaded & untouched (Customer 3.1016.0).
- `screenshots/VCST-5531-C3-genuine-save-prompt-after-edit.png` — genuine save prompt after a real First-name edit (correct behavior).

## Incidental observations (not filed)
- On vcst-qa (fixed build), a double-click on a not-yet-open member opened **two stacked identical detail blades** rather than replacing — cosmetic/UX oddity, no dialog, out of this ticket's scope.
- vcst-qa Contoso members list contained a member rendering as a **blank-name row** and one named "le na" (contacts with empty first/last name) — data quality, not a defect.

## Teardown
- No test entities created. C5's transient First-name edit on *SmokeTest Runner* was reverted to the original ("SmokeTest") and re-saved; grid confirms "SmokeTest Runner". No lingering dirty state. Tokens kept in-memory only; no token files written to disk.

## Hand-off
Clean RED baseline for C2 is captured on Customer 3.1016.0 (vcptcore-qa). The GREEN fix-verification (Pass B) should run on the build carrying Customer 3.1017.0-pr-310 — already live on **vcst-qa** — where C1/C2 must produce **no** false dialog while C3/C4/C5 continue to behave as above.
