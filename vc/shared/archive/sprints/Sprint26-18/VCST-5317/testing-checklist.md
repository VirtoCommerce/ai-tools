# Testing Checklist — VCST-5317 (Round 3, the fix pass)

**EXECUTED 2026-09-10.** C1 regression `RUN_ID: REG-2026-09-10-1453` — 9/9 executed, **5 PASS / 3 FAIL / 1 BLOCKED, every red named in advance as expected**. Per-item verdicts inline below.

**Supersedes the Round-2 checklist of 2026-09-09** (git history holds it). Round 2's per-condition verdicts are **not carried** — they were measured on a different build. What IS carried is Round 2's evidence-bearing measurements, attributed inline, and its **Traps**, every one of which cost a false verdict once.

**Ticket:** VCST-5317 — Story, Priority Medium, status `Testing`. Flow `feature-test`, path **FULL**, `layer: cross-layer`.
**Env:** `{{FRONT_URL}}` / `{{BACK_URL}}` (vcst-qa) · Platform `3.1064.0` (login-page HTML) · `/health` 200.
**Build — the delta is ONE commit.** Storefront **`Ver. 2.58.0-pr-2469-afce-afce27e1`** read from the page footer at 1920 and 375 (`1r`, re-read by `1c`); Round 2 tested `83d6-83d6e5d5`. The feature delta is **`878e765a`**, a direct child of `83d6e5d5`; `afce27e1` is a `dev` merge carrying three unrelated commits (VCST-5159, VCST-5891, VCST-5916). Backend **`ProfileExperienceApiModule 3.1018.0-pr-145-4fe6` UNCHANGED** since 2026-09-07 (#145 head `4fe664e8`) — **the backend is not in this delta.**
**PRs — both still OPEN / unmerged**, PR-deployed to this env only: `vc-frontend` **#2469** · `vc-module-profile-experience-api` **#145**.
**Contract:** schema introspected live **2026-09-10** (108 queries / 140 mutations / 54 types); `Organization.isLockedForCurrentUser` present; 75/75 fixtures green, zero drift.
**Test Model:** `reports/ba/test-models/VCST-5317-2026-09-09.md`, **amended in place as `## Round 3`** (22 scenarios; +20/21/22 this round) — cited, not restated.
**Discovery (3x):** `reports/exploratory/SBTM-VCST-5317-R3-2026-09-10.md`. **Both P0 hypotheses settled in the developer's favour.** This checklist carries what that lane OBSERVED; Step 4 grades it independently, on a different lane.

**⚠ BREAKING, declared twice** (PR #145's body; ledger `Customer 3.1021.0`) — unchanged this round, and deployed Customer is **ahead of `ledger_through`**, so the ledger's silence past that point is *unknown*, never *absent*.

**The ticket still contradicts itself, and this checklist tests the AS-BUILT.** Title, Context/Gap, Technical Notes and AC-1's *trailing clause* specify **HIDE**; the build ships **SHOW-AND-FLAG**. A HIDE expectation fails by design, not by defect. The hide-vs-disable call is a product decision this run reports and does not make. Line 1 of the description — `> Hide or provide clear error message` — has been undecided for three months and is the root cause.

## Fixture state at dispatch — read this before running anything

- **Both lanes are at V2** (locked TechFlow, unlocked BuildRight), seeded and **read back** this run. Backend leg `65f9e33e…`, frontend leg `9fbdf17a…`, both `isLocked=true / server.isCurrentlyLocked=true`.
- **BuildRight is the ACTIVE org on both lanes; TechFlow is the non-current one.** Round 1 inverted this in 11 bindings and every gate still passed — a resolving `@td()` says nothing about whether it names the right entity.
- **Lane split is absolute.** `MULTI_ORG_TF_BR` = backend/API lane. `MULTI_ORG_TF_BR_ALT` = frontend/UI lane. A membership row is keyed on `(userId, organizationId)`; two lanes on one account eat each other's state and both report confident wrong results.
- **`IMPERSONATE_TARGET_BLOCKED` (V6) is OFF LIMITS** — suite 082's impersonation-blocked-target condition depends on it staying locked.
- **Do NOT re-seed or tear down.** `4c`'s cases self-seed and self-tear-down and run AFTER this checklist; a teardown here poisons them. The orchestrator owns the final restore to V1.

## Traps to bake in — each one previously cost a false verdict

- Omitting `storeId` on `/connect/token` → `user_cannot_login_in_store`, which **masks** the org code. `storeId` is camelCase-only; `organization_id` accepts either casing.
- A **consumed** refresh token fails with a **code-less** `invalid_grant`, easily mistaken for the org refusal. Take the refresh token **fresh**.
- **Never assert on the token response's `count` field** — it is the parameter count, not an error count (`BL-AUTH-013`). Count `errors[]`.
- **Settle ~2 min on the xAPI flag after a passive expiry.** The 60 s bound is `GetLockedOrganizationIdsAsync` **only**. **Never assert on the REST `onlyLocked` search after a passive expiry** — region-token-only cache, no time bound, still reported locked at t+162 s.
- `POST …/{id}/lock` on an unknown membership id returns **`200 OK` with a null body, not 404** — the read-back is the only trustworthy confirmation.
- **Never force a disabled control** (`VC-EXEC-003`). The disabled state IS the validation working; a refused click is the evidence.
- Runner assertions: keep predicates **bare**. A `/` or `(` in the rationale makes the assertion vacuous (`T-005`).
- **NEW, found during Round 3 execution — re-authenticate after every lock-state cycle that lands V2/V4/V7.** Cycling the fixture `V2→V1→V2` twice inside one live browser tab caused a later org-switch to fail with `/connect/token 400 invalid_grant: "The specified refresh token is no longer valid."` and signed the user out. Cause: `RevokeTokenOrganizationMembershipChangedEventHandler` revokes the account's refresh token **globally** on *any* transition into `IsCurrentlyLocked=true` — the seeder's own log warns *"Acquire tokens AFTER this run"*. **This is self-inflicted, not a product defect** — verified by re-authenticating fresh and repeating the identical flow cleanly. Left untagged it reads as a false P0 forced sign-out, which is exactly the defect class this ticket is about.
- **A screenshot's achieved viewport must be read from the image, not asserted.** Round 1 reported "375 px" from a lane that clamps at 500 px, and a whole P0 was mis-scoped on it.

---

## PART A — THE DELTA. This is what Round 3 exists to decide.

### A1 — the mobile lock treatment (VCST-5931, `To do`; scenario 14; frontend lane, 375×812)

- [x] **A1.a** → **PASS** — achieved 375x812 read from the PNG IHDR, not asserted; the TechFlow radio carries a native `disabled` (value `96f109a7…`). `4a` frontend + `4c` B2C-ORG-066
  -  — At a genuine **375×812** (report the achieved `innerWidth`/`innerHeight`), hamburger → **Corporate** → *"My organizations"* renders, and the row for `@td(MULTI_ORG_TF_BR_ALT.org_techflow_id)` carries a native `disabled`. `{SPEC}` `878e765a` · `{OBSERVED}` 3x R3
- [x] **A1.b** → **PASS, recorded as DRIFT not FAIL** — mobile exposes the full lock sentence as the accessible NAME (inline AX text); desktop exposes the same sentence via a native `title` attribute. AC-1 says *Locked label*; shipped as icon + reason on both surfaces. `4a` + `4v`
  -  — That same row renders a lock indicator and exposes a lock **reason** in the accessibility tree. 3x measured the mobile reason as **inline AX text**, where desktop uses a native `title` — record which channel each surface uses. AC-1 says *"Locked label"*; shipped as icon + reason ⇒ record **DRIFT, not FAIL**. `{SPEC}` PR #2469
- [x] **A1.c** → **PASS** — the BuildRight row is not disabled and carries no lock indicator on either viewport; the treatment is scoped to the locked membership, not the list
  -  — The row for `@td(MULTI_ORG_TF_BR_ALT.org_buildright_id)` is **NOT** disabled and carries no lock indicator — the treatment is scoped to the locked membership, not the list. `{OBSERVED}`
- [x] **A1.d** → **PASS** — the real tap was refused by the actionability gate (`element is not enabled`), never forced (`VC-EXEC-003`); the page stayed on `/`, still signed in. This is the exact regression that defined Round 2
  -  — **The regression that defined Round 2:** attempting the tap does **not** sign the user out. No token clear, no `/sign-in` redirect, no anonymous home. **Do not force the control** — a refusal by the actionability gate IS the pass. `{BL}` BL-AUTH-013
- [x] **A1.e** → **PASS** — no new `/connect/token` POST after the refused tap; only the original sign-in token call appears in the whole network log. This is the guarded-vs-guarded-looking discriminator
  -  — **No `/connect/token` POST naming the locked org is issued by the tap.** This is the discriminator between "guarded" and "guarded-looking". `{SPEC}` `selectOrganization()` guard
- [x] **A1.f** → **PASS** — same session, same lock state: the 1920x1080 popover also flags TechFlow `[disabled]` and a real click was likewise refused
  -  — Desktop control read in the **same session at the same lock state** as the paired baseline (1920×1080, Account-menu popover, listbox `Organizations`). If the desktop option is NOT flagged, report `BLOCKED:PRECONDITION_UNMET:DESKTOP_BASELINE_ABSENT` — the build is wrong, not the mobile row. `{OBSERVED}`

### A2 — the refetch-on-open fix (the unfiled High; scenario 20; frontend lane, 1920)

- [x] **A2.a** → **PASS** — open once while unlocked → close → REST lock with the page still loaded → reopen with NO reload → row renders `disabled`. `4a` + `4c` B2C-ORG-068
  -  — **The headline condition.** Page loaded, Account-menu popover opened **once** and closed, lock applied via REST while the page stays loaded, popover reopened **with no reload** → the locked row renders `disabled` with the indicator. `{OBSERVED}` 3x R3
- [x] **A2.b** → **PASS** — a second, distinct `GetOrganizations` fired on reopen (req #222 then #224); #224 carried `isLockedForCurrentUser: true`
  -  — A **second `GetOrganizations` request** is observable on the reopen. This is what separates "the fix works" from "the fixture happened to be locked before the first fetch". `{OBSERVED}` 3x R3
- [x] **A2.c** → **OBSERVED** — every popover open produced a fresh `GetOrganizations`, including opens where the data had not changed: consistent with destroy/remount per open, not a watcher and not a TTL. `useUserOrganizations.ts` is untouched by the delta. **The fix rests entirely on that lifecycle property, and B2C-ORG-068 is now the only thing in the corpus guarding it** — a later `KeepAlive`/`v-show` refactor would silently reintroduce the P0
  -  — **State the MECHANISM you observed, not the PR's wording.** 3x found the popover is destroyed and remounted per open, so `onMounted` re-fires; there is no watcher and no every-open hook, and `useUserOrganizations.ts` was not touched (no TTL, no invalidation). Record whether the component remounts. **The correctness rests entirely on that lifecycle property, which no case asserts** — a later `KeepAlive`/`v-show` refactor silently reintroduces the P0. `{SPEC}` `878e765a`
- [x] **A2.d** → **PASS** — the mobile drill-in fired a fresh `GetOrganizations` (req #229) on every navigation into the panel; same mechanism, triggered by SPA panel navigation rather than popover open/close
  -  — Same on **mobile**: the panel is drilled into, so it plausibly remounts for a different reason. Say which. `{SPEC}`
- [x] **A2.e** → **PASS (UIP-TABS)** — tab B's FIRST EVER menu open after an externally applied lock already rendered `disabled`, backed by a fresh request (#128), with no reload of tab B
  -  — **`UIP-TABS`:** two tabs open, lock lands while tab B's menu is closed → tab B's next menu open shows the row disabled, **without a reload**. Round 2 recorded this as a GAP folded into a session check; it is now a first-class condition, because a mount-time fix is exactly where a two-tab case can miss. `{HYPOTHESIS}`

### A3 — what the delta did NOT guard (scenario 22 + the declared gap)

- [x] **A3.a** → **NOT REACHED as reproduced** — no lane that can authenticate has a throttling primitive (`4v` ran on playwright-edge; Chrome DevTools MCP has throttling but cannot sign in). At normal latency `3x`, `4a` and `4c` B2C-ORG-069 all observed sequential, non-overlapping requests. The race is neither reproduced nor ruled out — explicitly not a pass
  -  — `void search()` discards the promise and no loading state gates it. Rapid close/reopen **on a throttled connection** → does a slower stale response repaint over a fresher one? **3x reached this only at normal latency and found no overlap** — that is `NOT REACHED as reproduced`, never a pass. Needs throttling; the visual lane (Chrome DevTools) has it. `{HYPOTHESIS}`
- [x] **A3.b** → **DECLARED GAP, blocker named** — no lockable membership exists on any >10-org account, and `DV-022` forbids binding one to `MULTI_ORG_USER` (6 dependent suite files, no lane isolation, `CUST-091` depends on its zero-membership shape). No case authored
  -  — **DECLARED GAP, no case, blocker named.** Scenario 21 — a locked org filtered out of `organizationsWithoutCurrent` by an active search phrase yields `target === undefined`, the guard's optional chain is falsy, and it falls through to `trySwitch()` (the hole `B2C-ORG-042` flags on desktop, now inherited by mobile). **Unreachable this round:** the search box needs >10 orgs, both lane fixtures are 2-org, and `MULTI_ORG_USER` is refused — 6 dependent suite files, no lane isolation, a lock terminates all its sessions globally, and **`DV-022` already forbids the binding**. Follow-up: provision a lane-isolated >10-org fixture.

---

## PART B — REGRESSION GUARD. Behaviour Round 2 established as correct; this round confirms the delta did not break it.

- [x] **B1** → **PASS** — `totalCount: 2` with both orgs in `items[]` regardless of lock state; the rendered count is the membership total, not the unlocked-only count. AC-1's trailing clause CONTRADICTED, which is the point of asserting it this way
  -  — Both orgs listed; rendered row count equals the user's **total** membership count, not the unlocked-only count. This is AC-1's trailing clause **CONTRADICTED**, and asserting it that way is the point. `{SPEC}` `useUser.ts:382` (untouched by the delta) + PR #145
- [x] **B2** → **PASS** — locking a membership did not reduce `totalCount` (stayed 2). `4a` backend
  -  — Locking a membership does **not** reduce `totalCount` (post-#145 the filter is gone). Round 2 measured `totalCount` stayed **2**. `{OBSERVED}` R2
- [x] **B3** → **PASS** — desktop locked option `disabled` + lock icon + `title`; the real click was refused and the active org was unchanged
  -  — Desktop: locked row `disabled` + padlock + `title`; clicking it does not switch and the active org is unchanged. `{SPEC}` `top-header-organizations.vue`
- [x] **B4** → **PASS** — the A2 mid-session sibling lock did not evict the live tab: all GraphQL calls stayed 200, no `/sign-in` redirect, no new `/connect/token`, and the row simply re-rendered `[disabled]` on the next open with no re-login. A negative result guarding `BL-AUTH-012`'s session half
  -  — A **sibling** lock does **not** evict a live session (R2: 13 × `POST /graphql` all 200, no `/sign-in` redirect, no lost cart; the row re-rendered `[disabled]` on the next menu open with no re-login). A **negative** result guarding `BL-AUTH-012`'s session half, which no pre-existing case draws. `{OBSERVED}` R2
- [x] **B5** → **PASS** — `errors[]` empty; TechFlow (locked) `true`, BuildRight (active) `false`
  -  — Backend lane: `me { contact { organizations(first: 50) { totalCount items { id name isLockedForCurrentUser } } } }` → `errors[]` empty; locked org's flag `true`, unlocked org's `false`. Treat `undefined` as not-locked **and say so inline**. `{SPEC}` `OrganizationType.cs`
- [x] **B6** → **PASS, all three legs** — `organizationsIds` returns the locked id; `organization(id: <locked>)` → `extensions.code = Forbidden` with null data; the same shape against the unlocked ACTIVE org → 200 with data. The refusal is lock-specific, not a blanket customer-principal denial
  -  — `me.contact.organizationsIds` returns the locked id **and** `organization(id: <locked>)` is refused (`extensions.code = Forbidden`, `data.organization` null) **and** the same shape against the unlocked ACTIVE org returns 200 with data. **All three legs, or the result proves nothing** — a lone Forbidden could be a blanket customer-principal denial. `{OBSERVED}` R2
- [x] **B7** → **PASS** — HTTP 400, `invalid_grant`, exactly ONE `errors[]` entry, `code: user_is_locked_in_organization`
  -  — Non-`password` grant naming the locked org, **freshly issued** refresh token, explicit `organization_id` → `invalid_grant`, exactly **one** `errors[]` entry, `code: user_is_locked_in_organization`, active org unchanged. `{BL}` BL-AUTH-013
- [x] **B8** → **PASS** — HTTP 200, no error, and the returned JWT's `organization_id` claim decoded to BuildRight, the ACCESSIBLE org. `BL-AUTH-016` fallback intact; AC-4's premise correctly CONTRADICTED
  -  — Multi-org **`password`** grant naming the locked org → **HTTP 200, no error**, active org = the accessible one. **Correct** per `BL-AUTH-016`; assert it so a future "fix" that refuses outright is caught as a regression. AC-4's premise **CONTRADICTED**. `{BL}` BL-AUTH-016
- [x] **B9** → **PASS** — no console TypeError or uncaught exception and no 4xx/5xx on `/graphql` across sign-in, both menu-open cycles, viewport changes, the mobile drill-down, the refused tap and the two-tab test
  -  — No new console `TypeError` / uncaught exception on sign-in, menu open, viewport change, the mobile drill-down, or the refused tap. No 4xx/5xx on `/graphql`. The `/connect/token` 400 is expected **only** in an unguarded state and is scored at A1.e, not counted here.

---

## PART C — CARRIED FORWARD UNRESOLVED. Stated, because a blank reads as clean.

- [x] **C1** → **STILL REPRODUCES — VCST-5933, deliberately not re-filed.** `organization(id: <locked>)` → Forbidden/null while `organizationOrders(organizationId: <locked>)` → `totalCount = 79` for the same principal on a token carrying no `organization_id`, so `BL-AUTH-016` fallback is ruled out by construction. Round 2 measured 66; consistent growth, not a discrepancy. `4a` backend + `4c` PRF-GQL-093
  -  — **`organizationOrders(organizationId: <locked>)` serves the locked org's full order history** while `organization(id:)` refuses the same id for the same principal. Round 2 measured `totalCount 66` with a token carrying **no** `organization_id`, so `BL-AUTH-016` fallback is ruled out by construction. **VCST-5933, `To do`, explicitly scoped out of #2469 by the developer.** Re-confirm it still reproduces on this build; do **not** re-file. Carrier `PRF-GQL-093` (`Draft`). `{OBSERVED}` R2
- [x] **C2** → **Not independently reproduced this round** — reaching V7 requires locking BuildRight too, which is outside the execution lane's authorized V1/V2 write scope. `3x` re-confirmed the dead end. Evidence added to the open P0 `BUG-multiorg-no-self-recovery-when-pinned-org-blocked-VCST-5281`; NOT a new filing
  -  — **V7 all-locked dead end:** `/403` + `ApolloError`, switcher still rendered with **every** row disabled including `[disabled] [selected]`, no empty state, no unlock path. Dup-class of the open P0 `BUG-multiorg-no-self-recovery-when-pinned-org-blocked-VCST-5281`; 3x re-confirmed it this round. **Evidence on that bug, a new trigger, NOT a new filing.** `{OBSERVED}` 3x R3
- [x] **C3** → **PASS — `BL-B2B-001` L7 exercised live for the first time.** Items in the cart under BuildRight ($15.00) → switch to TechFlow → cart correctly empty, no leak → switch back → $15.00 fully restored. This was the model's stated load-bearing omission, guarded until now by a single never-executed `Draft` row
  -  — **`BL-B2B-001` `[P0-revenue]`, the chain's load-bearing omission.** This ticket's chain does not touch domain link L7 (*transacting under the org*), and exactly **one** row — `B2C-ORG-065`, `Draft`, never executed — guards it. Cart items under BuildRight → switch to TechFlow → org-scoped context resets → switch back. **A locked row that renders perfectly while the switch it guards leaks the previous org's cart passes every other condition here.** `{BL}` BL-B2B-001

---

## Not covered by this checklist — stated, because a blank reads as covered

- **The hide-vs-disable product decision** — out of scope by the model's own terms. This run reports the divergence; it does not adjudicate it.
- **Cross-product consistency with Sales Rep's exclude-on-lock behaviour** (`SR-GQL-012/017/024/124`, `SR-CP-021`) — a UX call for the go/no-go owner, not a per-ticket pass/fail.
- **Full WCAG 2.2 AA audit** of the disabled affordance / padlock / tooltip — delegated whole to the visual lane (`4v`). A1.b is the pointer, not the audit. Round 2's standing a11y findings (F-A1 focus-ring 1.4.11, F-A2 title shadowing, F-A3 listbox exposure at V7) are **pre-existing and site-wide**; per `feedback_a11y_never_blocks_feature_stories` none of them blocks this verdict.
- **Exhaustive enumeration of every consumer** of `contact.organizations` / `organizationsIds` — C1 covers the storefront-principal-reachable set; a source-level sweep of the unbounded remainder is out of scope and named as such.
- **Customer-doc update** — `StorefrontUserGuide` still says *"Only companies you currently have access to appear here"*, re-fetched first-hand 2026-09-10 and verbatim unchanged, now contradicted on **two** surfaces rather than one (D16). The lock axis still has **no** admin documentation at all (D17). A `ba-doc-writer` deliverable at 5h, not a test condition.
- **`MULTI_ORG_USER` fixture drift** — 3a found 1 membership row and 12 orgs where `CUST-091` (Critical) asserts **zero** membership rows as its load-bearing premise. **Out of scope for this ticket, carried to 5a as an incidental finding**, not tested here.
