# BUG — Multi-org users have NO working self-recovery once pinned to a blocked org — corrects VCST-5281's documented P1/P2 blast radius · P0

**Env:** vcst-qa-storefront @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 011b (COMP-E2E-005, COMP-E2E-025) · triaged `REAL_BUG`, both escalate to P0 by their own case signals
**BL:** BL-AUTH-013 · same root cause as VCST-5281

## Summary — corrects `reports/tickets/Sprint26-15/VCST-5281/summary.json`

That ticket's `p0_blast_radius.multi_org_user` documents multi-org users as "P1/P2 — misrouted, not
stuck... the header account menu and org switcher stay functional on /403, so selecting an Approved org
recovers full access without signing out." **This run found two independent ways that mitigation fails —
a multi-org user with one blocked org membership is exactly as stuck as a single-org user (COMP-E2E-024,
the ticket's own documented P0).** The `bugs_pending_confirmation` list should be updated: the "recovers
via the switcher" claim does not hold on this build.

## 1. No self-recovery on the `/403` landing (COMP-E2E-025)

**Steps:** a multi-org member (TechFlow **locked**, BuildRight Approved/unlocked) signs in, is pinned to
the blocked TechFlow org, lands on `/403`.

**Expected:** the header account menu exposes an "Organizations" section / org switcher so the user can
select the healthy BuildRight org and recover in-session (as VCST-5281 documented).

**Actual:** the account-menu popup contains **only** the user name link and Logout — no "Organizations"
section, no switcher listbox. BuildRight can never be selected. Worse: navigating to the storefront
**homepage (`/`)** also redirects to `/403` — the whole storefront is inaccessible, not just
`/company/*`/`/account/*`. The backend `me` query confirms the data needed to render a switcher IS present
(`organizations.totalCount=1`, i.e. BuildRight) — the storefront simply never renders it while the pinned
org is blocked.

## 2. Login refuses outright when the blocked org is the resolved default (COMP-E2E-005)

**Steps:** same fixture, but attempt fresh sign-in (not already in session) while TechFlow is locked.

**Expected:** the user reaches the storefront, at minimum via a switcher, since BuildRight is healthy
(`/connect/token organization_id=BuildRight` returns 200 independently).

**Actual:** sign-in is refused outright with an inline org-specific error ("Your access to this
organization has been blocked...") and **no session is created at all** — there is no page to render a
switcher on. This is arguably worse than case 1: the user never even gets a `/403` page with (theoretically)
recoverable chrome; there's no session to recover from.

Secondary (non-blocking) defects observed alongside case 2: the sign-in error concatenates two sentences
with no separator ("...contact your organization administrator contact the site administrator."), and the
API's `errorDescription` leaks a raw org GUID instead of a name (the storefront-rendered copy correctly
says "this organization" instead — the leak is API-surface only).

## Root cause

Both are the same VCST-5281 root cause reached two ways: `contact.organizationId`/the resolved default org
is never validated against `BlockingStatuses` before the session is pinned to it. Case 1 shows the pin
survives long enough to render `/403` but nothing else; case 2 shows the pin blocks the token grant itself,
so no session is ever created.

## Fix Routing

- **Layer:** L3/L4 — same component as VCST-5281 (`vc-module-customer` `OrganizationIdClaimProvider` /
  `OrganizationIdRequestValidator`), plus an L1 storefront fix so the "Organizations" section renders on a
  `/403` landing whenever `me.contact.organizations.totalCount > 0`.
- **Suggested fix:** validate the resolved org against `BlockingStatuses` before pinning/refusing; when
  blocked, fall through to another non-blocking org or surface the switcher rather than a hard refusal.
- **Routing confidence:** HIGH — reproduced via UI + cross-checked at the API layer for both cases.
- Do NOT auto-merge — human review required.

## Verification 2026-08-05 — DOES NOT REPRODUCE (ready to move to `fixed/`)

**Env:** vcst-qa @ Platform **3.1055.0** · Customer **3.1021.0-pr-312-3aa7** · Theme
**2.55.0-pr-2412-7bfd** (contains `#2399`; `vc-module-customer#312` merged 2026-08-04 12:02Z).

**The premise no longer occurs: a multi-org user is never pinned to a blocked org, so there is nothing
to recover from.** `#312`'s `OrganizationAccessResolver` resolves the active org over *accessible* orgs
only — `NOT IsCurrentlyLocked AND ResolveEffectiveStatus(...) ∉ {Invited, Rejected, Deleted}`.

Probed with `MULTI_ORG_TF_BR`, its **currently-pinned** org (TechFlow) set to `Invited` and BuildRight
left Approved — i.e. the §1 shape, blocked-org-first with a healthy fallback:

| `/connect/token` password grant | HTTP | resolved `organization_id` |
|---|---|---|
| no `organization_id` (server resolves) | **200** | **BuildRight** — the healthy org |
| `organization_id` = TechFlow (blocked) | **200** | **BuildRight** (silently substituted) |
| `organization_id` = BuildRight | 200 | BuildRight |

Storefront control (both orgs healthy): sign-in lands on **`/` (200)** with the active org rendered in the
header and the **`/account/dashboard` link present** — the page §1 reported as unreachable.

**Axis coverage:** the *status* axis is verified above. The *lock* axis (§1's original condition, TechFlow
`isLocked`) was separately observed on this same build during the VCST-5281 BL audit: a multi-org grant
naming a **locked** org likewise returns 200 on a fallback org. Both axes are filtered by the same
`accessible` predicate.

**Consequence for the oracle:** the refusal fires **only when no accessible org remains** — which is why
`BL-AUTH-012`'s `Verify` step was corrected on 2026-08-05; asserting an unconditional HTTP 400 for a
locked org was a false FAIL for every multi-org fixture. New invariants `BL-AUTH-015` / `BL-AUTH-016`
record the resolution chain and the single-code, lock-first refusal.

**Not closed here** — moving a P0 to `fixed/` is left to a human. Nothing in this verification contradicts
the original finding *as recorded against `pr-312-2257`*; the behaviour changed with the merged fix.

**Side finding (not this bug):** an explicit request for a blocked org returns **200 with a substituted
org**, not a refusal — no `user_invitation_pending_in_organization`. Tracked as VCST-5281 comment item 8
and `PROPOSED-BL-AUTH-017` in `reports/ba/bl-proposals-2026-08-04.md`; it is the deliberate fallback path,
and whether silent substitution is intended is the open question there.

Fixture `MULTI_ORG_TF_BR` was restored to its captured baseline (`Approved`, `isLocked=false`,
`lockoutEnd=null`) and re-read to confirm.
