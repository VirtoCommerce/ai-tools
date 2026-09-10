# VCST-5317 — Visual / a11y / design-system lane, Round 2 (`/qa-test` Step 4v)

**Surface:** organization switcher, Account-menu popover (`listbox "Organizations"`), `{FRONT_URL}`.
**Build:** `Ver. 2.58.0-pr-2469-83d6-83d6e5d5` — confirmed in footer at start (anon home, 1920×1080) and
end (anon home, 1920×1080, post-check). **Browser:** Chrome DevTools MCP. **Fixture:**
`seed:membership-lock:verify` run first — reports `VERIFY FAILED: 1 locked leg` on `MULTI_ORG_TF_BR_ALT`,
matching the brief's expected resting V2 (TechFlow locked / BuildRight active). Not mutated.

## Round 2 is BLOCKED on auth — the org-switcher surface was not reached

The pre-signed persistent Chrome DevTools profile (target is role-gated/data-bearing → this is the
mandated path, per this agent's own auth-path table) is **signed out**: header shows `Sign in` /
`Sign up now`, and `/account` redirects to `/sign-in?returnUrl=/account/dashboard`. Confirmed twice
(home page load, direct `/account` navigation).

Per policy this session did **not** type the fixture's plaintext password into the Chrome DevTools
sign-in form — that lane has no `--secrets`, so doing so would put the credential in the tool call and
the transcript, which is exactly what the policy exists to prevent. A minted throwaway account was also
not used: the org switcher is role-gated and data-bearing (needs the `MULTI_ORG_TF_BR_ALT` fixture's two
real memberships), so a fresh account would audit the empty state, not the surface under test, and read
as a false pass. **Result: STOP + report**, per `.claude/knowledge/execution/browser-lanes.md` and this
agent's "Signing the lane in" instructions. Recommend one of: (a) someone signs the persistent profile
in by hand once (session then persists across MCP restarts), or (b) dispatch this pass to a Playwright
lane (`playwright-chrome`/`-edge`), which carries `--secrets` and can type the credential safely.

**Everything requiring the signed-in org switcher is NOT REACHED, reason `AUTH_REQUIRED`:**
F-A2, F-A3, F-U1, F-U2 re-checks; Coffee-preset a11y pass on the popover; `BL-UI-002/003/005/006` on the
popover; the `vs. DESIGN` axis (also independently `SKIPPED` — no Prototype link, no default project);
**both C1 rows, `B2C-ORG-041` and `B2C-ORG-047`, in full** — no assertion in either row could be executed
without the fixture's signed-in session. Per-assertion disposition for both: **NOT REACHED (AUTH_REQUIRED)**.
Round-1's open questions on 041 (accessible name vs. description vs. tooltip-render vs. `disabled` exposure)
and on 047 (top-level hamburger vs. `Corporate → My organizations`) remain **unresolved** — this run adds
no new evidence on either and does not retract Round 1's F2-refutation or F-A2/F-A3/F-U2 findings, which
stand as last confirmed in the Round-1 report (superseded copy: `git show HEAD~1:reports/tickets/Sprint26-18/VCST-5317/design-report.md`).

## What COULD be verified without auth (public/anonymous surfaces only)

| Check | Result |
|---|---|
| Live theme preset | **Red** confirmed via `getComputedStyle` — `--color-primary-500: #e52121`. Coffee not exercised (store-config-driven, not user-togglable — same caveat as Round 1); still SKIPPED, not PASS. |
| **F-A1 independent re-check** (focus-ring contrast, WCAG 1.4.11) | **CONFIRMED, and now shown genuinely site-wide.** Real `Tab`×3 from the anonymous header lands on the "Language" button; computed `outline: color(srgb .898 .129 .129 / 0.4) solid 2px` over effective background `rgb(17,24,39)` (dark navy header, not the popover's white) → composited ≈ **1.49:1**. Required ≥3:1. This reproduces on a page with zero relationship to the org switcher, confirming Round 1's "preset-dependent and site-wide, pre-existing" attribution independently of the popover context. Still **not** attributable to PR #2469. |
| Utility-bar overlap candidate (brief's incidental defect, anonymous leg only) | **NOT reproduced anonymously.** At 1280×1024, signed out: `document.body` `scrollWidth 1265 ≤ innerWidth 1280`, no wrap, "Ship to: Add new address" / "Call us: …" / "Contacts" / "Sign in" / "Sign up now" render on one line (screenshot below). The brief's wrapped copy ("Ship to: Select address" / "Dashboard") is **signed-in-only vocabulary** — `/account` → `/sign-in?returnUrl=/account/dashboard` confirms `Dashboard` is an authenticated-only nav item, absent anonymously. **The signed-in leg is unconfirmed** (`AUTH_REQUIRED`) — this result narrows the defect's scope (anon at 1280 is clean on this build) but does not refute it for the signed-in state the brief actually measured it on. Do not close this as pre-existing-and-unrelated on this evidence alone; re-test signed-in once auth is restored. |
| Viewport clamp (Part 2's caveat) | Requested 375×812 → achieved `body.getBoundingClientRect().width = 485`. Corroborates Round 1's ~500px clamp on this lane; a 375px observation was never claimed. |
| Console | One `net::ERR_NAME_NOT_RESOLVED` (×2), an unresolved third-party asset — unrelated to PR #2469 or the org switcher, not filed. |
| Network | No 4xx/5xx observed on the anonymous pages visited. |

## Findings filed this round

None. F-A1's re-confirmation strengthens Round 1's existing filing; no new finding is warranted from an
anonymous-only pass. The utility-bar candidate stays a candidate — **NOT REACHED** for its signed-in leg,
not a filed finding, not closed.

## BL-UI invariants — this round

Only the anonymous public header was instrumented (the popover itself was unreachable):

| Invariant | Result | Basis |
|---|---|---|
| BL-UI-004 content stays in container | PASS (anon, 1280px only) | `scrollWidth 1265 ≤ innerWidth 1280` |
| BL-UI-001..003, 005, 006 (popover) | NOT REACHED | `AUTH_REQUIRED` |

## Evidence

`reports/tickets/Sprint26-18/VCST-5317/screenshots/`
- `S4-UX-utility-bar-1280-anon.png` — anon header at 1280×1024, no overlap, Red preset visible
- `S4-UX-round2-final-anon-signed-out-1920.png` — final state, footer version confirmed, signed out

## Lane state

No fixture mutation. `seed:membership-lock:verify` run once (read-only `--verify`), reported the expected
pre-existing `VERIFY FAILED: 1 locked leg` on `MULTI_ORG_TF_BR_ALT` and was not re-run. No sign-in attempted,
no sign-out needed (session was already anonymous throughout). No suite CSV touched.
