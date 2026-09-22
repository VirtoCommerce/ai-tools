# VCST-5861 — Fix Verification: BLOCKED (fix not deployed)

**Ticket:** [vc-shell] Blade-toolbar buttons convey no disabled state to assistive tech and stay in the tab order (WCAG 4.1.2) · Bug · Medium
**Env:** vcmp-dev Vendor Portal — app `2.1.2-rc.0`, asset build `42234` (2026-09-07 11:14:10 GMT), framework **`2.6.0-rc.0`**, Chrome, Light theme
**Fix:** `vc-shell` PR #355 `8f5c54f4`, merged 2026-09-04 12:51:46 GMT (framework layer)

## Verdict

**BLOCKED — not REOPEN.** The fix is real and merged, but it is **not in the deployed build**, so the
original defect still reproduces. Re-testing here would manufacture a false REOPEN blaming the dev for a
release lag. No transition made; the ticket stays at *Ready for test*.

## Deploy gate — FAIL (settled by arithmetic, not by marker)

| Check | Result |
|---|---|
| Served framework version constant | `2.6.0-rc.0` (in both `vc-shell-framework42234.js` and `vc-shell-vendors42234.js`) |
| npm `@vc-shell/framework` `rc` | `2.6.0-rc.0`, published **2026-09-02 10:21:31 GMT**, `gitHead cb6379d` (*"release: v2.6.0-rc.0"*) |
| Ancestry `8f5c54f4...cb6379d` | `status=behind`, `ahead_by=0`, **`behind_by=3`** — the release commit does not contain the fix |
| `vendor-portal@dev` pin | `"@vc-shell/framework": "2.6.0-rc.0"` — **exact, not a caret range** |

The exact pin is the load-bearing detail: today's app rebuild (build `42234`, 2026-09-07) **could not**
have picked the fix up, and no future rebuild will until the pin is bumped. `latest` on npm is still `2.5.0`.

## RED baseline — captured live, on the pre-fix build

Because the framework fix is absent, vcmp-dev **is** the pre-fix build right now — the ideal Phase A window.

**Instrument validated first:** the login page renders `button "Sign in" [disabled]`, proving the ARIA
snapshot *does* surface exposed disabled state — so an absent `[disabled]` below means absent, not unmodelled.

| Control | Accessibility tree | CSS state |
|---|---|---|
| **Delete selected** (Products list toolbar) | `button "Delete selected"` — no `[disabled]`, no `[cursor=pointer]` | carries `.vc-blade-toolbar-base-button--disabled` (confirmed via the axe target path) |
| **Save as draft** (product blade, no unsaved changes) | `button "Save as draft"` — no `[disabled]`, no `[cursor=pointer]` | siblings *AI Assistant* / *Delete* / *Save and publish* all carry `[cursor=pointer]` |

Both reproduce the ticket exactly: the state lives only in a CSS modifier class, so assistive tech is told
these are ordinary actionable buttons while they are inert.

## It also removes a node from VCST-5862

VCST-5862 lists the "Delete selected" toolbar title as a colour-contrast failure (2.41:1 Light, 3.40:1 Dark).
That attribution is wrong, and this ticket is why. A controlled pair on the same page: the pagination
buttons carry the SAME ink (#a3a3a3) at a WORSE ratio (~2.3:1) and axe does not flag them, because they
expose [disabled]; "Delete selected" is flagged only because it exposes nothing. WCAG 1.4.3 exempts
disabled controls, and the dev deliberately left --neutrals-400 in place on them.

So fixing THIS ticket removes that node from VCST-5862 with no colour change — and the dev's reported
"after: 0" is only reachable with both #355 and #356. The two tickets should be re-verified together.

## Limits

- **No AT pass was run** — read from the rendered accessibility tree, not screen-reader output.
- The tab-order half of the claim is not a post-fix defect: PR #355 deliberately keeps the control focusable
  (`aria-disabled`, not native `disabled`), so the expected GREEN is *in tab order **and** announced unavailable*.

## Next

Publish a framework release containing PR #355 → bump the `vendor-portal` pin → redeploy vcmp-dev → re-run Phase B.
The RED baseline above is banked and dated, so the GREEN half needs no re-derivation.

## Evidence

`screenshots/VCST-5861-RED-toolbar-deleteselected.png` · `screenshots/VCST-5861-RED-product-blade-save-as-draft.png`

---

# 2026-09-15 — Phase B (GREEN): **PASS**

**Env:** vcmp-dev — app `2.2.0-rc.1`, asset build **`53555`**, framework **`2.6.0-rc.1`** (live console
banner `v2.6.0-rc.1 · 2026-09-08T10:09:58Z · 371aa8ec5`). Chrome via `playwright-chrome` (lane deviation —
DevTools MCP has no `--secrets`). Light **and** Dark. **RED baseline: the 2026-09-07 section above.**

## Verdict — PASS (3 of 3 runs, both controls, both themes)

Every run started at the login page and re-validated the instrument — `button "Sign in" [disabled]` present in all 3, so an absent `[disabled]` below means absent, not unmodelled.

| Check | Run 1 | Run 2 | Run 3 | Result |
|---|---|---|---|---|
| **Delete selected** (Products toolbar, nothing selected) exposes disabled | `[disabled]` | `[disabled]` | `[disabled]` | **PASS** |
| **Save as draft** (product blade, no unsaved changes) exposes disabled | `[disabled]` | `[disabled]` | `[disabled]` | **PASS** |
| **Reverse control** — an actionable sibling does NOT expose disabled | ✓ | ✓ | ✓ | **PASS** |
| **Tab order** — inert control still receives focus | `[disabled] [active]` | `[disabled] [active]` | `[disabled] [active]` | **PASS** |

Reverse-control detail — what stops "everything reads disabled" passing as a fix: in the same snapshot
*Add / AI Assistant / Refresh / Export categories* (list) and *AI Assistant / Delete* (blade) all carry
`[cursor=pointer]` and no `[disabled]`. Dark reproduces every row identically.

**Tab order — two independent instruments agree**, which matters because the ARIA snapshot alone cannot
distinguish `aria-disabled` from native `disabled`: (1) tree = `button "Delete selected" [disabled]
[active]`; (2) a rendered focus ring sits on the greyed-out control (`…-deleteselected-focused-light.png`).
That is the expected post-fix state per PR #355 — **in the tab order AND announced unavailable**, not
removed. A like-for-like control confirms the mechanism differs from native disabling: the pagination
buttons are literally `<button disabled type="button" aria-label="First page">`; the toolbar control keeps
its tab stop.

## Adjacent regression — PASS

`aria-disabled` has not broken real actions. On the product blade: edited a property → *Save as draft*
flipped `[disabled]` → `[cursor=pointer]`; clicked → value persisted, button returned to `[disabled]`. The
edit was reverted and re-saved, so the fixture is back as found.

## Storefront-calibrated rules consciously set aside

Coffee theme (absent — portal ships Light/Dark/Green) · `storefront-selectors.md` (substituted role +
accessible name and `.vc-*`/`data-test-id`) · `BL-UI-*` / `critical-ui-scope.md` (storefront components) ·
`config/test-suites.json` (no suite covers vc-shell) · `/qa-accessibility` P0 routes (substituted login →
dashboard → list blade → item blade).

## Limits

- **No AT pass was run** — rendered-tree, computed-style and focus-ring measurement, never screen-reader output.
- **Green theme not audited — unknown, not clean.**
- **BL-A11Y-004** cited for the WCAG 4.1.2 criterion only — it is written *"on the accessibility-gated
  storefront themes"*, so it is storefront-scoped by its own wording; Virto declares no target for this product.

## Evidence

`screenshots/VCST-5861-GREEN-{toolbar-deleteselected,blade-save-as-draft}-{light,dark}.png` ·
`…-deleteselected-focused-light.png` · `…-taborder-focusring-light.png` · HAR `test-results/chrome/har/session.har`
