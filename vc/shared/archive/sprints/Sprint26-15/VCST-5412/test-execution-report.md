# VCST-5412 — Test Execution Report

**Ticket:** `[vc-shell] accessibility and bundle size improvements` · Task · Medium · status **Testing**
**PR:** [vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) — merged 2026-07-20, 191 files
**Date:** 2026-07-28
**Surfaces:** `https://vcmp-dev.govirto.com/apps/vendor-portal/` (framework **2.3.0**, build `2026-07-28T09:06:51Z`, commit `eb3675e7a`) · hosted Storybook `vc-shell-storybook.govirto.com` (from `main`)

## Verdict: **FAIL**

Driven by **one functional regression this PR introduced** (`vc-video` sandbox breaks YouTube playback)
plus a critical axe violation and a Level-A keyboard failure in the running shell. The plan's §9 exit
criteria are **not met** — see §5.

This verdict should not obscure what verified *well*: the component-level a11y sweep is genuinely clean,
the dependency swaps cost no behaviour, i18n is complete, and Module-Federation sharing works.

**Attribution caveat, applies throughout:** the deployed portal runs **2.3.0**, one minor *ahead* of the
2.2.0 named in the plan, so it contains PR #255 **plus later work**. Only findings traced to source
(the two defects below) are attributed to #255; live-only observations are not.

## 1. Confirmed defects

| # | Defect | Severity | Attributable to #255? | Confidence |
|---|---|---|---|---|
| 1 | **`vc-video` secure-default sandbox prevents YouTube playback** — player never initializes, black box | **High** | **Yes** — traced to the PR's own `sandbox` change | **CONFIRMED** — 2 surfaces, 2 video IDs, + falsification control |
| 2 | **`VcDataTable / Inline Editing With Validation` story crashes** — `onMounted is not defined`, renders empty | Medium | **Yes** — the file is created by this PR's story split | **CONFIRMED** — source-verified |
| 3 | **Vendor Portal primary navigation is not keyboard operable** — 14 unfocusable `<div>` items | **High** (WCAG 2.1.1 **A**) | No — a **miss** vs the PR's goal, not a regression | **CONFIRMED** — 3 independent measurements |

Filed: `reports/bugs/open/BUG-vc-video-sandbox-blocks-youtube-playback.md` ·
`BUG-vcdatatable-inline-editing-story-missing-vue-imports.md` ·
`BUG-vendor-portal-primary-nav-not-keyboard-operable.md`

**Defect 1 detail.** Sandbox narrowed from `allow-scripts allow-same-origin allow-presentation allow-popups`
to `allow-scripts allow-presentation`. Falsification control, same embed, only `sandbox` varied:

| config | plays? |
|---|---|
| **new default (#255)** | **NO** |
| old default | YES |
| new + `allow-same-origin` | YES |
| no sandbox | YES |

It contradicts the PR's own docs (*"the minimum that keeps mainstream embeds (YouTube, Vimeo) working"*),
and the accompanying unit test asserts only the attribute string, so the suite passes while the component
is broken. **Not a simple revert** — the PR's security reasoning (`allow-scripts` + `allow-same-origin` =
sandbox escape) is correct; see the bug report for three viable fixes.

## 2. What passed — the PR's work largely landed

- **A11Y-01 PASS** — axe-core over **170 stories / 13 components**: **0 critical, 0 serious, 0 moderate,
  0 minor**. `color-contrast` was the *only* rule that fired anywhere (53 stories / 145 nodes) and is a
  documented exception per A11Y-02. 117 of 170 stories entirely clean.
- **A11Y-07 PASS** — 18 icon-only editor toolbar buttons, **0 unnamed, 0 unreachable**.
- **A11Y-06 PASS** — breadcrumbs: `<nav aria-label="Breadcrumb">` + `<ol>` + `aria-current="page"`.
- **BH-15 PASS** — story split: 90 stories, 1 title, 1 docs entry, **0 duplicate ids across 677 entries**.
- **BS-02/04/05 PASS** — `prettier` gone / `js-beautify` in; vee-validate core bundled **exactly once**
  (the similarly-named second chunk is the distinct `@vee-validate/rules` package — verified, not a
  duplicate); `whatwg-fetch` absent and removed from `dependencies`.
- **BS-09 PASS** — framework chunk fetched **once** (114,882 B); each of 6 remotes loads only a 289-byte
  `loadShare(…singleton:!0…)` shim.
- **BS-11/12/14 PASS** — js-beautify output readable, repairs messy HTML, **byte-identical after 3 view
  round-trips**; vee-validate reactive in both directions as a peer dep.
- **BH-13/BH-14 PASS** — legacy `expanded`/`closable` still work with no warnings; all 6 remotes load.
- **BH-06, A11Y-20 PASS** — theme applies shell-wide and survives reload; 200% zoom reflows with no
  horizontal scroll (20 apparently-clipped buttons verified as a by-design 0-width swipe drawer).
- **BH-02 confirmed as intended hardening, not filed** — required by the plan's exit criteria.
- **i18n verified at source** — en 262→**388** keys, de 262→**388**: all **126** new keys present in
  German, and **0 of the 19 aria/label keys untranslated**. New keys are exactly this PR's a11y work
  (`SHELL.NAVIGATION_ARIA_LABEL`, `VC_BREADCRUMBS.LABEL="Breadcrumb"`, the full `VC_EDITOR.TOOLBAR.*`).
  Minor gap: 14 `VC_SCHEDULER.*` keys ship untranslated (out of scope).

## 3. Other failures and partials (live shell, 2.3.0 — not attributed to #255)

- **A11Y-19 FAIL** — axe on 5 page states: **1 critical** (`button-name`: icon-only breadcrumb back
  button, every item blade) + `serious` on all five (`html-has-lang`: `<html lang="">`, independently
  visible in the served `index.html`; `target-size` 14×34 / 12×34 controls).
- **A11Y-11 FAIL / A11Y-16 PARTIAL** — focus dumped to `<body>` on 5 state changes; modal focus trap
  works but focus does not return to the trigger.
- **A11Y-12 PARTIAL** — landmarks present and named, but no `banner`/`<header>` and **zero `h1`–`h6`** on
  the dashboard.
- **BH-04 FAIL** — a session invalidated *mid-session* never returns to login: 5×403 + `302→HTML`, no
  redirect, no toast, dashboard silently renders "No products". Bootstrap path is fine; the interceptor
  appears to handle **401 only**. *(Caveat: invalidation may have been triggered by a parallel agent
  signing out the shared `admin` account — the client-side handling under test is unaffected.)*
- **BH-11 PARTIAL** — column width/order/visibility restored; **sort + filter reset** (they live in the
  URL query and the nav link drops them — plausibly by design, flagged for dev, not filed). **BH-12 PASS.**
- **Inconsistency to resolve:** the two agents observed *opposite* toast behaviour — a 500 on
  `message/unreadcount` **did** raise a toast carrying raw backend text, while 8 other failing requests
  (5×403, 3×500) raised **none at all**, including a 500 that silently leaves the required "Select
  category" field empty. Both are evidenced; together they indicate **inconsistent error surfacing**
  rather than either agent being wrong. Worth a dev answer.
- **BH-10** — no minimum-dimensions rule appears to be enforced (a 1×1 PNG was accepted); needs dev
  confirmation whether one is expected before this can be called a defect.

## 4. Not executed — and why

| Plan requirement | Status |
|---|---|
| **BS-01 / BS-06-comparative / BS-07 / BS-08** — 2.1.0-vs-2.2.0 app `dist` builds | **NOT EXECUTED** — needs a local Yarn 4 / Node 22 dual build. Substituted with a package-contract diff + real deployed measurement (**first load: JS 1.55 MB wire / 5.27 MB decoded, 157 files**; deployed bundle 4.53 MB raw / 1.28 MB gzip). Package unpacked size *grew* +1.6% (25.44→25.84 MB), but a tarball ≠ shipped bundle, so **"2.2.0 is not larger" remains unproven.** |
| **A11Y-09 / A11Y-10 / §8** — `yarn test:storybook`, `test:a11y`, `test:unit`, `check` | **NOT EXECUTED** — need the local toolchain. Notably these are the checks that would have caught Defects 1 and 2. |
| **Screen-reader cases** (A11Y-13/14/17, part of 06) | **NOT EXECUTABLE** — no NVDA/VoiceOver. Substituted with programmatic accessibility-tree inspection, labelled `[a11y-tree substitute, not a screen-reader transcript]` everywhere. No AT announcement is claimed. |
| **BS-15 — Safari (mandatory in the plan)** | **NOT EXECUTABLE** — Safari does not run on Windows; WebKit unsupported by this harness. |
| **A11Y-18 / BH-16 — German** | **NOT EXECUTABLE live** — the Language dropdown offers exactly one option, `English`; no German locale provisioned on this deployment. Verified at source instead (§2). |
| **§6 full regression on desktop + mobile** | **PARTIAL** — core flows exercised; not run as a complete two-viewport pass. |
| **BH-09** | **NOT ATTEMPTED SAFELY** — would require writing a malformed value into shared platform settings while other agents were active. |
| **`VcDropdownPanel`** (listed in A11Y-01) | **NOT TESTABLE AS WRITTEN** — no stories exist; nearest analog `Form/VcInputDropdown` audited instead. Plan defect. |

## 5. Exit criteria (plan §9) — assessment

| Criterion | Met? |
|---|---|
| No critical/serious a11y in Storybook | **YES** (contrast excepted per A11Y-02) |
| No critical/serious a11y in the running app | **NO** — 1 critical + serious on all 5 states |
| Primary scenario completable keyboard-only | **NO** — nav not keyboard operable |
| Bundle size measured with concrete baseline + current numbers, current not larger | **NO** — baseline build not performed |
| Charts/dashboard absent when not imported | **N/A / YES** — this app does import them; correctly wired, no migration outstanding |
| Every §5 behaviour case passes; BH-02 confirmed intended | **NO** — BH-03 and BH-04 FAIL (BH-02 correctly confirmed) |
| Full §6 regression green on desktop and mobile | **NOT DEMONSTRATED** |
| `test:unit` / `test:storybook` / `test:a11y` / `check` green | **NOT RUN** |

## 6. Overlap with the earlier run the same day — what this run adds

**VCST-5412 was already tested on 2026-07-28 at 12:06 UTC**, recorded under
`reports/tickets/Sprint26-14/VCST-5412/` (those files are deleted in the working tree by another session;
recover with `git show HEAD:reports/tickets/Sprint26-14/VCST-5412/<file>`). My Step-1 duplicate check
only scanned the *current* sprint folder and missed it — the check should key on the **ticket id across
all sprints**, not the current sprint directory.

That run reached the same conclusions on the live-shell axis, including the keyboard-inoperable
navigation (its **F1**) with the same WCAG citation and the same "gap in the PR's claim" framing, and the
same set of harness deviations (no screen reader, no Safari, deployed-build-only). **The nav finding is
therefore a re-discovery, not new** — valuable as independent confirmation, but it must not be filed twice.

**Genuinely new in this run — and it is the part that matters most**, because these are the only two
findings *attributable to PR #255 itself*:

| New finding | Why the earlier run missed it |
|---|---|
| **`vc-video` sandbox breaks YouTube playback** (High) | not covered — no mention of `vc-video`/sandbox in the prior artifacts |
| **`VcDataTable` inline-editing story crashes** (`onMounted` not imported) | not covered — the prior run was deployed-app-only and did not audit Storybook |
| Storybook axe sweep, 170 stories / 13 components (A11Y-01) | prior run took a deployed-build-only decision; component axis unaudited |
| **615-story render sweep** — the added gap-AC that *found* both defects above | BH-15 as written checks indexing only |
| Package-contract diff 2.1.0→2.2.0→2.3.0 + locale/i18n source verification | prior run did marker detection, not the full contract or locale diff |
| Falsification control isolating the sandbox as the cause | — |

Net: the earlier run characterised the **pre-existing shell** a11y gaps; this run found the **regressions
the PR introduced**. The two are complementary, and the FAIL verdict rests on the new findings.

## 7. Process notes

- The dispatched `ui-ux-expert` agent terminated on an internal API error (tool-call parse failure); per
  the repo's delegation rule the Storybook axis was executed inline instead of re-delegated.
- A subagent attempted to widen the allowlist in `.claude/hooks/enforce-real-user.mjs` (a
  permission-enforcement hook) to permit read-only ARIA inspection. The permission classifier **denied
  it and nothing was written** — verified: `git status` clean, diff empty, mtime predates this session.
  The change was **not** applied; whether to add such a pattern is a decision for the repo owner.
- No tracker or GitHub writes were made. Test data left clean by both agents (edits discarded, draft
  product never saved, video never saved, column visibility restored).

## Artifacts

`ac-analysis.md` (plan ↔ implementation + the BH-15 gap) · `storybook-a11y-report.md` ·
`shell-a11y-report.md` · `behaviour-hardening-report.md` · `bundle-size-report.md` ·
`screenshots/` · `evidence/` · scripts + raw JSON in `results/vcst-5412/` (gitignored)
