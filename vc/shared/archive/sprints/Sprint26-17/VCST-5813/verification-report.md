# VCST-5813 — Verification (Phase B / GREEN) — **VERIFIED**

**Env:** vcmp-dev Vendor Portal (`/apps/vendor-portal/`), build **55512** (`last-modified` 2026-09-02 12:32:12 GMT), `@vc-shell/framework` **2.6.0-rc.0** (confirmed live in the console banner) · Edge (`playwright-edge`) · Light theme · 1920×1080 · 2026-09-02

## Summary
The Log Out STR passes 3/3: after logout the a11y tree marks the `vc-auth-layout` root `main` as `[active]` — focus is no longer on `<body>` and the tree is not `[active]`-less. The fix's claimed breadth holds (the Forgot password route repairs on mount too, and the root remounts on every auth route change so `onMounted` genuinely re-runs), the `tabindex="-1"` root adds **no** stray tab stop, and `focusIfLoose` was observed *declining* to take focus from a control the user had deliberately focused. One half of the Tab-continuation discriminator is **inconclusive by construction** — see Findings; it is a property of the page, not a defect.

**Oracle:** PR #343's `vc-auth-layout.vue` contract (`ref="rootRef"` + `tabindex="-1"` + `onMounted(focusIfLoose)`). No `BL-UI-*` invariant, `critical-ui-scope.md` cell or regression suite covers vc-shell — none cited; the `/qa-accessibility` P0 route list is storefront routes, so the vc-shell equivalents (login → dashboard → list blade) were substituted. Elements located by role + accessible name.

**Instrument:** the a11y snapshot `[active]` marker + a one-Tab continuation probe. `browser_evaluate` blocked and never attempted; no `@allow-eval`. **Calibration passed twice**, including once on the post-logout page: the Password field read `[active]` and `main` correctly lost the marker — so a `main [active]` reading is genuine focus, not a default.

## Checklist
| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | STR run 1 — `vc-auth-layout` root `[active]` after Log Out | **PASS** | `main [active] [ref=e1868]` (Logo + login form = the auth layout root) |
| 2 | STR run 2 | **PASS** | `main [active] [ref=e2715]`; `screenshots/5813-post-logout-auth-layout-focused.png` |
| 3 | STR run 3 | **PASS** | `main [active] [ref=e3468]` |
| 4a | Tab once from restored focus → first control in the form | **INCONCLUSIVE (by construction)** | Tab → **"Microsoft Entra ID"**. That node is simultaneously *the next control after the root* and *the document's first tab stop*, so "continues in place" and "restarts at the top" resolve to the same element here. Not evidence either way — see Findings |
| 4b | Root is focusable but **not** a tab stop (no stray stop) | **PASS** | Shift+Tab from "Microsoft Entra ID" left the page entirely (no in-page `[active]` node) rather than landing on `main` |
| 5 | Breadth — another page on this layout repairs on arrival | **PASS** | **Forgot password**: on arrival `main [active]`, and the root ref changed `e1868 → e1929`, proving the layout **remounted** so `onMounted → focusIfLoose` actually ran. Also the fresh document load at session start landed on `#/login` with `main [active]` |
| 6 | `focusIfLoose` repairs but does not **steal** focus | **PASS** (3 obs.) | With Sign in deliberately focused, a failed sign-in re-rendered the form (field cleared, `alert` added) and focus **stayed** on `Sign in [disabled] [active]` — the root did not reclaim it. Conversely it *did* claim focus on remount, when focus was genuinely loose. Measured without `evaluate` |
| 7 | VCST-5670 not regressed (authenticated repair still works) | **PASS** (3 obs.) | Each of 3 sign-ins landed focus on the authenticated workspace `main [active]` (`e260` / `e2207` / `e2969`), never `<body>` |
| 8 | No new console errors | **PASS** | **0 errors** / 17 messages across the whole session |

**STR tally:** 3/3.

## Findings / notes
- **Item 4a cannot be decided on this page, and that is geometry, not a bug.** The `vc-auth-layout` root is the document's *first* element, so its first tabbable descendant ("Microsoft Entra ID") is also the document's first tab stop. From the root and from `<body>`, one Tab reaches the same node. The discriminating evidence here is therefore the `[active]` marker (calibrated, and shown to move off `main` when focus moves), reinforced by **4b** — which is measurable and passes: the root does not itself absorb a Tab.
- The auth layout **remounts on every auth route change** (root ref changes login → forgot-password → login), so the fix's `onMounted` hook fires per page rather than once, which is what makes its stated breadth (sign-in, forgot/reset password, invitation, forced password change) plausible. **Reset password, invitation and forced password change were not reachable** without provisioning a new account — those three paths are **NOT-RUN**, not passed.
- **No AT pass was run** — focus/ARIA-tree verification only, no screen reader.
- **Incidental (described, not filed):** (a) a failed sign-in clears the Password field and raises `alert: "The Password field is required"` instead of an invalid-credentials message, with the field marked `[invalid]` — misleading, 3/3 (only exercised with a nonexistent account); (b) `[VcDataTable] Column width crisis: sum(minPx)=1800px > availableWidth=778px … squeezed below their minimum widths` on the *My Offers* list blade at 1920×1080; (c) `[@vc-shell/framework#ai-agent-context] Cannot set context data: no blade id available` repeats once per sign-in/route event (5×) — framework-internal, unrelated to focus.
- **Not attempted:** no `vc-popup` backdrop-dismiss measurement (proven unmeasurable with this MCP); the ARIA snapshot was never used as an `inert` exposure test.

**Evidence:** `reports/tickets/Sprint26-17/VCST-5813/screenshots/5813-post-logout-auth-layout-focused.png` (confirmed on disk).
