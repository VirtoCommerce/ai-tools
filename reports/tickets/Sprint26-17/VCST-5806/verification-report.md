# VCST-5806 — Verification (Phase B / GREEN) — **VERIFIED**

**Env:** vcmp-dev Vendor Portal (`/apps/vendor-portal/`), build **55512** (`last-modified` 2026-09-02 12:32:12 GMT), `@vc-shell/framework` **2.6.0-rc.0** (confirmed live in the console banner) · Edge (`playwright-edge`) · Light theme · 1920×1080 · 2026-09-02

## Summary
All three of the dev's repros pass 3/3 in a real browser, and the decisive discriminator — one Tab after activation — continues **in place** rather than restarting at the document. The fix's signature was observed directly: the a11y tree reports `button "Sign in" [disabled] [active]`, i.e. a button that is disabled *and* still holds focus, which is impossible with a native `disabled` attribute. The regression that mattered most is clean: ordinary disabled buttons that are not focused still carry native `disabled` and are still skipped by Tab.

**Oracle:** `vc-button.docs.md` @ `main` (the disabled-while-focused contract). No `BL-UI-*` invariant, `critical-ui-scope.md` cell, `storefront-selectors.md` entry or `config/test-suites.json` suite covers vc-shell — none were cited; the component's own docs contract was substituted. Elements located by role + accessible name.

**Instrument:** the Playwright a11y snapshot's `[active]` marker, plus a one-Tab continuation probe. `browser_evaluate` is blocked by `hooks/enforce-real-user.mjs` and was never attempted; no `@allow-eval`. **Calibration passed twice** — Password field read `[active]` and the layout root correctly *lost* the marker when focus moved, so the probe discriminates rather than always reporting the root.

## Checklist
| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Sign in keeps focus while the request is in flight (3×) | **PASS 3/3** | `Sign in [disabled] [active]` after Enter, all 3 runs; `POST /api/platform/security/login → 200` (req #233) proves the request fired. `screenshots/5806-signin-disabled-but-still-focused.png` |
| 2 | Range toggle, keyboard: range switches + focus stays (3×) | **PASS 3/3** | `7D [active][pressed]` → `30D [active][pressed]` → `90D [active][pressed]`; `main` lost `[active]` each time |
| 3 | Range toggle, mouse: focus lands and stays (3×) | **PASS 3/3** | click 90D → `90D [active][pressed]`; then 7D; then 30D — same shape |
| 4 | **Tab-continuation discriminator** | **PASS** (2 obs.) | After repro 2: Tab → **30D** (next control in the widget). Second obs.: Tab from 90D → **"All orders →"**. Neither restarted at the document's first stop (nav logo / Notifications) |
| 5 | `aria-pressed` genuinely changed | **PASS** | Exactly one `[pressed]` per switch, and the widget re-read: 30D = 2 orders / $1,436 vs 90D = **14 / $8,121**; header label tracked `(7D)`/`(30D)`/`(90D)` |
| 6 | **Ordinary disabled button keeps native `disabled` + skipped by Tab** | **PASS** (2 elements) | (a) *My Offers* blade pagination **"First page" / "Previous page"** (both `[disabled]` on page 1): Shift+Tab from "Page 1" jumped straight over both to the preceding row checkbox. (b) Login **"Sign in"** with an empty form: Tab from "Show password" landed on **"Forgot password?"**, skipping it. No leaked tab stop |
| 7 | `aria-disabled` button still inert | **PASS** | While `Sign in [disabled][active]`: Enter **and** Space → still exactly **one** `security/login` POST on that page, no new alert, URL unchanged (`#/login`) — the `type=submit` button did not submit its form |
| 8 | No new console errors | **PASS** | **0 errors** / 17 messages across the whole session |

**STR tally:** repro 1 — 3/3 · repro 2 — 3/3 · repro 3 — 3/3.

## Findings / notes
- **Repro 1 was measured against a *nonexistent* account** (`qa-focus-probe@example.com` + a deliberately wrong non-secret password), not against `admin`. Reason: a successful sign-in navigates away before the in-flight window can be sampled, and repeated *failed* attempts on `admin` risk an account lockout that would have blocked both tickets. Lockout counters are per-account, so a nonexistent user cannot lock `admin`. The auth POST genuinely fired, so the in-flight disabled state is real, not simulated.
- On the successful sign-ins (3 of them) focus never fell to `<body>` either, but it landed on the authenticated workspace root — that is VCST-5670's route repair, **not** this fix, so it is not counted as repro-1 evidence.
- The Orders widget carries **7D / 30D / 90D**; the ticket's "3M" belongs to the *Offers* widget. 7D and 30D happen to hold the same figures on this data, so the range change is evidenced by the `[pressed]` flip, the header label, and the 90D divergence.
- **No AT pass was run** — this is a focus/ARIA-tree verification, not a screen-reader test.
- **Incidental (described, not filed):** a failed sign-in clears the Password field and raises `alert: "The Password field is required"` with the field marked `[invalid]`, instead of an invalid-credentials message — misleading, 3/3 reproducible. Only exercised with a nonexistent account, so whether a wrong password on a real account differs is untested.
- **Tooling (not a product defect):** two interactions initially hit the MCP 5000 ms "visible, enabled and stable" gate (a dashboard range button, and one password fill); a 3 s settle then succeeded. Recorded so the flake is not mistaken for a defect.

**Evidence:** `reports/tickets/Sprint26-17/VCST-5806/screenshots/` — `5806-signin-disabled-but-still-focused.png`, `5806-range-toggle-keeps-focus-30D.png` (both confirmed on disk).
