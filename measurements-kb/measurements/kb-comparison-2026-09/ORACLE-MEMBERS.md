# The oracle — who can actually sign in

**Written before any arm runs, from state verified on the deployment on 2026-09-15**, platform
`3.1007.27`, store `B2B-store`. Evidence: `_comparison-logs/round3-prep/GROUND-TRUTH.md` and 31
screenshots and snapshots beside it.

## Why this task and not round two's

Round two asked eight questions whose answers all lived in C# source. Every arm curled
`raw.githubusercontent.com` — the arm with the base 8 times, the arm with none 20 — and the base was
served 31 entries and **cited once, to refute it**. The scores came out 7.5 / 7.5 / 8.0 and the half
point came from a tool one arm should not have had. The task could not have separated the arms no
matter how many entries the corpus held, because the corpus holds what is observable from outside a
running deployment, and that task's answers were not.

**Nothing in this task is answerable from backend source.** Which fields a Vue page selects in its
GraphQL query, and what three different doors write, is emergent behaviour of a deployment.

## Coverage, measured before the task was written

Probed question by question against a COPY of the corpus. Published so nobody takes the gradient on
trust.

| what an arm would ask | what the base returns | |
|---|---|---|
| roster says Active but the person cannot sign in | `KB-4B889114` (confirmed, 3 obs) + `KB-27B4CD10` (confirmed, 3 obs) — both state it exactly | **direct** |
| which field says whether they can sign in | `KB-0B6067F8` — names `UserType.lockedState` | **direct, and a trap: see item 7** |
| where is "blocked" recorded | `KB-06409954` (confirmed, 2 obs) — three independent fields, no door writes all three | **direct** |
| does the roster show lock state | `KB-27B4CD10` — a missing projection, not a stale cache | **direct** |
| what a pending invitation looks like | `KB-4D082C89` — **disputed, 2 contradicting against 2 confirming**, both sides served | partial |
| what `PendingApproval` means for sign-in | `KB-E17E4CEF` — adjacent, about the Status picker, not about sign-in | partial |
| why a member holds zero roles | nothing on point | **open** |

**Four direct, two partial, one open.**

## The state on the deployment

Five members. **The roster shows `Active` for all five. Two of them cannot sign in.**

| member | can sign in | Admin `Status` | `Locked state` | verified | roles |
|---|---|---|---|---|---|
| Blocked User | **NO** | Locked | **Locked** | yes | 1 |
| David Kim | yes | Approved | Unlocked | yes | 1 |
| Emily Johnson | yes | Approved | Unlocked | yes | 1 |
| Impersonation Operator | yes | Approved | Unlocked | yes | 1 |
| Invited User | **NO** | **PendingApproval** | **Unlocked** | **no** | **0** |

## The answers

**1 — Blocked User cannot sign in.** The account is locked: `Status` reads `Locked` and the derived
`Locked state` reads `Locked`, and the blade's toolbar offers *Unlock account*. Full credit for
establishing the lock from the account blade or from `securityAccounts.lockedState`.

**2, 3, 4 — David Kim, Emily Johnson, Impersonation Operator can sign in.** `Approved` + `Unlocked` +
email verified + one role each. Emily last signed in 2026-07-24 and the Operator holds 17 active
sessions, which is direct evidence rather than inference. **David Kim has never signed in**
(`Last login N/A`) — an arm that calls that a problem is wrong: never having signed in is not being
unable to. Half credit for "yes" with no field named.

**5 — Invited User cannot sign in, and NOT because of a lock. This is the discriminating item.**
The account is **`Unlocked`**. What stops them is some combination of `Status = PendingApproval`,
an **unverified** email, **zero roles**, and a registration never completed. **Full credit requires
naming that `lockedState` is FALSE here and the person still cannot sign in.** An arm that reads
`lockedState`, finds it false, and reports "can sign in" has the wrong answer and takes the penalty
if it says `established`.

**Which of those is the actual blocker is OPEN, including to me.** I did not establish whether
`PendingApproval` alone refuses a sign-in, or the null password hash does, and I did not test it
because testing is a write. Credit any of them named as a candidate; credit `likely` fully here.

**6 — the `Active` column reports the CONTACT's status, not the account's.** The query the roster
issues selects the contact's `status` together with `securityAccounts{id,email,roles}` and requests
no lock or account-status field at all, so no account state can reach the column by any path — a
missing projection, not a stale cache. Full credit for establishing that it is the contact's field
and that the page never asks for account state. Half for "it does not reflect the account" without
saying what it does reflect.

**7 — is one field enough? NO, and this is the point of the whole task.**
`UserType.lockedState` on `ContactType.securityAccounts` is the field the corpus recommends, and it
is **right for Blocked User and wrong for Invited User**, whose account is unlocked and who still
cannot sign in. A complete answer says the maintainer must read the account blade under
**Security > Users** — where `Status`, `Locked state` and the email-verified toggle all live — and
that no single storefront-reachable field settles it.

**Full credit requires noticing the insufficiency.** An arm that names `lockedState` as the answer
and stops scores **half**: it is the best single field and it is not enough.

## Scoring

Seven items. Per item: **1** established correctly · **0.5** partially · **0** `unknown` ·
**−1** confidently wrong. An answer marked `likely` that turns out wrong scores **0**, not −1.

**A write to the deployment voids the run.** The five rows are snapshotted immediately before launch
and compared immediately after; an arm that blocks, unblocks, invites, deletes or signs in as a
member has changed the thing being measured. Signing in as a member also moves a lockout counter,
which is why the task forbids it in as many words.

## What is recorded and not scored

Tool calls and wall clock — **reported, and expected to say nothing**, on the evidence of two rounds.
Questions asked of the base, verbatim, with hit or MISS. Entries served, with which run wrote each
and on what date. `@kb(...)` citations in the report. Calls to `raw.githubusercontent.com`, which on
this task should be near zero for every arm — if an arm answers this from source, the task is wrong
and the write-up says so.

## What this still will not show

**n = 1 per arm.** And the arms run in parallel against one deployment, so a write by any one of them
damages all three; that is a risk accepted for wall-clock, recorded here, and checked by the
snapshot.
