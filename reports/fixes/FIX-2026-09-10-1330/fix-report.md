# FIX-2026-09-10-1330 — VCST-5940

**Ticket:** [VCST-5940](https://virtocommerce.atlassian.net/browse/VCST-5940) — Notifications: Preview renders the raw `{{blade.html}}` binding instead of the sent message
**PR:** [VirtoCommerce/vc-module-notification#203](https://github.com/VirtoCommerce/vc-module-notification/pull/203) — **OPEN, not merged**
**Commit:** `7489b6c` · branch `claude/qa-autofix/VCST-5940` → base `dev`
**Terminal state:** ticket at **In review**; awaiting human PR review.

## Route

| | |
|---|---|
| Repo | `VirtoCommerce/vc-module-notification` |
| repoKind | `module` (no sub-app override — only `vc-module-pagebuilder` declares one) |
| Developer agent | `fullstack-backend` via `/angular-admin` |
| Reviewer | `backend-reviewer` |
| Routing confidence | HIGH |

## The fix

One file, +11/−4. `blade.html` and `blade.isLoading = false` move into a `$timeout`; DI gains `$timeout`.

The controller assigned the preview payload **synchronously**, so Angular's `srcdoc` write landed in the same
task in which the iframe was attached and began its initial `about:srcdoc` navigation. That navigation — from
the raw, not-yet-interpolated attribute — won, and nothing ever re-navigated. Deferring the write to a later
task is what makes it stick.

Measured live before the fix: `srcdoc` **attribute** correct (87 chars), iframe **rendered document**
`{{blade.html}}`, `readyState === "complete"`. Re-assigning the identical value forced the re-navigation and
the body rendered.

## Why not `ng-if` on the template

The bug report proposed gating the iframe's creation on `blade.html` instead. Rejected, on evidence rather
than theory: the **working** sibling `notifications-template-render.tpl.html:5` already wraps its iframe in
`ng-if="!error"` with `$scope.error = null` assigned synchronously — so its `ng-if` creates the element during
the first digest, exactly as `ng-if="blade.html"` would. It renders correctly anyway. `ng-if` is therefore
present in the working case and is demonstrably not the differentiator; async assignment is.

| Blade | Assignment | Renders? |
|---|---|---|
| `notifications-template-render.js:55` | inside `renderTemplate` success callback | yes (verified live) |
| `notifications-edit-template.js:251` | `$timeout(updatePreview, 500)` → XHR callback | yes |
| `notification-journal-details-content.js` | **was synchronous** | no — this bug |

The deferred write is safe under either browser ordering: if the initial navigation has already committed when
the `setTimeout(0)` fires, the attribute change queues a fresh navigation; if it hasn't, our value is the one
navigated to. No interleaving lets the stale value win — the race is closed, not narrowed.

## Gates

| Gate | Result | Notes |
|---|---|---|
| G0 eligibility | PASS | localized, non-breaking, single file, no schema/contract change |
| G1 single repo | PASS | anchor confirmed; deployed 3.1013.0 byte-identical to `dev` |
| G2 reproduce RED | PASS *(proxy)* | see limit below |
| G3 fix GREEN | PASS | `dotnet build` 0 warnings 0 errors; no existing test modified |
| G4 review | **APPROVE** | HIGH confidence; `backend-reviewer` |
| G5 CI | PASS | ci · SonarCloud x2 · swagger-validation · auto-tests (mysql,postgres,sqlserver) · license/cla all pass; mergeStateStatus CLEAN |
| G6 live E2E | **NOT RUN — by design** | `/qa-fix` is static-only; needs a running Admin SPA |
| G7 stop | PASS | not merged, auto-merge not enabled |

## Limits — read these before trusting the green

- **The reproduction is a proxy, not a browser reproduction.** `vc-module-*` repos ship no JS test harness and
  Node has no iframe, so the RED/GREEN harness asserts the controller's *assignment-timing contract*
  (`blade.html` must not be set during synchronous construction). It pins the property the RCA identified as
  causally decisive and will catch a revert, but it does not prove the rendered outcome.
- **Gate 6 was not run.** The customer-visible behaviour is unverified on a built artifact. The PR carries a
  `## ⚠ Needs deploy verification` section; run `/qa-verify-fix VCST-5940` once merged and deployed.
- **5 pre-existing test failures**, all `IntegrationTests.NotificationSenderIntegrationTests` (live
  SMTP/SendGrid/Twilio). Confirmed identical on a pristine tree with the diff stashed — not caused by this change.
- **`needs deploy verification` label does not exist** in this repo and was not created; the signal lives in
  the PR body only, so it is not label-queryable.

## Out of scope, noted not fixed

Two pre-existing issues the reviewer spotted and correctly left alone: the duplicate DOM id
`notification_template_preview` shared with the sibling blade, and `openEmailHtmlBlade` never setting
`isLoading: true` on the child blade.
