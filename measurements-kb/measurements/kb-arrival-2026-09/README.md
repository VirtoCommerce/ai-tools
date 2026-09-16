# kb-arrival-2026-09 — would a coordinate hook have helped, and by how much

Reproduce:

```
node measurements/kb-arrival-2026-09/replay-logs.mjs
```

## The problem it addresses

Three runs consulted the base in their opening minutes and never again. Run 03 in full:

```
call    5   kb capture --help
calls 7–10  kb deliver ×4          ← every question it ever asked
calls 11–265                       ← 255 calls of work, no contact either way
calls 266–269 kb capture ×4        ← four entries in 39 seconds, KB_PHASE=report
call  312     kb capture ×1
```

Consulting is a place you go, and once work starts the page already open answers faster than
anything you have to fetch. Runs 01 and 02 were both **told** to consult the base and front-loaded
anyway, so this is not a wording problem in a brief.

The idea under test: stop making the agent go, and make the base arrive. Every entry in both planes
is anchored on coordinates — `/company/members`, `POST /api/members/search`,
`Mutations.lockOrganizationContact` — and a tool call is made of coordinates. So a PostToolUse hook
can look at what the agent just touched and hand back what the base holds about it. No question is
asked and nothing has to be remembered.

## What it would actually have done

Replayed over the three archived tool logs. The second column counts only entries that **existed
before that run started** — without that restriction a run appears to be helped by its own answers.

| run | calls | fires | fires on entries that already existed | what the work was |
|---|---|---|---|---|
| 01 | 83 | 9 | **9** (11%) | promotions, REST driven by `curl` |
| 02 | 172 | 2 | **1** | discount → checkout, browser against GraphQL |
| 03 | 319 | 11 | **2** | organization roles, browser UI |

**The honest headline: once or twice per run, except where the work touches routes directly.**
Run 01 drove REST with `curl`, so the routes it called were literally the coordinates the derived
plane is anchored on, and 11% of its calls were met with something. Runs 02 and 03 clicked through a
browser, where a URL is a storefront path and the derived plane's 590 entries — anchored on GraphQL
type and field names — have nothing to say.

## The number that says where the value is

Run 03's own two entries, anchored on `/company/members`, match **nine** of its calls. Those nine
are worthless to run 03, which wrote them. They are exactly what the *next* UI run gets, at the
moment it lands on that page, without asking.

So the mechanism pays in proportion to how many entries are anchored on **routes agents actually
travel**, and there are currently two. It is not a fix for front-loading today; it is a fix that
grows one entry at a time, and the thing that grows it is agents anchoring on where they were.

## Three bugs the measurement caught, all in the matcher

The number read "2 hits in 319 calls" three times, for three different reasons, and every one was
in the matching rather than in the idea. They are worth listing because each would have shipped as
"the hook does not help" if the number had been taken at face value.

1. **A crude first probe over-reported**, not under-reported: 19 hits on the bare coordinate
   `organization`, every one of them a URL carrying `organizationId`. Substring matching is useless
   here.
2. **Word boundaries were applied to coordinates that carry their own.** `/company/members` was
   rejected nine times because the character in front of it was the `m` of `.com`. A boundary is
   only needed on an edge that is itself a word character.
3. **Routes were compared in the wrong case.** `normalizeAnchor` lowercases a dotted coordinate and
   leaves a route alone, so the index holds `POST /api/members/search` beside
   `mutations.lockorganizationcontact`. A lowered haystack matched none of the routes — half the
   corpus, silently.

And one more that is a property of real text rather than a bug: `POST /api/members/search` never
appears verbatim in anything an agent writes, because `curl -X POST https://host/api/...` puts the
host between the verb and the path. The path is now tried on its own, which costs the verb
distinction — a GET to that route will offer an entry about the POST. That is the right trade: the
entry is about the route.

## It does run, and that was worth checking

Wiring it up produced an unplanned live test: writing this page fired the hook, because the prose
above names `Mutations.lockOrganizationContact` and `POST /api/members/search`, and the hook duly
offered three entries about them. So `hookSpecificOutput.additionalContext` on `PostToolUse` does
reach the agent in this harness — that had been an assumption, and it is now an observation.

It also names the false-positive class this design has: **writing about a coordinate looks exactly
like touching one.** Editing a file that mentions a route gets the same injection as calling it.
Cheap enough to live with at 3% of calls, and worth watching if that rate rises.

## What this does not establish

Three runs, one deployment, one corpus. Whether the injected context is *read*, acted on, or
ignored is measured by none of this — it is the next run's question, and the one worth asking
before anyone builds more of this.
