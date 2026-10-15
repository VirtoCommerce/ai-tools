# VCST-5817 - Visual lane (4v): scoped search chip + pending loader

Build: local vc-frontend PR #2522 (Ver. 2.60.0-pr-2522-6f90-6f902c9e), anonymous, Chrome DevTools MCP, no sign-in.
Pages: /printers/multifunction-printers/laser-monochrome (-> breadcrumb "Laser Printers"), /online-courses/uxui-design-courses (-> "Courses and audio books").
Loader freeze: Slow 3G (+ CPU 6x) then real click; the pending window is short, so loader values were read by a MutationObserver
that sampled getComputedStyle at the moment the button became disabled. Network "Offline" does NOT hold the loader (-> 404 page, chip gone).

## Verdicts
| Axis | Verdict |
|---|---|
| a11y (BL-A11Y-002/003/004) | PASS (manual SR verification outstanding) |
| design-system / BL-UI (003/004, tokens) | PASS with 1 advisory observation (O-1) |
| vs. DESIGN | SKIPPED - no design link on the ticket (DesignSync not called) |

## 1. a11y
| Check | Result |
|---|---|
| Loader accessible name | `aria-label="Loading search context"`, `disabled`, `aria-busy="true"` - exact |
| Previous label leaking into name | No. The label sits in `.vc-button__content` at `opacity:0` (still in DOM/a11y tree) but the button name comes from aria-label; axe clean |
| Chip name | `Remove: <category>` (aria-label), type=button, enabled |
| axe-core 4.10.2 (wcag2a/aa, 21a/aa, 22aa) on nav "Main menu", settled chip | 0 violations, 0 incomplete |
| axe-core, loader-pending state | 0 violations, 0 incomplete |
| Deutsch (DE) | chip `Entfernen: Laser Monochrome`; loader `Suchkontext wird geladen`, `aria-busy=true`; placeholder `Suche in Laser Monochrome`; no raw i18n key. Only DE checked (ja/zh cold-load not in scope here) |
Not verifiable here: actual screen-reader output (opacity:0 label vs. aria-label) - manual NVDA/VoiceOver item.
Scope note: axe ran on the main-menu nav (contains the search bar), not the whole page.

## 2. Design system / BL-UI
| Check | Settled chip | Loader | Verdict |
|---|---|---|---|
| min-width | 80px (=5rem) | 80px (=5rem) | PASS |
| height | 31.2 | 31.2 | PASS |
| padding / radius / border | 0 12px / 6px / 1.6px solid | identical | PASS |
| bg / fg (light) | 231,238,243 / 36,43,52 | identical | PASS |
| width (same label "Laser Monochrome") | 154.99 | 154.99 (prior label kept invisible) | PASS (width preserved) |
Spinner: 16px, `animation: spin`, arc rgb(36,43,52) on bg rgb(231,238,243), contrast about 12:1 (light).
Dark (theme button -> dark): chip and loader both bg rgb(36,44,54), fg/spinner rgb(169,188,203) = 7.22:1 (text and non-text, >= 4.5 / 3); same tokens in both states, no light flash captured.
Long label "Courses and audio books" (chip 183.9 x 31.2):
- 1024 (innerWidth 1026): bar 596.8, input 319.3 px (>= 200), docSW 1011 < vw -> no horizontal scroll (BL-UI-004 PASS)
- "1920": browser window capped at 1540 px: bar 1041.8, input 764.3, docSW 1525 < vw -> PASS at 1540; true 1920 NOT measured
- 375: window floor was 502 px; at 502 the chip was absent from the DOM (mobile search layout differs) -> not measured (INCONCLUSIVE for mobile)
Slot text is `white-space: normal`, no max-width; wraps rather than clips (not stressed beyond this label).

## Observations (advisory, no BL violation proven)
- O-1 (BL-UI-003, Low): loader -> chip swap onto a DIFFERENT label changes chip width (154.99 -> 126.25 for "Laser Printers"), so the input's left edge moves ~28.7 px at settle. The loader holds the previous label's width, so the shift happens once, when the new label arrives. Inherent to a content-sized chip; propose as UX note, not a bug unless the spec wants a fixed width.
- O-2 (Low): during pending the input placeholder drops to the generic "Search"/"Suchen" and the searchbox name changes from "Search within <old>" to "Search", then to "Search within <new>" (three changes in one navigation).
- O-3 (info): empty English category page "Laser Printers" has 11 results vs 5 under Laser Monochrome - irrelevant to the component.

## Findings
| # | Title | Sev. proposal | BL | Evidence |
|---|---|---|---|---|
| O-1 | Input shifts ~29 px when loader resolves to a shorter label | Low (advisory) | BL-UI-003 | 4v-loader-pending-c-1280.png, measurements above |
| O-2 | Placeholder / searchbox name flickers via generic text while pending | Low (advisory) | BL-A11Y-002 | loader sample ph="Search"/"Suchen" |
No FAIL-level findings.

## Screenshots (reports/tickets/Sprint26-20/VCST-5817/screenshots/)
4v-chip-settled-1280.png, 4v-loader-pending-b-1280.png, 4v-loader-pending-c-1280.png, 4v-loader-dark-1280.png,
4v-loader-de-dark-1280.png, 4v-long-chip-1024.png, 4v-long-chip-1920.png (actually 1540 px wide)

## Side effects left in the Chrome DevTools profile
Theme = dark and language = Deutsch persisted in localStorage; reset before reusing the lane.
