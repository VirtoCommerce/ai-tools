# qa-suite-sync — the domain map, the mind map and the data model

Supporting file for [`qa-suite-sync`](SKILL.md). You read it at Phase 1 and pass its path in the brief; the
subagent reads it at 2a, 3a–3c.

Three files describe a domain, one question each (`.claude/skills/qa-test-mind-map/SKILL.md` §Where it sits):

| File | Answers | Cases link to it by |
|---|---|---|
| domain map `.claude/knowledge/domain/<name>.md` | what exists — surfaces per layer (§2), where the layers disagree (§3), coverage shape (§4), open gaps (§5) | — |
| mind map `.claude/knowledge/domain/<name>.mind-map.json` | how the domain behaves — behaviour, branch and state nodes | `Behavior:<node-id>` in `References` |
| data model `test-data/models/<name>.data-model.json` | what data state each behaviour needs — profiles with an ordered seed plan | `DataProfile:<profile-id>` in `References` |

**This skill reads them and never writes them** — each has one writer: `/qa-domain-map`, `/qa-test-mind-map`,
`/qa-test-data-model`. The only model links it writes are the stamps on the cases it authors or rewrites.
**A missing model passes**: say so in the report and carry on as before. Never build one here.

## Phase 1 — load them once (you)

1. **Which models are in scope.** (a) The maps the in-scope suites' `Behavior:` stamps point to; (b) for a
   `domain <name>` input or a change in one domain, the files whose basename is that domain. The manifest's
   `domain` field uses other names (`auth-security` vs `auth`): when no file matches by name, `ls
   .claude/knowledge/domain/` and pick by the domain map's §1–§2, and say which you picked.
2. **Domain map present** → its §2 surfaces resolve the change inventory's pages and APIs to suites; §3 and
   §5 are leads for Phase 3.
3. **`npm run models:check -- --json`**, once per run. Keep what concerns the in-scope suites and maps:
   - `suspects[]` — cases stamped onto a node that is DRIFT, OBSOLETE or changed (TM-017);
   - `coverage` (node → case ids) and the TM-014 findings — behaviours and branches with no case;
   - `crossings[]` with no case (TM-032), and TM-015 — a stamp on an OBSOLETE or unknown node.
   Pass them as `models` in the brief (`briefs.md`).

## Phase 2 — sync (subagent, 2a)

- Every in-scope `suspects[]` case is at least `POTENTIALLY_STALE`, whatever the text match says; its `why`
  goes into the classification. A suspect is a change signal of its own: on a `suite` / `domain` input,
  Phase 2 runs for the suspects (and only them) — this is how `/qa-test-mind-map update` hands them over. A change that touches a node's surface → the cases `coverage[node]` lists
  are the first candidates, before matching by text.
- A case stamped onto an OBSOLETE node whose behaviour is gone is a BROKEN candidate (removal by default,
  after approval — `sync.md` *For BROKEN cases*).
- Report each node whose behaviour the run found changed in `nodesChanged[]` — never edit the map.

## Approval list (you, SKILL.md step 4)

- A removal that leaves a node with no case in `coverage` says so beside the item: *leaves `<node>` uncovered*.
- Seeding a profile before the live check (Phase 5, below) is a write to the stand: it goes in the list.

## Phase 3 — gaps, data, authoring (subagent)

- **3a.** TM-014 nodes and caseless crossings in scope are gaps, scored like any other; so are the domain
  map's §5 open gaps. A checklist gap that a node's linked case already covers is not a gap.
- **3b.** A gap whose node has a profile in the data model uses that profile —
  `npm run models:check -- --plan <profile-id>` prints the state it needs and the seeders that reach it —
  before `/qa-generate-data` designs anything new.
- **3c.** A case written for a node carries `Behavior:<node-id>`, and `DataProfile:<profile-id>` when it
  uses one (plan-row `behavior` / `dataProfile` fields, `.claude/knowledge/execution/regression-scaffold.md`).
  Re-run `npm run models:check` before returning: a TM-015/TM-016 on a stamp this run wrote is fixed first.

## Phase 5 — live check (you)

A target case stamped `DataProfile:` whose state the stand may lack: print its plan
(`npm run models:check -- --plan <profile-id>`); if the user approved seeding in step 4, run
`/qa-seed-data --profile <profile-id>` before dispatching. Without it, a case that comes back BLOCKED on
missing data is an environment finding, not a case defect.

## Report

A **Models** section, per domain in scope: which of the three files exist; suspects in scope and what
happened to each; uncovered behaviours before → after; stamps written; `nodesChanged[]` as the follow-up
`/qa-test-mind-map update <name>` (listed, not run).
