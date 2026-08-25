# VCST-5663 — Fix Verification

**Ticket:** [VCST-5663](https://virtocommerce.atlassian.net/browse/VCST-5663) · Bug · Medium (P2) · `framework` `vc-shell`
**Check type:** fix verification (RED→GREEN) · **Date:** 2026-08-25 · **Verdict: VERIFIED WITH NOTES**
**Env:** vcmp-dev Vendor Portal (app 2.1.1, bundle `22260`, built 2026-08-24 09:58 UTC) + vc-shell-storybook (v2.5.0, built 2026-08-19 10:27 UTC)

> **Separate product.** vc-shell / the Vendor Portal is neither the VC storefront nor the Platform Admin SPA.
> Storefront-calibrated rules were consciously set aside — see §Rules set aside.

## Summary

`parseError()` put a non-JSON HTTP error body into `DisplayableError.message`, so a 500 returning an HTML
error page rendered the **entire document** into the toast and blade error banner. Fixed by vc-shell PR
[#293](https://github.com/VirtoCommerce/vc-shell/pull/293) (merged 2026-08-13, shipped in **v2.5.0**), which matches the NSwag
`ApiException` shape (`Error & {status:number, response:string}`) *before* the generic `response` branch.
Verified live by fault injection on vcmp-dev — 4/4 test cases pass, STR 3/3 — and at source level RED→GREEN
against two pinned builds. Three incidental defects were found; none is caused by this fix.

## Fix provenance & deploy gate

| Check | Result |
|---|---|
| PR #293 CI | 6/6 green (`test`, `static-checks`, `storybook-build`, `storybook-tests`, `lint`, `pr-preview`) |
| Fix ⊂ v2.5.0 | `caf01504` → `v2.5.0`: 19 ahead / **0 behind** |
| vcmp-dev bundle | ✅ post-fix guard present in `vc-shell-vendors22260.js` |
| Storybook bundle | ✅ post-fix guard present in `assets/iframe-1uXuqCDm.js` |
| Diff scope | `error.ts` + `error.test.ts` only — `useAsync/index.ts` **byte-identical** pre/post |

## Phase A → Phase B (pinned-build source repro)

Baseline is **not fabricated**: `framework/core/utilities/error.ts` fetched at `caf01504^` (pre-fix, 2.4.0 line)
and at `v2.5.0`, exercised by an uncommitted scratch harness (scratchpad only, never committed).

| Assertion | PRE-FIX | POST-FIX |
|---|---|---|
| HTML body stays out of short message | **FAIL** — message = whole `<html>…</html>` | PASS — `500: An unexpected server error occurred.` |
| Short message is the status line | **FAIL** | PASS |
| Raw body preserved in `details` | PASS | PASS |
| Dedup id differs across statuses | **FAIL** — both `<!DOCTYPE html><html><head><title>Error<` | PASS — `500: …` vs `502: Bad gateway` |
| JSON body → platform message wins | PASS | PASS |
| Empty body → status fallback | **FAIL** | PASS |
| 3 non-regression assertions | PASS | PASS |
| **Total** | **5 pass / 4 fail** | **9 / 0**, 3 consecutive runs |

## Live verification — vcmp-dev (fault injection, `qa-backend-expert`, playwright-edge)

Only the **server reply** was synthesized (Playwright `page.route`). The NSwag client, `parseError`, `useAsync`,
the notification store, the toast and the blade banner all ran as genuine deployed code; every trigger was a
real user click.

| TC | Injected | Observed | Result |
|---|---|---|---|
| A | 500 `text/html` + unique marker, ×3 | `500: An unexpected server error occurred.` — identical 3/3; no `<html>`/marker as visible text | **PASS 3/3** |
| B | 500 + 502 sharing first 83 chars | Two live toasts, ids `async-error-500: …` / `async-error-502: …` | **PASS** |
| C | 400 `application/json` `{"message":"Name is required"}` | `Name is required` (not `400: …`) | **PASS** |
| D | routes removed, reload | Blade loads, 20 rows of 299, **0 console errors**, 15× `200` | **PASS** |

Raw body is not discarded — it lands in `details`, rendered **collapsed** and **escaped as text** in a monospace
pane behind a deliberate expand. That is the intended developer-diagnostic affordance, not a leak.

## Regression — Storybook (`ui-ux-expert`, Chrome DevTools MCP)

**Collateral axis only — Storybook does not exercise `parseError`** (stories pass literal strings), so it does
*not* confirm the fix. 16/16 stories rendered, no uncaught exceptions, no blank canvases. axe-core on the 6
`overlay-vctoast--*` stories (Light theme): **0 WCAG A/AA violations**; `role="alert"` on the error variant vs
`role="status"` elsewhere is the correct split. Defence in depth confirmed on the surface the bug flooded:
`.vc-notification__content` is `max-height:100px; overflow:auto`, box capped at `max-width:600px` with
`overflow-wrap:anywhere`, and `{{ content }}` is plain interpolation (no `v-html`) so markup renders escaped.

## Incidental defects — reported, NOT filed

1. **Stale error banner survives a later success** (vcmp-dev). After the TC-A 500s, a successful `200` refresh
   re-rendered all 299 rows while the `500: …` banner **stayed on screen**. Framework `useAsync` *does*
   `error.value = null` on every call and is byte-identical pre/post-fix, so the retained state is app/blade-level.
   Independent of this fix — see §Verdict rationale.
2. **Dashboard widget rejection escapes to the global handler** — `[#global-error-handler] Unhandled rejection`
   alongside the expected `[#use-async]` pair (`global-error-handler/index.ts:56`). Cosmetic today.
3. **Status prefix is not universal** — one toast read `Error: An unexpected server error occurred.` with a
   non-`async-error-*` id. `global-error-handler` keys dedup off `errorKey(err)` = `` `${err.name}:${err.message}` ``,
   *not* the parsed status line, so that path can still collapse a 500 and a 502 sharing the generic
   `ApiException.message`. Untouched by PR #293; the ticket's stated scope is `useAsync/index.ts:65`, which is fixed.

Storybook-side: VcToast story Controls are inert (args never bind), and the component-bodied `content` branch
loses the clamp and `tabindex` (WCAG 2.1.1 risk, latent — the string branch `parseError` feeds is unaffected).

## Verdict rationale — why not REOPEN

`feedback_fix_must_leave_clean_end_state` asks whether the fix made a stale end state **load-bearing**: did the
old path mask it and the new path no longer does? Here, **no**. PR #293 changes only the *content* of a pure
function's return value; the banner lifecycle is untouched, and under the old code the same banner would have
persisted identically — merely containing the whole HTML document. The staleness is orthogonal to the fix, so
it is a genuine independent defect rather than an incomplete fix. **This is the one judgement call worth a
second pair of eyes** — if the reviewer reads the error surface as "the interaction this fix changes", REOPEN
is the alternative.

## Rules set aside (storefront-calibrated, inapplicable to vc-shell)

| Set aside | Substituted |
|---|---|
| `storefront-selectors.md` (`data-test-id`) | ARIA role + accessible name, `.vc-*` BEM classes |
| `BL-UI-*`, `critical-ui-scope.md` | Pass/fail judged against the PR #293 fix contract only |
| Coffee-theme a11y gating | vc-shell ships Light/Dark/Green — audited **Light** (default) |
| The 123 suites in `config/test-suites.json` | None cover vc-shell; bespoke charter, no suite touched |
| Storefront P0 routes / `$cfg.*` / sitemap | Routes discovered live from the app's own nav + network log |

## Notes

- `vendor-portal` repo is **private and unreachable** with this token, so the app's `@vc-shell/framework` caret
  pin could not be read. Immaterial: the served bundle was grepped directly, which is stronger than the pin.
- `hooks/enforce-real-user.mjs` blocked `browser_run_code_unsafe`; the agent used the documented
  `/* @allow-eval: <reason> */` opt-in. Cleaner long-term fix is to allowlist `page.route` fault injection.
- Evidence: `screenshots/` · `evidence.html` · `verification-summary.json`
- **Evidence gap:** the Storybook agent reported three screenshots of its own; they did not survive its
  teardown and are absent from disk. The Storybook findings rest on its live measurements + axe output only.
  The four vcmp-dev captures are intact.
