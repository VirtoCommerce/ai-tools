# Notification activity feed — Preview renders the raw `{{blade.html}}` binding instead of the sent message

## Status: FIXED

**JIRA:** VCST-5940 (filed 2026-09-10) — https://virtocommerce.atlassian.net/browse/VCST-5940

**Severity:** Medium (straddles Medium/High; lower bucket per `reports.md` §1a) · **Found:** `/qa-bug`, 2026-09-10

**Env:** vcst-qa @ Platform **3.1064.0**, `VirtoCommerce.Notifications` **3.1013.0** · Edge (chromium 152) · Reproduced 2/2

## Summary

Opening **Preview** on any entry in **Notifications → Notification activity feed** shows the literal text
`{{blade.html}}` instead of the notification body that was sent. The feature — the only in-UI way to see
what a customer actually received — is 100% non-functional.

The bug is **not** in the data and **not** in Angular's binding: the REST payload carries the correct body and
the iframe's `srcdoc` attribute ends up holding the correct HTML. The iframe simply never re-navigates away
from the document it loaded from the *pre-interpolation* template, so it shows the placeholder forever.

## Steps to reproduce

1. Admin → **Notifications** → **Notification activity feed**.
2. Click any journal row (e.g. `OrderCreateEmailNotification`, Success).
3. In the **Notification Info** blade, click **Preview** in the toolbar.

**Expected:** the preview blade renders the sent email body
(*"Thank you for placing an order. Order number: CO260909-00001"*).

**Actual:** the blade renders the literal string `{{blade.html}}`.

![Preview blade rendering the raw Angular binding](../../screenshots/Notification-Journal-Preview-Raw-Angular-Binding/nj-03-preview-raw-liquid.png)

## Evidence — the attribute is right, the rendered document is stale

Read-only DOM inspection of `iframe#notification_template_preview`:

| | value |
|---|---|
| `srcdoc` **attribute** | `Thank you for placing an order.\n<br>\nOrder number: <strong>CO260909-00001</strong>\n<br>` (87 chars) |
| iframe **rendered** `body.innerText` | `{{blade.html}}` |
| `contentDocument.readyState` | `complete` |

`GET /api/notifications/journal/2ecdd23c-…` → **200**, `body` populated with exactly that HTML. So Layer 4 is
correct and Angular did write the attribute correctly — only the frame's loaded document is stale.

**Fix validated live:** re-assigning the *identical* value (`f.setAttribute('srcdoc', f.getAttribute('srcdoc'))`)
forces the re-navigation and the body renders correctly:

![Same frame after forcing a srcdoc re-assignment](../../screenshots/Notification-Journal-Preview-Raw-Angular-Binding/nj-04-after-forced-reload.png)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | preview renders `{{blade.html}}`; screenshots + DOM read above |
| 3. GraphQL xAPI | N/A | REST endpoint, not xAPI |
| 4. Platform REST API | **PASS** | `GET /api/notifications/journal/{id}` → 200 with the correct `body` |

**Owning layer:** Layer 2 — the module's Admin SPA (AngularJS) blade. App Insights not queried: the only server call returned `200` with correct data — no exception to correlate.

## Root Cause Analysis

`notification-journal-details-content.js` assigns the preview HTML **synchronously** inside the controller:

```js
// src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notification-journal-details-content.js:6
blade.html = $sce.trustAsHtml(blade.currentEntity.body);
```

```html
<!-- notification-journal-details-content.html:5 -->
<iframe id="notification_template_preview" srcdoc="{{blade.html}}" ...></iframe>
```

Because the value is already final when `$compile` links the template, Angular's `srcdoc` write lands in the
same task in which the iframe is attached and starts its initial `about:srcdoc` navigation. Chromium's initial
navigation — from the raw, not-yet-interpolated attribute — wins that race, and the later attribute value never
triggers a re-navigation. The frame is left permanently showing the placeholder.

**The discriminating observation:** the sibling preview blade uses the *identical* pattern — same element id,
same CSS, same `srcdoc="{{…}}"` binding — but assigns its value **asynchronously**, inside the render API's
success callback:

```js
// notifications-template-render.js:55
blade.originHtml = $sce.trustAsHtml("<html><body>" + response.html + "</body></html>");
```

That one renders correctly on the same build (verified live — `rendered: "Thank you for placing an order. Order
number:"`), because the attribute changes in a *later* task, after the initial navigation has completed.
Assignment timing is the only difference between the broken blade and the working one.

![The async sibling preview rendering correctly on the same build](../../screenshots/Notification-Journal-Preview-Raw-Angular-Binding/nj-08-sibling-async-preview-works.png)

**Not a PR #201 regression.** PR #201 (VCST-5543, "notification preview iframes and scrollbars") did touch this
file, but it only changed classes/scrolling and removed an `onload` height shim — the `srcdoc="{{blade.html}}"`
binding is byte-identical before and after. The defect predates it. The deployed 3.1013.0 files were fetched
from the running server and match `dev`.

**Suggested fix (minimal, mirrors the proven-good sibling):** defer the assignment by one turn so the write
happens after the frame's initial navigation —

```js
$timeout(function () {
    blade.html = $sce.trustAsHtml(blade.currentEntity.body);
    blade.isLoading = false;
});
```

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — journal details preview blade (Admin SPA, AngularJS)
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notification-journal-details-content.js:6` (`blade.html = $sce.trustAsHtml(...)`, synchronous) + `notification-journal-details-content.html:5` (`srcdoc="{{blade.html}}"`)
- **Routing confidence:** HIGH — single repo, single file, exact line, fix validated live in the browser

## Verification 2026-09-10 — FIX_INCOMPLETE

PR [#203](https://github.com/VirtoCommerce/vc-module-notification/pull/203) (`$timeout` deferral) was verified
live on vcst-qa against its own artifact `3.1014.0-pr-203-4ab6`. **The bug still reproduces 3/3.**

```json
{ "srcdocLen": 87, "rendered": "{{blade.html}}", "readyState": "complete" }
```

Stale bundle ruled out two ways: `/api/platform/modules` reports the PR build, and the executed bundle
contains the `$timeout` code. Regression surface clean — the change breaks nothing, it just does not work.

**The RCA in this report was right about the symptom and wrong about the remedy.** Deferring the assignment
does not help: the iframe is inserted with the *uninterpolated* literal in `srcdoc`, commits its
`about:srcdoc` navigation to that literal, and the later attribute write produces no second navigation.
The working sibling differs **structurally**, not by timing — its iframe sits behind `ng-if="!error"` (so it
is interpolated before insertion) *and* its controller pre-initialises `originHtml = ""`.

Correction to this report's "Why not `ng-if`" section: that section, and the Gate 4 review it came from, are
**wrong**. The presence of `ng-if` on the working sibling was read as proof that `ng-if` is not the
differentiator; it is in fact a necessary part of why that blade works.

Also correct the Summary's "Fix validated live" claim: re-assigning `srcdoc` *after* load is a different
mechanism from deferring the first assignment, and should not have been carried forward as support for the
shipped change.

Next direction: `ng-if="blade.html"` + a pre-initialised value, or set `srcdoc` imperatively from a directive.
Any candidate must be checked in a **browser** before being called fixed.

Evidence: `reports/tickets/Sprint26-18/VCST-5940/`

## Resolution

- **Root cause (measured):** the HTML parser creates the iframe with a real `srcdoc` attribute holding
  the raw, uninterpolated text. Chromium ≤152 commits its `about:srcdoc` navigation from that
  parse-time value and never re-navigates when Angular writes the interpolated one — the same class as
  the `ng-src` / `ng-href` trap. **The attribute was never the problem; the parsed markup was.**
- **Fixed in:** `ng-attr-srcdoc` — one token, [vc-module-notification#203](https://github.com/VirtoCommerce/vc-module-notification/pull/203), commit `fc686c7`. The earlier `$timeout` deferral was measured ineffective and reverted.
- **Tracker:** VCST-5940 — Tested
- **Verified:** 2026-09-10, STR **3/3** on Edge 152 against the deployed artifact `3.1014.0-pr-203-fc68`,
  three different entities, asserting the iframe's rendered `contentDocument`, not its attribute.
- **Verification method:** `/qa-verify-fix VCST-5940`

**Browser caveat:** the defect is chromium-152-generic and **absent on chromium 153**. Re-test only on a
152-class engine; on 153+ the expected result is "no regression", not red→green.

**This report's own RCA was wrong** (see the Verification block above and the corrections in it). The
mechanism recorded here originally — same-task attribute write — is refuted; so is the `ng-if` reasoning.
Full incident and the refuted-candidate table: [`docs/decisions/autofix-proof-medium.md`](../../../docs/decisions/autofix-proof-medium.md).

**Note:** PR #203 is not merged at time of writing; verification was against a temporary prerelease pin.
