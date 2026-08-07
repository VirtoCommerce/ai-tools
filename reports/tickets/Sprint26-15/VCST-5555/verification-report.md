# VCST-5555 — Fix Verification (Storybook a11y, Red Theme 4)

**Check type:** bug-fix verification (`/qa-verify-fix`, routed from `/qa-test` §1a — Bug × `fix-ready` → `verify-fix`)
**Env:** vcst-qa @ Platform 3.1057.0, theme `vc-theme-b2b-vue-2.55.0-pr-2423-a4e7-a4e7163b`, Storybook 9.1.20 — 2026-08-06

## Summary

vc-frontend PR #2423 clears all 6 axe rules across all 28 reported story instances under the **Red** preset —
confirmed 0 violations on three independent instruments, with a live negative control proving the harness is
sensitive. No new axe violations of any rule, no console errors. **VERIFIED WITH NOTES**: three incidental
a11y items surfaced (one a minor degradation this PR introduced, two pre-existing) — none blocks the fix.

## Verdict: VERIFIED WITH NOTES

## Build & deploy gate (authoritative, not inferred)

| Signal | Value |
|---|---|
| Fix PR | `VirtoCommerce/vc-frontend` #2423 `fix/VCST-5555` @ `a4e7163b`, **OPEN → dev** (not merged) |
| Storybook build | `project.json` `generatedAt` = 2026-08-06T13:04:55Z ↔ storybook-ci `workflow_dispatch` on `fix/VCST-5555@a4e7163b` (13:05:50Z) |
| PR-exclusive live marker | `<th scope="col"><span class="sr-only">Row selection</span>` present |
| Storefront | `vc-deploy-dev@vcst-qa` `theme/artifact.json` = the same PR-2423 artifact |

## RED → GREEN

**Phase A (RED) — cited, not re-taken.** The fix was already live when this run started, so RED could not be
reproduced on this env. Baseline source: **VCST-4226 comment 103757** (Elena Kutasina, 2026-07-23 17:32 +03) —
15 numbered items + 20 screenshots enumerating exactly these 28 story URLs. Not fabricated.

**Phase B (GREEN) — 3 consecutive passes + two corroborating instruments.**

| Instrument | Scope | Result |
|---|---|---|
| axe-core 4.10.3, injected via Playwright | 28 stories × **3 consecutive passes** | **28/28, 0 target-rule violations; 0 violations of any other rule** |
| Storybook `addon-a11y` panel (the reporter's own tool) | 28 stories | **28/28 `Violations 0`**, 2–20 axe *passes* each — proves axe evaluated real content |
| Chrome DevTools MCP, axe **4.12.0** (addon's own) + 4.10.3 — `ui-ux-expert`, independent | 8-story sample, one per fix mechanism | **8/8 = 0 violations on both versions** |
| **Negative control** — same badge story at `themePreset:purple-pink` | reproduced by both instruments | **9 `color-contrast` nodes (serious)** → a green result under Red is a real signal |

Preset correctness was gated on every measurement: poll until `--color-primary-500 == #e52121` before asserting
(the `themePreset` global loads by async dynamic import; a capture taken too early audits the *previous* preset).

**Per-rule outcome (all 28 instances):** `color-contrast` 9/9 · `scrollable-region-focusable` 8/8 ·
`nested-interactive` 7/7 · `button-name` 2/2 · `label-title-only` 1/1 · `empty-table-header` 1/1.

## Fix mechanisms verified physically present in the deployed build

| Mechanism | Live evidence |
|---|---|
| `red.json` accent token | solid-accent bg `rgb(37,99,235)` on white → **5.17:1** (was `accent-500 #3b82f6` = 3.68:1, failing AA). This is `accent-600` from Red's own blue accent ramp, matching the outline/surface/ghost accent tokens already at `#2563eb` — not a foreign colour |
| `vc-container` loading opacity | computed `opacity: 0.7` (was 0.5) |
| `vc-scrollbar` auto tab stop | `tabindex="0"` on all 7 overflowing regions; `ArrowDown` scrolls (0→40 / 0→120); `:focus-visible` outline `2px rgb(229,33,33)` = **4.59:1**, passes 1.4.11 |
| `vc-popover` nested-interactive | wrapper reduced to `class` only; ARIA relocated onto the real `<button>` — `aria-haspopup="dialog"`, `aria-expanded` false→true, `aria-controls` populated |
| `vc-input` clear button | `aria-label="Clear"`, 38×38 px (≥24×24, WCAG 2.5.8) |
| `vc-action-input` label | `<label for>` "Promo code" properly associated; no title-only |
| `vc-table` selection header | `sr-only` span, 1×1 px `clip: rect(0,0,0,0)` — visually absent, present in the a11y tree |

## Regression checks — all PASS

Popover Enter opens / closes / reopens with no reopen-after-close; Escape closes without trapping focus.
Hover popover opens and closes cleanly. **No spurious tab stops**, both guards confirmed: a scroll region with
focusable children gets `tabindex = null` (dropdown-menu, 7 focusable descendants), and a non-overflowing region
drops it — reactively, verified by resizing 1920→2900 px (`tabindex` removed) and back (restored). Console clean
across every story visited.

## Findings (none blocking — no in-scope P0/P1)

| # | Finding | Provenance | Sev |
|---|---|---|---|
| 1 | `VcTooltip` forwards `#trigger` without `triggerProps`, so non-interactive triggers (`vc-checkbox__label`, `vc-input-details__message`) carry no role/state. Storefront `/search`: of 52 `.vc-popover__trigger`, 4 carry ARIA, 45 have a focusable child but no `aria-haspopup`/`aria-expanded`, 3 have no focusable child at all | **Keyboard inoperability is PRE-EXISTING** — `emitTriggerProps` on `dev` never contained `tabindex`, so `role="button"` alone never conferred focusability. The **new** delta is loss of AT role/state announcement on a control that was already unreachable | P3 |
| 2 | `VcButton` focus ring `3px` red at **30 % alpha** → ≈1.63:1 vs white, 2.82:1 vs the button fill; below the 3:1 usually applied under 1.4.11. axe does not test focus-indicator contrast | PRE-EXISTING, untouched by this PR | P3 |
| 3 | `VcScrollbar` focusable regions have no accessible name (`role`/`aria-label` both null) — an unnamed Tab stop. Not an AA failure (`scrollable-region-focusable` requires only focusability) | IN-SCOPE-adjacent: the tab stop itself is new, so the unnamed stop is new | P3 |
| 4 | `purple-pink` (3.58:1) and `watermelon` (3.14:1) still fail AA on solid-accent | PRE-EXISTING, out of scope (ticket is Red-scoped) | P3 |

Finding 1 is recommended as a **separate follow-up**, not a blocker: the ticket's acceptance condition —
0 axe violations on each listed story — is fully met, and the underlying `VcTooltip` gap predates this PR.

## Evidence

`reports/tickets/Sprint26-15/VCST-5555/` — `evidence.html` (RED→GREEN page), `verification-summary.json`,
`screenshots/` (15). Key: `manager-red-badge-all-colors.png` shows the addon panel's own
`Violations 0 / Passes 2` with the toolbar on **Red**.
