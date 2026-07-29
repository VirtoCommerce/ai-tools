# BUG: Vendor Portal primary navigation is not keyboard operable — 14 menu items are unfocusable `<div>`s — [High, WCAG 2.1.1 Level A]

**Env:** `https://vcmp-dev.govirto.com/apps/vendor-portal/` · `@vc-shell/framework` **2.3.0** (build `2026-07-28T09:06:51Z`, commit `eb3675e7a`) · Chromium 1920×1080 · signed in as `admin` (Administrator)
**Found while testing:** VCST-5412 (A11Y-11, A11Y-12) — an accessibility-focused release
**Confidence:** **CONFIRMED** — reproduced independently **four** times: an earlier QA run the same day
(2026-07-28 12:06 UTC, recorded as "F1" in `reports/tickets/Sprint26-14/VCST-5412/a11y-shell-report.md`,
reachable via `git show HEAD:…`), two QA agents in this run on `playwright-chrome` / `playwright-edge`, and a
separate scripted DOM + tab-walk measurement. Two independent runs reached the same WCAG 2.1.1 conclusion.

> **Not a new discovery — file once.** The earlier run documented this as F1 with the same severity and the
> same "gap in the PR's claim" reading. This file is the consolidated permanent record; **do not open a second
> tracker ticket** if one already exists from that run.

## Summary

Every item in the Vendor Portal's primary side navigation is a plain `<div>` with no role, no
`tabindex`, no `href` and no focusable ancestor. A keyboard or screen-reader user cannot reach any of
the 14 navigation destinations, nor Theme, Language, Change password or **Log Out**. The `<nav>`
landmark and its `aria-label="Primary navigation"` are correct — but nothing inside it is operable.

## Steps to reproduce

1. Sign in to `https://vcmp-dev.govirto.com/apps/vendor-portal/`.
2. Press `Tab` repeatedly from the top of the page and watch where focus lands.
3. Optionally: inspect any side-menu entry (e.g. "Orders") in DevTools.

## Expected vs actual

**Expected** (VCST-5412 A11Y-11: *"Every step is achievable without a mouse"*; WCAG 2.1.1 Keyboard, Level A):
each navigation item is reachable by `Tab` and activatable by `Enter`.

**Actual:** of the **first 40 tab stops, zero** land on or inside a `.vc-menu-item`. Measured DOM state
of all 14 items:

| item | tag | `role` | `tabindex` | computed `tabIndex` | `href` |
|---|---|---|---|---|---|
| Home, Orders, Quote requests, Products, Marketplace Products, My Products, Offers, Import, Rating & Reviews, Communication, My Store, Profile, People, Fulfillment Centers | `div` | `null` | `null` | **-1** | `null` |

- **`<a href>` elements inside `<nav>`: 0** — there are no link semantics at all.
- The nearest focusable ancestor of every item is `div.vc-scrollable-container__viewport[tabindex="0"]`
  — the scroll container, whose accessible name is the **entire menu concatenated**:
  `"Home Orders Quote requests Product…"`. Pressing `Enter` or `ArrowDown` on it does nothing (URL stays `#/`).
- Same pattern for the account dropdown: "Theme", "Language", "Change password" and **"Log Out"** are
  also unfocusable `<div class="vc-menu-item--clickable">`. Tab from the open dropdown skips straight to
  the main content.

Markup shape:
```html
<nav aria-label="Primary navigation">
  <div class="vc-scrollable-container__viewport" tabindex="0">
    <div class="vc-menu-item vc-menu-item--clickable">…Orders…</div>   <!-- no role, no tabindex -->
```

## Impact

A keyboard-only or screen-reader user can sign in but then **cannot navigate the application at all**,
cannot change theme or language, and **cannot log out**. The only reason the primary scenario was
completable during testing was an incidental route in via a dashboard widget's "All offers →" button.

WCAG 2.1.1 (Keyboard, **Level A**) and 4.1.2 (Name, Role, Value).

## Relationship to PR #255 — a miss, not a regression

Deployed is 2.3.0, one minor ahead of the 2.2.0 under test, so nothing here is attributable to
[vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) alone, and there is no evidence the
menu was ever keyboard-operable (so **not a regression**).

It is, however, squarely inside that PR's stated goal — *"Eliminate WCAG 2.1 A/AA violations across
components; add shell landmarks"* — and the PR did touch `framework/shell` (14 files). The landmark
layer landed correctly (`<nav>` + the new `SHELL.NAVIGATION_ARIA_LABEL` locale key, verified present and
translated in both `en.js` and `de.js`), but the **interactive** layer was not addressed. A correctly
labelled landmark containing nothing focusable is the gap.

**Suggested fix:** render menu items as `<a href>` (preserving router navigation) or
`<button role="menuitem">` inside a `role="menu"`/`role="list"` container, with roving-tabindex or
per-item `tabindex="0"`, and drop `tabindex="0"` from the scroll viewport so it stops presenting the
whole menu as one accessible name.

## Related findings from the same run

- Focus is dumped to `<body>` on every state change (after sign-in, blade open, Maximize, Save, modal
  close) — including a failure to return focus to the trigger when a modal closes (WCAG 2.4.3).
- `button-name` **critical** (axe): the icon-only breadcrumb back button
  (`.vc-blade__breadcrumbs-button`, 22×36) has no accessible name, in every item blade.
- `<html lang="">` is empty on all page states — `html-has-lang`, serious; independently visible in the
  served `index.html`.
- A maximized blade leaves the ~100 controls it covers tabbable with no `aria-hidden` (WCAG 2.4.3).

Full detail: `reports/tickets/Sprint26-15/VCST-5412/shell-a11y-report.md`.
