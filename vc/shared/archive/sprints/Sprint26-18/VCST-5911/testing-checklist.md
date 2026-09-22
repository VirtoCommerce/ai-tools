# VCST-5911 — Verification checklist

**Flow** verify-fix · **Verdict VERIFIED WITH NOTES** (run 2; run 1 was BLOCKED) · 2026-09-15
**Build** localhost — platform `3.1071.0-alpha.13389`; storefront = vc-frontend PR **#2479** `fix/VCST-5911` @ `cf20b0ad`, **open/unmerged**. Footer-confirmed both runs: `Ver. 2.58.0-pr-2479-cf20-cf20b0ad`.
**Env** `http://localhost` · store `B2B-store` · Playwright Chrome MCP · Red preset (light `--color-primary-500 #e52121`, dark `#d34247`) — same preset as the RED baseline.

> **Two runs are recorded here deliberately.** Run 1's BLOCKED result is not overwritten: it is the proof that the environment, not the fix, was the obstacle, and rewriting it as a pass would delete that record.

## Phase A — RED baseline (cited, not fabricated)

`reports/tickets/Sprint26-18/VCST-5910/testing-checklist.md` § A11y findings — measured live on vcst-qa 2026-09-08, theme `2.57.0-pr-2471-6ed5`, Red preset:

| Defect | Pre-fix observation |
|---|---|
| 1 — WCAG 1.4.11 | date-badge dot `warning-500` = `rgb(252,158,0)` `#fc9e00` vs white card = **2.09:1** (needs 3:1). `danger-500` 4.58:1 PASS, `success-500` 4.51:1 PASS — only amber failed |
| 1 — exposure | 24 missions @180d, 1 @108d, 1 @21d, 1 @14d all rendered the identical `rgb(252,158,0)`; **0 of 31 cards** rendered `success` |
| 2 — WCAG 1.4.1 | `AGENT-TEST-MSN-OPEN-ENDED` and "Target number of orders" (`daysRemaining: null`) rendered the dot with **no adjacent date text at all** — status by colour alone |

---

# Run 1 (18:16) — BLOCKED, environment. Retained as record.

`/account/missions` never rendered a mission card: `POST /graphql` returned 400 —
`Argument 'storeId' of type 'String!' is required for field 'loyaltyBalance' but not provided` (`PROVIDED_NON_NULL_ARGUMENTS`). Every surface PR #2479 changes was unreachable, so neither defect was observable.

**Not attributable to PR #2479** — the PR touches no GraphQL document. Root cause: `vc-module-loyalty` made `storeId` required (VCST-5024, module PR #17) while the storefront `dev` branch — which #2479 branches off — still sent neither. Verified at the time on **both** localhost and vcst-qa by live introspection and by POSTing the exact `dev` document to each. The in-flight storefront fix is **vc-frontend PR #2475**; no new bug was filed.

**Unblocked by the operator updating the loyalty module on localhost**, after which live introspection returned `loyaltyBalance(userId: String, orderId: String)` — `storeId` no longer required. Note this moved localhost *away* from vcst-qa, which still declares `storeId: String!` against a storefront that does not send it; that break is unchanged and still live there.

**Screenshot loss, flagged not buried:** run 1's two `VCST-5911-BLOCKER-*.png` captures are no longer on disk. They were never git-tracked (the `screenshots/` directory is untracked), so they are unrecoverable. Cause unknown; the re-run agent reports it did not delete them. Residual impact is low — run 1's finding is fully evidenced in text above, and the blocker is resolved — but the loss is recorded rather than silently absorbed.

---

# Run 2 (18:56–19:02) — the verification. 3 consecutive full passes, identical each time.

`totalCount: 16` — 12 cards on page 1 + 4 on page 2, **all read on all 3 passes**.

| # | Item | Verdict |
|---|---|---|
| 1 | **Defect 1** — every status dot ≥3:1 vs its adjacent background, every severity band present | **PASS** — 16/16 light, 12/12 dark; min **4.53:1** |
| 2 | **Defect 1, root cause not symptom** — `vc-badge--dot` + **700** shade, no global `warning-500` change | **PASS** |
| 3 | **Defect 2** — "No deadline" label on `daysRemaining: null` | **NOT EXERCISED** (fixture gap) — **defect itself verified fixed by a stronger check, below** |
| 4 | **Same fix on the modals** via the shared `MissionDateBadge` | **PASS** |
| 5 | **Dark theme** — items 1 and 3 re-run | **PASS** (item 3 same fixture gap) |
| 6 | **Regression** — "N days left" text and severity banding unchanged | **PASS** (`danger` band not exercised) |
| 7 | **Regression — UI-kit blast radius** | **PASS** |
| 8 | **Regression** — progress bar still `warning-500` (VCST-5910's fix intact) | **PASS** |
| 9 | **BL-A11Y-003** — axe-core `color-contrast` | **PASS** — 0 AA violations, **12 cards present at scan time** |
| 10 | **No new console errors, no 4xx/5xx** | **PASS** — 106 requests, all 200 |

## Contrast — measured live, and re-derived independently by the orchestrator

**Light, all 16 cards, all 3 passes**

| Band | Cards | Dot fill | Token resolved | Behind | Ratio | ≥3:1 |
|---|---|---|---|---|---|---|
| `success` | 13 | `#316144` | `--color-success-700` | `#ffffff` `.mission-card` | **7.18:1** | PASS |
| `warning` | 3 | `#ab660e` | `--color-warning-700` | `#ffffff` `.mission-card` | **4.53:1** | PASS |

**Dark, 12 cards**

| Band | Cards | Dot fill | Token resolved | Behind | Ratio | ≥3:1 |
|---|---|---|---|---|---|---|
| `success` | 9 | `#278659` | `--color-vc-background-solid-success` | `#0a0a0a` | **4.37:1** | PASS |
| `warning` | 3 | `#ffc53d` | `--color-vc-background-solid-warning` | `#0a0a0a` | **12.54:1** | PASS |

**The headline number: `warning` went 2.09:1 → 4.53:1.** The orchestrator recomputed both light ratios from the reported hexes rather than accepting them: `#ab660e` → 4.526:1, `#316144` → 7.18:1. Both match.

## Item 2 — the mechanism, verified on the resolved custom property

All 16 dots carry `vc-badge--dot`. `--color-warning-500` is **still `#fc9e00`**, so the PR did not darken the shared token globally — the stated design concern is answered. In **light** the preset leaves `--color-vc-background-solid-*` unset, so `--bg-color` falls back to `--color-<band>-700`, which is the fix's intended mechanism. In **dark** the preset *does* define `--color-vc-background-solid-warning: #ffc53d`, so by the PR's own `var(--color-vc-background-solid-X, var(--color-X-700))` precedence the preset wins — correct by design, and still 12.54:1. A non-dot solid badge is untouched: `vc-badge--solid--secondary` still resolves `#6b7280` = secondary-**500**.

## Item 3 — why NOT EXERCISED is not a gap in the verdict

**The brief's fixture premise was wrong, and the agent corrected it from the live payload.** `AGENT-TEST-MSN-ORDERCOUNT` has `daysRemaining: 180`, not `null`; the only `daysRemaining: null` mission, `AGENT-TEST-MSN-OPEN-ENDED`, is `status: Completed`. Reaching the "No deadline" string live needs an `InProgress` + `daysRemaining: null` mission, and none exists on this env.

**The WCAG 1.4.1 defect is nonetheless verified closed, by construction.** Source read at PR head `cf20b0ad`, `useMissionCard.ts`:

```ts
let dateLabel: string;                        // no "" default any more — the RED cause
if (isCompleted(data))      dateLabel = t(`${CARD_I18N}.mission_completed`);
else if (daysLeft !== null) dateLabel = t(`${CARD_I18N}.days_left`, daysLeft);
else                        dateLabel = t(`${CARD_I18N}.no_deadline`);
```

A typed `string` with no initializer plus an exhaustive `if / else if / else` means **TypeScript enforces assignment on every path** — there is no remaining code path that renders a dot with no adjacent label. That is a stronger guarantee than any single live observation. Corroborated live: **0 of 16 cards has an empty `.mission-date-badge`**, in either theme, on all 3 passes. `isCompleted` is checked *first*, so a Completed open-ended mission correctly shows "Mission completed" — which is exactly what the PR's own unit test asserts.

## Items 4, 7, 8 — regression

- **4.** `order-mission-modal` (ZEROTARGET) and `sku-mission-modal` (PROGRESS-PARTIAL) both render `<span class="mission-date-badge">` + `vc-badge--dot vc-badge--solid--warning`, fill `#ab660e` on `#ffffff` = 4.53:1, label "180 days left" — identical to the card. One shared component confirmed, not three copies.
- **7.** `/account/orders`: 13 `VcBadge` instances, **0 slotless**, so `vc-badge--dot` applies to none — nothing changed. On `/account/missions` the split is 12 dots (all loyalty) / 9 non-dots (currency picker): the modifier reached only its intended targets.
- **8.** In-progress `.mission-card__bar` = `#fc9e00` = warning-500, **unchanged** — VCST-5910's fix intact; completed bar `#3e845b`. Danger dot `#a01313` vs bar `#fc9e00` = 3.86:1, distinguishable — **computed from live tokens, not observed**, since no danger dot renders on this fixture set.

## Item 9 — axe-core, and what it does and does not prove

axe-core 4.12.1 over `document`, with **12 mission cards and 12 dots present at scan time** (asserted in the same call — the run-1 scan was vacuous for exactly this reason, and this one is not). **`color-contrast` (WCAG AA): 0 violations, light and dark.** The 24 `color-contrast-enhanced` nodes are AAA (7:1), not the AA target, all ≥4.5:1, all pre-existing. **Nothing in `.mission-date-badge` or `.vc-badge--dot` appears in any result.**

**Stated limit:** axe has no automated rule for 1.4.11 non-text contrast. The dot evidence is the `getComputedStyle` measurement above; axe only corroborates that no AA *text* contrast regressed.

## Notes carried with the verdict

1. **Two paths rest on unit tests + token arithmetic, not live observation** — the "No deadline" string and the `danger` band. Closing them needs two fixtures: an `InProgress` mission with `daysRemaining: null`, and an `InProgress` mission with `daysRemaining < 10`.
2. **The dark-theme override is inert on this preset.** Because Red/dark defines `--color-vc-background-solid-*`, the new rule in `dark/atoms/vc-badge.scss` changes nothing here — it only bites on a preset that leaves the token unset. Not a defect, flagged so dark-mode green is not read as proof that rule works.
3. **Local-env infra noise, not findings:** `ws://localhost/graphql` handshake 400s, the downstream Apollo #30, and the resulting full-width "Our server is currently experiencing technical issues" toast. Pre-existing, not PR-attributable. UX note for elsewhere: a subscription-transport failure surfaces a scary banner on a page that works fine.
4. **Currency-picker badges measure 0×0** (collapsed dropdown) on both surfaces. Pre-existing.
5. **Run-1 screenshots lost** — see the Run 1 section.

## Coverage note (no cases authored — verify-fix does not author)

`MSNF-017` asserts the days-left label + danger badge on the *ending-soon* mission, i.e. the **dated** text differentiator — exactly what this ticket says does not extend to the open-ended case. `A11Y-CC-002/003` are generic. The precedent shape for what is missing is `A11Y-CC-004` (*"Lists card — save-v2 icon contrast ratio ≥ 3:1 on white card background (WCAG 1.4.11, regression for VCST-5066)"*). A mission-card analogue is the durable guard this fix wants; the route is `/qa-test-lifecycle`, not this flow. PR #2479 ships `useMissionCard.test.ts` (+72), so the label logic gains a unit guard; the contrast half gains none.

## Reasoned skip

verify-fix Step 0.4 asks for a Context7/VirtoOZ lookup of expected post-fix behaviour. `BL-A11Y-003`'s own `Docs:` field records that Virto documentation declares **no storefront conformance target**, so no VC doc can ground a WCAG threshold — the oracle is the SC itself. Skipped deliberately, not omitted.

## Standing caveat

Run against **localhost** on an **open, unmerged** PR branch build, at the operator's direction. VERIFIED here means *the fix works*; it does **not** mean the fix is on vcst-qa. It still needs merge, deploy and a spot-check there.
