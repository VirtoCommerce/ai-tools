# Run 05 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## Before your first `kb` command

`MEASUREMENT/` already holds a tool log from another session. Two of them make the resolver refuse
to guess which run the question rows belong to, and your rows would stop being written. One line
fixes it:

```
ls MEASUREMENT/          # two tool-log-*.jsonl files
export VC_MEASURE_SESSION=<the id that is NOT c842f27b>
```

## The task

**Verify the invitation lifecycle on `vcptcore_stable`: what a B2B organization maintainer can do
about a pending invitation, what each control actually does, and whether what the surfaces report
matches what the platform holds.**

From the moment an invitation is sent until it is either completed or gone:

* what the maintainer is offered on the storefront roster for a member who has been invited and has
  not registered — and what each of those controls actually does when used
* whether the invitation can be **cancelled**, **resent**, or its **role changed** before it is
  accepted, on either surface, and what happens to the invited person's record in each case
* what the Admin SPA holds for that person while the invitation is outstanding, and whether the two
  surfaces agree about it
* what, if anything, distinguishes an outstanding invitation from a member who is simply blocked —
  from the maintainer's side, without opening the Admin SPA

Report what each control does, and every place a surface says something the platform does not hold.

## Where to work

Organization `AGENT-TEST-Org-TechFlow-20260310`, signed in as described in the brief.

## What this is deliberately not

Not a repeat of member-state mapping. Assume the states exist and go straight at what can be **done**
about an outstanding invitation, which is different work.

Not a task that needs an email to arrive. If completing a registration turns out to need a mailbox
you do not have, say so and work with the part of the lifecycle you can reach. An unreachable step
is a fact about the deployment.

## Scope

You may send **one** invitation to this organization, at an obviously test address, and act on it
with whatever controls the surfaces offer. Change a role if a step needs it. Undo what you can, and
list what you could not.

Do not delete any member that existed before you started, do not place orders, and do not touch
another organization, the platform's own security roles, or catalog and pricing data.

Whatever you create is yours to clean up. Say in your report what remains.
