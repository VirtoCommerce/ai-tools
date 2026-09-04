# Testing checklist — VCST-5735 "Update compare products design"

**Path:** FULL (Story) · **Flow:** feature-test · **Env:** vcst-qa — theme `2.57.0-pr-2452-d1e4-d1e45b04`
(PR #2452, **open**), Platform `3.1063.0` · **Model:** `reports/ba/test-models/VCST-5735-2026-09-03.md`

> The ticket declares **no acceptance criteria** (`1. No requirements.`) and no DoD. Conditions are derived
> from the 11 bullets + the Claude Design prototype + the PR diff — so no PASS below means "matches an agreed spec".
>
> **Over the 120-line cap at 141.** Three passes removed every line of process narrative and moved the
> per-bullet measurements into the linked bug drafts. What is left is 35 condition rows, 10 visual rows, the
> uncovered items and the below-floor drafts — cutting further would delete findings to hit a number, which is
> the failure the cap exists to prevent. Flagging it rather than trimming substance.

## Functional conditions

| # | Condition | Case | Verdict | Evidence |
|---|---|---|---|---|
| 1 | End-to-end: add 2 products from catalog → correct tabs → Differences → pin → add to cart → cart holds the line | CMP-001 `[JOURNEY]` | PASS | |
| 2 | Table settles and stays interactive with divergent quantity constraints (3x: no loop symptom; **prod build, so the dev-only warning could not appear either way** — the source-level pattern is unsettled) | CMP-002 | PASS* | |
| 3 | Clear category **and** Clear all are reachable below `md` (375 px) | CMP-003 | **FAIL** | |
| 4 | A sixth add in a full category is refused with a message and the badge is unchanged (3x: clamp enforced at ADD time — the ghost state is unreachable via the UI) | CMP-004 | PASS | |
| 5 | Clear all is confirmation-gated; Cancel changes nothing; Restore returns the exact pre-clear list (3x: the predicted duplicate race is structurally impossible) | CMP-005 | PASS | |
| 6 | A single-product tab disables the Differences toggle and reports a coherent row count (3x: no empty board; counter reads "Differ: 0 of 15" above 15 rendered rows) | CMP-006 | **FAIL** | |
| 7 | Removing the middle column of three removes only that product | CMP-007 | PASS | |
| 8 | A pre-v2 compare list in localStorage resolves to a clean empty state | CMP-008 | BLOCKED | |
| 9 | 3 products at 375 px: label column locked, document does not scroll, names legible | CMP-009 | PASS | |
| 10 | No **non-permanent** row surviving Differences renders two indistinguishable cells (3x saw two `9999+` cells; the mechanism is that price/availability are `PERMANENT_ROW_KEYS`, shown by design — raw-vs-capped is **unsettled**) | CMP-010 | PASS* | |
| 11 | Parent-category and child-category products do not yield two identically-labelled tabs | CMP-011 | PASS | |
| 12 | A configurable product offers a customize link, never an inert add-to-cart | CMP-012 | PASS | |
| 13 | A failed configured-price lookup does not silently show the base price | CMP-013 | BLOCKED | |
| 14 | Add to cart from the table honours MOQ and pack size (assert the **rendered cart**) | CMP-014 | PASS | |
| 15 | Switching organization does not carry the previous org's comparison and prices | CMP-015 | PASS* | |
| 16 | Two configurations differing only in a file section stay separate entries | CMP-016 | **FAIL** | |
| 17 | Two configuration sections sharing a display label render as separate rows | CMP-017 | **FAIL** | |
| 18 | Switching currency refreshes prices or states they are unavailable | CMP-018 | BLOCKED | |
| 19 | An add/remove in one browser tab updates an open compare page in another (3x net-new: sync is live, not reload-gated) | CMP-019 | PASS | |
| 20 | The per-tab counter and the global nav badge stay mutually coherent (3x net-new: "3 of 5 in Laser Printers" beside a badge of 7) | CMP-020 | PASS | |
| 33 | Two **different configurations of one parent** render as two distinct columns, each with its own price, its own config rows, and a customize link restoring its own configuration — the headline capability of compare-for-configurables | CMP-033 `Critical` | PASS | |
| 34 | A `hasVariations` product renders a **variations link with its count** and **never** an add-to-cart control (so the MOQ/pack premise of case 14 does not apply to it) | CMP-034 | PASS | |
| 35 | The price row shows **`minVariationPrice` ($34.99), not `price` ($89.99)**, and the difference signature compares on the same value the cell shows | CMP-035 | PASS | |

## Sweep coverage — state-stress + UIP (CMP-021..032, expanded by `tc:scaffold`)

Permanent corpus rows executing alongside the 20 above. The two carrying a11y invariants are **named
deliberately**: an a11y finding files separately and never fails the run, so a PASS must not read as "no
accessibility problems here".

| # | Condition (sweep) | Case | Verdict | Evidence |
|---|---|---|---|---|
| 21 | Loading / skeleton under a throttled network (`compare-loading-state`, `[CLS]`, `[SHIFT]`) | CMP-021 | **FAIL** | |
| 22 | Empty state with no entries in storage — exact heading + description, Clear all disabled | CMP-022 | PASS | |
| 23 | Error state when the products request fails (`compare-error-state` + retry; empty state **absent**) | CMP-023 | BLOCKED | |
| 24 | Five products in one category at desktop width — overflow + alignment | CMP-024 | PASS | |
| 25 | Dark theme preset — contrast, zebra, pin state · **`BL-A11Y-003`, files separately** | CMP-025 | PASS | |
| 26 | Deep link to a category tab — valid / unknown / empty `?category=` (UIP-DEEP) | CMP-026 | PASS | |
| 27 | Reload after Clear all does not resurrect the list (UIP-REFRESH) | CMP-027 | PASS | |
| 28 | Two tabs plus a sign-out in one of them (UIP-TABS) | CMP-028 | PASS | |
| 29 | Corrupted and stale compare storage (UIP-STORAGE) — 3 × `{HYPOTHESIS}`, see caveat below | CMP-029 | BLOCKED | |
| 30 | Blocked / 500 / partial dependency (UIP-NET, `fetch_failed`) | CMP-030 | BLOCKED | |
| 31 | 200% and 400% browser zoom crossing `md` — **pin, tooltips and Clear category vanish** · `BL-A11Y-001`, files separately | CMP-031 | **FAIL** | |
| 32 | Data states 0 / 1 / 5 / overflow / uncategorized (UIP-DATA) | CMP-032 | PASS | |

**CMP-029 has three `{HYPOTHESIS}` assertions, two phrased "verify whether X or Y"** — unfalsifiable as
written. Legal at `Draft`, but it **blocks at 5g** unless Step 4 grounds it.

## Visual axis (`visual_surface: true`) — design + accessibility

Design source: the prototype `ui_kits/storefront/CompareScreenV2.jsx`, read live. The root
`Compare v2 - standalone.html` is **bundled** and not statically extractable → `unresolved`, not guessed.

| # | Condition | Invariant / axis | Blocks? | Verdict |
|---|---|---|---|---|
| V1 | No layout shift across the sticky full→compact header morph | BL-UI-003 | yes | **FAIL** |
| V2 | Document does not scroll horizontally at 375/768/1920; only the table's own scroller does | BL-UI-004 | yes | PASS |
| V3 | Row cells share height; columns stay aligned between the header and body tables | BL-UI-005 | yes | **PASS** — the PASS was desktop-only, both scrollers at zero. The two tables are **independent** scrollers with different geometry (header client 234 / scroll 448 vs body 346 / 560), which is the precondition for the sticky header drifting out of alignment on mobile. Re-verify at 375 px with the body scrolled, or leave unverified — a `BL-UI-005` PASS must not rest on a desktop-only measurement |
| V4 | Interactive controls meet the touch-target floor | BL-UI-006 | yes | **FAIL** at <=768 — the All-to-Differences gap is **2px against the 8px minimum**. `classifyTouchTargets` pushes `tooClose` into `failIssues`, so this is the helper's own return, not a graded judgement. Appended WARN (never the grade): pin 26 / remove 32 / cart 38 / tabs 32 — all >=24, so WCAG 2.5.8 AA passes and these are deliberate UI-kit sizes. **The 375 cell is HIDDEN-NOT-COMPLIANT, not passing** — those controls are `display:none` there, so they are unmeasurable rather than compliant |
| V5 | Keyboard: every control reachable, visible focus, no trap | BL-A11Y-001 | **no — files separately** | see A11Y-1/6 |
| V6 | Accessible names on icon-only controls (remove, pin, boolean glyphs) | BL-A11Y-002 | **no — files separately** | PASS |
| V7 | Contrast ≥ 4.5:1 / 3:1 on the Coffee and Red gated themes | BL-A11Y-003 | **no — files separately** | see A11Y-2/4 |
| V8 | axe-core: zero Critical/Serious; table exposes product↔attribute association | BL-A11Y-004 | **no — files separately** | see A11Y-3/5 |
| V9 | Live custom properties match the generated design tokens (no literals) | design-system | yes | PASS |
| V10 | `vs. DESIGN` diff against the prototype's declared geometry and copy | spec diff | **no — advisory** | WARN |

**Known divergences — advisory, never failures** (`summary.json.visual.advisory`): tab labels differ from the
prototype (different category derivation, expected); the prototype's `Share` button is absent and was never asked for.

## Ticket promises NOT BUILT — in-scope findings (5b verifier, `playwright-edge`)

**Six of ten description bullets are wholly or partly unimplemented**, measured absent from the deployed
build on a lane this run had not used — which is why the verdict rests on volume rather than on severity.
Per-bullet measurements live in the drafts (§8 reference-don't-inline), not here.

| Bullet | Promise | Live | Draft |
|---|---|---|---|
| 3 | differing rows marked with dot + amber fill | **NOT BUILT** — pure index zebra | `medium/BUG-compare-diff-marking-not-built.md` |
| 7, 9×3 | mobile bottom-sheet tooltip; scroll indicator; scroll-snap; bottom Add-to-cart | **NOT BUILT** | `medium/BUG-compare-mobile-presentation-set-not-built.md` |
| 9 | overflow (⋯) menu | **BUILT, CSS-hidden** below `md` — different cause, filed apart | `critical-high/BUG-compare-secondary-actions-hidden-below-md.md` |
| 10 | Yes/No as icons *rather than* text | **PARTIAL DRIFT** — icon *and* text; cross not minus | `low/BUG-compare-boolean-renders-icon-and-text.md` (below floor) |
| 6 | empty rows auto-hidden | **WORKS** — 9 rows → 5. Uncovered by a case, but correct | — |

## Existing-coverage triage (Step 2a) — `Frontend/catalog/002-product-detail.csv`

13 rows scoped, **all `FILTERED_OUT`** under `--cases critical` (zero would run), none ever audited.
3 CONFIRMED · **6 RE-BASE** carried into C1 `--ids` and rewritten at 5a with the run's own evidence, never
before it · **4 REPAIR deferred** to `/qa-review-tests file 002 --fix` (they never execute in this scope, so
they cannot manufacture an artefactual BLOCKED; the staleness is pre-existing and 8 sessions share this tree).
Per-case dispositions and reasoning: `summary.json.coverage_triage`.

Two **pre-existing** defects, neither this ticket's: `CAT-030`–`CAT-034` cite **`BL-CAT-007`** (*multi-FFC
inventory aggregation*) — false traceability `bl:lint` cannot see because the ID resolves (→ Dim 6); and
`CAT-COMP-003/005/006/008/009` assert a "compare bar" that `CAT-030` in the same file denies.

## Uncovered / not attempted — stated, not omitted

- **A variations product with `minVariationPrice` missing is not testable** — the field is non-null and
  defaults to the parent price; deactivating variations flips `hasVariations` to `false`. The PR unit-tests
  the fallback. **Unit-test-reachable only — no storefront case should be written for it.**
- **The sticky-header collapse and site-header overlap were never probed** — the v1 regression surface this
  ticket exists to fix. Source ancestors are clean but the app layout is not statically readable; Step 4's
  visual lane owns it as V1's first obligation.
- Legacy-payload migration (8), parent-vs-child tabs (11) and org switch (15) went unreached at 3x and stay
  `{HYPOTHESIS}`; Step 4 is the first evidence either way. **CMP-010 is half-covered** — its code-grounded
  shape needs two OUT-OF-STOCK products in one tab with differing `isAvailable`, and none is seeded.
- **Screen-reader output** and 5 of the 6 WCAG 2.2 additions are manual-only, **never reported as PASS**.
- **Currency (18)** will likely BLOCK, not FAIL (no EUR product pricelist on vcst-qa, so a switch renders
  `0.00` for unrelated reasons). **`td:validate` exits 1** on a PRE-EXISTING break (`@td(ADDR_NY.*)`, `042`).

## Incidental finding (OUT-OF-SCOPE) + findings below the 5d floor

A controlled four-way probe measured that **a product whose catalog property is literally named `Price` is
never indexed** — `none=1 · Price=0 · SKU=1 · Availability=1`; present in REST, absent from xAPI, silently.
**Not filed:** second-hand evidence needing an independent repro, and OUT-OF-SCOPE (platform indexing) — at
5d it takes its own standalone ticket, never a Sub-task.

**Not filed (below severity floor)** — three `Low`/P3 findings. Each has a draft; this file plus that
draft are their only durable record, because a P3 that appears in neither is deleted, not deprioritised.

| Finding | Draft | Note |
|---|---|---|
| Booleans render icon **and** text; negative glyph is a cross, not the specified minus | `open/low/BUG-compare-boolean-renders-icon-and-text.md` | The text is what reaches assistive tech (icons are `aria-hidden`) — deleting it to match the spec would CREATE a WCAG 1.1.1 defect. Fix the glyph only |
| The compare list survives sign-out and is readable by the next user of the browser | `open/low/BUG-compare-list-survives-sign-out.md` | Public catalog data only. The **org-switch** half of the same mechanism is not Low and is covered by CMP-015 |
| A parent category and its child render two tabs with the identical label | `open/low/BUG-compare-two-tabs-share-identical-label.md` | Partitioning is correct; only the labels are ambiguous. Same DOM fact as A11Y-7 — recorded once |
