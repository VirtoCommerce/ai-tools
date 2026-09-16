# Run 04 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**Verify that every state an organization member can be in is reported truthfully on both
surfaces, on `vcptcore_stable`.**

A member of a B2B organization passes through several states — invited but not yet registered,
active, blocked, removed from the organization, deleted outright. Each of those is administered in
one place and displayed in another, and the two can disagree.

For each state you can reach:

* what the **storefront** shows a colleague looking at `/company/members` — the status column, the
  role, whether the row is actionable at all
* what the **Admin SPA** shows for the same person — the contact, its account, its locked state,
  its roles
* whether the storefront's own controls match what the API will allow for that state: a row that
  offers an action the backend refuses, or refuses one it would allow, is the finding worth having

Report what each state actually looks like from each side, and every place the two do not agree.

## Where to work

Organization `AGENT-TEST-Org-TechFlow-20260310` on `vcptcore_stable`. It already contains members in
more than one state, including one named "Invited User" and one named "Blocked User", so most of
this is observation rather than setup.

Sign in as described in the brief.

## What this is deliberately not

Not an audit of the permission model — that ground is covered. This is about **state**, not about
who may do what, and the two are easy to conflate: if you find yourself comparing roles again, you
have drifted.

Not a task that needs an email to arrive. If completing a registration from an invitation turns out
to need a mailbox you do not have, say so and work with the states you can reach. An unreachable
state is a fact about the deployment, not a failure.

## Scope

You may block and unblock a member, change a role if a state depends on it, and invite one new
member **to this organization only**, at an address that is obviously a test address. Undo what you
can, and list what you could not.

Do not delete any member that existed before you started. Do not place orders. Do not touch any
other organization, the platform's own security roles, or catalog and pricing data.

If you invite someone, the invitation itself is yours to clean up. Say in your report what remains.

## One loose end from earlier work, if you happen to pass it

On `/company/info` the address rows carry a per-contact "favourite" toggle whose prior state a
previous run could not establish after clicking it. If you end up on that page and can tell what it
is supposed to do, that is worth a sentence. Do not go looking for it.
