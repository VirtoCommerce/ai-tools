| C12 |undefined| **PASS** | 30 descendant mutations → exactly 1 coalesced write at 101.7 ms. `/company/members`: **155** mutations / 78 elements → **0** writes (both axes off, bails at guard 1). Max frame gap 18.7 ms. No console errors, no 4xx/5xx — ev: C12 || C11 |undefined| **PASS (3 gaps found)** | New filter covers **5 of 7** attributes the selector + role guard read (`type`, `controls` absent); watcher covers **3 of 4** relevant props (`noBar` absent — `--no-bar` grows the client box; compensating `scrollbar-gutter:stable` is Firefox-only, line 278) — ev: source review @ 0242ba90 || C10 |undefined| **FAIL (unrelated, non-blocking)** | axe 4.12.1 injected on all 3 surfaces. **`scrollable-region-focusable`: 0 violations, 0 incompletes everywhere** — the ticket's own outcome is CLEAN. Unrelated pre-existing: 1 Critical `button-name` (PDP), 2 Serious (`color-contrast`, `list`) on home/search; `/company/members` 0 — ev: — || C9 |undefined| **PASS** | Tab reaches `.vc-table__scrollbar`, `:focus-visible` true, outline `solid 2px rgb(229,33,33)` at −2px, matching source SCSS. Nothing skipped — ev: C9-*.png || C8 |undefined| **PASS** | 375×812, `--vertical` on, overflowing 1393/650, role null, 31 focusables, tabindex null — ev: C8-*.png || C7 |undefined| **PASS** | At 1920×**620** both regions genuinely overflow (563>438, 448>438) with `--vertical` on, role null, and both stay tabindex null with 14/17 focusable descendants ⇒ focusable-descendant guard bailed, not the overflow guard — ev: C7-*.png || C6 |undefined| **PASS** | PDP variations table `tabindex="0"` at 1920/1300 px while NOT overflowing ⇒ explicit `focusable` override wins. `/company/members` + `/account/orders`: no axis modifier, tabindex null (matches source) — ev: `.vc-table__scrollbar`; C6-*.png || C5 |undefined| **PASS** | Idempotence **measured**: `el.matches('[tabindex]…')` true but `el.querySelector(…)` false. 21 alternating flips → 0 extra writes; 2500 ms quiet → 0 — ev: — || C4 |undefined| **PASS** | `role="listbox"` → tabindex removed **103.7 ms**; role removed → returned **103.9 ms**. Exactly 2 mutations / 2158 ms. Pre-fix: **no reaction in 2000 ms** (RED) — ev: same container || C3 |undefined| **PASS** | 15 focusable descendants neutralised → 15→0 → tabindex null→"0" at **105.7 ms**; restored, tab stop correctly withdrawn. Pre-fix: no `attributes:true`, so no reaction — ev: `ul.vc-scrollbar.vc-dropdown-menu__list`; C3-*.png || C2 |undefined| **BLOCKED** | Pre-fix baseline: "0"→null after **1044 ms**, reproducible — ev: 01/02-QA-*.png || C1 |undefined| **BLOCKED** | Storybook preview dead. Pre-fix baseline on dev: `disabled` t→f, tabindex null→"0" after **1048 ms**, remount marker survived ⇒ async path, not a watcher — ev: `.vc-scrollbar`, 01/02-QA-*.png |# VCST-5701 — Testing Checklist (Artifact B)

**Ticket** VCST-5701 · [UI-Kit] VcScrollbar: auto tab stop does not react to prop changes
**Path** FAST (feature-test) · Task · Priority Low (P3) · labels `a11y` `tech-debt` `ui-kit`
**Env** vcst-qa · Platform **3.1063.0** (login-page HTML) · theme **2.57.0-pr-2455-0242-0242ba90** (= PR #2455's own artifact)
**Build verified by fingerprint**, not by `artifact.json` alone: the deployed bundle
`/assets/index-DPieVzRp.js` contains `attributeFilter:["disabled","tabindex","href","contenteditable","role"]`,
`{flush:"post"}` and the `100`ms debounce — i.e. both halves of PR #2455 are live.
**Layer** storefront · **data_surface** false (`td:validate` green; no seeding) · **contract_surface** false

## Surface availability — both halves are now reachable

| Surface | Build | Carries fix | Can flip `vertical`/`horizontal`/`disabled` |
|---|---|---|---|
| `vcst-qa-storefront` | `2.57.0-pr-2455` — bundle `/assets/index-DPieVzRp.js` | **yes** (fingerprinted) | **no** — the ticket own 4-call-site audit |
| `vcst-qa-storybook` | **delivered by the operator 2026-09-04**, chunk `assets/iframe-DqwQmL1L.js`, `generatedAt` 2026-09-04T11:53:53Z | **yes** (fingerprinted: `attributeFilter[...]` + `flush:"post"`) | **yes** — `argTypes` booleans |

Both builds were verified by **fingerprinting the deployed bundle**, never by trusting `artifact.json` or the
delivery claim. The Storybook image was undelivered when this run started (`storybook-ci.yml` has no
`pull_request` trigger, so `dev` builds only); it was delivered mid-run, which moved C1/C2 from
`NOT VERIFIABLE (env)` to testable. The prop lever is **`disabled`**, not `vertical` — the `Vertical` story
hardcodes `vertical` after `v-bind="args"`, so the literal wins and that control is inert.

## Conditions

| # | Condition | Oracle | Verdict | Evidence |
|---|---|---|---|---|
| C1 | **Stuck-OFF** (Storybook, prop-only): `disabled` true→false on an overflowing, non-focusable region adds `tabindex="0"`, in <100 ms (undebounced watcher, not the 100 ms observer path), with no remount | ticket comment §Two-directions; PR #2455 `flush:"post"` watcher | NOT-RUN | |
| C2 | **Stuck-ON** (Storybook, prop-only): `disabled` false→true removes `tabindex`, same latency and no-remount conditions | ticket comment §Two-directions | NOT-RUN | |
| C3 | **Widened observer — descendant attribute**: neutralising the last focusable descendant (`disabled` / drop `href` / `tabindex="-1"`) makes the container gain `tabindex="0"` within ~250 ms | PR #2455 diff `attributeFilter` | NOT-RUN | |
| C4 | **Widened observer — container `role`**: setting an `INTERACTIVE_CONTAINER_ROLES` value (`listbox`) on a region that currently has `tabindex="0"` removes it | component role guard, line ~119 | NOT-RUN | |
| C5 | **No feedback loop**: the element's own `tabindex` write is itself observed; `tabindex` must settle (≤1 extra recompute) — no runaway loop, no CPU churn | regression risk introduced by the fix | NOT-RUN | |
| C6 | No regression — call site `vc-table` (`:focusable="scrollable \|\| !!maxHeight"`): `tabindex` correct in both scrollable and non-scrollable states | ticket per-call-site table | NOT-RUN | |
| C7 | No regression — `search-dropdown` sidebar + content (`:vertical="!isMobile"`): focusable descendants keep `needsAutoTabStop` false, no spurious `tabindex` | ticket per-call-site table | NOT-RUN | |
| C8 | No regression — `mobile-search-bar` (`:vertical="isMobile"`) at a mobile viewport | ticket per-call-site table | NOT-RUN | |
| C9 | Scrollable regions remain keyboard-reachable and operable with a visible focus ring; tab order unchanged | **BL-A11Y-001** (P1) | NOT-RUN | |
| C10 | axe-core: no new Critical/Serious violation on the affected surfaces; specifically `scrollable-region-focusable` clean | **BL-A11Y-004** (P1) | NOT-RUN | |
| C11 | Residual gap (source): `type` is absent from `attributeFilter` while `FOCUSABLE_SELECTOR` reads `input:not([type="hidden"])` — same defect class not closed | diff review | NOT-RUN | |
| C12 | No console errors; no interaction-time perf regression on a table-heavy page | shared-instructions §Always-On | NOT-RUN | |

## Coverage notes
- **Existing corpus**: 23 rows mention "scrollbar", all about horizontal-overflow layout; **none** asserts `tabindex` or a focusable scroll region. No existing row is invalidated by this change (`coverage_surface` derived `true`, not run — FAST, no `--coverage`).
- **FAST authors no cases**, so this file is the run's only durable record. Route to durable coverage: `/qa-test-lifecycle`.
- **Oracle gap** (for `/qa-review-oracles`, proposal only): no `ECL-*` row and no `BL-*` beyond the general `BL-A11Y-001` covers "scrollable region not keyboard reachable" (axe `scrollable-region-focusable`).

## Verdict: **BLOCKED** — awaiting a Storybook rebuild

The widened-MutationObserver half is **VERIFIED** (RED→GREEN: no reaction in 2000 ms pre-fix → 103.7 ms post-fix).
The **prop-watcher half — the ticket's primary claim — is NOT VERIFIED**: strong static evidence (watcher present,
`flush:"post"` justified, fingerprinted in both deployed bundles) and **zero behavioural evidence**, because the
only surface that can flip the props renders nothing. Per the state machine BLOCKED transitions nothing and
requires a comment naming the blocker — posted as comment 108300 (3 inline screenshots, §5c-verified).
Nuance: pre-fix the stale window was **~1 s**, not indefinite (the ResizeObserver eventually corrects), so the
fix's real value here is latency.

**Blocker:** QA Storybook (chunk `iframe-DqwQmL1L.js`, built 11:53Z, carries the fix) mounts no stories — all 767.
Dev Storybook (`iframe-CIPvoytP.js`, 07:22Z, pre-fix) renders fine. Root cause: Apollo `ApolloLink.from` receives
the 1-arg `useModuleSettings` composable — `.length===1` passes the `length===0` guard, then `.map` is absent —
an identifier-binding collision in the minified preview bundle. The same line is byte-identical in the working
dev build, so a rebuild will very likely clear it. Rocket Loader and the mocker reference were both ruled out.

## Not filed (below severity floor)
Three residual gaps of the class this ticket closes, all Low/P3, documented in comment 108300 rather than filed:
`type` and `controls` absent from the new attribute filter; `noBar` absent from the watcher's dependency list.

## Filed / documented, not blocking
Per operator instruction, **no new tickets were created**; all of the following are recorded in comment 108300:
P0 Storybook preview dead · Medium `Vertical` story cannot exercise its own axis props · Medium focus-ring
contrast 2.11:1 (Default preset only — Coffee/Red, the gated presets, **not measured**) · Critical `button-name`
(pre-existing) · Serious `list` (pre-existing) · Low Rocket Loader on both Storybook hosts.

## Regression
- **C1 (case-scoped):** SKIPPED — FAST authors no cases and `--coverage` was not passed, so there are no new Draft ids and no RE-BASE ids; an exact-set run would be empty.
- **C2 (release sweep, 5r):** NOT RUN — deferred. `regression:select --target 40` widened to the P0 floor (13 suites: 039, 040a-c, 041, 042, 044, 048c, 049, 078, 078b-d) at **71 min predicted vs a 40 min target, trimmed: 0**, because no path token maps to the scrollbar file (`unmappedPaths` names it, `widened: true`). Deferring until the blocked half can be re-run in the same pass rather than sweeping twice.
