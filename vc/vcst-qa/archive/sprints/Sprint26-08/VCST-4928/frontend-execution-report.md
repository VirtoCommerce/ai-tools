# VCST-4928 — Frontend Execution Report

**Ticket:** [Frontend] Add live character counter to configurable product Text section inputs (Low / UX)
**Build:** `vc-theme-b2b-vue-2.47.0-pr-2263-2bf2-2bf2be51.zip` (PR #2263) — footer-verified on QA
**Platform:** 3.1019.0
**Component:** `client-app/shared/catalog/components/configuration/section-text-fieldset.vue` + `vc-input-details.vue` + `vc-input.vue`
**Environment:** `https://vcst-qa-storefront.govirto.com` (FRONT_URL from .env)
**Browser:** Chromium (`playwright-chrome`), viewport 1920x1080, locale en-US
**User:** `mutykovaelena@gmail.com` (session: "Agent Chrome" — storefront authenticated)
**Executed:** 2026-04-20 (UTC+0)
**Agent:** qa-frontend-expert

---

## Aggregated Verdict

**Overall: PASS** for ACs 1, 2, 7. **PARTIAL (blocked by test data)** for AC 4 — the designated null-maxLength product does not expose a Text input on the current QA build; all counter rendering paths that were reachable produced zero console errors, zero Vue warnings, and no problematic counter text (`null`, `undefined`, `/0`).

| AC | Scenario | Test Case | Verdict | Notes |
|----|----------|-----------|:-:|-------|
| 1 | Counter visible `0 / 30` + `aria-describedby` linked at rest | CFG-TEXT-COUNTER-001 | PASS | All DOM assertions matched exactly |
| 2 | Live updates 0 → 5 → 30 with at-cap transition | CFG-TEXT-COUNTER-002 | PASS | Reactive update < 100ms; limit class + role + aria-live applied only at cap |
| 4 | Null maxLength — hidden OR `0 / 255`; no console errors | CFG-TEXT-COUNTER-004 | PARTIAL / INCONCLUSIVE | MHI-55960404 Fabric and materials section has no text input in the current QA data; null-maxLength code path not exercised, but no counter errors observed across the PDP |
| 7 | No regression to 30-char enforcement + counter integration | CFG-TEXT-001 | PASS | HTML `maxlength` truncates over-cap input; Add-to-Cart succeeds with 1-char value; no new console errors |

**Business rule BL-CAT-006 regression:** PASS — required-section enforcement unchanged; Add to Cart with 1-char value succeeded (line item created with `Selected text: A`).

---

## CFG-TEXT-COUNTER-001 — Empty State + aria-describedby (AC Scenario 1)

**URL:** `https://vcst-qa-storefront.govirto.com/products-with-options/configurations/agent-test-config-engraved-ring-20260327`
**Verdict:** PASS

DOM snapshot (via `browser_evaluate`) at rest:
```json
{
  "id": "input-504",
  "maxlength": "30",
  "ariaDescribedby": "input-504-details",
  "counterOuter": "<div id=\"input-504-details\" class=\"vc-input-details vc-input-details--hide-empty\"><div class=\"vc-input-details__counter\">0 / 30</div></div>",
  "counterText": "0 / 30",
  "counterRole": null,
  "counterAriaLive": null,
  "hasLimitClass": false
}
```

Per-assertion:
- Counter element present and visible: PASS
- Counter text equals `0 / 30` (spaced slash — load-bearing format): PASS
- `aria-describedby` non-empty and references counter element id: PASS (input-504 → input-504-details; ids match)
- `role=status` absent at rest: PASS (null)
- `aria-live` absent at rest: PASS (null)
- `vc-input-details__counter--limit` absent at count=0: PASS

Evidence: `evidence/chrome/counter-001-empty-state.png`

---

## CFG-TEXT-COUNTER-002 — Live Update 0 → 5 → 30 (AC Scenario 2)

**Verdict:** PASS

Progression (real-user keyboard events via `browser_press_key` + `browser_type slowly:true`):

| Step | Input value | Counter text | limit class | role | aria-live |
|------|-------------|-------------|:-:|:-:|:-:|
| Initial | (empty) | `0 / 30` | no | null | null |
| Typed "Hello" | `Hello` (5) | `5 / 30` | no | null | null |
| Typed " twenty-five more chr here" | `Hello twenty-five more chr her` (30 — truncated by `maxlength`) | `30 / 30` | **yes** | `status` | `polite` |
| Pressed "X" (31st) | `Hello twenty-five more chr her` (still 30) | `30 / 30` | yes | status | polite |
| `Ctrl+A` + `Delete` | (empty) | `0 / 30` | no | null | null |

Per-assertion:
- Counter reflects reactive character count at each step (0, 5, 30): PASS
- At-cap BEM class `vc-input-details__counter--limit` applied only when count = max: PASS
- `role=status` + `aria-live="polite"` conditionally added at cap and removed when cap lifted: PASS
- 31st character rejected by HTML `maxlength` (value remains 30 chars): PASS
- Counter and at-cap class removed immediately when field cleared: PASS
- No API calls triggered by typing (client-side only): PASS (no xapi requests during keyboard events)

Evidence:
- `evidence/chrome/counter-002-mid-5of30.png` (5 / 30 state)
- `evidence/chrome/counter-002-at-cap-30of30.png` (30 / 30 state — red emphasis visible)

---

## CFG-TEXT-COUNTER-004 — Null maxLength Path (AC Scenario 4)

**URL:** `https://vcst-qa-storefront.govirto.com/products-with-options/configurations/bed-with-additional-options`
**Verdict:** PARTIAL / INCONCLUSIVE — requires fresh test-data seeding to fully verify

DOM inventory across the Bed PDP:

| Section | Text input? | maxlength | Counter text |
|---------|:-:|---|---|
| COVER (required) | yes (input-517) | 25 | `0 / 25` |
| MATTRES (optional, collapsed) | — | — | — |
| FABRIC AND MATERIALS (optional, collapsed) | **no input** (section has no body options in this build/data) | n/a | n/a |
| PILLOWS | yes (input-593) | 10 | `0 / 10` |

- Total `.vc-input-details__counter` elements found on page: 2
- All counter texts: `["0 / 25", "0 / 10"]`
- Counters with `null`, `undefined`, or `/ 0` substring: 0
- Vue warnings related to counter props: 0
- JS TypeErrors during page render: 0 (only unrelated 3rd-party image 404s from `images.netdirector.co.uk`)

**Why INCONCLUSIVE:** The spec for this case designates MHI-55960404 "Fabric and materials" as the null-maxLength scenario. On today's QA build, that section renders only a header/subtitle with no text input (no options defined), so the `section-text-fieldset.vue` null-maxLength code path is not reached here. No product in the tested scope exposed `null/undefined/0` in the counter template. The test case itself flags this: "If MHI-55960404 has null maxLength: use it. If not available, this test requires product seeding — flag in manual items."

**Interpretation per AC 4 acceptance criteria:** Observed behavior is consistent with SCENARIO A (counter hidden when no Text input present) and with the `?? 255` fallback not being exercised. No fail signals triggered.

**Recommendation:** Seed a configurable product whose Text section explicitly has `maxLength: null` (admin SPA → ProductConfiguration section, leave MaxLength empty), re-run CFG-TEXT-COUNTER-004 against that product to definitively verify the fallback branch.

Evidence: `evidence/chrome/counter-004-bed-pdp.png` (full-page screenshot of Bed PDP)

---

## CFG-TEXT-001 (updated) — 30-Char Enforcement + Counter Integration (AC Scenario 7)

**URL:** `https://vcst-qa-storefront.govirto.com/products-with-options/configurations/agent-test-config-engraved-ring-20260327`
**Verdict:** PASS

Flow:
1. Navigate to Ring PDP — input empty, counter `0 / 30`, aria-describedby wired.
2. Type 41-char string `This text is way too long for this field!` via real typing.
3. DOM: `input.value = "This text is way too long for "` (30 chars), counter `30 / 30`, `vc-input-details__counter--limit` + `role=status` + `aria-live=polite` applied.
4. Clear field (`Ctrl+A` + `Delete`), then type `A` (1 char).
5. Counter reads `1 / 30`; limit class + role + aria-live removed.
6. Click ADD TO CART — success.
7. URL updates to `?lineItemId=9f466c81-0d39-4e96-9627-45c62c1e436d`; Cart count badge shows items present.
8. Cart page line item shows `"Selected text: A"` — backend captured the text-section payload correctly.

Per-assertion:
- HTML `maxlength=30` truncates over-cap paste/type to 30: PASS
- Counter stays bounded at `30 / 30` on over-cap attempt (no `31 / 30`): PASS
- Counter format preserved with spaces (`0 / 30`, `30 / 30`, `1 / 30`) — no regression to `0/30`: PASS
- Below cap (1 / 30): no `vc-input-details__counter--limit`, no `role`, no `aria-live`: PASS
- Add-to-Cart succeeds with 1-char value; BL-CAT-006 required-section enforcement unchanged: PASS
- No functional JS errors; GraphQL addItem path succeeded (lineItemId returned): PASS

Evidence:
- `evidence/chrome/counter-CFG-TEXT-001-1of30.png` (post-clear 1/30 state — counter visible, no emphasis)
- `evidence/chrome/network-addtocart.txt` (filtered network capture)

---

## Console / Network / Cross-Layer Summary

**Console errors across all test steps (4 total messages, all identical):**
```
[ERROR] Failed to load resource: 404 @ https://images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg
```
- 3rd-party image 404 from a related product recommendation tile. Unrelated to PR #2263 counter feature. Pre-existing environmental noise. NOT a functional bug against VCST-4928.

**Vue warnings:** 0 across all four test cases.

**Network:** No 4xx/5xx on storefront-owned endpoints. GraphQL `addItem` mutation returned 200 (lineItemId present in URL update).

**Cross-layer:**
- STOREFRONT UI: All reactive DOM updates match spec.
- CONSOLE: Clean (no counter-related errors or Vue warnings).
- NETWORK: Counter is client-side — no per-keystroke API traffic. Add-to-Cart GraphQL path intact.
- CART: Payload correctly includes the text-section value as `Selected text: A`.

---

## Cleanup

- Removed the added ring line item from cart via "Remove from cart" button after CFG-TEXT-001 Add-to-Cart verification.
- No persistent test artifacts left on storefront.

---

## Evidence Manifest (`tests/Sprint-current/VCST-4928/evidence/chrome/`)

| File | Bytes | Case | Purpose |
|------|-------|------|---------|
| `counter-001-empty-state.png` | 197,282 | CFG-TEXT-COUNTER-001 | PDP with empty required Text section, `0 / 30` counter visible |
| `counter-002-mid-5of30.png` | 196,541 | CFG-TEXT-COUNTER-002 | Mid-typing state, "Hello" with `5 / 30` |
| `counter-002-at-cap-30of30.png` | 198,794 | CFG-TEXT-COUNTER-002 | At-cap state, `30 / 30` with red emphasis |
| `counter-004-bed-pdp.png` | 424,268 | CFG-TEXT-COUNTER-004 | Full-page Bed PDP showing all visible counters |
| `counter-CFG-TEXT-001-1of30.png` | 71,919 | CFG-TEXT-001 | Post-clear state with `1 / 30`, no emphasis |
| `network-addtocart.txt` | 3,499 | CFG-TEXT-001 | Filtered network log for Add-to-Cart flow |

---

## Open Items / Risks

1. **CFG-TEXT-COUNTER-004 incomplete** — request test-data team to seed a product with an explicitly-null maxLength Text section; re-run this case to definitively exercise the `?? 255` fallback path and SCENARIO B.
2. No issues with Scenarios 3 (at-cap a11y), 5 (i18n), or 6 (axe WCAG) from the scope of this run — those are assigned to `ui-ux-expert`.

---

## Sign-off

- **CFG-TEXT-COUNTER-001:** PASS
- **CFG-TEXT-COUNTER-002:** PASS
- **CFG-TEXT-COUNTER-004:** PARTIAL — inconclusive on null-maxLength fallback (test data limitation, not a product defect; zero counter errors observed)
- **CFG-TEXT-001 (regression):** PASS

Recommended JIRA action: Transition VCST-4928 to Ready for Acceptance once ui-ux-expert clears Scenarios 3/5/6. Flag the null-maxLength fallback as a follow-up test-data seeding item (does not block release, UX polish ticket).
