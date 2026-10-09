# Triage — VCST-6214 checklist (ticket mode, `--verify`)

**Ticket:** VCST-6214 · 2026-10-09 · env vcst (storefront vc-frontend-next 3.0.0-alpha.2685, backend 3.1076.0 + 7 PR-build modules)
**Source:** `testing-checklist.md` — 15 non-passing rows after the D5 re-run (15 FAIL · 0 BLOCKED; D5 FAIL (env) → PASS), 9 advisory, 0 unresulted · **Real bugs:** 15 (5 at/above the filing floor) · **Checklist defects:** 1 · **Dismissed (ENV):** 1
**Mode:** `--fix` ignored (ticket mode writes nothing; the caller owns the checklist and filing). Live investigation (`vc-fix:qa-investigate`) ran for every candidate **at or above the floor**; the 10 `Low` candidates were classified from lane + source evidence and NOT live-investigated — stated, not silent.
**Upstream baseline:** `vcptcore-qa` = vc-frontend 2.59.0-pr-2458 (sales-rep GA widgets only — a valid baseline). `virtostart` (2.59.0-pr-2494) is the **Paprika demo branch**, not upstream; one early G1 comparison taken there was superseded.

## 1. Confirmed real bugs (≥ floor) — none IN-SCOPE

| Row | Bug | Sev | Provenance | Repo | Package |
|---|---|---|---|---|---|
| G1 | Zero-hit search (keyword **and** barcode) collapses skeleton + controls + sidebar in one frame — CLS 0.41–0.49 @1920 / 0.76–0.84 @375; upstream 0.64–0.72 / 0.80–2.28 (BL-UI-001) | Medium | PRE-EXISTING (upstream, untracked) | vc-frontend | `evidence/G1-barcode-empty-cls/` (+ `upstream-signed-in/`) |
| I1 | Paprika **light** preset: white on `#e5451c` = 4.04:1 on every text-bearing solid-primary button + header badge (dark 7.01) — WCAG 1.4.3 | Medium | OUT-OF-SCOPE (theme preset, `paprika.json:7`) | vc-frontend-next | `evidence/I1-primary-contrast/` |
| I3 | Mobile main menu (375) does not contain focus — Tab/Shift+Tab reach obscured page controls — WCAG 2.4.3 / 2.4.11 | Medium | PRE-EXISTING (upstream worse: no focus-in, no Esc) | vc-frontend → port | `evidence/I3-mobile-menu-focus/` |
| I4 | Mobile notifications bell's accessible name is only the count ("13"; upstream "1") — WCAG 4.1.2 / 2.4.6 | Medium | PRE-EXISTING (upstream identical) | vc-frontend → port | `evidence/I4-mobile-bell-name/` |
| I5 | List-details qty input `max="0"` (maxQuantity 0 = no limit) → `invalid=true`, ArrowUp dead; cart/PDP guard 0, list does not — WCAG 4.1.2 | Medium | PRE-EXISTING (upstream identical, `line-items/index.ts:126`) | vc-frontend → port | `evidence/I5-list-qty-max0/` |

## 2. Below floor (`Low`) — drafted, not filed

I2 preferences-menu text 3.2:1 (theme) · I6 barcode empty-hint 4.14:1 dark (theme) · I8 demo-home `image-alt` ×9 (theme) · J1 `createOrderFromCart` 1.2–9 s — **also on released XOrder/XCart**, env-capacity, not this ticket (`evidence/J1-…`) · J2 empty-cart view before "Order completed" (upstream ordering, n=1) · J3 `de.json:1126` "Featured" untranslated (theme) + backend sort names unlocalised · J4 checkbox named `billingAddressEqualsShipping` (upstream) + **textarea unnamed (dup of local draft `BUG-vc-textarea-has-no-accessible-name-shared-ui-kit.md`)** + raw return-reason codes (Return PR build) · J5 plural / premature "required" / row roles (upstream) · J6 sign-out FCM 404 + uncaught ApolloError + devtools banner (upstream) · J7 missing page titles (upstream; KB-52188DBA). Added after the operator's mobile review (advisories promoted to Low rows in `findings.md`): C2a mobile language list — two options named "English", no `aria-current` · I9 BL-UI-006 0–4 px gaps between mobile header/footer targets.

## 3. Checklist fixes / dismissed

| Row | Class | Action |
|---|---|---|
| D1 | `TEST_STEPS_DEFECT` | Lists are cards in upstream and fork — never a `vc-table`; row corrected to N/A, #2532 verified via D2 (and the return-wizard table: hover present, no selected-row state on any storefront page) |
| D5 | `ENV` (dismissed as a bug) — **RESOLVED** | Storefront ingress had no `/api/otp/*` route (405 nginx); theme request byte-identical to upstream. DevOps added the route to vcst-qa; **re-run 2026-10-09 13:52–13:55Z PASS** end to end (request 200 → code → `/connect/token` 200 → signed in) |

**No tracker ticket filed, no fix triggered — human decides.**

_Restored 2026-10-09 after a local deletion; the `evidence/` packages it cites were lost (folders empty)._
