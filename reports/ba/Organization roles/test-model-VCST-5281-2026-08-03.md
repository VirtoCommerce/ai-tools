# Test Model — VCST-5281 "Organization Invite and Status for Multi Organization customers"

**Scope:** Test-design model (not a case CSV) built on top of the 2026-08-03 BA sweep + 07-29 QA run.
**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a

## Executive Summary

VCST-5281's two ACs are unmeasurable as written; the real spec is 47 QA-synthesized conditions plus two live P0s
(claim-provider/validator asymmetry; no storefront self-recovery) that have no PR covering them. VCST-5496
(Done, PR #308, released 3.1016.0) already fixed the *lock*-based version of this exact failure mode in
`OrganizationIdRequestValidator`; VCST-5281 extends the same accessible-org filter to *status* but never
propagated the fix into `OrganizationIdClaimProvider`, so 5281 does not supersede #308 — it reopens the same
class of bug through a sibling mechanism. The test model below reduces the status×lock×org-count cross-product
to ~20 defensible cells (from a raw ~540), ranks P0 around the two open bugs and the 105-account migration
blast radius, and maps every condition to existing suites vs net-new rows so nothing already covered gets
re-authored.

## Rewritten Acceptance Criteria

1. **AC1 (status visibility):** A contact's storefront- and admin-displayed organization status for org X equals
   `EffectiveStatus(membershipX) = membershipX.Status ?? contact.Status ?? "Approved"`, using the label mapping
   `Approved→Active, Deleted→Inactive, Invited→Invited, IsLocked→Blocked` — consistently between Admin (raw value)
   and storefront (mapped label) for the same membership.
2. **AC2 (multi-org invite):** Inviting an existing, active customer (identified by email) into org Y creates an
   independent `OrganizationMembership` row for (userId, orgY) with status `Invited`, leaving every other org's
   membership for that contact untouched (BL-B2B-008/009), and the resulting session **must remain able to
   authenticate into any org where the contact is not blocked** — i.e. the invite is additive, never regressive.
3. **AC3 (gap, P0):** A blocked/unapproved status on the session's auto-resolved org MUST NOT deny access to a
   *different* org the contact can otherwise use — either by falling through to a healthy org or by exposing a
   working switcher on the denial page.
4. **AC4 (gap, P1 — breaking-change):** A pre-existing contact whose *global* `Contact.Status` is `Invited`/
   `Rejected`/`Deleted` and who has no per-org membership override loses access to every org after this change;
   this must ship with a data-remediation plan, not silently regress ~105 live accounts.
5. **AC5 (gap):** `revokeOrganizationInvite`/`rejectOrganizationInvite` resolve to a documented, single legal
   status value (record the observed value — not previously specified anywhere in source).
6. **AC6 (gap):** Deleting a user removes **all** of that contact's `OrganizationMembership` rows, not just the
   one in the org where the delete was initiated.
7. **AC7 (gap):** The three new notification types render with org-scoped content and, absent a per-store
   template, fall back to the documented English-only default — never silently reuse the retired template's
   customization.
8. **AC8 (gap):** `organizations(statuses:)` GraphQL filter and `Contact.status`/`statusInOrganization`/
   `isLockedInOrganization`/`Organization.myStatusInOrganization` resolve for the **queried** contact/org, not the
   caller's own (see C-P3 finding — `myStatusInOrganization` currently returns the caller's status).

## Context Gaps Closed (beyond the 08-03 sweep)

- **VCST-5496 vs VCST-5281:** VCST-5496 (Bug, Done, `vc-module-customer` PR #308, released `3.1016.0`) fixed
  exactly the *lock* variant of this defect: `OrganizationIdRequestValidator` now falls back to a non-locked org
  when the **auto-resolved** org (`CurrentOrganizationId`→`DefaultOrganizationId`→first) is `IsCurrentlyLocked`,
  and still blocks on an *explicit* locked `organization_id` or when every org is locked. VCST-5281 generalizes
  the same validator-side filter (`GetAccessibleOrganizationIdsAsync`) to cover `BlockingStatuses` too — but the
  fix does not supersede #308 end-to-end: it reopens the identical failure MODE (unvalidated pinned org) via a
  **second, parallel resolver** (`OrganizationIdClaimProvider`) that #308 never had to touch, because #308's
  fallback lived entirely inside the validator and the claim provider re-resolves independently. Net: **#308's
  regression-guard tests do not exercise the claim-provider path at all**, so this is a genuine coverage gap
  the 5496 test suite should have caught structurally and didn't.
- **Sibling tickets under VCST-5142:** queried all 24 children of the Sales Rep Hub epic — none carve out any
  slice of the org-invite/status surface; they are dashboard/customer-profile/lists/widget stories (VCST-5304,
  -5308, -5362, -5367/5368, -5586..-5592, etc.), all separate concerns (mostly Done or in review). VCST-5281 is
  the sole owner of this scope within the epic — no parallel ticket to reconcile against.
- Nothing else in the 08-03 sweep needed correction.

## Entity/State Model

`EffectiveStatus(membership) = membership.Status ?? contact.Status ?? "Approved"`. Lock (`IsLocked`/
`IsCurrentlyLocked`) is a **second, independent** blocking predicate (VCST-5028/5496) OR'd with
`BlockingStatuses.Contains(EffectiveStatus)` inside `GetAccessibleOrganizationIdsAsync`. Because
`membership.Status ?? contact.Status` already collapses "membership row exists with override" vs "no row /
no override" into one derived value, **membership-row-existence is not an independent axis** — it is subsumed
by which side of `??` supplied the value (documented reduction, not a silent drop).

| Reachable in product | Contact.Status | Membership.Status | Resolved EffectiveStatus |
|---|---|---|---|
| Yes | Approved/null | null (pre-migration: ALL 132 rows) | Contact.Status wins |
| Yes | any | Invited/Approved/Rejected/Deleted (post-fix writes) | Membership.Status wins |
| Yes (env anomaly) | `"Locked"`/`"New"` (41+7 accounts, not in the legal 4-value set) | null | **Unrecognized string** — not in `BlockingStatuses`, so it is *silently treated as non-blocking* even though a separate legacy field may say otherwise. New edge case (§Decision Table row U1). |
| Unreachable | — | anything | `EffectiveStatus` is never independently "both blocked" by two DIFFERENT statuses — only one value survives `??` |

## Layer Map

| Layer | Repo | Owns |
|---|---|---|
| L4 REST + token pipeline | `vc-module-customer` | `OrganizationMembership`/`Contact` models, `/connect/token` auth pipeline (`OrganizationIdRequestValidator`, `OrganizationIdClaimProvider`), Admin SPA blades (org memberships widget), invite/accept/reject/revoke/resend REST |
| L3 xAPI GraphQL | `vc-module-profile-experience-api` | `organizations(statuses:)`, `Contact.status/statusInOrganization/isLockedInOrganization`, `Organization.status/myStatusInOrganization`, the 4 invite mutations, notification trigger wiring |
| L1 Storefront | `vc-frontend` | dashboard/members/confirm-invitation/pending-invites-widget, org switcher, `/403` landing (**not touched by #2399 — the gap**) |

## Coverage Dimensions (EP / BVA / Decision Table / State Transition)

1. **EffectiveStatus value** (EP, 5 classes): Approved(baseline) · Invited · Rejected · Deleted · unrecognized-legacy(BVA: out-of-domain string)
2. **Lock state** (EP, 3 classes, independent OR'd predicate): not-locked(baseline) · temporarily-locked(`IsCurrentlyLocked`, future `lockoutEnd`) · permanently-locked
3. **Alt-org reachability** (EP, 3 classes, outcome modifier only): no-alt(single-org) · alt-exists-healthy(multi-org) · alt-exists-also-blocked(all-blocked)
4. **Session state at trigger time** (state-transition): already-signed-in(pinned mid-session) vs fresh-sign-in(token grant) — the two bug reports show these diverge (case 1 vs case 2)
5. **Precedence/override** (2 boundary cells only): membership override beats contact global (Rejected-global + Approved-override) · no membership row exists (legacy-association-only)
6. **Status transition path** (state machine): `Invited →{accept→Approved | reject→Rejected} →{revoke→?(undocumented) | re-invite(only from Reinvitable={Rejected,Deleted})→Invited}`

## Reduced Decision Table (cause-effect, ~20 cells from a raw ~540)

**Reduction technique:** one-factor-at-a-time on the two independently-OR'd blocking predicates (status, lock),
plus explicit boundary cells for precedence and the session-state divergence — not a full cross-product, since
status×lock don't interact (they only OR into one boolean "blocked"). Dropped: full membership-row × status
cross (subsumed by `??` precedence, tested at 2 cells only, §Entity model).

| # | EffectiveStatus | Lock | Alt-org | Session state | Expected outcome | Oracle |
|---|---|---|---|---|---|---|
| D1 | Approved | not-locked | n/a | any | full access, baseline | {BL} BL-AUTH-012/013 |
| D2 | Invited | not-locked | no-alt | fresh sign-in | refused, `user_invitation_pending_in_organization`-class code | {OBSERVED} C-40 |
| D3 | Invited | not-locked | alt-healthy | already signed-in | **case 1: pinned to blocked org, `/403`, no switcher** | {OBSERVED} P0 bug #1 |
| D4 | Invited | not-locked | alt-healthy | fresh sign-in | **case 2: refused outright, no session** | {OBSERVED} P0 bug #2 |
| D5 | Invited | not-locked | all-blocked | any | refused, no fallback possible | {HYPOTHESIS} |
| D6 | Rejected | not-locked | no-alt | any | refused, `user_is_rejected_in_organization` | {OBSERVED} C-40 |
| D7 | Deleted | not-locked | no-alt | any | refused | {HYPOTHESIS} |
| D8 | Approved | temp-locked | no-alt | any | refused, `user_is_locked_in_organization`, global untouched | {BL} BL-AUTH-012/013 |
| D9 | Approved | temp-locked | alt-healthy | already signed-in | validator-side fallback works (VCST-5496 fix) — **does claim provider match?** | {OBSERVED}+{HYPOTHESIS} |
| D10 | Approved | perm-locked | alt-healthy | fresh sign-in | fallback issues token for alt org (5496 regression baseline) | {BL} BL-AUTH-012 |
| D11 | Invited | perm-locked | alt-healthy | any | combined-blocking: one code wins, document which | {HYPOTHESIS} |
| D12 | unrecognized("Locked"/"New") | not-locked | no-alt | any | **not in `BlockingStatuses` → falls through as non-blocking** (edge case, likely defect) | {OBSERVED} entity model anomaly |
| D13 | Rejected(global) + Approved(override) | not-locked | n/a | any | override wins, access succeeds | {BL} membership precedence |
| D14 | Invited(global, no membership row) | not-locked | no-alt | any | refused, no override path exists (104/105 accounts) | {OBSERVED} C-40 refinement |
| D15 | n/a (transition) | — | — | `revokeOrganizationInvite` | resolves to exactly one legal value — **record it** | {SPEC-gap} AC5 |
| D16 | n/a (transition) | — | — | re-invite after Rejected/Deleted | succeeds (Reinvitable) | {SPEC} status oracle |
| D17 | n/a (transition) | — | — | re-invite while still Invited | rejected/no-op — only resend works | {SPEC} status oracle |
| D18 | n/a (delete) | — | multi-org | delete user | ALL membership rows removed, not just current org's | {BL} AC6 (gap) |
| D19 | Approved | not-locked | 3rd org invite | any | independent `Invited` for org-3, orgs 1–2 untouched | {BL} BL-B2B-008 |
| D20 | any blocking | not-locked | — | notification | 3 new types fire with org-scoped content, English fallback if no store template | {SPEC} comment 2 |

## Per-Layer Test Conditions (oracle + provenance)

| Layer | Condition | Oracle | Provenance |
|---|---|---|---|
| L4 REST/token | `/connect/token organization_id=X` for each D1–D14 cell | error code / 200 + claim value | {BL}/{OBSERVED} |
| L4 Admin SPA | Org-memberships widget shows raw status matching L4 REST | admin blade | {OBSERVED} CUST-085 |
| L3 GraphQL | `organizations(statuses:["Invited"])`, `Contact.statusInOrganization`, `isLockedInOrganization`, `Organization.myStatusInOrganization` for the *queried* contact | schema + live | {SPEC-gap} — not yet in `graphql-schema.md` (PR #141 unmerged; refresh post-merge) |
| L3 mutations | `inviteUser`, `acceptOrganizationInvite`, `rejectOrganizationInvite`, `revokeOrganizationInvite`, `resendOrganizationInvite` | mutation result + resulting membership row | {SPEC}/{OBSERVED} |
| L1 storefront | status label mapping, pending-invites widget, `/403` self-recovery (D3/D4), sign-in error copy | rendered DOM | {OBSERVED} + {BL} BL-AUTH-013 |
| E2E | full invite→register→status→block→unblock→delete journey (comment-1's 28 steps) | cross-layer | {SPEC} comment 1 |

## Risk-Ranked Priority

- **P0** — D3/D4 (the two open, unowned bugs: claim-provider asymmetry, no self-recovery) — no PR covers either;
  D8–D11 (regression risk against VCST-5496's already-shipped fix, since 5281 touches the same validator);
  D14/AC4 (105-account breaking-change blast radius, migration backfills nothing).
- **P1** — D6/D15/D16/D17 (status-transition correctness: reject/revoke/re-invite semantics, several currently
  GAP — mutations "never exercised" per the checklist); AC7 (notification-type swap silently drops customer
  customizations); D18/AC6 (delete-user cascade).
- **P2** — D19 (3rd-org fixture flows), D12 (unrecognized-status anomaly — real but low-likelihood, env data
  artifact rather than a code path under active development), AC8's `myStatusInOrganization` wrong-contact bug,
  a11y findings.

## Test-Data / Fixture Requirements

- `@td(MULTI_ORG_TF_BR.email/.password)` — **real membership rows** in TechFlow+BuildRight; use for every
  D-row that performs a membership *mutation* (lock/unlock/invite/role-change/revoke) — per DV-022, `{{MULTI_ORG_USER_EMAIL}}`
  has **zero** `OrganizationMembership` rows (legacy `contact.organizations` associations only) and cannot be
  used for D8–D11/D13/D18.
- `{{MULTI_ORG_USER_EMAIL}}`/`.PASSWORD` — org-switcher / global-status-only cases (D6/D7/D14, legacy-association
  path) where the point is the **absence** of a membership row.
- **GAP — no 3-org maintainer/inviter fixture exists** (checklist "Pre" row); needed for D19 and the full
  comment-1 walkthrough. Recommend `/qa-generate-data` author an `AGENT-TEST-` 3-org set with a maintainer
  membership in all three, isolated from `MULTI_ORG_TF_BR`.
- **GAP — no controlled fixture for "global-blocking-status + no membership row"** (D14) other than the 104
  real at-risk vcst-qa accounts, which are not reproducible/regression-safe. Recommend a dedicated
  `AGENT-TEST-` contact seeded with `Contact.Status=Invited` and zero membership rows.
- Fresh `AGENT-TEST-`-prefixed invitee email per invite condition (one-shot flow, never reuse — checklist
  prerequisite 2).
- **Isolation:** switching orgs persists `contact.organizationId` **server-side**, survives a fresh browser
  context, and is not resettable via `PUT /api/members`. FE and BE agents MUST run on disjoint fixtures
  (checklist prerequisite 4) — this applies equally to any parallel `test-runner-agent` slot picking up these
  suites later; do not let two parallel runs share `MULTI_ORG_TF_BR`.

## Regression-Suite Mapping (net-new vs existing)

Existing coverage spot-verified live in this pass (not re-derived, just confirmed present): `CUST-064/065/080/085/088`
(`Backend/customer/027-customer-orgs-invites.csv`), `B2C-MBR-005/009/011/012/020/021/028`
(`Frontend/b2b/008-b2b-members.csv`), `AUTH-065` (`Frontend/auth/032-auth-session-rbac.csv`). These are STALE/PARTIAL
against the new exact-status contract (see testing-checklist.md's Coverage column) — do not duplicate, extend in place.

**Net-new rows to author** (already scoped by the 07-29 checklist, reconfirmed here — no duplication):
`Backend/customer/027-*` `CUST-09x` (D1–D14/D18/D19 exact-status assertions), `Backend/graphql/050d-*` `PRF-GQL-*`
(D-row L3 conditions + AC8), `Backend/notifications/057-*` (AC7), `Frontend/b2b/008-*` `B2C-MBR-03x` (D2–D4 journey
+ label parity), `Frontend/auth/032-*` (D3/D4/D8-D11 status-based org refusal, mid-session revocation).

## Explicit Non-Testable / Blocked List

| Item | Reason |
|---|---|
| D3/D4 root-cause confirmation beyond HIGH confidence | Needs the exact `/connect/token` grant payload (explicit vs auto-resolved `organization_id`) captured at the wire — open question #1 in the 08-03 sweep |
| Full D1–D20 exact-status suite execution | Blocked until #312/#141/#2399 merge — currently testing a moving PR head, and D3/D4 (P0) make the accept/reject journey unexplorable past the blocking point |
| Multi-DB-provider migration-backfill parity (checklist #44) | vcst-qa runs one provider; needs `/qa-local-env` against postgres/mysql/sqlserver each, or a CI job |
| D12 (unrecognized-status anomaly) root cause | Requires reading `ResolveEffectiveStatus`/`BlockingStatuses.Contains` against a live "Locked"/"New" contact — not yet done this pass |
| `OrganizationIdClaimProviderTests` gap closure | Dev-side unit-test authoring, not a QA suite condition — flagged for the fix, not modeled as a regression case |

## BL Drafts (NOT applied to business-logic.md — response-only per instructions)

- **PROPOSED-BL-AUTH-015** (draft): "The org pinned into an access-token session must be validated against
  `BlockingStatuses` by *every* resolver in the auth pipeline that can independently mint the org claim
  (validator AND claim provider), not just the one invoked first." Source: {OBSERVED} root-cause chain in
  `reports/ba/ba-report-2026-08-03.md` §4 + the two open bug reports. This generalizes BL-AUTH-013 (which QA
  already recorded as violated) into a structural rule about resolver symmetry — recommend triangulating via
  `/qa-review-bl` once #312 merges, not applying now (PR unmerged, moving target).
- **STALE-CANDIDATE:** none — BL-AUTH-012/013 text is still accurate; the violation is implementation, not a
  stale oracle statement.
