# VCST-5632 — Testing Checklist

**Path:** fast · **Flow:** feature-test · **Type:** Task (P2/Medium) · **Layer:** `null` (`UNRESOLVED` — see below)
**Env:** vcmp-dev Vendor Portal — `@vc-shell/framework` **2.6.0-rc.0**, build `98032`, rebuilt 2026-09-02 11:23:24 GMT · Chrome · Light theme
**Verdict: PASS WITH NOTES** — both previously-failing mechanisms are fixed; AC-4 as written is still contradicted by the implementation and one dismiss path stays unmeasurable.

## Deploy gate — PASSED

| Check | Result |
|---|---|
| Served framework | **2.6.0-rc.0** (version string in both served chunks) |
| App build | id `16355` → **`98032`**, rebuilt 2026-09-02 11:23:24 GMT |
| npm | `2.6.0-rc.0` under the **`rc`** dist-tag (`latest` is still 2.5.0), `gitHead` `cb6379d0f` |
| Ancestry | all five fix PRs (#343–#347) are **ancestors of the published release commit** |
| Proven-new markers | `aria-disabled` bundle 16→18; `inertNavigation` bundle 5→7 — deltas match the source deltas |

## Conditions

| # | Condition | Verdict | Detail | Reps |
|---|---|---|---|---|
| AC-1 | Focus never `<body>` after the 5 transitions | **PASS here / FAIL at parent** | all five pass on this build; a new sidebar+chord path fails → `VCST-5859` under VCST-5670 | see 5670 |
| AC-2 | Escape → opener | **PASS** | returns to `button "Delete"` | 1 |
| AC-2 | Close (X) → opener | **PASS** | returns to `button "Delete"` | 1 |
| AC-2 | Cancel → opener | **PASS** | returns to `button "Delete"` | 1 |
| AC-2 | **Backdrop → opener** | **BLOCKED (tooling)** | still unmeasurable — see below. **Not a pass** | — |
| AC-2 | Popup opened with focus loose on `<body>` | **PASS** | returns to `button "Delete"`; no silent no-op | 3 |
| AC-2 | **Detached opener → workspace fallback** (VCST-5814 / #346) | **PASS** | lands on `main` — #346's declared fallback | 3 |
| AC-3a | Nothing behind a maximized blade Tab-reachable | **PASS (boundary proof)** | first stop `button "Show more breadcrumbs"`, last stop `textbox "Brand"` — both inside the blade | 1 |
| AC-3a/3b | **Teleported popovers don't escape `inert`** (VCST-5815 / #345) | **PASS** | notifications + app-hub both contribute nothing while covered | 1 each |
| AC-3b | Sidebar / `nav` not exposed to the a11y tree | **PASS (axe A/B)** | 23 applicable rules restored → **2** maximized | 1 A/B |
| AC-3c | Restore removes `inert` | **PASS** | clean in both directions, no one-way regression | many |
| AC-4 | Modal traps focus | **PASS** | Tab cycles Close → Confirm → Cancel → Close; Shift+Tab wraps to Cancel | 1 |
| AC-4 | Maximized blade traps focus | **MEASURED — NOT ADJUDICATED** | `Shift+Tab` from the blade's first focusable **exits the document**, and notably *not* into the sidebar → it does **not** trap | 1 |

### AC-3b — the axe A/B, because the ARIA snapshot cannot answer this

Sidebar `nav[aria-label="Primary navigation"]`, scoped scan:

| State | Applicable rules | Inapplicable | Violations |
|---|---|---|---|
| RESTORED | **23** (`button-name`, `image-alt`, `label`, `color-contrast`, `tabindex`, `nested-interactive`, …) | 67 | 1 (`color-contrast`) |
| MAXIMIZED | **2** (`aria-allowed-role`, `aria-hidden-focus` — structural, both pass) | 86 | 0 |

21 content-dependent rules go inapplicable while covered and applicable again on restore. Teleported popovers: app hub **4 hits → 0**; notifications node **present → absent**. As warned, the ARIA snapshot lists the sidebar with full accessible names in **both** states — it would have manufactured a false PASS.

## Uncovered conditions, stated explicitly

- **AC-4 still needs a product ruling — nothing is filed for it.** Measurement now confirms the implementation's argument: a modal traps (HeadlessUI), a maximized blade does **not** trap but everything it covers is `inert`, and `Shift+Tab` leaves toward browser chrome rather than into hidden content — so 2.4.3/4.1.2 are satisfied and 2.1.2 is not violated. **But the AC as written says a blade traps focus, and the product does the opposite deliberately.** That is a contradiction a human must rule on; AC-4 should then be rewritten to the outcome. This is why the verdict is PASS **WITH NOTES** rather than PASS.
- **Backdrop dismiss remains BLOCKED after a third attempt.** The blocker is the tool, not the page: `browser_click` targets element centres only, and every ancestor of the dialog panel (`.vc-popup__overlay`, `.vc-popup__container`, `.vc-popup__center`) is viewport-centred, so the centre always resolves inside the panel — Playwright reported the interception explicitly. Tried beyond prior runs: 1920×1080, then **1920×300** to shift the centre (same interception), the real overlay selector derived from axe target paths rather than guessed, and **390×844** where the popup is full-screen with no backdrop at all. No coordinate/offset-click primitive exists in this MCP server. Whether backdrop-dismiss restores focus — or is even intended — is **unverified**.
- **The literal "focus already loose" path is unreachable as written**: a mouse click on a `<button>` focuses it, so the opener is never absent. The real fallback was reached via the **unsaved-changes dialog**, where confirming detaches the opener — landing on `main` exactly where a prior run recorded `<body>` (its own screenshot is still in the folder). Strongest single piece of evidence for #346.
- **No screen-reader (AT) pass** — `inert` was proven structurally, which is not a listening test.
- **No change-scoped regression** (no suite covers vc-shell) · **no App Insights correlation** (no component for vcmp-dev).
- **Layer is `UNRESOLVED`** ⇒ no release-note fragment; all five sources of `1b` item 2b are empty for this product (detail in the VCST-5670 checklist).

## Findings filed (out-of-scope incidentals, all Medium, linked to this ticket)

| Key | Finding |
|---|---|
| **VCST-5860** | Products view-mode toggles have no accessible name (axe `button-name`, critical) |
| **VCST-5861** | Blade-toolbar buttons convey no disabled state to AT and stay in the tab order |
| **VCST-5862** | 25 colour-contrast violations, Light theme; role label at 2.41:1 |

## Findings held below the 5d severity floor (`Low`, not filed)

| Finding | Draft |
|---|---|
| Dialog accessible name computes as "Confirmation Close" | `reports/bugs/open/low/BUG-vc-shell-dialog-accessible-name-includes-close.md` |
| Mobile (390 px) popup loses heading + close control — **one detail unverified, may re-grade** | `reports/bugs/open/low/BUG-vc-shell-mobile-popup-loses-heading-and-close.md` |

**Not defects:** product images fail with `ERR_NAME_NOT_RESOLVED` on 8 requests to `vcmarketplace-platform.dev.govirto.com` (**environment/asset-host config**, not code); `clickhandler`/`isvisible` Vue props serialized into the DOM (informational, 4.1.1 is retired); collapsed-submenu tab-reachability (**unverified lead** — not tabbed).

**VCST-5816** (unreadcount HTTP 500) — still failing, **not re-filed**. One change worth noting: it now also surfaces as a **user-visible red error toast**, not just console noise.

**Evidence:** `reports/tickets/Sprint26-17/VCST-5632/screenshots/` · HAR `test-results/chrome/har/session.har`
