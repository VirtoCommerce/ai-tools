# BUG — Inviting an existing, healthy, ACTIVE org member to a second organization immediately locks them out of the ENTIRE storefront · P0

**Env:** vcst-qa-storefront @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 011b (COMP-E2E-026) · triaged `REAL_BUG`, escalated to P0 by the case's own signal
**BL:** BL-AUTH-013 · same root cause as VCST-5281

## Summary

An **admin action against org B** (inviting a member) bricks a user's access to **org A**, where they were
already an approved, active member with no problems. Before the invite, `agent-test-sf-invite-1040@yopmail.com`
(Approved `purchasing-agent` in TechFlow) signed in normally. Immediately after `BUILDRIGHT_ADMIN` sent them
a BuildRight invitation, the **same credentials** land on `/403 Access denied` — so `/account/dashboard`,
the only page hosting the pending-invites widget, is unreachable and the BuildRight invite can never be
accepted through any UI path. The healthy TechFlow membership is also unreachable.

## Steps to reproduce

1. Confirm a user is an Approved, active member of Org A (sign in succeeds, full access).
2. From Org B, invite that same user (`inviteUser` / Admin "Invite customer").
3. Immediately re-attempt sign-in with the same credentials.

## Expected vs actual

**Expected:** the user continues to access Org A normally; the Org B invite sits pending, visible via the
`/account/dashboard` pending-invites widget once accessible.

**Actual:** sign-in redirects straight to `/403 Access denied`. The pending-invites widget is on the one
page now unreachable — **the user has no working acceptance path for the new invite, and no access to
their existing healthy org.**

## Root cause

`contact.currentOrganizationId` was `null` for this fixture. The invite immediately added BuildRight to
`contact.organizations` (**before acceptance**) — `[BuildRight, TechFlow]`. With `currentOrganizationId`
null, login resolves the active org from `contact.organizations[0]`, which is now BuildRight, where the
membership status is `Invited` (a blocking status) — and pins the session there **without validating the
blocking status**. This is the same unvalidated-pinned-org defect already root-caused in VCST-5281
(`contact.organizationId` never checked against `BlockingStatuses`), reached here through a third trigger:
an *invite to an unrelated org*, not a status/lock change on the org the user is actively using.

**Causality proven:** revoking the BuildRight invite (`DELETE` the membership + reset
`contact.organizations` to `[TechFlow]`) restored sign-in immediately with the same credentials.

## Fix Routing

- **Layer:** L3/L4 — `contact.currentOrganizationId`/`contact.organizations[0]` resolution at login
- **Repo:** `vc-module-customer` (`OrganizationIdClaimProvider` / `OrganizationIdRequestValidator`) — same
  component as VCST-5281's root cause
- **Suggested fix:** validate the resolved default org against `BlockingStatuses` before pinning the
  session to it; when the resolved default is blocking, fall through to the next non-blocking org in
  `contact.organizations`, or surface the switcher instead of `/403` with none.
- **Routing confidence:** HIGH — causality reproduced and reversed live.
- Do NOT auto-merge — human review required.

## Note

Related but distinct symptom family: `BUG-multiorg-no-self-recovery-when-pinned-org-blocked-VCST-5281.md`
(no working self-recovery via the switcher once pinned to a blocked org) and the parent ticket VCST-5281.
This report's specific contribution is the **trigger** — a routine invite to an unrelated org — which is a
new way to reach the same defect and was not previously documented.
