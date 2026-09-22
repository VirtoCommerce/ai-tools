# VCST-5911 — GREEN verification (Phase B) — **BLOCKED**

**Verdict: BLOCKED — the fix could not be verified on this environment.** `/account/missions`
renders an error state instead of mission cards, so none of the surfaces under test (mission card,
its date badge, the two mission modals) are reachable. The blocker is **not attributable to PR #2479**.

| Field | Value |
|---|---|
| Build under test | `Ver. 2.58.0-pr-2479-cf20-cf20b0ad` (footer, visible in screenshots) — correct PR/commit |
| Env / account | `http://localhost` + `:8090`, store `B2B-store`; `shopper@localhost.test` (header "shopper User") |
| Browser / passes | `playwright-chrome`; 3 consecutive passes, identical result each time |
| Theme preset | **Red** — `--color-primary-500 #e52121`; token hexes match the RED baseline exactly |

## The blocker

`POST /graphql` → **400** on every `/account/missions` load:

```
Argument 'storeId' of type 'String!' is required for field 'loyaltyBalance' but not provided.
  extensions.code: PROVIDED_NON_NULL_ARGUMENTS
```

The **missions query itself succeeds**: `GetLoyaltyMissionProgress` returns `200`, `totalCount: 16`,
12 items on page 1, `hasNextPage: true` — including `AGENT-TEST-MSN-OPEN-ENDED` (`daysRemaining: null`)
and `AGENT-TEST-MSN-ENDING-SOON` (`daysRemaining: 5`). The page still renders *"We couldn't load your
missions. Please try again."* plus a global error toast; "Try again" does not clear it.

**Causal chain (observed):** the only failing request on the page is the `loyaltyBalance` 400; the
missions request is 200 with good data; the page shows the error. Both `useMissions.fetchMissions`
and `useLoyaltyBalance.fetchLoyaltyBalance` re-`throw`, so a failing sibling query blanks a panel
whose own data loaded fine.

**Attribution — pre-existing, NOT this PR.**

- PR #2479 touches no GraphQL document (only `vc-badge.vue`, `dark/atoms/vc-badge.scss`, the new
  `mission-date-badge.vue`, `mission-card.vue`, the two modals, `useMissionCard.ts`, 13 locales, a story).
- `getLoyaltyBalanceQuery.graphql` on **`dev`** already omits `storeId`, so the gap predates the branch.
- The RED baseline rendered 31 missions on vcst-qa on 2026-09-08 ⇒ **local-env version skew**: this
  localhost loyalty module requires `storeId` where the storefront never sends it.

**Recommendation:** re-provision localhost with a loyalty module matching `dev`, or run Phase B
against vcst-qa with the PR build. The checklist itself needs no change.

## Per-item verdicts

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | All status dots ≥3:1 on `/account/missions` | **BLOCKED** | 0 mission cards render (3/3 passes) |
| 2 | Root cause: `vc-badge--dot` + 700 shade | **PARTIAL** | see below |
| 3 | "No deadline" on both open-ended missions | **BLOCKED** | 0 cards; string absent from DOM |
| 4 | Order- + SKU-mission modals | **BLOCKED** | no card to open a modal from |
| 5 | Dark theme re-run of 1 and 3 | **BLOCKED** | `html.dark` active, still 0 cards |
| 6 | "N days left" + severity banding unchanged | **BLOCKED** | 0 cards |
| 7 | UI-kit blast radius on a non-loyalty surface | **PASS (partial)** | see below |
| 8 | Progress bar `warning-500`; danger dot distinguishable | **BLOCKED** | 0 cards |
| 9 | axe-core `color-contrast` on `/account/missions` | **BLOCKED** | see below |
| 10 | No new console errors, no 4xx/5xx | **FAIL (pre-existing)** | see below |

### Item 2 — what could be established

Live token values read from `document.documentElement` on the running build (light theme):

| Token | Hex | vs `#ffffff` | ≥3:1 |
|---|---|---|---|
| `warning-500` | `#fc9e00` | **2.09:1** | ✗ |
| `warning-700` | `#ab660e` | **4.53:1** | ✓ |
| `danger-500` | `#de3131` | 4.58:1 | ✓ |
| `danger-700` | `#a01313` | 8.09:1 | ✓ |
| `success-500` | `#3e845b` | 4.51:1 | ✓ |
| `success-700` | `#316144` | 7.18:1 | ✓ |

- **PASS — no global symptom fix.** `warning-500` is still `#fc9e00` = `rgb(252,158,0)`, identical to
  the RED baseline; the PR did not darken the shared 500 token. The 2.09 / 4.58 / 4.51 figures
  reproduce that baseline exactly, validating the measurement chain (canonical `COLOR_MATH_JS` +
  `EFFECTIVE_BG_JS` from `scripts/lib/measure-layout.ts`).
- **BLOCKED — the other half.** `warning-700 #ab660e` at 4.53:1 *would* satisfy WCAG 1.4.11, but
  **no `.vc-badge--dot` node exists anywhere reachable on this env**, so it is unproven that the
  rendered dot resolves to it — a prediction from tokens, not an observation of the fix.
- Dark tokens exist and invert as expected (`warning-700 #ffca16`, `danger-700 #ff9592`,
  `success-700 #3dd68c`), again with 0 dots rendered.

### Item 7 — blast radius (the one genuinely testable regression)

`/account/orders`, 13 `.vc-badge` nodes, **0 of them gained `vc-badge--dot`** (all have slot content):
9 × `vc-badge--solid--secondary` fill `#6b7280` (unchanged, not a 700 shade), 4 × `xs outline--secondary`
border `#6b7280` vs white = 4.83:1 at 18×16px. No layout, size or colour anomaly ⇒ **no regression from
the UI-kit change on this surface.** Caveat: 9 of the 13 measured 0×0 (collapsed currency picker).

### Item 9 — axe

axe-core **4.12.1** loaded and ran on `/account/missions`: **0 violations, 0 `color-contrast`
incompletes**. This is **not** a pass for the fix — the scanned page contained **zero mission cards**.
It only establishes the page shell is clean; reporting it as green would be a vacuous pass.

### Item 10 — console / network

- `POST /graphql` **400** on every missions load (the blocker above) — pre-existing, not PR-attributable.
- Repeated `ws://localhost/graphql` WebSocket handshake failures (`400`, close `1006`) on every page
  including ones that work — local-env infrastructure (no ws endpoint), not PR-attributable.
- No other 4xx/5xx. No Vue hydration warnings. No JS exceptions from the badge/loyalty components.

## Incidental finding

**Resilience defect (pre-existing, not PR-attributable, worth its own ticket).** A successful
`loyaltyMissionProgress` payload — 16 missions — is discarded and replaced with a full-page error
because an *unrelated sibling* query (`loyaltyBalance`) failed. A balance widget failing should
degrade to a missing balance, not blank the missions list. Severity: **High**.

## Evidence

- `screenshots/VCST-5911-BLOCKER-missions-error-light-pass1.png` (light; build string + error + toast)
- `screenshots/VCST-5911-BLOCKER-missions-error-dark.png` (dark)
- No screenshots of the previously-failing dot states exist — those states never rendered.

---

## Orchestrator correction (2026-09-15, post-handback)

The attribution above ("local-env version skew") is **wrong** and is superseded by the close-out in `testing-checklist.md`.

Re-derived from source this session: **vcst-qa live introspection returns the identical `loyaltyBalance(storeId: String!, ...)`**, the committed snapshot `.claude/knowledge/api/graphql-schema.md:184` already recorded it on 2026-09-11, and POSTing the exact `dev`-branch document to **both** endpoints produces the **same 400**. This is a live storefront-to-module contract break on vcst-qa as well, not a localhost artefact.

It is already tracked: **vc-frontend PR #2475** "feat(VCST-5024): add storeId to loyalty points queries" (OPEN, base `dev`). No new bug was filed.

The resilience finding is also not new — it is `reports/bugs/closed/BUG-missions-page-fails-whole-page-on-partial-graphql-response.md` (VCST-5843), closed won't-fix 2026-09-02, whose stated re-open condition is now met.
