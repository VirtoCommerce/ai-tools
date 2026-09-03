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

## Verification 2026-08-05 — root cause FIXED; the invite-flow permutation is still unverified

**Env:** vcst-qa @ Platform **3.1055.0** · Customer **3.1021.0-pr-312-3aa7** · Theme
**2.55.0-pr-2412-7bfd** (contains `#2399`; `vc-module-customer#312` merged 2026-08-04 12:02Z).

**The named root cause is fixed.** This report's mechanism is that the resolved active org is pinned
*without* validating it against `BlockingStatuses`, so an org the invite just set to `Invited` becomes the
session's org. `#312`'s `OrganizationAccessResolver` now resolves over *accessible* orgs only
(`NOT IsCurrentlyLocked AND ResolveEffectiveStatus(...) ∉ {Invited, Rejected, Deleted}`).

Probed with `MULTI_ORG_TF_BR`, its currently-pinned org (TechFlow) set to `Invited`, BuildRight healthy:
a password grant with **no** `organization_id` returns **200 scoped to BuildRight** — the blocked org is
skipped, not pinned. Storefront control (both orgs healthy): sign-in lands on **`/` (200)** with the
**`/account/dashboard` link present** — the page this report identified as unreachable, and the only host
of the pending-invites widget.

**What is NOT verified, stated plainly:**

1. **The exact STR was not executed.** The blocking status was set **directly** on an existing membership
   rather than produced by a real invite from Org B. The invite path additionally *appends* the new org to
   `contact.organizations` (the report's `organizations[0]` ordering) and may set
   `currentOrganizationId`, so that ordering permutation remains untested. The shared root cause is
   demonstrably fixed; this specific sequence is inference, not observation.
2. **Invite acceptance was not confirmed end-to-end.** The report's sharpest consequence is that the
   invite *"can never be accepted through any UI path"*. The dashboard is now reachable, but accepting a
   pending invite from the widget was not exercised — UI clicks on this storefront repeatedly failed the
   MCP's 5 s element-stability check (keyboard submit worked).

**Recommended closing step:** run this report's STR verbatim — invite a healthy active Org-A member from
Org B, re-sign-in, and accept the invite from `/account/dashboard`. Suite `011b` `COMP-E2E-026` is the
covering case. Until then this stays in `open/`.

Fixture `MULTI_ORG_TF_BR` was restored to its captured baseline (`Approved`, `isLocked=false`,
`lockoutEnd=null`) and re-read to confirm.
