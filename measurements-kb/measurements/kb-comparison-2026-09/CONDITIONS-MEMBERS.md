# Round three — conditions, recorded before the first arm

Predictions sealed at **`sha256:829b3d2a1538db96`**
(`C:/_VIRTO/_predictions/comparison-r3-2026-09-15.md`). Corpus frozen at `vc-knowledge@18e5321`.
Deployment `vcptcore-stable`, platform `3.1007.27`. Arms run **sequentially**: B, then A, then C.

## The QA repository holds a partial answer key, and it stays

`preflight.mjs` failed on two files the moment it was taught the round-three identifiers:
`test-data/b2b/contacts.csv` and `test-data/b2b/users.csv`. They are **the repository's own seed
data**, not an earlier arm's material, and they name both members the task turns on:

| file | row | what it says |
|---|---|---|
| `users.csv` | `USR-021` | status **`Locked`**, `is_active=false`, roles `Organization employee`, note: "user-level Locked status (lockoutEnd=9999-12-31, lockoutEnabled=true)" |
| `users.csv` | `USR-022` | status **`EmailUnconfirmed`**, `is_active=false`, roles **empty**, note: "invitation pending, emailConfirmed=false" |
| `contacts.csv` | `CON-021` | contact status **`Approved`** |
| `contacts.csv` | `CON-022` | contact status **`Invited`** |

Taken together those four rows state the contact-versus-account split that is the heart of the task.
**This is arm B's treatment**, exactly as the GraphQL schemas were in round two. Deleting it to keep
the comparison tidy would be curating one arm's context to flatter another — the same defect as
seeding a run and calling the output a discovery. **It stays.**

### Where it is stale, and that is the interesting part

The rows carry `Seeded on vcst-qa 2026-05-14` — a different deployment, four months ago — and the
live state has moved:

| the CSV says | the deployment shows today |
|---|---|
| `CON-022` contact status `Invited` | contact status is **Approved** — the roster renders `Active` |
| `USR-022` status `EmailUnconfirmed` | Admin `Status` reads **`PendingApproval`** |
| `USR-022` `membership_locked` blank / `membership_status` blank | `Locked state` reads **`Unlocked`** |

So the repository holds a **partially correct, partially stale answer key**. An arm that trusts it
gets Blocked User right and reports the wrong state words for Invited User. That is a fair and
useful contrast — a document with no evidence row and no date against a corpus whose every claim
carries both — and it is the first time in three rounds the QA repository has held anything directly
on point.

### This was found AFTER the predictions were sealed

The seal is `829b3d2a1538db96` and it does not mention the CSVs, because I did not know they existed
when I wrote it. **No prediction is added or amended.** The discovery is recorded here, dated, and
the result page will say the same: it was not predicted, and it changes how arm B's score should be
read whichever way that score goes.

## Baseline state

`_comparison-logs/round3-prep/GROUND-TRUTH.md`, established today with 31 artefacts. Five members,
the roster shows `Active` for all five, two cannot sign in.

**The five rows are re-read after every arm** and compared against that file. A write by any arm
voids that arm's run; sequential order is what makes the drift attributable to one arm rather than
to the round. The tempting forbidden move is signing in as a member to test sign-in, which moves a
lockout counter — the task forbids it in as many words.

## Arm B

| | |
|---|---|
| launch from | `C:/_VIRTO/vc-mcp-testing-module` |
| context | the repository on `main`; `plugins/vc-kb/` absent, PR #298 still unmerged |
| log | `C:/_VIRTO/_comparison-logs/round3/arm-B` |
| cap | none; `VC_MEASURE_CAP=600` is a stop, not a budget |
| pre-flight | READY, 7 checks |

Screenshots land in `reports/bugs/screenshots/_incoming/chrome` and are moved out afterwards, along
with anything the arm writes into the repository root.
