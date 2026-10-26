# Visual check — the fork before the merge against the fork after it

Read by step 7. **The fork owns how it looks**, so a merge should leave the look alone. The only visual
changes that may land are the ones the step 3 brief accepted, such as an upstream feature with new UI. This
check compares the two commits pixel by pixel and lists everything else that moved.

The engine ships with this plugin, in `visual/` at the plugin root:
`node "${CLAUDE_PLUGIN_ROOT}/visual/<script>.mjs"`. On a client that does not substitute placeholders,
resolve it against this file's directory: `../../visual/`. Each script's header documents its flags and
exit codes.

## Once per machine — setup

```bash
node "<plugin>/visual/setup.mjs"            # playwright, pixelmatch, pngjs → node_modules/.cache/vc-frontend-visual
node "<plugin>/visual/setup.mjs" --with-browser   # only when Playwright's Chromium is not on the machine
```

- The packages go to the fork's `node_modules/.cache/`, which git already ignores. Nothing enters
  `package.json` or the lockfile.
- `--with-browser` downloads Chromium (~150 MB). **Ask the user before running it.**

## Base and head

`M` is the merge commit (step 4). **Base** is `M^1`, the fork before the merge. **Head** is `M`. Build each
in a temporary worktree, never by checking a parent out into the merge:

```bash
B=$(mktemp -d); git worktree add --detach "$B" "$M^1"
H=$(mktemp -d); git worktree add --detach "$H" "$M"
```

In each worktree run `yarn install` and the fork's Storybook build. Read the script name from its
`package.json` (vc-frontend calls it `storybook:build`). Pass `-o <dir>` so both builds land outside the
worktrees.

## Scope

```bash
node "<plugin>/visual/affected.mjs" --repo . --base "$M^1" \
  --roots client-app/ui-kit/components,<every dir of a fork component that has stories> --out "$T/affected.json"
```

- **`ALL`**: a token, preset, Tailwind or shared-style file moved. Shoot every story.
- **`uncovered[]`**: a fork component with no story, typically everything `fork-map.json` replaces in
  `shared/` and `pages/`. These are checked on pages (below), never dropped.

## Shoot, compare, confirm

1. Shoot both builds in one run: `snap.mjs --storybook <dir> --out <set> --only "$T/affected.json"`.
   Use desktop plus 375 px (`--viewports 1280x800,375x812`), and the fork's own theme preset if its
   Storybook has a theme toggle (`--globals`).
2. Compare: `diff.mjs --base <base set> --head <head set> --out <dir>`.
3. Re-shoot only the flagged stories, three times each: `--grep-file <dir>/flagged-ids.txt --repeat 3` on
   both sides. Then run `diff.mjs` again. Only this second verdict counts.
4. **Pages, for `uncovered[]`.** Run step 7's preview for `M^1` and for `M` on two ports. Write a
   `targets.json` with the pages the merged files render (step 7's list). Record the API answers once on
   the base preview: `--record-har <file> --har-url "<the GraphQL endpoint path, e.g. **/graphql>"`. Then
   shoot both previews with `--har <file>` and the same glob, so both render the same data. Then compare
   and confirm as above.

## Triage — what may move

| What moved | Verdict |
|---|---|
| A component the step 3 brief or a resolution says changes | intended — name the brief item |
| An upstream-only component the fork does not replace, changed by an upstream PR in the range | intended (upstream owns it) — list it in the QA checklist |
| A fork component (`fork-map.json` `fork`), its theme, or a ui-kit component the fork restyles | **regression** unless the brief accepted it. The fork's look moved |
| A story or page that rendered on base and not on head (`unrendered`) | regression until shown otherwise |
| A target that the confirmation pass cleared | noise — record its id |

A regression goes back into step 4 (the resolution that caused it) before the push. Record the result in
the log under **Visual**: the counts, every regression with its diff image path, and every target that was
not measured. Add one QA-checklist block per intended change. The images stay in the temp folder; they
are evidence, not commits. Remove both worktrees when done: `git worktree remove "$B"`, same for `"$H"`.
