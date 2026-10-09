# Optional: the Codex lenses

A second reviewer from a different model family catches a different class of defect. Two lenses, run
in the background while the diff pass and the tests run (`SKILL.md` Step 3):

- **adversarial-review** — design and assumptions: breaking changes, moved or bypassed seams,
  layering, hidden coupling.
- **task** — a concrete defect hunt: nulls, async bugs, EF query issues, missing migrations,
  authorization gaps.

Everything here is optional. Without Codex, skip Step 3; the review is complete without it. Codex
findings are proposals like any helper's — each is verified against the worktree in Step 6.

## One-time setup

**Requirements:** a ChatGPT subscription (the free tier included) or an OpenAI API key; Node.js 18.18
or later. Usage counts against your Codex limits.

1. **The Codex CLI.** `npm install -g @openai/codex`. (The plugin's setup check below can also offer
   to install it when npm is available.)
2. **Sign in.** `codex login` — it supports a ChatGPT account or an API key; `codex login --device-auth`
   for a device-code flow, `codex login --with-api-key` for a key. Inside Claude Code, prefix with `!`
   to run it in the terminal: `!codex login`.
3. **The Claude Code plugin.** In Claude Code:
   ```text
   /plugin marketplace add openai/codex-plugin-cc
   /plugin install codex@openai-codex
   /reload-plugins
   /codex:setup
   ```
   `/codex:setup` reports whether Node, npm, the CLI and the sign-in are all ready.

### Model and reasoning effort

The plugin uses your local Codex CLI and its configuration. Defaults come from `config.toml`:

```toml
model = "<model name>"
model_reasoning_effort = "high"
```

- user level: `~/.codex/config.toml`;
- project level: `.codex/config.toml` in the directory Claude Code was started in — loaded only when
  Codex trusts that project.

Per run, only the `task` lens takes flags: `--model <name>` and `--effort <level>`, where the level is
one of `none`, `minimal`, `low`, `medium`, `high`, `xhigh` (anything else is rejected).
`adversarial-review` takes `--model` but **no `--effort`** — its effort always comes from
`config.toml`.

Choosing: leave both unset unless the user asks — Codex then uses its own defaults. For a review
that has to be deep (a large diff, a base-class change, a security-relevant path), raise the effort in
`config.toml` to `high` or `xhigh` before the run rather than guessing a flag. Whatever the run used,
**report the model and effort with the verdict**; read them first:

```bash
grep -nE '^(model|model_reasoning_effort)' ~/.codex/config.toml .codex/config.toml 2>/dev/null
```

## Running the lenses

The plugin's review slash commands cannot be invoked by the model (they are marked
`disable-model-invocation`), and the `codex:codex-rescue` subagent is the wrong channel for this: it
backgrounds the job and returns only a job id it cannot collect. So the lead runs the plugin's
companion script directly, one background Bash call per lens:

```bash
CODEX_PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/openai-codex/codex/* | sort -V | tail -1)
```

**Preflight, and do not continue past a failure:**

```bash
node "$CODEX_PLUGIN_ROOT/scripts/codex-companion.mjs" setup --json
```

**The design lens:**

```bash
node "$CODEX_PLUGIN_ROOT/scripts/codex-companion.mjs" adversarial-review --wait \
  --cwd <worktree> --base origin/<baseRefName> --scope branch \
  "<design focus> <self-assessment request>"
```

**The defect lens:**

```bash
node "$CODEX_PLUGIN_ROOT/scripts/codex-companion.mjs" task --fresh \
  --cwd <worktree> --prompt-file <scratch>/codex-defect-hunt-pr-<pr>.md
```

**`task` takes no `--base`, `--scope` or `--wait`.** Its parser knows only `--model`, `--effort`,
`--cwd`, `--prompt-file`, `--write`, `--fresh`, `--resume`, `--resume-last`, `--background` and
`--json`, and it **appends any other token to the prompt text** — so a wrong flag does not fail, it
turns into words Codex reads. The prompt file therefore names the range itself: *"Review the branch
diff `git diff origin/<baseRefName>...HEAD` in this worktree."*, then the defect focus, then the
self-assessment request. Pass the prompt as a file with an absolute path, never as a long argument.
Never pass `--write`: the lenses are read-only.

If the user prefers to drive Codex themselves, the equivalent for the design lens is
`/codex:adversarial-review --background --base origin/<baseRefName> <focus>`, then `/codex:status`
and `/codex:result`.

### The self-assessment request

A Codex run is ephemeral, so its account of what it did can only be asked for in the same run. Ask
for:

- **A** — an ordered work log: every command, every file and line range read, why, and what it
  concluded;
- **B** — what it did **not** read or test;
- **C** — per hypothesis: verdict, confidence %, verified or inferred;
- **D** — "shallow? yes/no" first, and what made it stop;
- **E** — what a deep review would take.

Say that the account matters as much as the verdict. `adversarial-review` output is schema-bound, so
say the account must come back inside `summary` / `next_steps` — and check that it did.

### Focus templates — adapt them to the PR

- **Design focus** (adversarial-review): *"Breaking changes to the public and virtual API surface
  consumed by downstream NuGet users; removed or moved `protected virtual` override seams; base-class
  changes that bypass seams subclasses override; layering (Core / Data / Web, XAPI vs domain); hidden
  coupling, duplication; design assumptions that do not hold."*
- **Defect focus** (task): *"Concrete defects: null handling, async/await bugs, EF query issues
  (N+1, client evaluation, tracking), missing or incomplete DB migrations for every provider,
  authorization gaps in command handlers, allocation-heavy hot paths."*

## Failure handling

- Run both lenses, always — they catch different classes (design and assumptions vs concrete
  defects).
- If a lens fails, go back to the preflight and report what it shows; do not work around it.
- **A "no material findings" from a run that could not execute its commands is an empty instrument,
  not a clean review.** Check the work log (A) and the "shallow?" answer (D) before counting a clean
  result.
