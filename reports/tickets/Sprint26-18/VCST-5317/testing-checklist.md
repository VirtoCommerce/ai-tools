# Testing Checklist — VCST-5317 (Round 2)

**Supersedes the Round-1 checklist of the same date** (git history holds it). Round 1's Step-4 per-case results were never persisted, so **no verdict from it is carried**; its evidence-bearing measurements are preserved inline below and attributed. Round 2 was ordered by the operator as a full re-test from `1a`.

**Ticket:** VCST-5317 — Story, Priority Medium, status `Testing`. Flow `feature-test`, path **FULL**, `layer: cross-layer` (api + storefront).
**Env:** `{{BACK_URL}}` / `{{FRONT_URL}}` (vcst-qa) · Platform `3.1064.0` · `/health` green ×6.
**Build — deployed = declared** (authenticated `/api/platform/modules`, 87 modules): `ProfileExperienceApiModule 3.1018.0-pr-145-4fe6` · `Customer 3.1024.0-pr-316-1ac3` · `Xapi 3.1020.0`. Storefront `Ver. 2.58.0-pr-2469-83d6-83d6e5d5` (footer, every page). **No deploy drift.**
**PRs — both OPEN / unmerged, PR-deployed to this env only:** `vc-module-profile-experience-api` **#145** · `vc-frontend` **#2469**.
**Contract:** GraphQL schema introspected live this run (108 queries / 140 mutations / 54 types); **`Organization.isLockedForCurrentUser` is in the live schema**; 75/75 fixtures green, zero drift.
**Test Model:** `reports/ba/test-models/VCST-5317-2026-09-09.md` (L1–L8 chain, V1–V10, **19** scenarios, `## Round 2`) — cited, not restated.

**⚠ BREAKING, declared twice:** PR #145's own body (`contact.organizations` / `organizationsIds` no longer exclude locked memberships — *"any consumer relying on that implicit filtering must now check `isLockedForCurrentUser` itself"*), and independently the release ledger at `Customer 3.1021.0`. Deployed Customer is **ahead of the ledger**, so the ledger's silence past that point is *unknown*, never *absent*.

**The ticket contradicts itself, and this checklist tests the AS-BUILT.** Title, Context/Gap, Technical Notes and AC-1's *trailing clause* all specify **HIDE** (PR #135's `IsCurrentlyLocked == false` filter). PR #145 **deletes that filter**; AC-1's *first half* and AC-2 describe **SHOW-AND-FLAG**. A HIDE expectation fails every L4–L6 line **by design, not by defect**. The hide-vs-disable call is a product decision this run reports on and does not make.

## Traps to bake in — each one previously cost a false verdict
- Omitting `storeId` on `/connect/token` → `user_cannot_login_in_store`, which **masks** the org code (4.a/4.b/4.c). `storeId` is camelCase-only; `organization_id` accepts either casing.
- A **consumed** refresh token fails with a **code-less** `invalid_grant`, easily mistaken for the org refusal. Take the refresh token **fresh** (4.a).
- **Never assert on the token response's `count` field** — it is the parameter count, not an error count (`BL-AUTH-013`). Count `errors[]`.
- **Settle ~2 min on the xAPI flag after a passive expiry** (measured Round 1: flipped at t+9 s). The 60 s `AbsoluteExpirationRelativeToNow` bounds **`GetLockedOrganizationIdsAsync` only**. **Never assert on the REST `onlyLocked` search after a passive expiry** — region-token-only cache, no time bound, still reported locked at t+162 s.
- **BuildRight is the ACTIVE org on both lanes; TechFlow is the non-current one.** Round 1 inverted this in 11 bindings and every gate passed anyway — a resolving `@td()` says nothing about whether it names the right entity. Bind lane-scoped: `@td(<LANE>.org_techflow_id)` / `org_buildright_id`.
- `POST …/{id}/lock` on an unknown membership id returns **`200 OK` with a null body, not 404** — always read back.
- **Never force a disabled control** (`VC-EXEC-003`) — the disabled state IS the validation working.
- Runner assertions: keep predicates **bare**. A `/` or `(` in the rationale makes the assertion vacuous (`T-005`).

## L1 — Lock write + session kill
- [ ] 1.a — Org-scoped lock does **not** set `ApplicationUser.LockoutEnd`; `GET /api/platform/security/users/{userId}/locked` stays `{"locked": false}` and the unlocked sibling org still authenticates. Read global lock from the `/locked` endpoint — the by-id payload can return successful-but-empty, where `isLockedOut` is `undefined` and a test passes proving nothing. `{BL}` BL-AUTH-012
- [ ] 1.b — Lock on the **active** org: all sessions terminated, and re-auth **rehomes to the unlocked sibling** (so V5 is not a reachable resting state — it collapses into V2). `{BL}` BL-AUTH-012 + BL-AUTH-015
- [ ] G2 — `UIP-TABS`: two tabs open, lock lands between them — expect both evicted, not just the tab that triggers the read. `{HYPOTHESIS}`
- [ ] 1.c — **Sibling** lock does **not** evict a live session (Round-1 measured: 13 × `POST /graphql` all 200, normal client-side nav, no `/sign-in` redirect, no lost cart; the row re-rendered `[disabled]` on the next menu open, no re-login). Re-confirm — this is a **negative** result guarding `BL-AUTH-012`'s session half, which no pre-existing case draws. Carrier `B2C-ORG-046`. `{OBSERVED}` Round 1

## L2 — xAPI list membership
- [ ] 2.a — `me { contact { organizations(first: 50) { totalCount items { id name isLockedForCurrentUser } } } }` → `errors[]` empty, backend lane. `{SPEC}` PR #145
- [ ] 2.b — `items[]` contains only orgs the caller holds a membership in; no foreign org id present. `{BL}` membership scoping
- [ ] 2.c — Locking a membership does **not** reduce `totalCount` (post-#145 the lock filter is gone). Round 1 measured `totalCount` stayed **2**; this is why `PRF-GQL-078` is **CONFIRMED**, not RE-BASE. `{OBSERVED}` Round 1
- [ ] G5 — Org-list query itself fails (`errors[]` non-empty or 5xx) → switcher degrades, header otherwise intact, no uncaught console exception. `{DOC}` ECL-10.2
- [ ] G6 — The lock treatment applies **before** paging — the locked org does not reappear on a later page; count assertions use `totalCount`, never rendered-row count. `{SPEC}` extends `PRF-GQL-078`
- [ ] **G17 (NEW, Round 2)** — **Breaking-change consumer inventory.** For every org-scoped read a storefront customer principal can reach — `organization(id:)`, `currentOrganizationAddresses`, `organizationContracts`, `organizationOrders` — record accept-or-refuse for the **locked** org id **with the unlocked active org as the paired control**. A refusal alone proves nothing; the control is the discriminator. PR #145 ships no such inventory. Carrier: model scenario 19 / `1d` gap-AC-11. `{SPEC}` PR #145 Breaking-changes section
- [ ] G13 — An org-scoped read **naming the locked org id directly** is refused. **Round-1 result, both legs:** `me.contact.organizationsIds` **does** return the locked id, `organization(id: <locked>)` → `errors[0].extensions.code = Forbidden` with `data.organization` null, **and** the same query against the unlocked ACTIVE org returns 200 with data — so the refusal is lock-specific, not a blanket customer-principal denial. `organizationsIds` is a **membership** list, not an **access** list. **Both legs are mandatory.** Carrier `PRF-GQL-086`. `{OBSERVED}` Round 1
- [ ] G14 — The switcher's search input composes with the lock treatment (a disabled row still appears and stays flagged in filtered results) and never bypasses it. **Round 1 did NOT reach this** — the search box is threshold-gated (`SEARCH_THRESHOLD = 10`) and does not render on a 2-org account; both lane fixtures are 2-org. Needs `MULTI_ORG_USER` (11 orgs). State **NOT REACHED** if the fixture is unavailable. `{HYPOTHESIS}`

## L3 — xAPI lock flag
- [ ] 3.a — Locked org's `isLockedForCurrentUser` is `true`, unlocked org's is `false`. Treat `undefined` as not-locked, and say so inline — nullability is inferred from the generated client type, not asserted from the backend schema. `{SPEC}` `OrganizationType.cs`
- [ ] 3.b — `IsLocked=true` with `LockoutEnd` **in the past** behaves as unlocked, no manual unlock — proves the read is `IsCurrentlyLocked`, not raw `IsLocked`. Reach V4 in ONE `/lock` call with a past `LockoutEnd`. Precedent `VCST-5374`, guarded by `PRF-GQL-080`. `{BL}` `OrganizationMembership.cs:22`
- [ ] 3.c — `LockoutEnd` within clock-skew of now → one of the two defined outcomes only, never a render error or a null row. `{BL}`
- [ ] **G16 (NEW, Round 2) — batch-loader scope.** `ResolveIsLockedForCurrentUser` registers a loader under the **constant** name `organization_isLockedForCurrentUser` and calls `LoadAsync(context.Source.Organization.Id)` — **keyed on the organization id alone** — while `userId` is read inside the batch from `context.GetCurrentUserId()` on whichever field resolution created the loader. `me`, `contact` and `organization` each accept a **`userId` argument**. Assert one document naming two different `userId` values cannot make one user's lock answer serve the other. **Also probe `myStatusInOrganization`** — same file, identical pattern, predates #145: that is what decides *introduced* vs *pre-existing*. `{SPEC}` `OrganizationType.cs`
- [ ] G8 — The expiry predicate re-asserted end-to-end L3→L5: after a **~2 min** settle on the xAPI flag the row renders **enabled with no padlock**, and render agreed with the flag at every sample. Regression guard on currently-correct behaviour, not a hunt. **Do not read the REST `onlyLocked` search here.** Carriers `B2C-ORG-049` + `PRF-GQL-087`. `{OBSERVED}` Round 1
- [ ] G18 — `statuses:["Locked"]` returns only locked orgs; **`["locked"]` (lowercase) silently returns empty**, because `wantsLocked` tests `statuses.Contains("Locked")` case-sensitively. A **BVA extension of `PRF-GQL-091`**, never a duplicate row. `{SPEC}` `ContactType.cs`

## L4 — Visibility gate
- [ ] 4.a′ — Rendered row count equals the user's **total** membership count, not the unlocked-only count. This is AC-1's trailing clause **CONTRADICTED**, and asserting it that way is the point. `{SPEC}` `useUser.ts:382` + PR #145
- [ ] 6.a — All memberships locked → the switcher control is **still rendered** (the gate reads unfiltered `totalCount`, not visible rows). `{SPEC}` `useUser.ts:382`
- [ ] G1 — A 2-org user with exactly 1 locked does **not** lose the switcher. `{SPEC}` `useUser.ts:382`
- [ ] G19 — V8's honest limit: the `isMultiOrganization` **false→true flip itself is not observable** on a 2-org account, because the gate reads the unfiltered `totalCount`, which is 2 before and after. Observing the flip needs an account whose unfiltered count was 1. **State the limit; do not let a green case imply the flip was seen.** `{SPEC}`

## L5 — Row render
- [ ] 5.a′ — Both orgs listed; the locked row carries the locked indicator (greyed, padlock, tooltip), the unlocked row does not. Note AC-1 says *"Locked label"* — shipped as **icon + tooltip**, not a literal text label: record as **DRIFT**, not FAIL. `{SPEC}` PR #2469
- [ ] 6.b — All memberships locked → every row renders disabled; record whether any empty-state copy exists and whether a console exception is thrown. AC-6 defines no empty state reachable through this path. `{SPEC}` PR #2469 + `ContactType.cs`
- [ ] G10 — The locked indicator is programmatically determinable (accessible name / `aria-disabled`), not colour-only; contrast holds on **Coffee and Red** presets only. **Round 1 measured `title` → accessible description and axe-core 0 violations, refuting its own earlier "no accessible name" claim** — `B2C-ORG-041` still asserts the refuted version and is carried into C1 as **RE-BASE**. Detailed audit belongs to the visual lane; an a11y finding never blocks this story. `{BL}` BL-A11Y
- [ ] G11 — The locked label and any empty-state copy resolve from i18n keys across the **15** locales #2469 touched; an untranslated key falls back to the default language, never the raw key. `{BL}` default-language fallback

## L6 — Click guard
- [ ] 6.c — Clicking the locked row does **not** switch; the control is `disabled` and the active org is unchanged. `{SPEC}` PR #2469 `top-header-organizations.vue`
- [ ] 6.d — The guard reads `organizations.value` while the row came from `displayedOrganizations` — a locked org paged out by an active search phrase has `target === undefined` and would slip past. Needs the >10-org fixture; **NOT REACHED** is a valid answer, stated. Carrier `B2C-ORG-042`. `{SPEC}` PR #2469
- [ ] **G15 (RE-OPENED at P0, Round 2) — mobile.** Round 1's 3x and checklist said *"at 375 px there are no rows at all"*; its **own Step-4 screenshots** show `corporate-submenu` → `my-organizations-locked-row-NOT-flagged` → `after-tap-signed-out`, and the domain map's D7 note (written by that run) says the mobile switcher *"got no lock handling at all and tapping a locked org silently signs the user out."* `design-report.md` F-U2's `orgListbox: false` was measured at **500 px**, not 375. `mobile-navigation.md` §5's "ABSENT" was measured on a **single-org** member and proves nothing here. **On a MULTI-ORG account at a genuine ≤500 px viewport:** does `Corporate → "My organizations"` render? At V2, is the locked row flagged, tappable, and does tapping switch / no-op / sign out? Is a `/connect/token` issued naming the locked org? `multi-organisation-menu.vue` is **untouched by #2469** — no `:disabled`, no padlock, no guard — while reading the same fragment. **Report the viewport actually achieved.** `{SPEC}` #2469 diff + `menu.json` `contact-organizations`

## L7 — Token refusal
- [ ] 7.a — In-session switch into the locked org, **non-`password`** grant, explicit `organization_id`, **freshly issued** refresh token → `error: invalid_grant`, exactly one `errors[]` entry, `code: user_is_locked_in_organization`, active org unchanged. `{BL}` BL-AUTH-013
- [ ] 7.b — Single-accessible-org fixture, `password` grant naming the locked org → HTTP 400, same single code. `{BL}` BL-AUTH-013
- [ ] 7.c — Multi-org, `password` grant naming the locked org → **HTTP 200, no error**, active org = the accessible one. **Correct** per `BL-AUTH-016`; assert it so a future "fix" that refuses outright is caught as a regression. This is AC-4's premise **CONTRADICTED**. `{BL}` BL-AUTH-016
- [ ] G3 — A refused switch surfaces org-specific copy, not the generic global-lockout message. `{HYPOTHESIS}`
- [ ] G7 — Single-org user whose only membership is locked → sign-in **succeeds with no org context**, not a refusal; account pages reachable. `{BL}` BL-AUTH-015
- [ ] G9 — A membership both locked **and** at a blocking status → the token layer returns the **lock** code (lock beats status). The two axes assert independently, never collapsed onto one indicator. `{BL}` BL-AUTH-016

## L8 — Sibling access preserved
- [ ] 8.a — All memberships locked → `/account/**` remains reachable, renders with no org context, no crash. `{BL}` BL-AUTH-015
- [ ] 8.b — V7 all-locked is a **dead end**: `/403` + `ApolloError: Access denied.`, the switcher still renders in the account menu with **every** row disabled including the `[disabled] [selected]` current org, no empty state, no unlock path. Dup-class of the open P0 `BUG-multiorg-no-self-recovery-when-pinned-org-blocked-VCST-5281` — **evidence on that bug, a new trigger (lock, not status), not a new filing.** Carrier `B2C-ORG-045`. `{OBSERVED}` Round 1
- [ ] **G20 (NEW, Round 2) — the clause-11 L7 gap.** This ticket's chain does not touch the domain's link 7 (*transacting under the org*), and exactly **one** authored row — `B2C-ORG-065`, `Draft`, never executed — guards `BL-B2B-001` (switch resets cart / ship-to addresses / lists / pricing). Put items in the cart under BuildRight, switch to TechFlow, assert the org-scoped context resets, switch back. A locked row that renders perfectly while the switch it guards leaks the previous org's cart would pass all 33 other rows. `{BL}` BL-B2B-001

## Not covered by this checklist — stated, because a blank reads as covered
- **The hide-vs-disable product decision** — out of scope by the model's own terms. This run reports the SHOW-AND-FLAG divergence from the shipped docs; it does not adjudicate it.
- **Cross-product consistency with Sales Rep's exclude-on-lock behaviour** (`SR-GQL-012/017/024/124`, `SR-CP-021`) — a UX-consistency call for the go/no-go owner, not a per-ticket pass/fail.
- **Full WCAG 2.2 AA audit** of the disabled affordance / padlock / tooltip — delegated whole to the visual lane (`ui-ux-expert`). G10 is the pointer, not the audit. Round 1's standing findings there: **F-A1** 1.4.11 focus ring 1.63:1 (preset-dependent, **pre-existing**, not introduced by #2469), **F-A2** 1.4.13 title shadowed by a nested `title` on 6 of 8 sample points + the row removed from tab order by native `disabled`, **F-A3** 4.1.2 listbox exposing 0 of 2 focusable options at V7.
- **Exhaustive enumeration of every consumer** of `contact.organizations` / `organizationsIds` — G17 covers the storefront-principal-reachable set; a source-level sweep of the unbounded remainder is out of scope and is named as such.
- **Customer-doc update** (the Storefront guide still says *"Only companies you currently have access to appear here"*, which is now false and contradicts its own preceding sentence) — a `ba-doc-writer` deliverable at 5h, not a test condition.
- **`statuses` argument values beyond `["Approved"]`, `["Locked"]` and the case variants** — held contract-side by `PRF-GQL-078`/`083`/`091`; extend those, never duplicate.
