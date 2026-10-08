---
name: kb-judge
description: "[KB] Settle disputed knowledge-base entries. Takes one disputed entry or its cluster, builds the dossier of both sides, runs a FULL live investigation (every stand involved, storefront, Admin/REST, VirtoOZ docs, source at the deployed version) that establishes the build and settings each observation was made under, and proposes a verdict per dispute as a reviewed PR on the base. A human merges; nothing is decided from the papers and nothing is auto-resolved."
argument-hint: "[<KB-id> | cluster <KB-id> | next] --base <local vc-knowledge checkout>"
---

# /kb-judge — settle a dispute by investigating it, then let a human sign

A `kb_dispute` only flags an entry ("a dispute retires nothing — it flags, and a human decides").
Until this skill nothing helped the human decide and nothing could record that they had, so a
disputed entry stayed DISPUTED forever and agents kept re-arguing it. `npm run kb:disputes -- list`
prints the queue as it stands.

**Three things this skill never does:** decide from the dossier alone; write to the base's `main`;
resolve a dispute its own session took part in (`kb:disputes resolve` refuses that — see Step 6).

Input: an entry id, `cluster <id>`, or `next` (the top of the queue). `--base` is a local checkout of
`VirtoCommerce/vc-knowledge`; the operator says which, or ask.

## Step 1 — Bring the base up to date

```bash
npm run kb -- push                       # anything this session queued lands first
git -C <base> switch main && git -C <base> pull --ff-only
```

A PR built on a stale checkout conflicts with every confirm that arrived meanwhile.

## Step 2 — Take the case

```bash
npm run kb:disputes -- list --base <base>              # the queue: clusters, worst first
npm run kb:disputes -- cluster <KB-id> --base <base>   # the dossiers of the whole cluster
```

Judge a **cluster**, not an entry: entries that share two concepts or anchors are usually one
behaviour seen from several sides, and ten disputes in one feature are more likely one change than
ten errors. Note each dispute's `at` from the dossier table — it is the dispute's handle in Step 6.

Read the dossier's **hints** as hypotheses to test, never as findings.

## Step 3 — Ask the base and the docs what is already known

- **The base, for each coordinate of the cluster:** `mcp__kb__kb_ask` (CLI:
  `npm run kb -- ask "<coordinate> <question>"`) — siblings at the same coordinates, an entry that
  already states the other half, a duplicate. Rule: `CLAUDE.md` §Essential Rules → *Product context*.
- **VirtoOZ, for the documented mechanism** (`/vc-docs`) — what the platform is supposed to do. A doc
  decides a mechanism, never a UI string, a count or a layout.

Neither settles a dispute. Both shape the investigation.

## Step 4 — Investigate, live and in full

Follow [`investigation.md`](investigation.md). In short, for every disputed clause:

1. Split each entry into atomic clauses and map every evidence item to the clause it touches.
2. Establish the **conditions** of every stand the evidence names, plus one more: deployed build,
   theme, the settings, store, role and entity state the clause can depend on.
3. Re-observe on each of those stands with a **fresh fixture** — storefront (`qa-frontend-expert`,
   `playwright-chrome`) and Admin/REST (`qa-backend-expert`, `playwright-edge`), dispatched per
   [`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) §Agent Prompt Structure and
   [`../../rules/agents.md`](../../rules/agents.md) (lanes, at most three browser agents at once).
4. Read the source at each stand's **deployed** version, and its history, to find whether and where
   the behaviour changed.
5. When the sides differ, vary ONE condition at a time until the difference has a name.

Specialists **report** their observations with conditions; they do not write to the base. Who
records what, and how a held run keeps its queue private: [`investigation.md`](investigation.md) §3.
Observations of a disputed entry are recorded in Step 6 with `observe`; observations of other entries
go through the normal door with `conditions`
([`../../knowledge/execution/kb-capture-contract.md`](../../knowledge/execution/kb-capture-contract.md)
§Conditions).

**Reconstruct the past builds, not only today's.** A stand's build moves; the evidence was made on the
build of its day. The deploy repo's history gives it — `.claude/templates/agent-dispatch.md`
§Build Verification names the files; read them at the commit in force on each evidence item's date.
A dispute is most often two generations of the platform, not two errors.

**If a source cannot be reached** (a stand down, no access, the reproduction inconclusive), that
dispute gets no verdict. Say what is missing; do not infer it.

## Step 5 — Decide, per dispute

One verdict per contradicting evidence item, from the table in
[`investigation.md`](investigation.md) §4: `claim-amended`, `version-scoped`, `conditions-scoped`,
`split`, `dispute-wrong` — or **no verdict**, which leaves the dispute open. A verdict states what was
observed, on which stands, under which conditions, and which source confirms the mechanism; if any of
the four is missing, it is not a verdict yet.

Disputes copied to a child by an earlier split (`splitFrom` on the item) are often about the sibling:
see [`investigation.md`](investigation.md) §4.

## Step 6 — Write the decision on a branch of the base

```bash
git -C <base> switch -c judge/<cluster-slug>-<yyyymmdd>
```

**One judge branch open at a time.** A merged judge PR that edits an entry's body makes
`kb:sync-base` refuse every other branch (it only carries appended evidence and resolutions), so a
second branch opened alongside the first must be brought up to date by hand.

**Run every `kb:disputes` write inside this Claude Code session.** Outside one there is no session key:
`observe` and `resolve` refuse, because the party check would have nothing to compare.

1. **Record the investigation's observations of each disputed entry**, one per stand and build —
   **after** any split in item 2, on the child the observation concerns: a split copies every item of
   the parent to every child, an observation included, and it would count as a confirmation of the
   sibling it never looked at:

   ```bash
   npm run kb:disputes -- observe <KB-id> --deployment <stand> --conditions "<k=v; k=v>" \
     --note "<what was seen>" --base <base>
   ```

2. **Edit the entries** the verdicts require: the claim in the body (and subject when it states the
   clause), the build range or condition the entry now holds under, `appliesTo` for a closed axis. A
   split goes through a `split` plan and `npm run kb:migrate-schema2` (its header has the shape).
3. **Close each dispute you have a verdict for:**

   ```bash
   npm run kb:disputes -- resolve <KB-id> --at <dispute at> --verdict <verdict> \
     --why "<one checkable sentence>" --in <branch or PR> --base <base>
   ```

   It writes the verdict onto that evidence item, rebuilds `index.json`, and **refuses** a session that
   wrote evidence on the entry at or before that dispute — a party never judges its own case. Evidence
   your own investigation added after the dispute does not disqualify you. A party is a session, not a
   person: when the dispute carries your own `who` it says so, and the PR must too. Both `observe` and
   `resolve` run the push's secret gate over what they write and refuse on a hit.
4. After body edits, `npm run kb -- reindex --base <base>`, then `git -C <base> diff` — every change
   must be one a verdict explains.

## Step 7 — Open the PR, never merge it

**Not before every client reads resolutions:** the ai-tools change that introduced `kb:disputes`
merged and pulled by the team — an older client counts a resolved dispute as open. Then bring the
branch up to date (`npm run kb:sync-base -- --base <base>`, review, commit; it carries main's appended
evidence and resolutions), push it and open a PR against `main` of `VirtoCommerce/vc-knowledge`. The PR description is
the judgement, in English, readable without this session:

- per entry: the clauses, which held, which did not;
- per dispute: its `at`, the verdict or "open — <what is missing>", and the observations behind it —
  stand, conditions, date, the ids of the evidence the investigation banked;
- the sources: the VirtoOZ page, the source file at the deployed version, the PR that changed it;
- the before/after count from `npm run kb:disputes -- list`.

No screenshots, no client names, no credentials, no emails: the base and its PRs are public. **The
operator merges.** If they reject a verdict, fix the branch; never push to `main`.

## Step 8 — Report

Tell the operator, in their language: the cluster, the PR link, how many disputes got a verdict
and which, which stayed open and why, and the ids banked during the investigation.

## Where things live

`scripts/kb/disputes.mjs` (the CLI), `scripts/kb/core/disputes.mjs` (queue, clusters, hints,
dossier, the resolution write and its independence check), `scripts/kb/core/conditions.mjs`,
`RESOLUTIONS` in `scripts/kb/core/index-build.mjs`. The open-dispute count is also on `/kb-report`
panel 5.
