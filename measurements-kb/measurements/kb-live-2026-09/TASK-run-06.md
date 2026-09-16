# Run 06 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## Before your first `kb` command

`MEASUREMENT/` already holds a tool log from another session. Two of them make the resolver refuse
to guess which run the question rows belong to, and your rows would stop being written. Find your
own session id and put it on every `kb` call — a shell `export` does not survive between tool
calls, so it goes on the line itself:

```
ls MEASUREMENT/          # two tool-log-*.jsonl files; yours is the one that is NOT c842f27b
VC_MEASURE_SESSION=<your id> KB_PHASE=orient node bin/kb.mjs deliver "…"
```

`KB_PHASE` is one of `orient · locate · understand · reproduce · change · diagnose · verify ·
restore · report` — only you know which, and the door refuses the row if you pass anything else.
**This line said "orient, work or close" when run 06 read it, and `work` is not in the vocabulary:
the row was refused, the run caught it in the door's output and re-asked under `understand`. It is
corrected here rather than quietly, because a run that skimmed the refusal would have lost the row
and nothing downstream would have shown it missing.**

## The task

**Establish what a shared list actually is on `vcptcore_stable`: who can see an organization-scoped
list, what a sharing key grants, and whether the two agree with each other.**

The storefront calls them lists or wishlists. `InputCreateWishlistType` carries a `scope` field
documented only as *"List scope (private or organization)"* and a `sharingKey` documented only as
*"Sharing key (URL argument)"*. What either of them means in practice is what this run is for.

* what scopes a list can actually be created with, and which of them the storefront UI offers
  against which the API accepts
* for a list scoped to the **organization**: which members can see it, which can change it, which
  can delete it — and whether that answer follows the member's organization role or something else
* what a **sharing key** grants: whether the holder needs to be signed in, whether they need to be
  in the organization at all, and what they can do with the list besides read it
* whether what one surface reports about a list matches what the other holds — the storefront
  roster of lists against what `Query.wishlists` returns for the same user with a `scope` argument

Report what each control does, and every place a surface says something the platform does not hold.

## Where to work

Organization `AGENT-TEST-Org-TechFlow-20260310`, signed in as described in the brief.

**On second identities, so you do not spend the run looking for one.** The brief names exactly one
storefront sign-in known to work on this deployment, and it explains why `USER_EMAIL` is refused.
Assume there is no second storefront password waiting to be found: **do not hunt for credentials and
do not spend attempts on a login that fails** — the brief's own warning about the lockout counter
applies.

Two identities you do have, for free:

* **a signed-out browser.** That is the whole of the sharing-key question — whether the holder of a
  key needs an account at all is answered by opening the link in a session that has none.
* **the Admin SPA**, which sees the stored list from the other side and is a different surface
  rather than a different person.

For "which members can see it", answer what those two can establish and say plainly where a second
storefront identity would have been needed. A well-evidenced "this is as far as one account can see"
is a result; a guess dressed as an observation is not.

## What this is deliberately not

Not a tour of the wishlist API. Naming the operations is the part the base can already do. Go
straight at what cannot be read off a signature: who sees what, and whether the surfaces agree.

Not a catalog or pricing exercise. Put products on a list by whatever route the storefront offers
and leave their data alone.

If a capability turns out not to be wired up on this deployment — no scope picker in the UI, no
share action, a mutation that errors for everyone — say so and work with the part you can reach. An
absent feature is a fact about the deployment, and a well-evidenced "this does not exist here" is
worth more than a guess about what it would do.

## Scope

You may create, rename, re-scope, share and delete **lists you created yourself**, and add and
remove items on them.

Do not delete or edit a list you did not create, do not place orders, do not touch another
organization, the platform's own security roles, or catalog and pricing data. Do not create or
delete member accounts — runs 04 and 05 left one behind that nothing can remove.

Whatever you create is yours to clean up. Say in your report what remains.
