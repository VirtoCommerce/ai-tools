# Exploratory Session: Company roles configurable per store — settings-v2 seam

**Date:** 2026-09-07 · **Duration:** ~30 min (agent box) + ~15 min orchestrator API probes
**Env:** vcst-qa · **Platform:** 3.1063.0 (login-page HTML) · **Customer:** 3.1023.0 · **Theme:** 2.57.0-pr-2452
**Session type:** [EXP] · **Lane:** playwright-edge · **Technique:** Feature-pair matrix + State Transition
**Charter:** EXP-03 from `sprint-26-17-summary.json` §5.3 — anchor VCST-5450 / GAP-05, signals C2+C3. VCST-5450 confirmed **deployed** by live settings probe, not by version arithmetic.
**Edge-Case Refs:** ECL-14.1, ECL-14.3 (hunted) · **BL Refs:** BL-B2B-005/008/009/011/013, BL-CROSS-008 (judged against)

## Net-New Scenarios Discovered

| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Next charter |
|---|---|---|---|---|---|---|
| 1 | `assignableRoles` with `storeId` **omitted** vs named vs bogus | Contract-shape question; no suite asserts on arg optionality | **Omitting the optional `storeId` does NOT fall back to the caller's own authenticated store.** Same session (token minted `storeId=B2B-store`): omitted → **3** roles; `storeId:"B2B-store"` → **4** (incl. `Advanced Sales Representative`). A **nonexistent** `storeId:"NOT-A-REAL-STORE"` → 200, 3 roles, **no error**. And 3 is not allow-all: global whitelist is `allowedValues:[]` (= all, per BL-B2B-011) while the platform carries **60** roles | **NONE** → Oracle Feedback | **PROMOTE** — suite `050d`. "`assignableRoles` omitted / store A / store B / bogus store on one org: assert each set matches the named store, omission is not silently a third set, and a bogus id is rejected" | EXP-03a |
| 2 | `contactRoles(storeId)` honours its own argument | Same | **`storeId` is inert on `contactRoles`** — identical 5-role set for omitted, `B2B-store`, `Electronics` and a bogus id. Declared per-store, honoured nowhere | **NONE** → Oracle Feedback | **PROMOTE** — suite `050d`, same shape as #1 | EXP-03a |
| 3 | Storefront Edit-role dialog on a member holding **2 or more** roles | 027/027b cover change-role as single-role only; no case seeds a multi-role membership | Dialog is a **single-select radio group** while `InputChangeOrganizationContactRoleType.roleIds` is `[String!]`. A member holding `Organization employee, Purchasing agent` renders only the first as `[checked]`; saving would silently drop the second. **Measured corpus-wide: 2 of 228 memberships hold more than one role** — the premise is real, not hypothetical. Save deliberately **not** taken (shared data) | **NONE** → Oracle Feedback | **PROMOTE** — suite `027b`. "Seed a membership with two whitelisted roles; open Edit role; assert every held role is represented and pre-selected, and that Save round-trips the full `roleIds` set" | — |
| 4 | A membership already holds a role the store dictionary **forbids** | No suite asks what a whitelist does to **existing** data; every case assigns then reads back | **40 of 228 memberships (17.5%) across 199 orgs hold a role absent from EVERY store's dictionary** — `Sales Representative`, `Store manager`, `Task Manager role`, `Task manager`, `Organization manager`. The grid displays them; the picker cannot offer them. Compounds #3: membership `d4dbc327…` holds `Sales Representative + Task manager` — two non-whitelisted roles inside a single-select control | **NONE** → Oracle Feedback | **PROMOTE** — suite `027b` + a read-only audit case | EXP-03d |
| 5 | Per-store axis applied to only one half of a documented pair | Suites predate the per-store axis | `Customer.MembershipRolesWhitelist` exists `objectType:"Store"` on all 6 stores; `Customer.OrganizationRolesWhitelist` has **no per-store counterpart** and stays global + empty. They also differ on `isPublic` (`true` vs `false`), so the org-level half is unreachable from the storefront by construction | `BL-B2B-011` (contradicts its symmetry claim) | **PROMOTE** — settings-contract case | — |
| 6 | Admin SPA login page vs the accessibility tree | Not an a11y-charter surface; no suite snapshots the login blade | `browser_snapshot` at depth 14 returns only `generic [active]` with no children, and a find for `Login`/`Password`/`Sign in` matches nothing, while the screenshot shows a fully rendered `Login *` / `Password *` / `Log in` card. Two independent probes agree | **NONE** → Oracle Feedback (a11y) | **DECLINE** for `027b` — belongs to an a11y/tooling charter. But it is a hazard for **every** agent-driven Admin SPA suite | EXP-03b |

## Oracle Feedback

| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new `BL-*` | *Which store's dictionary scopes a storeless membership picker* — the charter's central question. No invariant governs it. Live: `assignableRoles` honours a named store but **not** the session's store on omission; `contactRoles` ignores the arg entirely | #1, #2 | `/qa-review-oracles bl` |
| Candidate new `BL-*` | *A membership's `roleIds` is a SET; any editor of it must represent and round-trip every held role.* A single-select control over a multi-valued field is data loss. Sits beside `BL-B2B-008`, which scopes *where* a change lands but says nothing about *preserving the set* | #3 | `/qa-review-oracles bl` |
| `BL-B2B-011` amendment | It models the two whitelists as a symmetric independent pair. Live they are asymmetric on **two** axes (per-store existence, `isPublic`). Separately, its "empty = allow ALL" clause does **not** hold at the xAPI layer — empty global plus omitted `storeId` yields 3 of 60 roles | #1, #5 | `/qa-review-oracles bl` |
| Candidate new ECL pattern | *A whitelist restricts assignment but not existing data — pre-existing entities keep out-of-dictionary values and the editing surface silently rewrites them.* Generalises past roles (currencies, languages, payment methods) | #4 | `/qa-review-oracles ecl` — near ECL-14.3 |

## Bugs Found

| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | **High** | Storefront Edit-role dialog is single-select; a member holding two roles loses one on save with no warning | `screenshots/EXP-03-role-picker-radio-vs-two-roles.png` | Yes |
| 2 | **High** | `assignableRoles` accepts a nonexistent `storeId` with 200 and returns a default 3-role set; omitting the arg ignores the caller's own store | orchestrator probe — §Net-New #1 | Yes |
| 3 | Medium | `contactRoles(storeId)` declares a per-store argument and honours it nowhere | orchestrator probe — §Net-New #2 | Yes |
| 4 | Medium | 40 of 228 memberships hold a role absent from every store dictionary; no surface preserves or flags it | orchestrator sweep — §Net-New #4 | Yes |
| 5 | Medium | Company members grid renders the literal string `Invite sent` in the Name cell while Active shows `Active` — a placeholder leaking into Name, incoherent with the status axis (`BL-B2B-013`: status and lock are separate axes) | `screenshots/EXP-03-role-picker-radio-vs-two-roles.png` | Yes |
| 6 | Medium | Admin SPA login page exposes an empty accessibility tree — the form renders but carries no accessible roles or names | `screenshots/EXP-03-admin-spa-login-blank.png` | Yes |
| 7 | Low–Med | Storefront white-labeling favicon 404 x5 — `.../favicon_organization-double-quotes_…jpg`; an org name containing a double quote was slugified into the asset name and never round-tripped. Corroborated: orgs `"Müller" % Schmidt GmbH` and `"Quoted" Double Quotes` both exist | console errors, storefront home post-login | Probably pre-existing |

## Charter scenarios — coverage

| # | Charter scenario | Status |
|---|---|---|
| 1 | Divergent per-store sets, then switch store — active dictionary or cached Initialize-Applications payload? | **COVERED (storefront half)** — the picker matches the **active** store exactly (4 roles incl. the discriminating one), not a cached global payload. Extended at the API layer by #1/#2. **NOT REACHED:** Admin-SPA half and the post-switch re-read — the storefront is one store per host, so an actual store *switch* is only reachable in the Admin SPA, whose login was not completed (Bug 6) |
| 2 | Change a member's role while that store's dictionary is mid-edit in a second Admin session | **NOT REACHED** — needs two authenticated Admin SPA sessions; blocked by Bug 6 |
| 3 | Store with an EMPTY dictionary — allow-all fallback (`BL-B2B-011`) or silent deny-all? | **NOT REACHED as a picker read.** Partially answered at the API layer: empty global plus omitted `storeId` returns 3 of 60 roles — **neither** allow-all nor deny-all. Deliberately not tested by emptying a live store's dictionary (shared state); the safe route is the disposable store `test_del`, next session |

## Risk Areas

- **The seam is the editor and the argument, not the dictionary.** Both surfaces read a dictionary correctly when told which one; the damage is in representing a multi-valued field, and in what an omitted or bogus `storeId` silently resolves to.
- **Asymmetric `storeId` honouring across the four seam operations** — `assignableRoles` partial, `contactRoles` inert, `changeOrganizationContactRole` optional and unprobed, `inviteUser` required. Any caller that omits it gets 200 and an unknown dictionary.
- **Existing out-of-dictionary data is unaudited** (17.5% of memberships, nothing reports them), and **half of a documented pair moved** — the org-level whitelist is global-only and not storefront-visible at all.

## Observations

- Content lives in `allowedValues` with `value: null` on every store — `BL-B2B-011`'s "never `value`" clause holds. No `ECL-14.3` row-3 stale-after-reload observation was made, so nothing was misfiled as a defect.
- API notes: `GET /api/stores` is 405 (search is POST-only); `/api/customer/organization-memberships/search` requires a scoping filter and takes `organizationIds`, not `organizationId`. Storefront console on the members page was clean apart from Bug 7; all 11 `/graphql` calls returned 200, but their payload `errors[]` were **not** inspected per `ECL-14.1` — stated gap.

## Corrections to the agent's own report

Two agent-reported blockers were **refuted** on orchestrator re-check, and both were tooling assumptions rather than product defects — so charter scenario 4's API probe was never actually blocked, and running it is where net-new #1 and #2 came from.

- **"`/connect/token` store gate regressed, blocks all API org testing" — REFUTED.** The parameter is **`storeId` (camelCase)**; the agent used `store_id`. `storeId=B2B-store` returns **200**. `reference_connect_token_org_scoped` was correct all along — it specifies camelCase `storeId` *and* snake_case `organization_id` as two different params — and needs no edit.
- **"`@td(MULTI_ORG_TF_BR)` is dead on vcst-qa" — REFUTED.** The contact exists (`85d1aeea-ee57-4041-9c18-c16431fe23ec`, "AgentTest MultiOrg") in both AGENT-TEST orgs exactly as the alias documents. `POST /api/members/search` just does not index that field — even the keyword `multiorg` returns 0. The DV-022 fixture is healthy; the members-search behaviour is the note worth keeping.

## Questions for the Team

1. Is a membership intended to hold **multiple** roles? The grid renders two, the API takes a list, the picker takes one.
2. Was omitting per-store `OrganizationRolesWhitelist` deliberate, or does VCST-5450 have a second half?
3. What should happen to a membership holding a role its store no longer allows — preserve, flag, or migrate?
4. Is `storeId` optional on `changeOrganizationContactRole` on purpose, given `inviteUser` requires it — and should a bogus `storeId` return 200?

## Charter-from-Gap (next-session candidates)

- **EXP-03a** — `changeOrganizationContactRole` with `storeId` omitted or bogus: does the **mutation** accept a non-whitelisted role (BL-B2B-011 says server enforcement is unimplemented), and which dictionary does it validate against?
- **EXP-03b** — Admin SPA Contacts → Organization memberships picker: which dictionary scopes it with no active store? (Charter scenario 1's admin half plus scenario 2's concurrent-edit race.) Same session: empty-dictionary fallback on the disposable store `test_del`, `allowedValues` recorded and restored.
- **EXP-03d** — Read-only audit sweep of every membership holding a role absent from its store's dictionary (baseline 40/228).

**Store settings changed:** none. All reads. No `PUT /api/stores`, no `POST /api/platform/settings`. No tracker item filed, no oracle edited, no CSV written.
