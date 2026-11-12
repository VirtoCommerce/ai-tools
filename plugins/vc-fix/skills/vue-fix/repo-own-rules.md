# The checkout's own agent rules

The storefront you fix may ship its own instructions for coding agents. Upstream `vc-frontend` does —
`AGENTS.md`, `CLAUDE.md`, path-scoped `.claude/rules/*.md`, an `implement` skill and an edit-guard hook; a client fork may carry the same files, a changed copy, or none. They are the
maintainers' definition of acceptable code: a fix that breaks them bounces at human review (G7) even when
every gate of `quality-gates.md` is green.

## Read them in the checkout — never copy them here

After install (`fullstack-frontend` workflow step 3), before the repro test:

1. `<checkout>/AGENTS.md`, when present. It is written for agents that are not the repo's own Claude Code
   session — which is what you are — and names the rule file for each path and the checks to run.
2. Every `<checkout>/.claude/rules/*.md` whose `paths:` front matter matches a file you will change. The
   front matter wins over the `AGENTS.md` summary.
3. `<checkout>/CLAUDE.md` — its commands and the conventions that apply to every rule file.

None of them present ⇒ nothing to read; the defaults in `/vue-fix` apply.

**Never copy their content into this plugin.** They change with the repo; the checkout is always the
current version for the branch you fix, and a copy here is stale at their next commit.

**Why reading is not optional.** Your session's project is the QA project, not the checkout: the
checkout's `.claude/settings.json` hooks do not run on your edits, and its path-scoped rules are not
guaranteed to load for files under `.fix-workspace/`.

## How their rules apply inside `/qa-fix`

Their rules decide what the code looks like; the gate ladder decides the process (single repo, never edit
existing tests, minimal diff, no auto-merge). A repo rule that **adds** a check or a code constraint is
followed; one that would **loosen** a gate does not — the gate wins. A conflict you cannot place ⇒
`FIX_STATUS: FAILED` and hand off.

| The repo's rule | In `/qa-fix` |
|---|---|
| The typecheck command | Use the one the repo names (upstream: `yarn validate:types`). **Never bare `vue-tsc --noEmit`:** upstream's root `tsconfig.json` is `"files": []` plus project references, so it checks zero files and exits 0 — a false-green G3. Fallback when the repo names none: `npx vue-tsc --build --force` |
| Checks for the files you touched (upstream: `check:designs` for a design or preset, a token-table test for a shape/type token, `build` after a utility → `@apply` move) | Run them at G3, beside typecheck + lint + the scoped spec. G3's scoping (no full suite, no `build` for a template-only diff) holds otherwise |
| Where lint runs (upstream: pre-commit only, **not in CI**) | Local `lint` is then the only place a lint error shows: never skip it, and a green CI is no evidence of a clean lint |
| "Propose new public UI-kit names and wait for agreement" (a new prop, slot, emit or `--vc-*` token) | There is no developer to wait for. A fix that needs new public UI-kit API is not a minimal fix ⇒ `FIX_STATUS: FAILED`, hand off with the proposed names |
| "Reuse before writing" (UI-kit components, composables, utilities) | Before the fix, look for the existing component, composable or utility that already does it, and reuse it instead of hand-rolling |
| "Moved code is new code" | Lines you move or copy into a new place are judged as added lines, by you and by `frontend-reviewer` |
| A hook that blocks an edit (upstream: `guard-styles.mjs`) | It does not run here — keep to what it blocks by hand. `AGENTS.md` lists it; read the hook script when unsure |
| A step that waits for a human answer | A STOP + hand-off, never permission to proceed |
