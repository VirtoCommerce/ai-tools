# Healing playbook — `/prompt-review --fix`

Supporting file for [`SKILL.md`](SKILL.md) Step 4. One recipe per finding type. **Class** decides
what happens: `SAFE` is applied; `PROPOSE` is shown as a diff and applied only after the user
confirms. Under `--dry-run` both are shown and nothing is applied or asked.

**The test for SAFE:** *could an agent executing the prompt behave differently after this edit?*
If yes, or unsure, it is `PROPOSE`. Two corollaries decide most edge cases:
- **An edit to text a step or a dispatch brief acts on is PROPOSE**, even when it looks like a
  repoint — the executing agent may never follow a pointer, and a subagent cannot see its parent.
- **An edit to the `description`** beyond the `[Category]` tag changes triggering → PROPOSE
  (improvement-loop territory).

| # | Finding | Recipe | Class |
|---|---|---|---|
| H1 | Dangling **file path** or `§` heading | Find the successor (`git log --follow --diff-filter=R --oneline -- <old>`, `git ls-files \| grep <name>`, `grep -rn '^#.* <heading>'`); repoint. A bare filename gets its full path. No successor → PROPOSE removing the citation. | SAFE |
| H2 | Missing `npm run` script | Find the renamed script in `package.json`; repoint. None → PROPOSE. | SAFE |
| H3 | Transcribed count / default / budget number | Replace with the command or constant that holds it (`npm run suites:lint`, `DEFAULT_MAX_BATCH` in its file, the `context:report` cap). No source exists → drop the number if nothing acts on it (SAFE), else PROPOSE. | SAFE / PROPOSE |
| H4 | Restatement identical to its owner, in **background prose** | Replace with a pointer to the owner + `§`. | SAFE |
| H4b | Restatement a **step or a brief acts on** | Keep a one-line imperative at the step and add the pointer; delete only the rest. | PROPOSE |
| H5 | Restatement **drifted** from its owner | Which side is right is a process decision. Flag the drift, propose the pointer. | PROPOSE |
| H6 | Hardcoded URL/host | Replace with the env var that already carries it (`FRONT_URL`, `BACK_URL`, `{{VAR}}`). None exists → PROPOSE per `.claude/knowledge/execution/test-data-authoring.md` §When you must add a hardcoded value. | SAFE if the var exists |
| H7 | Literal secret | Remove; use the bare key name / `{{VAR}}`. Tell the user the value must be **rotated** — it is in git history. | SAFE + escalate |
| H8 | Memory slug carrying a **process/tooling** claim | State the claim in full where it belongs (the prompt, or a tracked `.claude/knowledge/**` file that owns the topic — a new sentence, never a rewrite of an existing one), cite that path, keep the slug as trailing provenance. Only if the claim is recoverable from tracked files. | SAFE |
| H8b | Memory slug carrying a **product-behaviour** claim | Writing it anywhere is a product claim: ground it (`CLAUDE.md` §Essential Rules → *Product context*) and hand it to its owner (`/qa-review-oracles` for BL/ECL, `/qa-domain-map` for a domain file). | PROPOSE |
| H9 | Frontmatter shape | Align `name` to the directory, `argument-hint` to `## Usage`, add the `[Category]` tag. | SAFE |
| H10 | `disable-model-invocation` wrong | Changes when, and whether callers can, run it. | PROPOSE |
| H11 | Loaded-whole file over the cap, or a ≥ ~2K conditional block | **Move down a tier** — below. | SAFE when a pure move |
| H12 | Step not executable (missing output / stop / fallback / branch) | Draft the missing piece from how callers use the output. | PROPOSE |
| H13 | Ungated outward write, or a "writes nothing" claim that is false | Add a gate / list the real writes. Always raise it. | PROPOSE |
| H14 | Delegation defect (agent type, lane, tools, missing fact, doc-first brief, callee that writes) | Fix the brief. | PROPOSE |
| H15 | Caller mismatch, or a wrong **invocation/argument** (not a path) | Fix the caller or the prompt — whichever is newer is usually right (`git log`). | PROPOSE |
| H16 | Missing README / ROUTING row | Add the row, matching neighbours. | SAFE |

## H11 — Moving down a tier

The loaded-whole file keeps the **spine** — steps, gates, stop conditions, pointers. Everything
only some runs need moves out.

1. **Measure** section sizes:
   `awk '/^#{2,3} /{if(h)print n"\t"h; h=$0; n=0} {n+=length($0)+1} END{print n"\t"h}' FILE | sort -rn`
2. **Pick conditional blocks**, largest first: a mode/flag branch, recovery path, report template,
   worked example, schema; history/rationale goes to `docs/decisions/` (never loaded).
3. **Destination:** a skill → a supporting file in its directory; a command → its backing skill's
   directory, or a new `.claude/skills/<command>/` supporting file if it has none; an agent →
   `.claude/knowledge/agents/<team>/`.
4. **Move verbatim**, keeping heading text so `§` citations can be repointed.
5. **Leave a pointer** where it was: file + `§` + **when** to read it ("On `--verify`, read
   `verify-mode.md` §Protocol").
6. **Repoint** citations to the moved heading: `grep -rn '<file>.md.*§<heading>' .claude plugins`.
7. **Re-measure and gate.** `.claude/` targets: `npm run context:check`, then
   `npm run context:check:baseline` (it deletes or shrinks the entry; never hand-edit a number).
   `plugins/*`: `wc -c` against the cap and `claude plugin validate`.

A move never rewords. Rewording hides behaviour changes in a diff that claims to be a relocation —
move in one edit, propose any rewording in another.

## After healing

- The SKILL.md Step 4 gate for the target is green.
- Every hunk is a SAFE recipe above or a confirmed PROPOSE.
- `plugins/*` touched → a version bump + tag is owed (`docs/release-process.md`); say so.
- A self-diagnostics containment file drifted → reported, not healed (SKILL.md Step 0, item 4).
