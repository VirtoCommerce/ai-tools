# Sales Rep rule-chip counter fails WCAG AA contrast in 3 of 4 state×theme combinations — P2

**Severity:** Medium / P2 · **Type:** Accessibility (WCAG 1.4.3 Contrast Minimum)

**Env:** vcptcore-qa @ Platform 3.1069.0, theme `2.58.0-pr-2474-62e6-62e635c6` · store `B2B-store` · chromium

## Summary
The item counter rendered inside a Sales Rep rule chip (`.sales-rep-rule-chips__count`, `text-primary-500` → `#d34247`) fails the 4.5:1 AA bar against the chip's actual backdrop in **three of the four** state × theme combinations. Only the selected chip in light mode passes, and only by 0.09.

## Steps to Reproduce
1. Sign in as `agent-test-sr-docs@example.com` (needs `sales-rep-documents:read`).
2. Open `{{FRONT_URL}}/company/documents` — the category chips render counters.
3. Sample the counter's computed `color` and the chip's **actual rendered** backdrop, in light and dark, on a selected and an unselected chip.

## Expected vs Actual
**Expected:** ≥ 4.5:1. The counter is 14px at weight 700 — below the large-text threshold (≥18.66px bold or ≥24px), so the 3:1 bar does not apply.

**Actual:**

| Theme | Chip state | Backdrop | Ratio | Verdict |
|---|---|---|---|---|
| Dark | unselected | `#121212` | **4.14:1** | FAIL |
| Dark | selected | `#0a0a0a` | **4.37:1** | FAIL |
| Light | unselected | `#fafafa` | **4.40:1** | FAIL |
| Light | selected | `#ffffff` | 4.59:1 | narrow pass |

Counter colour is `#d34247` in every case.

## Root Cause
`#d34247` (`primary-500`) is a fixed brand token applied as **text** at 14px. It sits near the midpoint of the luminance range, so it cannot reach 4.5:1 against a near-white *or* a near-black backdrop — no theme or backdrop change rescues it. The counter colour itself has to change (or the counter must stop being plain text at that size, e.g. a badge with its own background).

Note on the selected chip in dark: its fill computes to `#0a0a0a`, i.e. **darker** than the `#121212` row — the `additional-50` token inverts in dark, so "selected = lighter" does not hold.

## Provenance — PRE-EXISTING, not caused by PR #2474
PR #2474 changed `__count` from `@apply font-semibold text-primary-500` to `@apply text-primary-500`. The **colour token is unchanged**, the backdrops are unchanged, and 14px stays below the large-text threshold either way — so the ratios are identical before and after. Found during the VCST-5890 `/qa-test` run.

## Measurement note
Backgrounds were **pixel-sampled from rendered PNGs**, not derived by walking ancestors. Every ancestor of the chip up to `<html>` computes to `rgba(0,0,0,0)` on this page, so an ancestor walk falls through to the UA white default and fabricates a light backdrop under a dark page — that method produced an incorrect earlier figure for the light-unselected case (reported 4.59, actually 4.40).

## Fix Routing
- **Repo:** `vc-frontend` · `client-app/modules/sales-rep/components/sales-rep-rule-chips.vue` (the `&__count` rule)
- **Kind:** frontend
- Same class as VCST-5879 (Compare segmented control, 4.34:1 at 14px bold) and VCST-5483 (VcButton secondary/outline, 4.05:1).

## Evidence
`reports/tickets/Sprint26-15/VCST-5890/screenshots/` — `F4-s4-documents-chiprow-light-closeup.png`, `F6-s4-documents-chiprow-DARK-closeup.png`
