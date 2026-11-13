<!-- copy of .claude/skills/qa-test/exploratory-lane.md §5 — keep in step; the repository copy is canonical here -->
## 5. The box, and what happens when it runs out

**The box is SIZED TO SCOPE, floor 30 min, ceiling 60 — and it is stated in the charter, never left to
the lane's judgment mid-session.** It was a flat 25 until 2026-09-10, which proved too short once the
checklist was checked against what this lane brings back. Split it ~20% setup · ~65% explore · ~15% write-up.

| Scope | Box | Because |
|---|---|---|
| single-layer, single-domain, an obvious surface | **30 min** | the floor. Below it the lane is setup plus a glance, and its charter items go unreached |
| cross-layer, or ≥2 domains, or an all-layer chain | **45 min** | each extra layer is its own surface to reach, sign into and read |
| a new feature / Epic, or a domain whose §1 purpose is `UNDECLARED` | **60 min** | the ceiling. Nothing earns more: past an hour the lane has stopped resolving named unknowns and started browsing |

**The floor and the ceiling are doing different jobs.** The floor stops the lane being cheap and useless —
an under-boxed session reaches two of five charter sources and reports three as unknown, which costs a
browser lane to learn nothing. The ceiling stops it becoming `/qa-exploratory`, which already exists and
is the right tool when a feature genuinely needs an open-ended session.

**Its cost to the critical path depends on where the strategy put it.** Alongside the checklist runners it
costs a lane and no wall time; **first**, the runners wait for it, so a 60-minute box is an hour before the
checklist executes. What *first* buys: checks whose items were **seen**, not inferred from ACs.

- **Overrun ⇒ take what returned.** The join proceeds on what the lane returned. A lane whose box is spent
  does not hold the join.
- **Unreached charter items are NAMED, never dropped.** Each source present is either covered by a
  session note or recorded `NOT REACHED + reason`. An omitted source reads as a source with nothing in it,
  which is the one thing it must never read as.
- **A skip is stated with its reason.** No free lane, tracker down, environment unhealthy at preflight —
  each is a recorded `SKIP: <reason>` in `verdict.md`, never an absent line. A lane that ran and found
  nothing is a different fact from a lane that never ran.
