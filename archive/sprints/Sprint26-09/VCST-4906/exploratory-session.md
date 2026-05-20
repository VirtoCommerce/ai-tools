# SBTM Risk Charter — VCST-4906 (Login on Behalf, PR #2280) — Firefox

| | |
|---|---|
| **Charter ID** | SBTM-VCST-4906-FF-001 |
| **Mission** | Probe integration boundaries and resilience of the new Login-on-behalf entry point and revert flow introduced by PR #2280, in **Firefox**, with focus on session token integrity, multi-tab behavior, and recovery from error states. |
| **Charter type** | Risk (security/auth-adjacent) |
| **Heuristic** | CRISP (auth/API focus) + SFDPOT (UI surface) |
| **Time-box** | 20 min effective (≈ 50 min wall-clock incl. setup, env hiccups, screenshots) |
| **Tester** | qa-testing-expert (Firefox) |
| **Build under test** | `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2.zip` (verified live in footer) |
| **Environment** | vcst-qa storefront (`https://vcst-qa-storefront.govirto.com`) |
| **Browser** | `playwright-firefox`, viewport 1920×1080, locale `en-US` |
| **Date** | 2026-05-14 |
| **Linked ticket** | VCST-4906 — https://virtocommerce.atlassian.net/browse/VCST-4906 |
| **Linked PR** | vc-frontend #2280 (head `80690ef2`) |

---

## Test accounts used

| Alias | User | Role | Permissions snapshot (live) |
|---|---|---|---|
| `SUPPORT_AGENT` | John Mitchell (USR-001) `test-john.mitchell-20260310@test-agent.com` | Organization maintainer | Includes `platform:security:loginOnBehalf` ✓ |
| `IMPERSONATE_TARGET` | David Kim (USR-007) `test-david.kim-20260310@test-agent.com` | Purchasing agent | `storefront:organization:view`, `storefront:user:view` only — **no** `loginOnBehalf` |

**Org context:** Both users belong to **`Camila-incorporate`** (`6fb516c1-07f3-4af4-be5e-35961e3f7993`) — not "AcmeCorp"/"TechFlow" as the alias changelog suggests. The aliases still resolve to the right user GUIDs, but the underlying org assignment differs from the changelog narrative.

> **Side note for `test-data/aliases.json` maintainer:** Changelog 1.4.1 says the role on USR-001 lacked `CanImpersonate` as of 2026-05-11. On 2026-05-14 the live permissions on USR-001 include `platform:security:loginOnBehalf` — the role assignment has been updated. Recommend refreshing the changelog or removing the stale precondition warning.

---

## Coverage delivered

| Focus area | Status | Notes |
|---|---|---|
| FA1 — Firefox happy-path smoke | PASS | Menu item present in Firefox identically to Chrome; modal copy correct; silent flow → banner mounted; BL-AUTH-010 banner persistence verified |
| FA2 — Token-flow resilience (500 + abort on `/connect/token`) | PASS | Both 500 and net abort: friendly error surfaced, operator session preserved, no banner mounted, no infinite spinner |
| FA3 — Multi-tab broadcast resilience | PASS | Tab B reload on impersonation; Tab B reload on revert; bonus: cross-tab logout propagation also works |
| FA4 — Log out from impersonated session (BL-AUTH-007) | PASS | Logout button + revert affordance both present in popup; Logout cleared full session (no `/sign-out` page, no leftover usable tokens) |
| FA5 — Browser back-button during transitions | PASS (with caveat) | Back-during-modal: modal is non-routable (does not dismiss); Back-during-silent-flow: impersonation still completes (network was in flight) — acceptable, audited |
| FA6 — Adjacent feature regression | PASS | Non-operator user (David Kim) sees no Actions buttons on member rows; direct-URL impersonation hits backend 403; operator's normal sign-in unaffected |

---

## Findings log

> Legend: **Bug** = functional defect; **Question** = needs product decision or spec drift; **Observation** = noteworthy but not a defect; **Risk** = potential defect under untested conditions.

### F-01 — Wrong-target modal binding [Observation → re-classified after re-test]
- **Initial symptom:** After opening Emily Johnson's Actions dropdown then David Kim's, the confirmation modal text named Emily Johnson, not David Kim.
- **Root cause:** Test artifact — my JS-driven `Array.find(button text === 'Login on behalf')` matched the first DOM-order button. Multiple row-level dropdowns were open simultaneously because clicking another row's Actions did NOT close the prior popover.
- **Re-test:** On a fresh page load, opening only David Kim's row produced a modal correctly bound to David Kim.
- **Verdict:** Not a binding bug. **But:** this exposes Risk **R-01** below.
- **Evidence:** `evidence/exploratory-firefox/04-modal-WRONG-TARGET-emily-not-david.png` (compromised state) vs `05-david-modal-correct-target.png` (correct state)

### R-01 — Multiple Actions dropdowns can be open simultaneously [Risk]
- **What I observed:** Clicking the Actions button on row B does not close an already-open Actions popover on row A. Both popovers remain rendered concurrently.
- **Why it matters:** A power-user (especially via keyboard) could:
  1. Open Emily's Actions, focus moves to her Login-on-behalf button
  2. Tab/click to David's Actions
  3. Click intending David, but the focus or hit-test could land on Emily's still-rendered Login-on-behalf
- **In Firefox:** I could not reproduce a UI-driven (mouse-click) wrong-target binding. The risk is theoretical for now, but the table renders structurally a "menu of menus", which the WAI-ARIA pattern usually closes on outside-trigger.
- **Suggested follow-up:** Verify the menu component closes on `mousedown` on another `[aria-haspopup]` trigger. If not, file an a11y/UX defect.
- **Evidence:** Both screenshots above.

### F-02 — data-testid selector spec drift [Question]
- The shared QA charter spec references `data-testid="main-layout.top-header.account-menu.sign-out-button"`.
- **Actual attribute on the live DOM:** `data-test-id="sign-out-button"` (different attribute name **and** different value).
- The associated revert affordance is `data-test-id="back-to-operator-row"` (text **"Back to John Mitchell"**, not "Revert back to own account" as the charter spec says).
- **Verdict:** Not a vc-frontend bug; **QA tooling/spec is out of date**. The selectors used in this report are the live ones.
- **Recommended:** Update `test-data/users/agent-user-pool.csv` or the QA agent prompt that references these test-ids; they will break Playwright assertions otherwise.

### F-03 — `localStorage["auth"]` shape after logout [Observation]
- After logout, `localStorage["auth"]` is **not removed** — instead it is rewritten to `{"expires_at":null,"token_type":"Bearer","access_token":null,"refresh_token":null}`.
- All token fields are `null` — there is **no usable bearer left**, so no security issue.
- `user-id` rotates to a fresh anonymous GUID (`0cf451cd...`).
- **Verdict:** Cosmetic/structural. If a downstream test asserts `localStorage.getItem('auth') === null`, it will fail; should assert `access_token === null` instead.
- **Evidence:** Inline JS evaluation, screenshot `08-post-logout-guest-state.png`.

### F-04 — 500-on-token error wording slightly misleading [Observation]
- When `POST /connect/token` returns 500 (or net-aborts), the UI message reads **"Verification succeeded, but switching to the customer account failed. Please try again."**
- For the **silent-flow** code path (no password form was shown), "Verification" is a stretch — the operator only clicked Continue on a confirmation modal; the password "verification" was never performed.
- **Verdict:** Wording inherited from the form-flow path. Cosmetic only; consider differentiating for the silent-flow path. Not a release blocker.
- **Evidence:** `11-fa2-500-token-result.png`, `12-fa2-abort-token-result.png`.

### O-01 — Confirmation modal does not push a history entry [Observation]
- Browser Back while the modal is open does **not** dismiss the modal.
- This is consistent with vc-frontend's other modals (Cart popovers, drawers).
- Not a bug; documented as a design choice for the test catalog.

### O-02 — Back during silent-flow does not abort the in-flight impersonation [Observation]
- Pressing Back after Continue (during the loader overlay) → impersonation still completes; operator ends up on Home with banner.
- The token POST was already in flight by the time Back fired.
- No half-state, no console errors. The audit trail still captures the impersonation correctly.

### O-03 — Tab B navigates to Home (not reload) on cross-tab impersonation [Observation]
- Tab B was on `/catalog`. After Tab A's "OK", Tab B navigated to `/` (Home), not reloaded `/catalog`.
- BL-AUTH-010 is still satisfied (banner persists across SPA navigation) but the URL state was discarded.
- **Suggested follow-up:** Confirm with PO whether `location.reload()` (preserving URL) would be preferable. The OTHERS-broadcast handler chose a `router.push('/')`. Either is defensible.
- **Evidence:** `14-fa3-tabB-post-impersonate.png`.

### O-04 — Bonus: cross-tab logout propagation also works [Positive observation]
- Logging out from Tab B while Tab A was on `/company/members` correctly bounced Tab A to `/sign-in?returnUrl=/company/members`.
- No JS errors. Auth state across tabs stays consistent.

### V-01 — BL-AUTH boundary check via direct URL access [Verification PASS]
- Logged in as **David Kim** (lacks `CanImpersonate`).
- Navigated directly to `/account/impersonate/{emilyUserId}` — the Security verification *form* was rendered (this is the form-flow public route, not gated client-side).
- Submitted David's own credentials.
- **Backend correctly returned 403** on `POST /connect/token` and the UI redirected to `/403` ("Access denied").
- BL-AUTH boundary enforced at the backend. UI surfaces the 403 cleanly.
- **Evidence:** `10-fa6-david-403-denied.png`.

### V-02 — BL-AUTH-007 logout from impersonated session [Verification PASS]
- The popup in impersonated state contains **both** the Logout (`data-test-id="sign-out-button"`) **and** "Back to John Mitchell" revert button.
- Clicking Logout cleared the full session (both operator and impersonated tokens nulled) and landed on `/` (Home), not a `/sign-out` page (consistent with `feedback_no_signout_page` memory).
- **Evidence:** `08-post-logout-guest-state.png`.

### V-03 — BL-AUTH-010 banner persistence [Verification PASS]
- Banner ("John Mitchell logged in as David Kim") visible on `/` (post-silent-flow landing) and remained when navigating to `/company/members` via Tab A after impersonation propagated.

### V-04 — BL-AUTH-011 revert without sign-in round-trip [Verification PASS]
- Clicking "Back to John Mitchell" in the impersonated session restored the operator. No password re-prompt, no sign-in round-trip. Same tab, banner cleared.
- **Evidence:** Verified during FA3 (Tab A revert observation).

### V-05 — BL-AUTH-009 nested impersonation forbidden [Defensive check — not exercised]
- I did **not** find a UI path from an active impersonated session to a "second" impersonation. The impersonated user (David Kim) is a Purchasing agent and has no member-list action buttons at all. Cannot confirm BL-AUTH-009 is enforced when the impersonated user *does* happen to be an Org maintainer with `CanImpersonate` — that scenario isn't reachable on this seeded data.
- **Suggested follow-up:** Create a synthetic test fixture (impersonate user A → A has CanImpersonate → attempt to start impersonation of user B → must fail).

---

## Console / network summary

- **Console:** 0 errors total across the session. Warnings remain in the noise (2–4) — same Vue warnings observed in baseline traffic, unrelated to PR #2280.
- **Network — happy path:** `POST /connect/token` (grant_type=impersonate) → 200. Followed by xAPI calls on the impersonated bearer.
- **Network — 500 sub-test:** `POST /connect/token` → 500 (synthetic). One retry observed (1 request total — no abusive retry loop).
- **Network — abort sub-test:** Two `NS_ERROR_FAILURE` requests recorded (one retry). UI gave up after the retry, no infinite-spinner pathology.
- **Network — 403 boundary check:** `POST /connect/token` → 403. UI routed to `/403`.

---

## Verdict and recommendations

**Charter conclusion: PASS.** PR #2280's Login on Behalf entry point and supporting flows behave correctly in Firefox across all 6 focus areas. No P0 / P1 functional defects discovered. The four BL-AUTH rules I could exercise (007, 010, 011, and the boundary at 003/006) all hold.

**Minor non-blocking items for the orchestrator's go/no-go:**

1. **F-02 (selector spec drift) — Update tooling, not vc-frontend.** Owner: QA tooling maintainer. Update test prompts that reference `data-testid="main-layout.top-header.account-menu.sign-out-button"` to the actual `data-test-id="sign-out-button"`.
2. **R-01 (multiple Actions dropdowns coexisting) — Suggest a11y review.** Owner: vc-frontend dev. Not blocking. Verify the `VcDropdownMenu` (or wrapper) closes other open instances on a new `aria-haspopup` trigger click.
3. **F-04 (silent-flow error wording).** Cosmetic. Owner: vc-frontend dev. Differentiate "Verification succeeded but…" wording for silent flow vs form flow.
4. **O-03 (Tab B navigation to Home).** Product decision. Either behavior is acceptable; consider preserving URL state.
5. **V-05 (nested impersonation defensive case).** Suggest a follow-up test added to suite 082 — needs a fixture user who has both `CanImpersonate` and is themselves a valid impersonation target.
6. **Alias maintenance:** Refresh `test-data/aliases.json` changelogs for `SUPPORT_AGENT`/`IMPERSONATE_TARGET`/`OTHER_ORG_USER` — the org assignments documented there (AcmeCorp/TechFlow/BuildRight) don't match the live org `Camila-incorporate` on vcst-qa.

**Bug filing:** None recommended for vc-frontend at this time. The QA-tooling/spec items (F-02, alias refresh) are out of scope for VCST-4906.

---

## Evidence inventory

All files under `tests/Sprint-current/VCST-4906/evidence/exploratory-firefox/`:

| # | File | What it shows |
|---|---|---|
| 01 | `01-dashboard-no-company-link.png` | Dashboard with sidebar (used to discover `/company/members` route) |
| 02 | `02-company-members-table.png` | Members table for John Mitchell (4 rows incl. Actions buttons) |
| 03 | `03-david-actions-dropdown.png` | David Kim's Actions dropdown open with Edit role / Block / Delete / **Login on behalf** |
| 04 | `04-modal-WRONG-TARGET-emily-not-david.png` | Wrong-target modal (test artifact, not a bug — see F-01 / R-01) |
| 05 | `05-david-modal-correct-target.png` | Correct modal text after clean re-test |
| 06 | `06-post-impersonation-home.png` | Home page after silent-flow completion, banner shows "John Mitchell logged in as David Kim" |
| 07 | `07-impersonated-account-menu-popup.png` | Impersonated session account-menu popup (shows Logout + "Back to John Mitchell") |
| 08 | `08-post-logout-guest-state.png` | Home page after Logout — Sign in/Sign up visible, auth tokens nulled |
| 09 | `09-fa6-david-no-actions-buttons.png` | David Kim's view of the same members table — no Actions buttons (FA6 gating verified) |
| 10 | `10-fa6-david-403-denied.png` | 403 Access denied page after David tried direct-URL impersonation (boundary check) |
| 11 | `11-fa2-500-token-result.png` | Friendly error after synthetic 500 on `/connect/token` |
| 12 | `12-fa2-abort-token-result.png` | Friendly error after route abort on `/connect/token` |
| 13 | `13-fa5-back-during-silent-flow.png` | After pressing Back during silent flow — impersonation still completed |
| 14 | `14-fa3-tabB-post-impersonate.png` | Tab B after Tab A's impersonation — shows David Kim, banner visible |
| 15 | `15-fa3-tabB-after-revert-from-tabA.png` | Tab B after Tab A revert — shows John Mitchell, no banner |

---

## Teardown

- Tab B closed
- Logged out from storefront (via account-menu popup → Logout, per BL-AUTH-007)
- All session state cleared (auth tokens nulled, user-id rotated)
- No test entities created (read-only / interactive flows only)
- Route intercepts (page.route on `/connect/token`) cleared with `page.unrouteAll()`

---

## Browser substitution log

`playwright-firefox` MCP launched cleanly. No fallback to Edge/Chrome needed.
