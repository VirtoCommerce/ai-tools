# VCST-5518 — Timer build re-verification (commit `04eac333`)

**Verdict: the auto-dismiss works and the original fix survives it. One of MY earlier claims was WRONG and is corrected below.**

Build verified live from the page footer: **`Ver. 2.55.0-pr-2422-04ea-04eac333`** (the timer build).
Platform live: `3.1057.0-pr-3095-3abb` — note this was bumped mid-session; Phase A/B ran on `3.1055.0`, so
the platform was **not constant** across phases. The fix is theme-only, so this doesn't invalidate the
verification, but the environment was not identical.

Cart: HP LaserJet Pro 500 Color MFP M570dn × 2 = subTotal $1,998.00. Applied coupon (V) = `FREE`
(`discountTotal 299.70`). Invalid codes (X) = fresh nonexistent codes per run.

**Executed inline by the orchestrator, not a subagent.** Two delegated attempts died on transient API
`529`s (the second mid-run, after completing the valid-replacement check). Per the fallback rule, the
remaining checks were run directly. Partial payloads from the second attempt survive in
`test-results/chrome/vcst5518-timer/`.

## What the timer commit does

`COUPON_ERROR_TIMEOUT = 7000`; a module-scope `couponErrorTimeoutId`; a new `setError()` that sets
`couponError` then schedules `clearError` after the timeout; `clearError()` now also cancels a pending
timer. All three error assignments route through `setError()`. **Components untouched.**

## Confirmed

| # | Finding | Evidence |
|---|---|---|
| 1 | **The original fix still holds.** `FREE` stayed applied across ~5 consecutive invalid applies; discount `- $299.70` and total `$2,037.96` never moved | sidebar snapshots throughout; `Remove coupon` on the FREE card the whole time |
| 2 | **The error auto-dismisses without user interaction**, while the invalid code is still sitting in the input | error present ~2 s after apply; absent by ~8 s and again at ~14 s, with `AGENT-TEST-NOPE-5518-BR2` still in the field |
| 3 | **`role="alert"` is intact** on the error element | renders as `alert` in the accessibility tree |
| 4 | Apply is **disabled** while the error shows for that exact code, and re-enables once the error clears or the code changes | button state across snapshots |
| 5 | **BL-CHK-006** holds after every failed apply | `1998.00 − 299.70 + 339.66 + 0 == 2037.96` |
| 6 | **BL-CART-009** single-slot holds — exactly one card applied at all times; the failed custom-code slot renders an error state, never an applied one | sidebar snapshots |

## CORRECTION — my earlier claim on the ticket was wrong

I previously commented on VCST-5518 that the error "does not clear on typing… or navigating away from the
cart and back". **The typing half is false, and it is now disproven empirically.**

- **Editing the input clears the error immediately** — within ~2 s of it appearing, far inside the 7 s
  window, so it was the edit and not the timer. The Apply button re-enabled at the same moment.
- **Why:** the render is *code-keyed*. `coupons-section.vue` binds `:error="getError(code)"` and `getError`
  returns a message **only when the passed code equals `couponError.value.code`**. Change the input's value
  and it no longer matches, so the error stops rendering. I inferred "never clears" from `couponError` being
  module-scope without tracing that keying — the module-scope ref is real, but it is not what decides
  whether the message is on screen.

**Navigation: NOT verified, and I am not going to assert it again.** The in-app "View all coupons" link
opens a **new tab** (`target=_blank`), so it never navigated the cart tab; my other attempt used
`page.goto`, which is a hard reload and trivially re-initializes the module. So an SPA in-app route change
was never isolated. What is now *verified* is the code-keyed render, and `customCode` is a component-local
ref re-created on mount (with `coupons-section.vue`'s `watchEffect` resetting it to `""` when the applied
coupon is a visible preset) — so on return it would not match a stale error code. That is a deduction from
a verified mechanism, **not** a tested result.

## Not isolated: the exact dismiss interval

The source constant is `7000` ms and observed behaviour is consistent with it (present early, gone well
before 14 s), but **I did not measure the interval**. Every observation step costs **5–8 s of tool
latency**, which is wider than the window being measured — a nominal 5 s wait landed at ~8 s elapsed, and a
nominal 3 s wait landed at ~14 s. Reporting "measured 7 s" would be fabricated precision.

**That latency is itself the most important finding of this run** — see below.

## Consequence: three regression cases are now genuinely racy

This is no longer speculative. Using the *same tooling the regression runner uses*, I could not reliably
observe the error inside its own lifetime. Any case that applies an invalid coupon and then asserts the
error is on screen is now timing-dependent:

- **`CPN-SMK-063`** (`077-smoke-cart-sidebar`, **smoke**) — asserts `<p class="coupon-card__error">` visible
  with 'This code is not valid' **and** `role="alert"` (WCAG 4.1.3; hardened by PR #2303)
- **`CPN-034`** (`077-coupons-promotions-storefront`)
- **`CPN-035`** (`077-coupons-promotions-storefront`)

A remedy must **not** hardcode `7000`/7 s into an assertion — a transcribed constant goes stale silently
and manufactures phantom failures. Assert the behaviour (clears without interaction; the cart is not
mutated when it does).

## Accessibility concern — for the change owner, not asserted as a defect

`CPN-SMK-063` exists to guard `role="alert"` on this exact element. Auto-dismissing a `role="alert"`
message after 7 s engages **WCAG 2.2.1 Timing Adjustable** (a time limit on content the user must be able
to turn off, adjust, or extend). A screen-reader user, or anyone reading slowly, can lose the message
before taking it in. The usual remedy is a **user-dismissible** error, or clearing on the next
interaction — which the code already supports and which is what wiring the exported `clearError` into the
input would have achieved. Flagged for a considered decision; not filed as a defect here.

## Gaps in the change itself

- **The 7 s behaviour has no unit test.** `04eac333` touches only `useCoupon.ts`. `useCoupon.test.ts` still
  has exactly its 5 original call-ordering cases and **zero** references to `timer` / `timeout` /
  `useFakeTimers` / `clearError` / `setError` — despite being trivially testable with `vi.useFakeTimers()` +
  `vi.advanceTimersByTime()`. The first commit shipped 5 tests; the follow-up shipped none.
- **No `onUnmounted` cleanup** — a pending timer outlives the component for up to 7 s. Harmless (it only
  nulls state) but untidy.
- `clearError` is still not wired to any component; the timer mitigates the symptom rather than removing the
  cause (module-scope state the UI never explicitly clears).

## Methodological notes

- **`Enter` does not reliably submit the custom code** — `browser_type(submit:true)` produced no
  `ValidateCoupon` and no error; only an explicit Apply **click** works. Two of my runs were discarded as
  inconclusive for this reason rather than being read as "the timer fired". Keyboard users can still Tab to
  the button, so this is UX friction rather than a WCAG 2.1.1 failure — worth a look regardless.
- **A token hygiene issue was fixed during this run:** the failed agent's `*-FULL.json` network dumps
  contained a live `authorization: Bearer` access token in plaintext (3 files under the gitignored
  `test-results/`). Redacted in place; repo swept clean of `Bearer eyJ` material. Those dumps captured
  headers only — no request/response bodies — so they hold no assertion evidence. Separately, the
  per-lane HAR archives (`test-results/{edge,firefox}/har/`) inherently contain tokens; gitignored,
  pre-existing, left untouched.

## State left behind

Cart retained: printer × 2, `FREE` applied, an invalid code sitting in the custom-code field (client-side
only — a reload clears it). No tracker write, no push.
