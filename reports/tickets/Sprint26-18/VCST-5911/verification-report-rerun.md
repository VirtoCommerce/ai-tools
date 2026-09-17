# VCST-5911 — Fix Verification (Phase B / GREEN) — RE-RUN

**Verdict: PASS with 2 items NOT EXERCISED** (fixture data cannot reach them — not product failures).
Both filed defects are fixed and verified. Nothing regressed.

| Field | Value |
|---|---|
| Build under test | `Ver. 2.58.0-pr-2479-cf20-cf20b0ad` (footer — matches expected) |
| Env | `http://localhost` storefront / `http://localhost:8090` platform, store `B2B-store` |
| Account | `shopper@localhost.test` (confirmed signed in — header shows "shopper User") |
| Browser | `playwright-chrome` MCP, 1920×1080 |
| Theme preset | light `--color-primary-500 #e52121` (Red preset, same as RED baseline); dark `#d34247` |
| Missions | `totalCount: 16` — 12 on page 1 + 4 on page 2, all read on all 3 passes |
| Passes | 3 consecutive full passes, byte-identical results |

## Contrast table — light theme (all 16 cards, all 3 passes)

| Band | Cards | Dot fill | Token resolved | Behind | Ratio | ≥3:1 |
|---|---|---|---|---|---|---|
| `success` | 13 | `#316144` | `--color-success-700` | `#ffffff` (`.mission-card`) | **7.18:1** | PASS |
| `warning` | 3 | `#ab660e` | `--color-warning-700` | `#ffffff` (`.mission-card`) | **4.53:1** | PASS |

RED baseline was `warning-500 rgb(252,158,0)` = **2.09:1**. Now **4.53:1**. Defect 1 fixed.
Bands `danger` / `info` / `neutral` are **not rendered by the current fixture set** — see NOT EXERCISED.

## Contrast table — dark theme (12 cards, page 1)

| Band | Cards | Dot fill | Token resolved | Behind | Ratio | ≥3:1 |
|---|---|---|---|---|---|---|
| `success` | 9 | `#278659` | `--color-vc-background-solid-success` | `#0a0a0a` | **4.37:1** | PASS |
| `warning` | 3 | `#ffc53d` | `--color-vc-background-solid-warning` | `#0a0a0a` | **12.54:1** | PASS |

## Per-item verdicts

**1. Every status dot ≥3:1 — PASS.** 16/16 light, 12/12 dark, across every band present. Min observed **4.53:1**.

**2. Root cause not symptom — PASS.** All 16 dots carry `vc-badge--dot` (`vc-badge vc-badge--size--md--dot vc-badge--solid--<band> vc-badge--dot`).
- `--color-warning-500` is still `#fc9e00` in light — unchanged globally.
- Light: `--color-vc-background-solid-*` are **unset**, so `--bg-color` falls back to `--color-<band>-700` — the fix's intended mechanism. Verified: warning dot `--bg-color` → `#ab660e` = `--color-warning-700`.
- Dark: the preset **does** define `--color-vc-background-solid-warning: #ffc53d`, so per the PR's own precedence `var(--color-vc-background-solid-X, var(--color-X-700))` the preset wins over `-700` (`#ffca16`). Correct by design; ratio still 12.54:1. Consequence worth knowing: on this preset the dark override in `dark/atoms/vc-badge.scss` is a **no-op** — it only bites on a preset that leaves the token unset.
- Non-dot badge unchanged: `vc-badge--solid--secondary` (currency chips, `/account/missions` and `/account/orders`) resolves `--bg-color` → `#6b7280` = `--color-secondary-500`, the original shade. The 700 override is dot-scoped.

**3. "No deadline" label on `daysRemaining: null` — NOT EXERCISED (not a failure).** The brief's fixture premise does not match the live data:
- `AGENT-TEST-MSN-ORDERCOUNT` has `daysRemaining: 180`, **not** null.
- Only **one** mission has `daysRemaining: null` — `AGENT-TEST-MSN-OPEN-ENDED` — and its `status` is `Completed` (pct 100).
`useMissionCard.ts` precedence is `isCompleted → "Mission completed"` **before** the null check, so that card correctly renders "Mission completed" (success, 7.18:1), never "No deadline". The PR's own unit test asserts exactly this ("keeps an open-ended completed mission completed"). To observe "No deadline" live the env needs a `daysRemaining: null` mission in `InProgress`; none exists. **The WCAG 1.4.1 defect itself IS verified fixed** by the stronger check below.

**Defect 2 (status by colour alone) — PASS.** The RED cause was `let dateLabel = ""` leaving a bare dot. Now `dateLabel` is unconditionally assigned on every branch. Measured: **0 of 16 cards has an empty `.mission-date-badge`** — every dot has adjacent text, in both themes, on all 3 passes.

**4. Modals route through the shared `MissionDateBadge` — PASS.**
- `order-mission-modal` (AGENT-TEST-MSN-ZEROTARGET): `<span class="mission-date-badge">` + `vc-badge--dot vc-badge--solid--warning`, fill `#ab660e` on `#ffffff` = **4.53:1**, label "180 days left".
- `sku-mission-modal` (AGENT-TEST-MSN-PROGRESS-PARTIAL): identical — `#ab660e`, **4.53:1**, "180 days left".
Both byte-identical to the card. Markup confirms one shared component, not three copies.

**5. Dark theme, items 1 + 3 — PASS.** See dark table. 12/12 dots carry `vc-badge--dot`; 12/12 labels non-empty; min ratio 4.37:1. Same "No deadline" data gap as item 3.

**6. Regression — dated missions + banding — PASS.** All 3 in-progress dated missions (`daysRemaining: 180`) render "180 days left" + `warning`. All 13 completed render "Mission completed" + `success`. Matches `useMissionCard`'s documented thresholds (completed→success; <10d→danger; else warning). The **<10d danger boundary is not exercised** — `AGENT-TEST-MSN-ENDING-SOON` has `daysRemaining: 5` but is `Completed`, so it resolves to success.

**7. UI-kit blast radius — PASS.** `/account/orders`: 13 `VcBadge` instances, **0 slotless**, so `vc-badge--dot` applies to none and nothing on that surface changed. Solid badges still `#6b7280` (secondary-500); outline badges untouched. On `/account/missions` the split is 12 dots (all loyalty) / 9 non-dots (currency picker) — the modifier reached only the intended elements.

**8. Regression — progress bar vs danger dot — PASS.** In-progress bar `.mission-card__bar` = `rgb(252,158,0)` = `#fc9e00` = **warning-500, unchanged** (VCST-5910's fix intact). Completed bar = `#3e845b` = success-500. Danger dot `#a01313` (danger-700) vs bar `#fc9e00` = **3.86:1** — distinguishable. *Computed from live tokens, not observed:* no danger dot is rendered by this fixture set.

**9. BL-A11Y-003 / axe-core — PASS.** axe-core 4.12.1, `document` scope, **12 mission cards and 12 dots present at scan time** (asserted in the same call).
- **`color-contrast` (WCAG AA): 0 violations** — light and dark.
- `color-contrast-enhanced` (AAA, 7:1 — **not** the AA target): 24 nodes, all pre-existing and all ≥4.5:1 so AA-clean. Mission-card: `.mission-card__note` ×12 (`#737373` on white, 4.74), `.vc-chip__content` "Completed" ×9 (`#ffffff` on `#3e845b`, 4.50). Page-shell: `.points-balance__label`/`__unit` (4.74), `.missions-banner__link` (5.16).
- `incomplete` ×12: `.mission-card__type` — "background could not be determined due to a background gradient" (banner gradient; axe cannot decide). Pre-existing, not PR-related.
- **Nothing in `.mission-date-badge` or `.vc-badge--dot` appears in any violation or incomplete result.** Note axe has no automated rule for WCAG 1.4.11 non-text contrast — the dot evidence is the manual `getComputedStyle` measurement above; axe corroborates that no AA *text* contrast regressed.

**10. Console + network — PASS (with known infra noise).** 106 HTTP requests over the session, **all 200 — zero 4xx/5xx**. Every console error is the known local-env noise: `ws://localhost/graphql` handshake 400 (×many) plus the Apollo error #30 it triggers downstream. No Vue warnings, no hydration mismatch, no JS exception from loyalty or the UI kit. No GraphQL response carried `errors[]`.

## Incidental observations (none block this PR)

1. **Generic error toast on every missions page load** — `vc-alert--tonal--danger`: *"Apologies for the inconvenience. Our server is currently experiencing technical issues."* It is the user-visible consequence of the same `ws://localhost/graphql` 400 handshake failure, so **local-env infra, pre-existing, not PR-attributable**. Worth noting as UX: a subscription-transport failure surfaces a full-width scary error to the customer while the page itself works fine.
2. **Currency-picker badges measure 0×0** on `/account/orders` and `/account/missions` (collapsed dropdown). Pre-existing, not PR-attributable.
3. **Dark override is inert on this preset** — see item 2. Not a defect; flagged so nobody reads dark-mode green as proof the `-700` dark rule works.
4. **The previous run's two `VCST-5911-BLOCKER-*.png` were present at session start (16:54) and are gone from disk now.** They were never git-tracked, are not in the stray bucket, and I did not delete them — I only wrote new files into that directory. Unexplained; flagging so the loss is not attributed to this run.
5. One measurement call threw mid-hydration before cards finished rendering; re-running after `wait_for` was clean. Measurement artifact, not a product defect.

## Evidence

Screenshots — `reports/tickets/Sprint26-18/VCST-5911/screenshots/`
`VCST-5911-GREEN-missions-page1-light.png` · `-dark.png` (full page) ·
`VCST-5911-GREEN-dot-warning-light.png` · `-dark.png` (previously-failing warning dot) ·
`VCST-5911-GREEN-dot-success-openended-light.png` · `-dark.png` (open-ended card, label present) ·
`VCST-5911-GREEN-order-modal-warning-light.png` · `VCST-5911-GREEN-sku-modal-warning-light.png` ·
`VCST-5911-GREEN-orders-blastradius-light.png`

Network: `network-pass1.txt`, `network-final.txt` (both all-200).
HAR: `test-results/chrome/har/session.har`. Video: `test-results/chrome/video/`.
Source grounding: vc-frontend PR #2479 @ `cf20b0ad` — `useMissionCard.ts`, `mission-date-badge.vue`, `vc-badge.vue`, `dark/atoms/vc-badge.scss`, `useMissionCard.test.ts`.

## Recommendation

**Fix verified — approve.** Both WCAG defects are closed and no regression was found across the mission surface, both modals, both themes, or the UI-kit blast radius.

**Before closing, the env needs one fixture added** so the two unexercised paths get live coverage: an `InProgress` mission with `daysRemaining: null` (proves "No deadline") and an `InProgress` mission with `daysRemaining < 10` (proves the `danger` band clears 3:1 and stays distinct from the warning-500 progress bar). Both are currently covered only by the PR's unit tests and by token arithmetic.
