# VCST-5281 — Testing Checklist

**Ticket:** VCST-5281 (Story, Medium) — Organization Invite and Status for Multi Organization customers
**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a (all LIVE)
**Date:** 2026-07-29 · **Source PRs:** vc-module-customer#312 · vc-module-profile-experience-api#141 · vc-frontend#2399

## Status oracle (source-grounded — `ModuleConstants.MembershipStatuses`, `OrganizationMembership.ResolveEffectiveStatus`)

```
Legal values:          "Invited" | "Approved" | "Rejected" | "Deleted"   (ONLY these four)
BlockingStatuses    =  { Invited, Rejected, Deleted }   // effective status in this set ⇒ org sign-in/access BLOCKED
ReinvitableStatuses =  { Rejected, Deleted }            // an already-"Invited" membership is NOT re-invitable
EffectiveStatus     =  membership.Status ?? contact.Status ?? "Approved"
```

Only `Approved` grants org access. `Invited` is itself a **blocking** status. Storefront/Admin **display labels may differ**
from these raw values (i18n) — label parity is condition #3, and expected labels must be discovered live, never assumed.

## Live baseline measured before execution

- **All 132 `OrganizationMembership` rows have `status = null`** — the migration adds the column, backfills nothing;
  every existing membership's effective status therefore resolves through its **contact's** global status.
- Contact statuses (475 total): `Approved` 262 · **`Invited` 109** · null 56 · `New` 7 · `Locked` 41.
  Of the 109 `Invited`, 105 have a login account; 1 (`dg_test123@asdf.com`) also has a membership row.
- Canonical fixtures safe: `MULTI_ORG_USER` (Approved, 11 orgs, **0 membership rows** — legacy associations),
  `ORG_USER` (Approved, 1 membership: TechFlow / org-maintainer / status=null).
- All 3 new notification types registered + active, 1 global template each, **no languageCode** (English-only fallback real).
  Old types still registered. No store-scoped customization exists on this env.
- `organization-memberships/search` now **requires** a scoping filter (`userId`/`organizationId`) — undocumented contract change.

## Checklist (execution order — the flow is stateful)

**Coverage:** `COVERED` existing case suffices · `PARTIAL` exists but doesn't assert the new exact value · `STALE` asserts an old label · `GAP` nothing exists.
**Agent:** FE = `qa-frontend-expert` (storefront, chrome) · BE = `qa-backend-expert` (admin-SPA/REST/GraphQL/email, edge).

| # | Condition (exact expected value) | Layer | Agent | Existing case | BL | Pri |
|---|---|---|---|---|---|---|
| Pre | 3-org maintainer inviter setup | — | BE | **GAP** — no fixture qualifies | — | P0 |
| 43 | Non-admin: invite/resend/revoke control absent **and** mutation refused | SF+xAPI | FE+BE | PARTIAL `B2C-MBR-009` (button only) | B2B-005 | P1 |
| 1 | Invite new user to Org-1 ⇒ membership `Invited` | admin/SF | BE/FE | STALE `CUST-065/066`, `B2C-MBR-005` | B2B-009 | P0 |
| 2 | Storefront shows `Invited` | SF | FE | STALE `B2C-MBR-005` | B2B-009 | P0 |
| 3 | Admin shows `Invited`, label matches storefront | admin | BE | PARTIAL `CUST-085` | B2B-009 | P0 |
| 4 | Email sent via `OrganizationInviteNewUserEmailNotification` | email | BE | STALE `CUST-080/081` (old type names) | — | P0 |
| 5 | Register via invite link creates/activates account | SF | FE | STALE `B2C-MBR-007` ("Pending→Active") | B2B-009 | P0 |
| 6 | Post-registration storefront status = `Approved` | SF | FE | **GAP** | B2B-009 | P0 |
| 7 | Post-registration admin status = `Approved` | admin | BE | **GAP** | B2B-009 | P0 |
| **40** | Pre-existing contact, global `Rejected`/`Deleted`, no override ⇒ loses access to every org | xAPI/auth | BE | **GAP** — breaking change | new | **P0** |
| **41** | Membership override beats global: global `Rejected` + membership `Approved` ⇒ sign-in succeeds | xAPI/auth | BE | **GAP** | new | **P0** |
| 8 | Same user → Org-2 creates independent `Invited`; Org-1 untouched | admin/xAPI | BE | PARTIAL `CUST-064` | B2B-008 | P0 |
| 9 | Storefront: Org-2 `Invited` while Org-1 `Approved` | SF | FE | **GAP** | B2B-008 | P0 |
| 10 | Admin: same isolation | admin | BE | PARTIAL `CUST-064` | B2B-008 | P0 |
| 11 | Notification appears for Org-2 invite | email | BE | **GAP** | — | P1 |
| 12 | Widget lists Org-2 invite via `me.contact.organizations(statuses:["Invited"])` | SF | FE | **GAP** — query untested | B2B-009 | P0 |
| 42 | Old customized templates stop applying; new types English-only | email | BE | **GAP** | — | P0 |
| 13 | `rejectOrganizationInvite` ⇒ `Rejected` | xAPI | BE | **GAP** — mutation never exercised | B2B-009 | P0 |
| 14 | Storefront reflects `Rejected` | SF | FE | **GAP** | B2B-009 | P1 |
| 15 | Admin reflects `Rejected` | admin | BE | **GAP** | B2B-009 | P1 |
| 16 | Org-2 access refused (`Rejected` ∈ Blocking) | SF | FE | PARTIAL `AUTH-065` (lock case only) | AUTH-012/013 | P0 |
| 17 | Refusal redirects to login | SF | FE | **GAP** | — | P1 |
| 18 | Re-auth lands in `Approved` Org-1, not Org-2 | SF | FE | PARTIAL `AUTH-065` | B2B-008 | P0 |
| 19 | Re-invite after `Rejected` succeeds (∈ Reinvitable) | xAPI/admin | BE | **GAP** | B2B-009 | P1 |
| 20 | `Invited` NOT reinvitable ⇒ resend is the only path | xAPI | BE | **GAP** | B2B-009 | P1 |
| 21 | Widget re-appears after re-invite | SF | FE | **GAP** | — | P2 |
| 22 | Storefront shows `Invited` again | SF | FE | **GAP** | — | P1 |
| 23 | `acceptOrganizationInvite` ⇒ Org-2 sign-in works | xAPI/SF | BE→FE | **GAP** — mutation never exercised | B2B-009 | P0 |
| 24 | Lock in Org-2 leaves Org-1 untouched | admin/xAPI | BE | **COVERED** `CUST-088`, `B2C-MBR-020`, `AUTH-065` | B2B-008/A-012 | P0 |
| 47 | Org-B unaffected when blocked in Org-A | admin/xAPI | BE | **COVERED** + `B2C-MBR-028` | B2B-008 | P0 |
| 25 | Storefront+admin reflect blocked state | SF+admin | FE+BE | **COVERED** `B2C-MBR-012`, `CUST-088` | B2B-005 | P1 |
| **26** | Locked sign-in ⇒ code `user_is_locked_in_organization`, never global codes (**VCST-5374 regression**) | SF/xAPI | FE+BE | **GAP at code level** — `AUTH-065` asserts DOM copy only | AUTH-013 | **P0** |
| 27 | Sign-in to unaffected Org-1 still succeeds | SF | FE | **COVERED** `AUTH-065` | AUTH-012 | P0 |
| 28 | Unlock restores access | admin/xAPI | BE | **COVERED** `B2C-MBR-011/021` | B2B-005 | P1 |
| 29 | Post-unlock sign-in succeeds | SF | FE | PARTIAL — re-login not re-verified | AUTH-012 | P1 |
| 46 | Live session force-terminated on mid-session block? | xAPI/SF | BE→FE | **GAP** | AUTH-012 | P1 |
| 30 | Same user → Org-3 independent `Invited` | admin/xAPI | BE | **GAP** — no 3-org fixture | B2B-008 | P2 |
| 31 | Storefront+admin show `Invited` for Org-3 | SF+admin | FE+BE | **GAP** | B2B-008 | P2 |
| 32 | `revokeOrganizationInvite` ⇒ **record actual resulting value** (undocumented) | xAPI | BE | **GAP** | B2B-009 | P1 |
| 33 | Storefront+admin reflect revoke | SF+admin | FE+BE | **GAP** | B2B-009 | P2 |
| 34 | Org-3 access refused after revoke | SF | FE | **GAP** | AUTH-012/013 | P1 |
| 35 | Re-invite to Org-3 after revoke succeeds | xAPI/admin | BE | **GAP** | B2B-009 | P2 |
| 36 | Revoke again succeeds | xAPI | BE | **GAP** | B2B-009 | P2 |
| 45 | Stale invite after org deleted fails gracefully, no orphan | xAPI | BE | **GAP** | B2B-009 | P2 |
| 37 | Delete user removes **ALL** memberships, not just one | admin/xAPI | BE | **GAP** (`CUST-052` unrelated) | B2B-008 | P0 |
| 38 | Deleted user absent from **every** org's member list | SF | FE | **GAP** | B2B-008 | P1 |
| 39 | Deleted user's admin status across all orgs | admin | BE | **GAP** | B2B-008 | P2 |
| 44 | Migration backfill parity MySql/PostgreSql/SqlServer | — | — | **NOT VERIFIABLE** here (single provider) | — | P1 |

**Open question the agents must resolve, not assume (C-32):** nothing in the source states which of the four legal
statuses `revokeOrganizationInvite` transitions *to*. Record the observed value before treating it as an oracle constant.

## Prerequisites

1. **3-org maintainer inviter — was blocking.** No account on this env is org-maintainer in ≥3 orgs (best: maintainer in
   2 of 4), so the developer walkthrough's premise required provisioning `AGENT-TEST-` orgs + maintainer memberships.
2. **Invitee emails:** fresh `AGENT-TEST-` prefixed address per condition — the flow is one-shot per email; never reuse.
3. **Email retrieval** (QA delivers no outbound mail): Admin SPA → Notifications → activity feed → row → **Preview**,
   or REST `POST /api/notifications/journal`. Do not use `GET /api/notifications/types` (returns `null`).
4. Agents run on disjoint fixtures: FE owns `ORG_USER` + TechFlow; BE owns its own `AGENT-TEST-` orgs.

## Permanent regression coverage to land after this run

| Target suite | Add |
|---|---|
| `Backend/customer/027-customer-orgs-invites.csv` | `CUST-09x` — exact-status assertions for #1/3/7/8/10/13/15/19/20/30/32/35/36/37/39/40/41/45 |
| `Backend/graphql/050d-graphql-xprofile.csv` | `PRF-GQL-*` — the 4 new mutations, `organizations(statuses:)` incl. invalid non-enum input, `ContactType.status`/`statusInOrganization`/`isLockedInOrganization`, `Organization.status`/`myStatusInOrganization`, error-code assertion for #26 |
| `Backend/notifications/057-notifications-templates.csv` | new invite type names, English-only fallback (#42), org-scoped invite email content (#4/#11) |
| `Frontend/b2b/008-b2b-members.csv` | `B2C-MBR-03x` — `[JOURNEY]` #12→#23 pending-invite→active, exact label rendering, refusal copy + redirect (#16/#17), deleted-user absence (#38) |
| `Frontend/auth/032-auth-session-rbac.csv` | extend — status-based (not lock-based) org refusal (#16/#18/#34), mid-session token revocation (#46) |

## Not verifiable on this environment

| # | Reason |
|---|---|
| 44 | vcst-qa runs a single DB provider. Multi-provider backfill parity needs `/qa-local-env` against each of postgres/mysql/sqlserver, or a CI job reading each provider's post-migration table state. |
