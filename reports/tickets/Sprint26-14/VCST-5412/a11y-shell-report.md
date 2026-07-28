# VCST-5412 — Shell accessibility (running Vendor Portal) — PARTIAL

**Env:** https://vcmp-dev.govirto.com/apps/vendor-portal/ · `@vc-shell/framework` **v2.3.0** (build `eb3675e7a`, 2026-07-28T09:06Z, read from the framework's own console banner) · app version badge `2.1.0` · Chrome/Chromium 1920×1080 · en-US · light
**Run:** 2026-07-28, window from 12:06 UTC · executed inline (the three dispatched agents were killed by an org spend-limit API error)

> **This report is INCOMPLETE.** Coverage was cut short twice: (1) all three execution agents terminated on an
> org monthly spend limit; (2) axe-core injection is blocked by a pre-0.8.2 `vc-fix` hook still bound in this
> session, so **A11Y-01 and A11Y-19 cannot be evidenced to spec** (both are defined as "no critical/serious
> *axe* violations"). Findings below are only what was directly verified.

## Verdict summary

| Case | Verdict | Note |
|---|---|---|
| A11Y-11 keyboard-only primary scenario | **FAIL** | Cannot open any list from the sidebar — see F1 |
| A11Y-12 shell landmarks | **PASS (minor gap)** | `navigation`/`main`/`complementary`/`region` present; **no `banner`** landmark |
| A11Y-15 blade header controls | **NOT REACHED** | Blocked by F1 — could not open a blade by keyboard |
| A11Y-16 modal focus trap/return | **PARTIAL PASS** | App-switcher popup: Escape closes, `aria-expanded`→false, **focus returns to trigger**. A true modal dialog was not reached. |
| A11Y-13 / A11Y-14 / A11Y-17 / A11Y-18 | **NOT RUN** | Agent termination |
| A11Y-19 axe on 5 pages | **BLOCKED** | axe injection blocked by stale hook |
| A11Y-20 200% zoom | **NOT RUN** | Agent termination |

## F1 — Primary navigation is completely keyboard-inoperable `[Defect · Serious · WCAG 2.1.1 Keyboard, Level A]`

The sidebar's 14 menu items (Home, Orders, Quote requests, Products → Marketplace/My Products, Offers, Import,
Rating & Reviews, Communication, My Store → Profile/People/Fulfillment Centers) are rendered as **`div`s with no
role**, exposed in the accessibility tree as bare `generic [cursor=pointer]`. They are wrapped in a **single
`div[tabindex="0"]` container** (246×886 px) whose accessible text is the whole menu concatenated
("HomeOrdersQuote requestsProducts…"), with **no role and no accessible name**.

Measured behaviour, from a real keyboard walk anchored on the sidebar search box:

| Action | Result |
|---|---|
| `Tab` | Focus lands on the **container div**, not an item |
| `ArrowDown` | **No effect** — focus unchanged, no `aria-activedescendant`, `scrollTop` 0 |
| `Enter` | **No navigation** — URL stays `#/` |
| `Tab` again | Jumps to the account button at the sidebar bottom (y=1026), **skipping all 14 items** |
| Focusable stops inside `nav` | **5**, against **14** rendered menu items |

**No alternative keyboard path exists.** The header "Open menu" button opens the **app switcher** (Applications +
Widgets — Commerce Manager, App Search, Vendor portal, …), whose entries *are* proper named `button`s; it does not
expose the vendor portal's own sections.

**Impact:** a keyboard-only or switch-device user cannot navigate the portal. This blocks A11Y-11 outright and
would almost certainly surface as a serious axe violation once axe is available.

**Attribution caution:** the nav landmark and scroll region are framework-rendered, so the item component most
likely lives in vc-shell — but the env is **2.3.0**, not 2.2.0, so this is *not* attributable to PR #255 alone.
It is better read as a **gap in the PR's claim** ("eliminate WCAG 2.1 A/AA violations", "keyboard operability"):
landmarks were added while nav items were left non-interactive. Confirm against the framework source before filing
upstream.

Evidence: `screenshots/A11Y-11-FAIL-sidebar-nav-keyboard-inoperable.png`

## F2 — App-switcher entries have broken logo assets `[Defect · Cosmetic/P3]`

Opening the app switcher emits **three 404s** (console errors, 0 → 3):
`/apps/builderio/logo.svg` · `/apps/page-builder-shell/assets/images/logo-only.svg` · `/apps/app_search/logo.svg`
— matching the "Builder.io", "Page Builder Shell" and "App Search" entries.
**Likely env/asset-deployment, not framework code** (logo URLs come from each app's own manifest). Verify on
another deployment before filing against vc-shell.

## F3 — Sidebar header controls below minimum target size `[Informational vs this ticket's scope]`

"Notifications" and "Open menu" both measure **18×21 px** — under the 24 px floor, so a **BL-UI-006 FAIL**.
WCAG **2.5.8** Target Size (Minimum) is a **2.2** criterion; this ticket scopes **2.1 A/AA**, so it is out of the
stated scope and reported as informational, not as an A11Y-19 failure.

## Confirmed positives (the PR's a11y work that IS present and working)

- **Landmarks:** `navigation "Primary navigation"`, `main`, `complementary "Environment indicator: Development"`,
  `region "Blade navigation"`, `region "Scrollable content"`. Gap: no `banner`.
- **Dashboard drag/drop is well-labelled:** `list "Dashboard widgets. Drag widgets to rearrange."` with
  `listitem "Orders, widget 2 of 5. Drag to reorder."` — genuinely good AT exposure for a drag surface.
- **Toggle state exposed:** chart range buttons use `[pressed]` (`aria-pressed`) — 30D/6M correctly reflected.
- **Table semantics:** proper `table`/`rowgroup`/`row`/`columnheader` with names on both dashboard tables.
- **Live region present:** a `status` node exists for toast/announcement use (relevant to A11Y-17, untested).
- **Named controls throughout:** "Notifications", "Open menu"/"Close menu", "Add product", "All orders →",
  "Show/Hide Columns" all carry real accessible names.
- **Popup dismissal is correct:** Escape closes, `aria-expanded` resets, focus returns to the trigger.

## Open candidates NOT yet confirmed (do not treat as findings)

- Login page: a `button` with **no accessible name** above the "or" separator (likely icon-only SSO) — needs axe
  to establish rule id + impact. Evidence: `screenshots/A11Y-19-login-page.png`.
- Login page has **no `<h1>`** (top heading is `<h2>`) — expected `page-has-heading-one`, best-practice tier.
- Dashboard charts render as `figure > img` with **no accessible name** — a possible 1.1.1 text-alternative gap;
  needs confirmation that no adjacent text alternative serves the same purpose.
- An empty `columnheader` (0×0) hosting the Show/Hide-Columns button — possible `empty-table-header`, minor.
- Console warning `[@vc-shell/framework#ai-agent-context] Cannot set context data: no blade id available` on the
  dashboard — relevant to BH-01/BH-02, but plausibly benign with no blade open. Not investigated.

## To finish this axis

1. Restart Claude Code so the 0.8.2 `vc-fix` hook binds → axe becomes available → run A11Y-01 and A11Y-19 properly.
2. Resolve the org spend limit so the three axis agents can complete (Storybook A11Y-01–08, BH-01–17, BS-11–15, §6 regression).
3. A11Y-15/13/14/17/18/20 still need execution; A11Y-15 needs F1 resolved or a mouse-opened blade as a workaround.
