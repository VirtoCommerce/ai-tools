# Triage — VCST-5903 (ticket mode, --verify)

Source: `testing-checklist.md` (checklist · exploratory · visual rows) · 2026-10-19 · env vcst · build vc-frontend#2568 @ 3f8af63a (QA Storybook 2.61.0-alpha.2594-vcst-5903-vc-stat-widget-3f8af63a)
Non-passing rows: 8 · confirmed real bugs: 2 · needs-review: 3 · test defects: 1 · dismissed: 1 · out of scope: 1 (B1, by user scope)
Phase 2 skipped (ticket mode, no cross-run history). `--fix` not applicable in ticket mode: this report writes nothing else.

## 1. Confirmed real bugs (live-reproduced via vc-fix:qa-investigate)
| Row | Severity | Repo · file | Root cause | Package |
|---|---|---|---|---|
| A3 (+X11) | P3 | vc-frontend · `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:90, :17, :96` | `hasValue` and the `errorText` checks skip `trim()`: value `" "` renders a blank (or unit-only, with `valueSuffix`) figure row instead of the dash; errorText `" "` hides the figures behind an empty error row, status "<label>:". Contradicts the PR's own "a blank figure can't read as a value". 4/4 | `evidence-A3/` |
| A11 | P3 | vc-frontend · `vc-stat-widget.vue:137-145` (`&__value`), `:109` | The figure never wraps and has no shrink/truncate/overflow fallback, so in a `minmax(0,1fr)` grid cell it paints past the card border at supported viewports: Colors story @1024 (4 cols, 236px) with `$123,456,789.00` → 13.1px past the border; @480 (2 cols) with `$12,345,678.90` → 15.7px past (BL-UI-004). 3/3 | `evidence-A11/` |

## 2. Needs review (not filed)
| Row | Class | Why not filed | Question for |
|---|---|---|---|
| V1 | REAL_BUG / LOW — reproduced | Loading/error hide description + delta: a lone card is 156 → 106 → 92px and content below moves 50/64px (also in a Row that wraps at 375). Identical to the shipping Sales Rep Hub card the component is extracted from; BL-UI-003 is INFERRED, no source states height across states | PO: should loading/error keep the ready height? (`evidence-V1/`) |
| X2 | REAL_BUG / LOW | Loader overlay (z 996) blocks the pointer on a `prepend` control (the PR's drag-handle example); keyboard still reaches it. Intended behaviour unspecified (KB-A74F95A5) | dev/PO: should prepend stay operable while loading? |
| X3 | REAL_BUG / LOW | `<output>` status holds its text from first render, so a card mounting in loading/error is likely not announced (KB-2B31393F). No screen reader in the toolkit — MANUAL | manual NVDA/VoiceOver run on Loading / Error State |

## 3. Test-case fixes
| Row | Class | Fix |
|---|---|---|
| A5 | TEST_STEPS_DEFECT | Storybook rejects an out-of-list `color` ("Received illegal value", KB-BFF94794), so the Data path cannot exercise the unknown-colour fallback. Source shows it takes the neutral path (same as A4 PASS). Needs a direct mount; not re-run (DOM edits are blocked by the real-user rule) |

## 4. Dismissed / out of scope
| Row | Class | Reason |
|---|---|---|
| C1 | KNOWN_ISSUE (user descope) | 10-suite F5 regression stopped by the user before dispatch; re-scoped to 093 P0 (C2 PASS, 0 attributable failures) |
| B1 | out of scope | a11y scope set to the Coffee preset by the user (Coffee ≥ 4.53:1); Black gold light secondary 3.36:1 is a pre-existing preset token (`evidence-B1/`, partial) |

Regression REG-2026-10-19-1307 (C2) side findings, not this ticket's: SR-HD-030 / SR-HD-053 read as stale 093 cases → `/qa-review-tests suite 093 --verify`; `bl:fresh` marked BL-SR-004 and BL-SR-029 SUSPECT from those two FAILs — review before the BL YAML is committed.

No tracker ticket filed, no fix triggered — human decides.
