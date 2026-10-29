# Multilanguage page: the "Link existing" row pushes Cancel / Link out of a narrow blade — `[Low]`

## Status: FIXED

**Env:** vcptcore-qa · PageBuilderModule `3.1039.0-pr-175` (VCST-4935, merged to `dev` 2026-10-28) · Edge/Chrome, 1920×1080
**Found:** 2026-10-28, during VCST-4935 round-2 retest (reported by the tester, cause confirmed in source) · **Ticket:** VCST-6589 (relates to VCST-4935) · assignee Basil Kotov · VCST Sprint 26-21

## Summary

In the Multilanguage page blade, **Link existing** opens an inline row under the language
(select *"Existing <culture> Landing Page"* + **Cancel** + **Link**). When the blade is opened next to the
Pages list (not maximized) and the selected page has a long name, the select does not shrink: the whole
languages table grows wider than the blade. **Cancel** is cut to "Ca", **Link** is off-screen, and the
other rows lose their right-most action (zh-CN: **Unlink** hidden). Maximized, everything fits.
New in PR #175 — the component did not exist before.

## STR

1. Page Builder → Active pages → open a Multilanguage page (blade opens next to the list, not maximized).
2. On a language with status *Missing* (e.g. fr-FR) click **Link existing**.
3. Choose a page with a long name, e.g. `AGENT-TEST-VCST4935-gql134-fr (/agent-test-vcst4935-gql134-fr)`.

## Expected vs Actual

| | |
|---|---|
| **Expected** | The select shrinks / truncates its value; **Cancel** and **Link** stay visible inside the blade; other rows keep their buttons |
| **Actual** | The table widens past the blade edge: **Cancel** clipped to "Ca", **Link** not visible, zh-CN **Unlink** hidden. Maximizing the blade is the only way to reach **Link** |

Narrow blade (bug):

![Link existing row overflowing the blade](BUG-PageBuilder-Link-Existing-Row-Overflows-Narrow-Blade-VCST-4935.png)

Same page, blade maximized (fits):

![Same row in a maximized blade](BUG-PageBuilder-Link-Existing-Row-Overflows-Narrow-Blade-VCST-4935-maximized.png)

## Root cause

`page-builder-shell/src/modules/page-builder/components/linkPageSelect.vue` (added by PR #175): the row is
`<div class="tw-flex tw-items-end tw-gap-3">` with `<VcSelect class="tw-grow">` + two buttons. A flex item's
default `min-width: auto` keeps the select at least as wide as its selected value. The row sits in a
`<td colspan="4">` of the languages `<table>` (`pages/MultilanguagePageDetails.vue`, `languages-table__link`),
and an auto-layout table grows to its cells' min-content width, so the whole table overflows the blade.
The same `VcSelect` in a flex row is already guarded elsewhere: vc-module-sales-rep `sales-rep-details.vue`
uses `tw-flex-1 tw-min-w-0` on every such select.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Admin UI (page-builder-shell) | FAIL | screenshots above; source as described |
| 2. REST / 3. GraphQL | N/A | layout only; link itself works when **Link** is reachable (VCST-4935 round 2) |

**Owning layer:** module-embedded Vue sub-app (`vc-module-pagebuilder` page-builder-shell).

## Fix Routing (→ /qa-fix)

- **Repo:** `VirtoCommerce/vc-module-pagebuilder` (module sub-app `page-builder-shell`)
- **RCA anchor:** `components/linkPageSelect.vue` — the `VcSelect` with `class="tw-grow"`
- **Fix:** add `tw-min-w-0` to the `VcSelect` (and let the value truncate); optionally make the languages
  table `table-layout: fixed` so a wide cell cannot widen it.
- **Routing confidence:** HIGH

## Notes

- Not reproducible on the stand right now: vcptcore-qa runs PageBuilderModule `pr-179` (VCST-6442), which is
  branched from `dev` without the multilanguage code. Re-check on a `dev` build after the PR #175 merge.
- Checked for the same pattern in Sales Rep (pr-26): document **Category** select lacks `min-w-0` but live
  categories are short; it renders fine — not a bug.

## Resolution

- **Fixed in:** vc-module-pagebuilder PR #181 (`812c83bd`, open, base `dev`) — build `3.1040.0-pr-181-812c`
- **Tracker:** VCST-6589 (status in Jira not changed by QA: ticket is in Draft, no path to Testing from there)
- **Verified:** 2026-10-28 on vcptcore-qa, Edge — STR 3/3 at blade widths 837 / 560 / 517 px; Cancel, Link and Unlink stay inside the blade, the title truncates
- **Method:** /qa-verify-fix — `reports/tickets/Sprint26-21/VCST-6589/verification-report.md`
- **Note:** at 1280 the truncated title shows no visible "…" (end of text under the clear icon) — cosmetic, not filed
