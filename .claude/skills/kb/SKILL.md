---
name: kb
description: Knowledge-brain toolchain for the vc-fix plugin — parses and validates typed knowledge entries, generates the drift-guarded retrieval index, resolves an id or a topic across a platform base and a client overlay with an explicit MISS, measures retrieval with an exam, captures observations as append-only drafts, and consolidates drafts into confirmed knowledge autonomously behind five mechanical gates. Self-contained and CWD-independent; zero external dependencies.
---

# kb — the knowledge brain toolchain

> Paths below are relative to the plugin root. The canonical copy of this skill is
> `plugins/vc-fix/skills/kb/`; `.claude/skills/kb/` is a byte-identical mirror enforced by
> `scripts/unit/mirror-parity.test.mjs`, which is why nothing here links across repo levels.

Implements the Two Brains architecture decided in VCST-5776 and recorded in
`docs/adr/adr-knowledge-brain.md`.
Two corpora — a read-only **platform brain** and a writable **client brain** holding only
the delta — one resolver over both, and a consolidation pipeline that promotes captured
observations into confirmed knowledge with **no pull request and no per-entry human
review** anywhere in it.

Every module resolves its own paths off `import.meta.url` (the
`skills/qa-fix-routing/skill-dir.ts` pattern), so it works from
any working directory on any install. There are **no external dependencies** — this code
also runs inside a client's brain repo CI, where the parent repo's `node_modules` does not
exist.

## Modules

| File | What it owns |
|---|---|
| `entry.mjs` | The entry contract: frontmatter parse + validate, two profiles (`entry` / `draft`), closed vocabularies, deterministic serialization. Rule ids `KBE-001…012`. |
| `fingerprint.mjs` | The observation fingerprint — what is hashed so the same knowledge dedups across phrasings, and the trade-off that buys. |
| `gen-index.mjs` | `knowledge-index.json` per root + the `--check` drift gate; `citedBy` / dangling / unparsable from `regression/suites/**.csv`. Also the corpus loader every other module reads through. |
| `resolve.mjs` | `@kb(<id>)` and topical lookup. Precedence `suppress > override > extend > new > platform > MISS`; containment by type. |
| `exam.mjs` | Goldens, `--check` self-test, hit@k / MRR, "wrong place" vs "not found at all", run history, and `compareMetrics` — the consolidation gate. |
| `capture.mjs` | Append-only draft writer: fingerprint dedup (`count++`), tombstones, capture-time evidence, write refusal by root. |
| `consolidate.mjs` | The autonomous pipeline: evidence bar → supersede-with-quote → layer guard → quarantine → exam gate with auto-revert → digest. |
| `drift-check.mjs` | Every client override's quote vs the current platform entry: `ok` / `changed` / `retired`. |
| `kb-paths.mjs` | `SKILL_DIR`, `outputRoot()`, the root layout, `readBrain`, `assertWritable`, `KbContainmentError`. |

Hooks live with the other plugin hooks: `hooks/kb-sync.mjs`
(SessionStart — pin the platform brain forward) and
`hooks/kb-guard.mjs` (PreToolUse — make the resolver the only
door). Both are strictly fail-open.

## A knowledge root

A directory carrying `brain.json`. Everything else is optional until it exists:

```
brain.json               name, scope (platform|client), readOnly, version, pin
confirmed/               one entry per file — the knowledge layer
drafts/                  one observation per fingerprint — the capture layer
  .tombstones.json       settled fingerprints; a settled item cannot be resurrected
exam/goldens.json        human-owned ground truth
exam/history.jsonl       one line per exam run
digest/<runId>.json      one consolidation report per run
knowledge-index.json     GENERATED — never hand-edited
```

`readOnly: true` on a root is what makes "a client context never writes to a platform
brain" a property of the data rather than of the caller's care: every writer calls
`assertWritable()` first.

## Commands

```bash
npm run kb:index        -- --root .knowledge/platform --suites regression/suites
npm run kb:index:check  -- --root .knowledge/platform --suites regression/suites
npm run kb:resolve      -- "@kb(BL-CART-010)" --platform-root .knowledge/platform --client-root .knowledge/client
npm run kb:resolve      -- --topic "cart tax before an address" --platform-root .knowledge/platform
npm run kb:exam         -- --root .knowledge/platform
npm run kb:exam:check   -- --root .knowledge/platform
npm run kb:consolidate  -- --root .knowledge/client --suites regression/suites
npm run kb:drift        -- --platform-root .knowledge/platform --client-root .knowledge/client
```

Each `:check` twin is the same script plus a flag — the repo's `tokens:sync` /
`tokens:check` convention.

## Rules that are not obvious from the code

- **IDs are a citation contract.** `regression/suites/**.csv` cites entry ids. Never
  renumber a surviving entry, never reuse a retired one. Consolidation mints ids from
  `max + 1` across ALL files, superseded and retired included, for exactly this reason.
- **Supersede, never delete.** A replaced entry keeps its file, its id and its body, and
  gains `status: superseded` plus `supersededBy`. The replacement carries the verbatim
  superseded wording in `quotes`.
- **A MISS is an object.** The resolver never answers an unknown id with an empty string.
  Silence and absence are different facts and must look different, or an agent that finds
  nothing concludes no rule exists and invents one.
- **The exam is load-bearing, not reporting.** With no human reviewer in the loop, it is
  the only thing that measures whether the corpus still answers. A root with no goldens
  gets no autonomy: consolidation holds the batch rather than applying it ungated.
- **Client knowledge never travels upstream through this toolchain.** The only route from
  a client brain to the platform brain is the closed-schema promotion contract (VCST-5820),
  which is a separate, human-gated path.

## CI templates for a brain repo

`templates/kb-consolidate.github.yml` and
`templates/kb-consolidate.azure-pipelines.yml`
run consolidation inside the brain repo on a cron plus a draft-count threshold. They are
scaffolded into a client brain by `/project-init` (VCST-5820); nothing in them needs an
environment, a model, or a package install.
