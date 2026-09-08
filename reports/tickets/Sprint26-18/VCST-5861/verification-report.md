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
