<!-- copy of .claude/skills/qa-test/exploratory-lane.md §5 — keep in step; the repository copy is canonical here -->
## 5. The box, and what happens when it runs out

**The box is SIZED TO SCOPE, floor 30 min, ceiling 60 — and it is stated in the charter, never left to
the lane's judgment mid-session.** It was a flat 25 until 2026-09-10; that was tuned for a lane running
beside \`3a\` on the way to authoring, and it is too short now that the CHECKLIST is written from what this
lane brings back. Split it ~20% setup · ~65% explore · ~15% write-up.

| Scope | Box | Because |
|---|---|---|
| single-layer, single-domain, an obvious surface | **30 min** | the floor. Below it the lane is setup plus a glance, and its charter items go unreached |
| cross-layer, or ≥2 domains, or an all-layer chain | **45 min** | each extra layer is its own surface to reach, sign into and read |
| a new feature / Epic, or a domain whose §1 purpose is `UNDECLARED` | **60 min** | the ceiling. Nothing earns more: past an hour the lane has stopped resolving named unknowns and started browsing |

**The floor and the ceiling are doing different jobs.** The floor stops the lane being cheap and useless —
an under-boxed session reaches two of five charter sources and reports three as unknown, which costs a
browser lane to learn nothing. The ceiling stops it becoming \`/qa-exploratory\`, which already exists and
is the right tool when a feature genuinely needs an open-ended session.

**Its cost to the critical path is now real, and that is a deliberate purchase.** \`3a\` is browserless and
runs beside it for free, but \`B\` and \`A\` both wait on this lane — so a 60-minute box is an hour before
the checklist executes. What it buys: a checklist whose items were **seen**, not inferred from ACs, and
which therefore does not need re-running when the model corrects itself.

- **Overrun ⇒ take what returned.** Artifact A proceeds on the amendments received. A lane that has not
  returned when 3a is green and B is written does not hold the gate.
- **Unreached charter items are NAMED, never dropped.** Each of the five sources is either covered by a
  session note or recorded `NOT REACHED + reason`. An omitted source reads as a source with nothing in it,
  which is the one thing it must never read as.
- **A skip is stated with its reason.** No free lane, tracker down, environment unhealthy at `1b` item 1 —
  each is a recorded `SKIPPED: <reason>`, never an absent block. `summary.json.discovery = null` means the
  lane **never ran**; an empty findings array means it ran and found nothing. Those are different facts.
