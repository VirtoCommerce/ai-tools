# BUG: On the selected day the status dots are invisible (1.02:1), and a date change announces nothing — Sales Rep Tasks calendar

## Status: CONFIRMED · two WCAG 2.2 AA failures, both re-derived on 2026-09-21
**Severity: Medium** (the pair straddles Medium/Med-High; filed at the **lower** bucket per
`.claude/rules/reports.md` §1a).
**Found by:** `/qa-test VCST-5732` re-test, visual lane · **IN-SCOPE surface, but see Provenance.**
**Archetype:** `RENDER` (contrast) + `STATE` (live region)

**Env:** vcptcore-qa @ theme `2.58.0-pr-2464-2971-2971a77b` · store `B2B-store` · `playwright-edge` ·
1920x1080 and 375px.

## Why this is one report and not two
Both are the same unfinished item on the same surface, and the first one **regressed while being fixed** —
a reviewer needs to see that together with the reason.

---

## Finding 1 — selected-day dots: 1.02:1 and 1.16:1 (WCAG 1.4.11, 3:1 required)

The developer's 2026-09-18 answer called this **"partially done"** and was explicit that the selected-tile
half was not fixed. It is worse than when it was measured.

| Surface | Dot | Colour | Background | Ratio | 3:1? |
|---|---|---|---|---|---|
| White page background | Completed | `rgb(59,119,84)` | `rgb(255,255,255)` | **5.31:1** | **PASS** — the −400→−600 shade move landed |
| **Selected day tile** | Upcoming | `rgb(43,126,168)` | `rgb(229,33,33)` | **≈1.02:1** | FAIL |
| **Selected day tile** | Completed | `rgb(59,119,84)` | `rgb(229,33,33)` | **≈1.16:1** | FAIL |

**The prior figures (1.60:1 / 2.67:1) are void and were re-measured from scratch**, because the selected
tile changed colour: it is now the brand red `#E52121`, not the darker primary-700 the first round
measured against. The new background happens to sit at almost the same luminance as **both** dot colours,
so the fix to one half coincided with a regression in the other.

**Why it matters more than a contrast number usually does:** these dots are the **only** indicator of what
a day contains. A rep scanning the month for a heavy day gets nothing from the currently-selected cell —
which is the cell they are most likely to be looking at.

**Not rescued by the theme explanation.** The amber-vs-`#E52121` difference from the mockups is the store's
Red theme preset and is correctly *not* a defect. But a theme choice does not rescue a violated success
criterion — the dots need to clear 3:1 against whatever the preset makes the tile.

**Fix shape:** give the dots a contrast-safe treatment that survives any tile colour — a solid light plate
large enough not to read as a blob at 2rem, an outline, or dot colours selected per tile state. The
developer noted a light plate was tried and rejected for looking like a white blob; an outline ring or a
state-aware palette is the remaining route.

---

## Finding 2 — the date change is announced to nobody (WCAG 4.1.3)

Reported on 2026-09-18 as **done** ("deep #9"). Half of it is.

- **Sighted half — FIXED.** Selecting a date visibly re-renders: heading, count, rows and the scope chip
  all change (`Sep 21, 2026` / 4 → `Sep 28, 2026` / 2 → `Sep 30, 2026` / 0), and the mini-grid moves the
  filled selection while today keeps its outline. Confirmed independently by both lanes.
- **Assistive-tech half — NOT DELIVERED.** After the change, **no `status`, `alert` or `log` role exists
  anywhere in the accessibility tree** — not near the panel, not elsewhere on the page. The only live
  region present is the unrelated global "Notifications" toast container.

**Confidence, stated honestly:** this was derived from the accessibility tree, not from a screen reader —
the visual lane had no NVDA/JAWS/VoiceOver hookup, because every target is behind a login and Chrome
DevTools MCP has no `--secrets`. The **absence of any live-region role** is strong evidence the
announcement is not implemented, but it is not an audible confirmation. Whoever fixes it should verify
audibly.

**Fix shape:** an `aria-live="polite"` region that receives the new day's summary (the day description
string already exists and is correct — "2 tasks. Marked: Upcoming").

---

## Provenance and why this does NOT fail VCST-5732
**PRE-EXISTING on the component, surfaced by this ticket.** Per `close-out.md` §5-verdict.2, a `BL-A11Y-*`
finding on a **functional/feature** ticket is filed as its **own** ticket at its **real** severity and does
not fail the story's verdict — accessibility is a cross-cutting property of a surface, not an acceptance
criterion of the story that touched it, and VCST-5732's ACs name no accessibility outcome. It is named in
the run report so that a PASS is never read as *"no accessibility problems here"*.

## A methodology note worth carrying
**axe-core returned zero violations** on the prior round's three scanned states while eleven genuine AA
failures were present. Neither finding here is axe-detectable: a contrast failure between two decorative
dots and a coloured tile, and a live region that does not exist, both satisfy automated tooling. **A green
axe run on this surface is not evidence of conformance.**

## Business rule
`WCAG 1.4.11` · `WCAG 4.1.3` · `BL-A11Y-*`.

## Fix Routing
`vc-frontend` — the Sales Rep tasks calendar (dot rendering + the day panel). The day-grid ARIA defects
are a **separate** report: `BUG-vc-calendar-grid-aria-application-role-and-focus-cluster.md` (shared UI kit).

## Evidence
`reports/tickets/Sprint26-19/VCST-5732/screenshots/laneB-minicalendar-dots-1920.png`,
`laneB-calendar-1920-default.png`, `laneB-calendar-375-default.png`. Ratios computed from sampled
`getComputedStyle` values (read-only measurement).
