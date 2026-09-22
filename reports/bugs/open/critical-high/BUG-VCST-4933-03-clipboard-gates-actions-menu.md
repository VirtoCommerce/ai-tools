# An unguarded clipboard read gates the entire Designer actions menu — the feature is unreachable in Firefox

- **Severity:** High
- **Provenance:** IN-SCOPE (VCST-4933, Page Builder — Shared Components)
- **Environment:** vcptcore-qa · `VirtoCommerce.PageBuilderModule 3.1025.0-pr-159-7361` (PR #159)
- **Found:** 2026-09-17, `/qa-test VCST-4933` Track 1

## Summary

The Designer's section and page **actions menus** render empty — silently, with no error — unless the
browser has granted `clipboard-read`. Those menus are the only entry point to `Save selected as Shared
Component`, so **the feature's primary creation flow (AC3) is unreachable without that permission**.
In Firefox it is unreachable permanently.

## Steps to reproduce

1. Open a Page Builder page in the Designer in a browser context WITHOUT `clipboard-read` granted.
2. Hover a section row and click its `tune` icon. (Also: the page-level `tune`, and right-click.)

## Expected

The menu renders its items: `Hide · Copy · Paste before · Paste after · Duplicate · Delete`, and at
page level `Paste section · Delete selected · Save selected as Shared Component · Reset template ·
Refresh preview`.

## Actual

An empty CDK overlay container opens. **Zero menu items, zero console errors**, no toast, no fallback —
even after a 3-second wait. The UI gives the author no indication that anything is wrong.

## Root cause (read from the shipped bundle)

`chunk-V76SF7H6.js`, `SectionsActionsService.getSectionsActions` / `getPageActions`: both action-list
builders open with

```js
await this.hasClipboardData()   // -> clipboard.getData() -> navigator.clipboard.readText()
```

That read **gates the whole menu render**, with no timeout and no fallback. It is not rejecting:
`getData()` wraps the call in `catch(i){ return console.log(i), null }` and no such log ever appeared.
The promise simply **never settles** — which is what `readText()` does without the permission.

## Why this is High, not a timing nuisance

Measured deliberately across a full session, because the first hypothesis was a startup race:

- **With** the permission granted: the menu opened populated on the **first** click and every click
  after — never empty once, not after two full `F5` reloads, not after SPA route changes, not on first
  paint.
- **Without** it: empty in **100%** of attempts, in both chromium and firefox.

So it is a hard permission dependency, not a race — graded on *"does this browser/deployment grant
clipboard-read"*, not on timing.

**And Firefox does not implement `navigator.clipboard.readText()` for web content at all.** There is no
permission an administrator can grant. On Firefox the menu can never render, so `Copy`, `Paste`,
`Duplicate`, `Delete`, `Delete selected` and `Save selected as Shared Component` are permanently
unavailable — i.e. the Shared Components creation flow does not exist on that browser. The ticket's own
Definition of Done names Chrome/Firefox/Edge.

## Impact

An author on Firefox cannot create a Shared Component from a page at all, and is given no explanation.
An author on Chrome who declines the clipboard prompt gets the same dead menu. The failure is silent in
both cases, which turns a permission problem into what looks like a broken product.

## Suggested fix

Do not let a clipboard read gate the menu. Either resolve `hasClipboardData()` against a timeout and
render the menu with `Paste` disabled on timeout/rejection, or compute the paste-enabled state lazily
when the menu is already open. The paste-validation logic itself is correct and should be kept —
`["paste-section", !await this.hasClipboardData()]` with `getData()` stamping `wrongData:true` for a
bad payload was verified working in the UI.

## Verification of the fix

Open the Designer in Firefox, and in Chrome with clipboard permission denied. The actions menu must
render its items in both, with `Paste section` disabled.

## Evidence

`reports/tickets/Sprint26-19/VCST-4933/screenshots/` — `INC-tune-no-menu.png`,
`INC-context-menu-empty.png`, `INC-rightclick-no-menu.png` (empty state);
`qa6-03-actions-menu.png`, `qa6-05-page-menu.png` (populated, permission granted).
Confirmed independently by the operator in desktop Chrome with the permission prompt accepted.
Run record: `reports/tickets/Sprint26-19/VCST-4933/findings.md` §C F4.
