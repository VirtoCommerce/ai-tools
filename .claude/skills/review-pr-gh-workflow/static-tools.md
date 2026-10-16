# Static tools — actionlint, zizmor and script linters

Read at `SKILL.md` Step 5. Both are optional; the review is complete without them, and says which
ran. Neither is installed without the user's yes.

| Tool | Catches | Misses |
|---|---|---|
| **actionlint** | YAML and schema errors, invalid expressions, type errors in `${{ }}`, unknown inputs of popular actions, `shellcheck` findings inside `run:` (when `shellcheck` is on PATH), some injection patterns | anything about callers, branch protection or secrets setup; semantics of third-party actions it does not know |
| **zizmor** | the security classes in `checklist/security.md` — dangerous triggers, template injection, excessive permissions, unpinned uses, credential persistence, `secrets: inherit`, cache poisoning | correctness, contract and cost; context it cannot see (who can trigger, environment rules) |

## Running them

On the changed files only, in the worktree, writing to `<scratch>`:

```bash
git -C <worktree> diff --name-only --diff-filter=d <base>...HEAD -- '.github/workflows/*' 'workflow-templates/*.yml' '**/action.yml' '**/action.yaml' > <scratch>/changed-workflows.txt
actionlint -version
( cd <worktree> && actionlint $(grep -v 'action\.ya\?ml$' <scratch>/changed-workflows.txt) ) > <scratch>/actionlint.txt 2>&1
zizmor --version
( cd <worktree> && zizmor --format plain $(cat <scratch>/changed-workflows.txt) ) > <scratch>/zizmor.txt 2>&1
```

actionlint does not lint composite actions, hence the filter. **Use the repository's own config**:
run from the worktree root so `.github/actionlint.yaml` is picked up, and pass `--config zizmor.yml`
to zizmor when the repository has one at its root (`VirtoCommerce/.github` does) — the review applies
the repository's policy, not the tools' defaults. Prefer the tool versions the repository's own gate
pins, when it pins them. Its online audits (`--gh-token`, e.g. checking
whether a pinned SHA matches a tag) query GitHub with a token — run them only if the user agrees,
and never with a token that can write.

`<base>` and `<worktree>` are the values `prepare.mjs` printed. These commands do prompt — they run
code on the machine, which is worth a look.

**Compare against the base, not against zero.** Run the same command at `<base>` (a second detached
worktree, or `git show <base>:<file> > <scratch>/base/<file>`) and report
what the PR **adds or removes**. A pre-existing finding in an untouched part of a changed file is not
this PR's defect — mention it in "checked and clean" or as an item for the owners, never as a
finding against the PR.

## Script linters — for the files actions run

actionlint lints shell only inside `run:`; zizmor reads no script files. For a PR that changes
`actions/*/scripts/*.sh`, `*.ps1` or a Node action's `src/`, the matching linter covers what
`checklist/scripts.md` asks — same rules: optional, installed only on a yes, run on the changed files,
compared against `<base>`.

| Files | Tool | Command (in the worktree) |
|---|---|---|
| `*.sh`, bash in `.jq` wrappers | **shellcheck** | `shellcheck -S warning <files>` |
| `*.ps1` | **PSScriptAnalyzer** | `pwsh -NoProfile -Command "Invoke-ScriptAnalyzer -Path <file> -Severity Warning,Error"` (module `PSScriptAnalyzer`) |
| Node action `src/` | the action's own scripts | only what its `package.json` already defines (`lint`, `typecheck`/`tsc --noEmit`); never `npm install` scripts from the PR without a yes — that runs PR code |

The repository's own linter config wins over the tool default (`.shellcheckrc`,
`PSScriptAnalyzerSettings.psd1`, the action's eslint config), as for actionlint and zizmor above.

## Reading the output

- Every tool finding is a proposal: verify it at `file:line` in Step 6, like a helper's.
- A tool's severity is not this skill's severity. zizmor rates by pattern; the review rates by who can
  trigger it and what the job holds (`SKILL.md` §Severity scale).
- **A clean run is not a clean review.** Both tools work file by file: they do not see callers, the
  callee at its pinned ref, branch protection or organization defaults. Count a clean result only as
  "the patterns these tools know are absent from the changed files".

## Codex lenses (optional)

As `/review-pr-virto` Step 3 and [`../review-pr-virto/codex-lens.md`](../review-pr-virto/codex-lens.md),
with these focus texts instead of the .NET ones:

- *design*: "Contract of reusable workflows, actions and templates for consumers in other
  repositories; trigger and permission model; what runs with secrets; coupling via artifacts, caches
  and `workflow_run`."
- *defect*: "Script injection through `${{ }}` in `run:`; `pull_request_target` / `workflow_run` /
  `issue_comment` executing untrusted code; secrets reaching logs or artifacts; conditions that never
  fire; failures swallowed by `continue-on-error` or `|| true`; unpinned third-party actions."

Their findings are proposals like a helper's, verified in `SKILL.md` Step 6.
