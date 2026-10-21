# VCST-6398 — Visual lane (ui-ux-expert), run VCST-6398-r1-2026-10-20

Build: footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (cache-busted, vcst). Guest only, Chrome DevTools MCP, desktop 1920x1080
and mobile 390x844, light + dark. Read-only; the 3 compare items I added were removed through "Clear all" (list empty).
Shots: `screenshots/V*` in this folder.

## Axes
| Axis | Verdict |
|---|---|
| vs. DESIGN | SKIPPED — ticket carries no Prototype / design link (no design project) |
| vs. RULES (BL-UI) | FAIL — BL-UI-001 marginal (V6), BL-UI-006 literal (V7). BL-UI-002/004/005 not regressed on audited surfaces |
| vs. WCAG (BL-A11Y) | FAIL (non-blocking) — V8 radios unnamed, V9 tbody scroller, V10 Sign-in contrast; all outside the PR's changed rendering |
| vs. SYSTEM (tokens) | PASS — F8 audited surfaces resolve to tokens, no literals found |

Presets: the store serves ONE preset (`--color-primary-500` #e5451c light / #e17853 dark); Appearance offers Light / Dark /
System only, so Mercury / Red / Coffee could not be selected. Measured: that preset x light/dark.

## Findings
| V# | Condition | Result | invariant/criterion | evidence |
|---|---|---|---|---|
| V1 | R3 PDP SKU colour, simple + configurable | PASS — `span.text-sm.text-neutral-900`; light #3d332b on #fbf9f7 = 11.71:1; dark #e3ddd7 on #2a2521 = 11.26:1. Note: PR claim "dark >= 12.67:1" is not met on this preset (11.26) — it clears AA/AAA, so advisory DRIFT vs the claim, not a defect | BL-A11Y-003, WCAG 1.4.3 | V1-pdp-simple-sku-dark.png, V1-V3-cfg-cake-sku-checklist-light-1920.png |
| V1b | R3 other presets | NOT-RUN — not shopper-selectable (SKIPPED, reason above) | — | — |
| V2 | R12 /compare table semantics, desktop + mobile, light + dark | PASS — ONE native `<table aria-label="Compare products">`; th scope=col named by product only; th scope=row with aria-describedby only on Price per unit + Min. order qty, target inside its own row, still correct after Differences; attribute values 400 (price + stock pill 700 by component, UNSPEC) | WCAG 1.3.1, 4.1.2, BL-A11Y-002 | V2-compare-all-*-1920.png, V2-compare-differences-dark-1920.png, V2-compare-mobile-390-*.jpeg |
| V2b | Inactive "Differences"/"All" tab label contrast (known axe hit) | PASS — light 5.63:1, dark 6.6:1; axe 4.10.2 clean inside the table at 1920 both modes (the known hit does not reproduce) | BL-A11Y-003 | scratch measurement |
| V2c | Sticky header + corner, light + dark | PASS (limited) — corner td and row-label th sticky, opaque (#fff / #29201b), thead sticky top 88px z10; light verified scrolled at 1280, dark only at scroll 119 (scroll avoided: page was 311px taller than viewport = KB-8891459E hazard; one screenshot timed out once, recovered) | BL-UI-003 | V2-compare-sticky-light-1280.png, V2-compare-sticky-dark-1280.png |
| V3 | Configurable PDP checklist colours, light + dark | PASS — red label/icon/link 9.36/7.18/6.95 (L), 8.49/6.59/7.42 (D); yellow 5.77/4.02/6.95 (L), 11.6/9.99/7.42 (D); green 10.75/6.38 (L), 9.95/8.09 (D). Text >= 4.5, icons >= 3 | WCAG 1.4.3, 1.4.11 | V3-cfg-*.png |
| V3b | Focus after checklist link | PASS — keyboard Enter moves focus to the section header button, ring 2px solid #8ebeec (offset 2px), fully in view below the sticky header (top ring edge ~4px under it, element not obscured). After a MOUSE click no ring shows (not :focus-visible) — expected | WCAG 2.4.7, 2.4.11 | V3-cfg-ring-keyboard-enter-focus-dark.png |
| V4 | F8 vc-file-uploader (guest-reachable on AGENT-TEST-Config-FileUpload) | PASS — all colours/borders/radius (12px)/padding (16)/gap (8) resolve to generated tokens; prompt 12.76:1 D, Browse btn 4.62 L (est.) / 10.62 D, requirements 4.77 L / 4.73 D; axe clean on the component; focus ring on radio None visible | BL-UI-002, WCAG 1.4.3 | V4-file-uploader-*.png, V4-cfg-radio-none-focus-dark.png |
| V4b | F8 vc-add-to-cart / qty stepper | PASS — outline-primary Add to cart text #b6380f/#fff 5.90:1 L, #fad1bc 11.32 D, via `--color-vc-text-outline-primary`; stepper Increase 28x28, white on primary-500 4.04:1 (icon, 1.4.11 ok) | BL-UI-006, 1.4.11 | scratch |
| V4c | F8 vc-textarea | SKIPPED — Text section is a `vc-input` (not a textarea); no other guest surface renders one (checkout/quote comments need a cart or account = data creation) | — | — |
| V4d | F8 vc-calendar | SKIPPED — Sales Rep calendar needs a rep; no public date picker found (/contacts has none) | — | — |
| V5 | Hardcoded colour/spacing literals in audited components | PASS — no off-token colour; spacing 16/12/8/2 px on scale | BL-UI-002 | V4 data |
| V6 | CLS on configurable PDP (Vintage Wedding cake), 2 loads | FAIL (marginal) — 0.1015 both loads; 0.0867 shift at ~1.35 s = footer 874->0 px and a widget footer 554->782 (below-fold late content). Simple PDP 0.0485, /compare 0.0456 PASS. Cause not attributed to the PR | BL-UI-001 | PerformanceObserver |
| V7 | Checklist "Review"/"Fill it in" links 42x14 px at 390x844 | FAIL (literal, low) — below 24x24, gap to nearest target 28-60 px. WCAG 2.5.8 itself PASSES via the spacing exception, so lead may treat as advisory | BL-UI-006 / WCAG 2.5.8 | V3-cfg-cake-mobile-390-dark-full.jpeg |
| V8 | Option radios in a configurable section (cake PDP) have empty label | FAIL (BL-A11Y non-blocking, axe `label` critical x3; unnamed radios in AX tree) — pre-existing component, not in PR diff; KB-FF7C9595 | BL-A11Y-002, WCAG 4.1.2/3.3.2 | axe run |
| V9 | /compare 390px: tbody scroller not keyboard-focusable | FAIL (non-blocking, serious) — axe `scrollable-region-focusable`, light + dark; same as KB-3CC64161 (pre-existing) | BL-A11Y-001, WCAG 2.1.1 | V2-compare-mobile-390-*.jpeg |
| V10 | Header "Sign in": white on #e5451c = 4.03:1 (axe, 1920 light, every page) | FAIL (non-blocking, serious) — pre-existing preset, KB-9F5ED18C; not PR-introduced | BL-A11Y-003 | axe run |
| V11 | Differences mode shows 4 rows while counter reads "Differ: 3 of 9 rows" (Availability, all 3 equal) | UNSPEC — possible always-pinned row; not a lane-C defect, flagged for functional lane | — | V2-compare-differences-dark-1920.png |

## Invariants not run / limits
- BL-UI-002/005 only spot-audited via computed style on touched components, not full spacing sweep.
- No screen-reader verification (not available). Mobile 390 checked on /compare and the cake PDP only; no 768 sweep.

## KB ids
Asked: KB-05F297E6, KB-34C7A8DD, KB-3CC64161, KB-29A75D95, KB-9F5ED18C, KB-0C163966, KB-0C8E0543, KB-0C6FA664.
Dispute: KB-34C7A8DD (two tables/noisy names not seen on 3.1.0-pr-11). Confirm: KB-3CC64161, KB-9F5ED18C, KB-29A75D95, KB-0C6FA664, KB-0C8E0543.
Capture: KB-FF7C9595 (unnamed option radios, suspected defect). KB-05F297E6 not touched (Mercury not selectable here).
