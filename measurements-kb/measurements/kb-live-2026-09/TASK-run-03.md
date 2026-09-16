# Run 03 — the task

Runs 01 and 02 were given their tasks in chat, so the single condition that shapes everything a run
asks and records exists only in a transcript. From here the task is a file, like the brief.

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**Verify that an organization's member roles actually gate what a member can see and do in the
B2B storefront on `vcptcore_stable`.**

Concretely, for at least two different roles on one organization:

* which orders a member can see — their own only, or the whole organization's
* whether a member can see and manage the organization's other members (invite, lock, change
  someone's role)
* whether the storefront's own navigation matches what the API will actually allow: a section that
  is hidden but still reachable, or shown but refused, is the finding worth having

Work on both surfaces. The Admin SPA is where an organization, its contacts and their roles are
administered; the storefront is where the gating is supposed to show up. A discrepancy between the
two is a bug, and it is the kind this task exists to look for.

Report what each role actually controls, and anything that does not match what it claims to.

## What this is deliberately not

Not a tour of the permission model in documentation. Look at the running deployment.

Not a request to create load-bearing fixtures. If you change a contact's role to observe the
difference, change it back, and say in your report what you touched.

## One thing you will hit early

The account named in the brief signs in as an ordinary **Customer** of an organization. This task
needs at least one member with more than that, and the brief does not tell you how to get one.
That is the task, not an obstacle in front of it — work it out.

## Scope

Read-only against product, catalog and pricing data. You may change a contact's organization role,
invite a test member, and lock or unlock a contact, because the task cannot be answered otherwise;
undo what you can and list what you could not. Do not place orders, do not touch the platform's
own security roles or any account outside the one organization you pick, and do not delete
anything that existed before you started.
