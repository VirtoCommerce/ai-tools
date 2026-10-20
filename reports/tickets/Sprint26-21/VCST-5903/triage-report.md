# Triage — VCST-5903 Round 2 (ticket mode, --verify)

Source: `testing-checklist.md` (checklist · exploratory · visual rows) · 2026-10-20 · env vcst · build vc-frontend#2568 @ bfe0b259 (QA Storybook 2.61.0-alpha.2597-vcst-5903-vc-stat-widget-a6255676)
Non-passing rows: 7 (6 FAIL · 1 BLOCKED) · confirmed real bugs: 2 · needs-review: 3 · known issue: 1 · test defect: 1 · unresulted: 0
Phase 2 skipped (ticket mode, no cross-run history). `--fix` not applicable in ticket mode: this report writes nothing else. Classification: two `regression-triage-agent` batches; live repro: `vc-fix:qa-investigate` per candidate with an oracle.

## 1. Confirmed real bugs (live-reproduced via vc-fix:qa-investigate)
| Row | Severity | Repo · file | Root cause | Package |
|---|---|---|---|---|
| X27 | P3 (Low) | vc-frontend · `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:17-23, :34, :36-42, :152-163` | Only `__label` (:131) has `overflow-wrap:break-word`. The `__error` / `__delta` message spans are flex items with `min-width:auto` + `overflow-wrap:normal`, `__description` is a block with `overflow-wrap:normal`, and the root has visible overflow, so one unbreakable token (≈28+ chars: a URL, an id) paints past the card border — errorText +82px, delta +78px, description +11px (256px card, 1280 and 375). A URL in errorText overflows +41px (BL-UI-004). Edge 2/2 per prop | `evidence-X27/` |
| X5 | P4 (Low) | vc-frontend · `vc-stat-widget.vue:90-91, :97` | The VCST-6427 fix uses `String.trim()`, which keeps format characters (U+200B–200F, U+2060, U+061C): value U+200B renders a blank figure row with no dash (with valueSuffix: the unit alone), errorText U+200B shows an error state with a blank message and status "<label>: U+200B". Breaks the PR's "a blank figure can't read as a value". Chromium 2/2 (firefox seen too); realism low (needs CMS/RTL-mark/backend-built strings) | `evidence-X5/` |

## 2. Needs review (not filed — no oracle states the expected behaviour)
| Row | Class | Why not filed | Question for |
|---|---|---|---|
| X15 | REAL_BUG / LOW | delta, description, label, valueSuffix are gated by a truthy `v-if`, not blank-checked: delta " " / U+200B renders the chevron with no text, others leave empty rows (KB-7C95C0AE) | dev/PO: should secondary props get the same blank check as value? |
| X25 | REAL_BUG / LOW | a no-value (dash) card is silent to assistive tech: dash aria-hidden, status empty, so the description can pass for the metric | dev/PO: should a no-value card announce "no data"? |
| X30 | REAL_BUG / LOW | the neutral-300 dash is ≈1.5:1 (light), 1.9:1 / 2.8:1 (dark, Coffee dark); axe passes only because it is aria-hidden | ui-ux/PO: is the dash decorative (WCAG 1.4.11) or must it reach 3:1? |

## 3. Known issue
| Row | Class | Note |
|---|---|---|
| A6 | KNOWN_ISSUE → VCST-6428 | Unchanged from Round 1 (13.1px @1024, 15.7px @480, KB-069099FD). Developer proposes Won't Fix (comment 112171), PO decides. New evidence for the ticket: at 480 with $123,456,789.00 the right column runs 17px past the viewport and the whole page scrolls sideways (X11); a 24-digit value runs 134.8px past a 256px card (X29). The kit's own Colors/DeltaColors stories use `lg:grid-cols-4`, the layout the new note warns against |

## 4. Test-case fixes
| Row | Class | Fix |
|---|---|---|
| X18 | TEST_STEPS_DEFECT | Row story renders a fixed card set and ignores value args; a DOM override breaks the real-user rule. Recorded NOT-RUN; mechanism known (KB-527B0F06: a flex Row widens the card) |

Evidence note: the collector mapped exploratory screenshots by row number, but the session's file names are offset (X27 = `R2-X25*`/`R2-X26*`, X30 = `R2-X27*`/`R2-X28*`); the packages above carry their own screenshots.

No tracker ticket filed, no fix triggered — human decides.
