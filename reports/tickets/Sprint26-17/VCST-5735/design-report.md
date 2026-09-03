# Compare v2 — `/qa-design` audit (live storefront)

**Target** Compare v2 board · **Route reached as a user** PDP → *Add to Compare* → header *Compare* → **`/compare`**, which self-appends `?category=<parentId>/<catId>`. No route hand-composed.
**Env** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` · **anonymous throughout** · Chrome DevTools MCP · 375 (device-emulated, `pointer:coarse`/`hover:none`) / 768 / 1280 · preset **Red**, light + dark.
**Fixtures** Group A 5 (incl. `AGENT-TEST-CMP-LONGNAME`) · Group B 2 · Group C 1.
> **Design-spec provenance.** Expectations were **relayed by hand** from `ui_kits/storefront/CompareScreenV2.jsx` (project `518d0b90-…`), **not** `extractDesignSpec()` output → `source: relayed (hand-read JSX)`, **`unresolved` is UNKNOWN, not zero**, parity coverage **partial**. `Compare v2 - standalone.html` and `ui_kits/storefront/compare-v2.html` are **bundled, not statically extractable** (recorded `unresolved`, never guessed); `Granular Color Tokens` / `Icon Stroke System` / `Button System` / `Border Radius Reference` were not read, so token literals and the stroke ladder are unverified. Every §2 surface is a `var()` indirection, so the assertion is *"resolves to the declared custom property"*, never a literal diff. `DesignSync` is not inherited by a subagent; the spec arrived as data.

## 1. Design-system consistency — `summarize` (`measure-layout.ts`): **7 pass · 2 warn · 5 fail · 0 P0**

| Category | Verdict | Evidence |
|---|---|---|
| Spacing `BL-UI-002` | **PASS** | 0 off-grid across 10 selectors at 375/768/1280 (row padding `10px 12px`, card `12px`) — all on the derived `SPACING_GRID` |
| Alignment `BL-UI-005` | **PASS** | product cards 5× and category tabs 3× and row-0 cells 6× all at **0px** centre + height drift |
| Colour tokens | **PASS** | 18/18 declared properties resolve, light **and** dark. Hover `#f3f4f6`=`--color-secondary-100`, zebra `#fafafa`=`neutral-50`, label `#525252`=`neutral-600`, value `#171717`=`neutral-900` |
| Overflow `BL-UI-004` | **PASS** | no document h-scroll at any viewport (375: `scrollWidth 375 == innerWidth 375`); head↔body scroll sync exact (497/497 @768, 311/311 @375) |
| Occlusion 007 · Image aspect 010 · Focus present 009 | **PASS** | 0 overlaps over alert/status surfaces incl. the refusal toast · 5 images all `object-fit`, 0 distortion · ring on **32/32** controls, **0 indeterminate**, confirmed by real `Tab` |
| Typography | **FAIL** | label 12/400/lh14 vs 12.5/500/1.35; value 14 vs 13; **price `font-weight:400` vs declared `900`** |
| Layout stability `BL-UI-001` | **FAIL** | **CLS 0.1273**, 3 shifts, observer installed **pre-paint** via `initScript` (`readyState:"loading"`). Top contributors `svg` (0.1256, moved 377px) + `footer#footer` (751px) — board renders after shell |
| Touch targets `BL-UI-006` · Text contrast `PROPOSED-BL-UI-008` · Non-text `BL-UI-008-NONTEXT` | **FAIL** | §4 A11Y-2 · A11Y-6 (light only, dark clean) · A11Y-1 |

## 2. Design spec diff — `Design axis DRIFT (37 failing, 12 advisory, 27 clean, 3 known divergence)`

`summarizeDesignFindings` → **DRIFT** / severity **FAIL** over 76 rows: PASS 27 · WARN 12 · FAIL 37 · P0 0. Per axis — TOKEN 9 CONFIRMED/10 DRIFT/1 MISSING/5 SKIPPED/2 KNOWN_DIVERGENCE/1 UNSPEC · GEOMETRY 7/14/3 · ICON 9/5/3 + 1 UNSPEC + 1 SKIPPED + 1 KNOWN_DIVERGENCE · STROKE 2 CONFIRMED/1 DRIFT/1 SKIPPED. Source for every row `CompareScreenV2.jsx`; full set `scratchpad/summarize.mts`. The failures that matter (rest are ≤4px cosmetic deltas):
| Axis | Item | Spec | Live | Verdict |
|---|---|---|---|---|
| GEOMETRY | add-slot | `156px`, present iff `0 < N < 5` | **never renders** (verified N=1, 2, 4) | **MISSING** |
| GEOMETRY | card / image compact @375 | `60px` / `36×36` | compact state **never engages at 375** | **MISSING** |
| TOKEN | empty value `—` | `--color-neutral-400` | `neutral-900` — a *missing* value looks like a real one | **DRIFT** |
| TOKEN | price cell | `font-weight: 900` | `400` | **DRIFT** |
| TOKEN | "Differ: **N** of M" | N `fw900` `--color-warning-600` | no emphasis element at all | **MISSING** |
| TOKEN | toast | **two conflicting declarations in one prototype** — `Cv2Toasts` (`CompareScreenV2.jsx`) says centred-bottom, max-w 420, z 999; the App-level toast in `ui_kits/storefront/index.html` (the file the TICKET links) says bottom-**right** 22/22, `--color-success-500` on white, radius 8, fw 700, 14px, max-w 360, plus a `--color-warning-50` + `triangle-alert` warning variant | top-right, w 320, z 5000 | **UNRESOLVED** — re-graded from DRIFT: the spec contradicts itself, so no single expectation is derivable and inventing one would fail a correct implementation. Anchor drifts either way; which is authoritative is a question for the design owner |
| TOKEN | cell borders | `1px neutral-100` right + bottom | right `neutral-200`, bottom `0px` | **DRIFT** |
| ICON | add-to-cart in-cart | `check`, `color=success` | no in-cart state (2 items in cart, still `shopping-cart`/primary) | **MISSING** |
| ICON | toast confirm | `check` @15 | no success toast observed | **MISSING** |
| ICON | Clear all / Clear category | `trash` / `delete-2` | `trash-2` / `x` | **DRIFT** |
| ICON | pin off / on | `pin-outline` / `pin` @13 | lucide `pin` @14 / **custom solid pin** @14 | **DRIFT** — outline↔solid semantics read correctly, names differ |
| STROKE | `vector-effect` | `non-scaling-stroke` | **`none` on all 76 glyphs** | **DRIFT** — checked first, so **no per-glyph weight deltas are reported**: `stroke-width` is in viewBox units, so no bucket is evaluable. No `--lucide-stroke-width` root pin; no outline glyph flooded with `fill` |

**CONFIRMED highlights** label col `240px` · row `min-height 50px` · compact image box **exactly 40×40** · head radius `8px 8px 0 0` + raised shadow when stuck · `compareLimit 5` enforced ("Only 5 products from the same category can be compared") · pinning reorders rows to top and pinned rows survive Differences mode · **0 blank glyphs in 76 renders**. **KNOWN_DIVERGENCE** (advisory, not filed, not a clean pass) Share omitted · category labels from breadcrumb depth 2 · Audio-specifications section absent. **UNSPEC** (never a failure) diff marking has **no design oracle** — `Cv2Row` declares neither dot nor tint, so nothing was invented; refusal toast uses `circle-alert`.

### AMBIGUOUS → escalated, spec NOT obeyed (precedence `BL-UI > design spec > heuristic`)
| # | Spec | Live | Call |
|---|---|---|---|
| 1 | `aria-pressed={true}` hardcoded on remove-from-compare | `aria-pressed="false"` — attribute still on a non-toggle | **Escalate.** Obeying the spec *creates* a 4.1.2 defect; fix = remove the attribute |
| 2 | toasts carry no `role`/`aria-live` | wrapped in `section.notifications-host[aria-live="polite"]` → announced | Spec gap **not reproduced** — implementation correct |
| 3 | dialog has no `role`/`aria-modal`/focus trap | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`, focus in, Escape + focus return | Spec gap **not reproduced** — implementation correct |
| 4 | tooltip not programmatically associated | `tabIndex=-1`, but full text is the icon's `aria-label` | Mitigated for AT; **fails keyboard** (A11Y-3) |
| 5 | pin revealed on hover only | keyboard focus **does** reveal it (opacity 0→1, real `Tab`) | Not reproduced for keyboard; pin absent entirely at 375 |

## 3. State-Stress matrix
| State | 375 | 768 | 1280 |
|---|---|---|---|
| Empty (56×56 tile, Add/Restore) | PASS | PASS | PASS |
| Populated 2–3 · At limit (5, add-slot absent) · Multi-tab badges | PASS | PASS | PASS |
| 6th add refused | PASS — announced, `vc-alert--solid--warning` | PASS | PASS |
| Single-product tab (Group C) | PASS — filter correctly `disabled`, `Differ: 0 of 9` | PASS | PASS |
| Long-name overflow | **FAIL** (UX-1) | **FAIL** | **FAIL** |
| Sticky / compact morph | **FAIL** — never compacts | PASS 251→107 + shadow | PASS 251→107 + shadow |
| Confirm dialogs | SKIPPED — **both triggers `display:none` at 375** (UX-2) | PASS | PASS |
| Toast (add to cart) | **FAIL** — no success toast (cart 0→2) | **FAIL** | **FAIL** |
| Row hover / pin | SKIPPED — `hover:none`; `.compare-table__row-pin` is `display:none` | PASS | PASS |
| Dark | PASS | PASS | PASS |

**Dark is preset-driven, not class-injected** — switched via the header *Theme* control (light→dark→auto); `rootClass="dark"`, `--color-additional-50` `#ffffff`→`#0a0a0a`. Scoped to `.compare-table` (the only opaque-background scope in dark): **0 text and 0 non-text violations** (63 / 58 evaluated). Outside the table the text audit is **INCONCLUSIVE, never a pass** — every ancestor up to `html.dark` is `rgba(0,0,0,0)`, so `effectiveBg` falls back to white and produced 5 phantom failures (h1 "1.16:1" on a white it never sits on). Tool limitation; excluded.

## 4. Accessibility findings — separate, at real severity

Not a gate on this run (`feedback_a11y_never_blocks_feature_stories`); recorded for filing.
| # | Finding | Criterion | Sev |
|---|---|---|---|
| A11Y-1 | **Focus ring 1.40:1 against its own background** — `outline: 3px solid color(srgb .451 .451 .451 / 0.3)` composites to `rgb(193,193,193)` on `rgb(227,227,227)`. Ring *exists* (2.4.7 met) but is effectively invisible. Design-system-wide (`vc-button`), not compare-specific | **1.4.11** | **High** |
| A11Y-2 | **The FAIL is the SPACING, not the sizes** — `classifyTouchTargets` returns FAIL on any `tooClose` pair, and All↔Differences sit **2px** apart against the 8px floor. The sizes (pin 26², remove 32², add-to-cart 38², tabs 32px high at ≤768) are all ≥24, so WCAG 2.5.8 AA passes and they land in the invariant's **AA-to-AAA WARN band** — `BL-UI-006` states two tiers on purpose because the UI kit ships 26/32/38 deliberately, and flattening that to FAIL produced 13 of 36 phantom failures in `REG-2026-07-24-2121`. At 375 these controls are `display:none` — **unmeasurable, not compliant**. *(Size band re-graded FAIL→WARN after reconciliation with the VCST-5735 close-out session; the gap keeps the row at FAIL.)* | `BL-UI-006`/2.5.5 | **High** |
| A11Y-3 | Row tooltip trigger `div.vc-popover__trigger` has **`tabIndex=-1`** → MOQ/VAT explanations cannot be opened by keyboard. Text *is* reachable via the icon's `aria-label`, so AT is not blocked; sighted keyboard users are | **2.1.1** | **Medium** |
| A11Y-4 | `aria-pressed="false"` on remove-from-compare — a delete action announced as an unpressed toggle | **4.1.2** | **Medium** |
| A11Y-5 | "Differ: N of M rows" is a `<p>` with no live region, yet changes on tab switch and All↔Differences | **4.1.3** | **Medium** |
| A11Y-6 | Inactive tab-switch label `#737373` on `#f5f5f5` = **4.35:1** (needs 4.5), enabled control. **Light preset only** — dark clean | **1.4.3** | **Medium** |
| A11Y-7 | Breadcrumb separator "/" 2.52:1; breadcrumb link 37.2×17 (<24×24). Page shell; 2.5.8's *inline text* exception plausibly applies | 1.4.3/2.5.8 | **Low** |
| A11Y-8 | Decorative 768×768 `.vc-container__bg` svg has no `aria-hidden="true"` | 1.1.1 | **Low** |

**Verified correct:** dialog `role`+`aria-modal`+`aria-labelledby` (a11y tree: `dialog "Clear all" modal`), focus to *Cancel* on open, **Escape closes and focus returns to the trigger**; pin `aria-pressed` `false`→`true` with `Pin "X"`→`Unpin "X"`; boolean cells carry the **text** "Yes"/"No" with `aria-hidden` icons — so the 2.42:1 `x` glyph is decorative-redundant and **1.4.11-exempt, not a failure**; keyboard focus reveals the hover-only pin; after *Clear all* focus moves to the empty-state `h3`. **Not verifiable here, never reported PASS:** screen-reader output (no NVDA/JAWS/VoiceOver); 200% zoom / 320px reflow; `prefers-reduced-motion`; five of the six WCAG 2.2 additions.

## 5. Sized-control table
| Control | Declared | Rendered | Aspect | Verdict |
|---|---|---|---|---|
| compact image box (desktop) | 40×40 | **40.0×40.0** | 1.00 | **PASS** |
| compact image box (mobile) | 36×36 | n/a | — | **SKIPPED** — compact never engages at 375 |
| empty-state tile | 56×56 | **56.0×56.0** at 1280 **and** 375 | 1.00 | **PASS** |
| pin (glyph / button) | `iconSize 13` | 14×14 / button 26×26 | square | DRIFT +1px; button <44 at ≤768 |
| remove-from-compare | `trash-2` @20 | glyph 20×20, button 32×32 | square | **PASS** glyph; button <44 at ≤768 |
| dialog footer buttons | — | 128×44 | — | PASS (≥44) |

## 6. UX findings — Nielsen scorecard
| # | Heuristic | Finding | Sev |
|---|---|---|---|
| UX-1 | #6 Recognition | **Titles truncate to an indistinguishable string.** At 1280 two columns both read `AGENT-TEST-Compare-Filler-…`; at 375 all five read `AGENT-TEST-Compare-…`. 2-line clamp + ellipsis, **no `title`**, no tooltip. Telling products apart is the feature's purpose | **3** |
| UX-2 | #3 User control | **At 375 both *Clear all* and *Clear category* are `display:none`** (`.compare-products__actions`, `.compare-table__clear-category`). Mobile users can only remove one at a time | **3** |
| UX-3 | #3/#9 Undo | **A reload loses the UNDO, not the comparison.** The restore *buffer* is in-memory (gone after a reload, so *Restore products* cannot be reached), but the compare **list itself persists** in `localStorage.compareProducts` and survives a reload — CMP-008 documents that key and CMP-027 verifies the reload path. *(Corrected after reconciliation: this row previously read "a reload permanently loses the comparison", which is wrong. The original "nothing in storage" probe was taken **after a Clear all**, when the key is legitimately empty, and over-generalised. Not a data-loss defect.)* | **2** |
| UX-4 | #1 Visibility | The "Differ: N of M rows" count **disappears entirely in Differences mode** — the number vanishes exactly when it is being acted on | **2** |
| UX-5 | #1 Visibility | No in-cart feedback: after adding 2 products the buttons stay primary/`shopping-cart` and no success toast fires | **2** |
| UX-6 | #8 Aesthetic | Empty-state emphasis inverted: *Restore products* is `solid--primary` while *Add products* — the primary task — is `outline--primary` | **2** |
| UX-7 | #5 Error prevention | Destructive confirm is labelled **"OK"**, not the specced "Clear"/a verb naming the outcome | **2** |
| UX-8 | #3 User control | While the header is stuck/compact the **remove control disappears** from the card (title + Add to cart only) | **2** |
| UX-9 | #2 Match | Differences mode shows `AgentTestCompareFormatCollision` whose two rendered values are **identical** (`1,234.568`), with no marker explaining why the row is there | **2** |
| — | #4, #7, #10 | no findings | 0 |

Row labels also x-clip at 375 (`scrollWidth 139` into `clientWidth 87`), ellipsis, no `title`; with A11Y-3 the full characteristic name is unreachable on touch.

## 7. Visual Findings — caught by visual review, not by any snippet
1. **Empty-state `h3` paints a red focus ring for mouse users** — `outline: 2px solid color(srgb .898 .129 .129 / 0.4)` renders on plain `:focus` (`matches(':focus-visible') === false`), so clicking *OK* draws a red box round the heading. The focus *move* is correct a11y; the ring should be `:focus-visible`-gated. Sev 1–2 · `compare-v2-empty-1280.png`
2. **Label-column header cell is unbalanced** — filter + differ text at top, *Clear category* pinned at bottom, ~120px dead space between. Sev 1 · `compare-v2-dark-1280.png`
3. **Compare entry point absent from the 375 header** (phone/search/cart only) — hamburger-only, while desktop shows a labelled *Compare* with a count badge. Sev 1, page shell · `compare-v2-multitab-375.png`

**Screenshots** → `screenshots/`, all prefixed `compare-v2-`, no pre-existing file overwritten: `multitab-1280` (full page) · `dark-1280` · `empty-1280` · `sticky-compact-1280` · `populated2-768` · `sticky-compact-768` · `clear-all-dialog-768` · `multitab-375` · `sticky-NOT-compact-375` · `limit-refusal-1280`.

## 8. Could not run — stated, never counted as a pass
**SKIPPED** toast colour/geometry tokens + tooltip panel tokens (success toast never appeared; popover never opened — trigger unfocusable, hover not driven) · stroke-ladder buckets (`Icon Stroke System.html` not read, and `vector-effect: none` makes buckets unevaluable anyway) · section-header + rating tokens (no section headers render — matches the newer spec copy; fixtures carry no ratings) · page padding.
**INCONCLUSIVE** dark text contrast outside `.compare-table` (§3).
**Methodology caveat** `focusIndicatorAudit` focuses every control in scope and left focus on the header *Theme* control; the theme changed `auto`→`light` during that pass. Not attributable from the evidence held — flagged only as a possible WCAG 3.2.1 (On Focus) follow-up on the **page shell**, not reported as a defect.
