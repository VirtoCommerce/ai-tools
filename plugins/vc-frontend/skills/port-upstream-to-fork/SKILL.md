---
name: port-upstream-to-fork
description: "Use after merging upstream vc-frontend into a theme fork (vc-frontend-next, a customer theme), or to audit a fork, when the fork has replaced upstream components with its own — a custom header, menu, home page or selector — so upstream fixes to the replaced components never reach users."
argument-hint: "[--from <ref>] --to <upstream ref>"
---

# port-upstream-to-fork — carry upstream changes into the fork's own components

A merge delivers an upstream change only to the file upstream changed. When the fork renders its own
component in that place — `header-preferences-menu.vue` instead of `language-selector.vue` — the change
merges cleanly and reaches nobody. This skill finds those changes, briefs them, ports the approved ones
into the fork's components and proves the port.

## 1. Run the drift report

`fork-drift.mjs` builds the fork's commit and the upstream commit with the repository's own Vite config
(through `graph.vite.config.mjs`, next to it) and compares the module graphs Rollup produces: Vite resolves
every import, compiles every `.vue`, and tree-shaking decides what is rendered. Nothing is guessed from
file names or regexes. Each commit is built once in a temporary worktree (about a minute) and cached under
`node_modules/.cache/fork-drift/`; a commit that locks other dependencies gets its own `yarn install`.

On a client that substitutes plugin placeholders:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/port-upstream-to-fork/fork-drift.mjs" --to <upstream ref> [--from <ref>]
```

Otherwise resolve `fork-drift.mjs` against **this file's directory**, not the working directory.
Run it from the fork's repository root; it analyses committed state only. Pick the range:

| Situation | Arguments |
|---|---|
| Right after an upstream merge commit (called from `vc-frontend:merge-upstream`) — the authoritative run | `--from "$(git merge-base HEAD^1 HEAD^2)" --to HEAD^2` |
| Before merging, to preview | `--to upstream/dev` (or the release tag). Upstream code not merged yet shows as "new upstream" and as lost users of shared files — expect noise |
| Auditing everything the fork has missed | `--from <the upstream commit the fork started from> --to <last upstream ref merged>` |

Sections, each listing the upstream commits in the range per file:

- **A** — upstream renders it, the fork does not: deleted or moved by the fork, imported by nothing the
  fork renders, or imported but tree-shaken away (a barrel still re-exports it).
- **A2** — stylesheets (Sass partials included) upstream compiles and the fork does not.
- **B** — rendered by both, but some of upstream's users of it are gone in the fork: the fork dropped a
  render site (`language-selector` used by upstream's `top-header`, only by `mobile-menu` in the fork).
- **C** — upstream commits to files the fork map says were replaced.
- **D** — fork-only rendered files not in the map, with the upstream files they resemble.
- **E** — map entries naming missing files.
- **Unresolved local imports** — must be zero; anything listed is an edge the graph may lack, so read
  those files by hand.

What the report cannot see: a component behind a `v-if` that is never true, a component registered at
runtime by name, and a fork style or token that overrides what upstream changed. The smoke test and
`vc-frontend:merge-upstream` step 2 cover those.

## 2. Keep the fork map current

`fork-map.json` in the fork's repository root records which upstream files each fork component replaces:

```json
{
  "replacements": [
    {
      "fork": ["client-app/shared/layout/components/header/_internal/header-preferences-menu.vue"],
      "upstream": ["client-app/shared/layout/components/language-selector/language-selector.vue"],
      "note": "desktop language, currency and color-mode switching"
    },
    {
      "fork": ["client-app/pages/demo-home/demo-home.vue"],
      "upstream": ["client-app/pages/home.vue"],
      "note": "the demo home replaces the page wholesale and has no login section"
    },
    {
      "fork": ["client-app/shared/catalog/components/category/category-sort.vue"],
      "upstream": [],
      "note": "fork-only addition, replaces no upstream file"
    }
  ],
  "ignored": [{ "upstream": "client-app/pages/<upstream-sample-page>.vue", "reason": "upstream's own sample page, never a storefront page; no fix to it can reach shoppers" }]
}
```

No map, or entries in sections D–E: read each fork component and its candidates side by side, and draft
the entries — a fork component that only *uses* an upstream composable replaces nothing. A fork-only
file goes in `replacements` with `"upstream": []`. An unrendered upstream file from section A maps to
the fork component that took its place, or, when nothing took its place, is a **lost feature** and stays
unmapped. The drafted entries go in the brief; the map is committed with the port.

**`ignored` — rarely, and only with a reason that stays true.** An ignored file disappears from every
section of every later report, *including the merges where upstream changes it*. Nothing reminds anyone
it was ignored. What goes wrong:

- **A replaced page gets a new feature.** `home.vue` ignored because `demo-home` replaced it: upstream
  then adds OTP sign-in to the home login section, and no report ever shows it. Mapped as a replacement
  instead, the change appears in section C and is triaged against `demo-home`.
- **A dropped feature gets a fix or comes back.** An ignored ship-to selector hides upstream's later
  fixes and redesigns — exactly the moment someone should ask whether the fork wants it back. Left
  unmapped, it shows in section A only in a merge where upstream touched it, so it costs nothing in quiet
  ranges.
- **The reason expires.** "The fork has no organizations" stops being true the day it gets them; the
  ignore entry stays and keeps hiding the file.

Before ignoring, both must hold: no upstream change to the file could ever need to reach the fork's
users, and a replacement or an unmapped entry would only be noise. Upstream's own demo or sample pages,
and tooling the fork's build never compiles, qualify. A file the fork *replaced*, *dropped* or *might
bring back* does not. The reason must say why no future change matters, not only why the file is
unrendered today; re-read the `ignored` list on every merge and delete entries whose reason no longer holds.

## 3. Triage each upstream commit

Read the earlier logs in `upstream-merges/` first: an upstream file a log already triaged — a lost
feature the user deferred, an n/a with its evidence — keeps that verdict unless the new commit changes
what it rested on. Cite the log instead of asking again.

For every commit in sections A, A2, B and C read `git show <sha> -- <upstream file>` and its PR
(`gh pr view <n> --repo <upstream owner/repo>` — a bare `gh` picks whichever repository the clone's
remotes point it at), then decide one:

| Verdict | When | Evidence the brief must carry |
|---|---|---|
| **port** | Behavior, accessibility, i18n, data or a bug fix the fork's component also needs | What changes in which fork file |
| **already** | The fork's component already behaves that way | The fork line that does it |
| **n/a** | The change is about markup the fork replaced wholesale | That the fork's component does not have the bug — checked, not assumed (a header that wraps at 1280 upstream: look at the fork's header at 1280) |
| **lost feature** | Upstream renders a feature the fork renders nowhere | Where upstream renders it; the user decides whether the fork brings it back |

## 4. Brief, then wait

```
N upstream changes the merge did not deliver: X to port, Y n/a, Z already, W lost features.

### 1. <ticket> — <one line> (<PR link>)
- upstream: <file> — <what changed>
- fork: <fork component> — <what it does today>
- ✅ port: <the change> / ➖ n/a: <evidence> / ✔ already: <evidence>

### Map
- + <new entry>
- ignored (rare): <file> — <why no future upstream change to it can matter>

### ❓ Your call
1. <lost feature: bring it back?>
```

Nothing is ported before the user answers.

The verdicts, the map changes and the user's answers go into the session's log
(`upstream-merges/<YYYY-MM-DD>-<ref>.md`, sections "Ports" and "Lost features and deferrals" of
`vc-frontend:merge-upstream`'s `log-template.md`). Called from `vc-frontend:merge-upstream`, that is the
merge's log; run alone as an audit, start a log of its own from the same template.

## 5. Port and prove it

- Port each approved change into the fork's component in the fork's own markup, keeping upstream's
  behavior exactly (attribute values, conditions, i18n keys, emitted events).
- Upstream's tests cover upstream's component, not the fork's. Write `<fork component>.upstream.test.ts`
  next to the fork's component, adapting upstream's assertions for that change; name `describe`/`it` by
  behavior. Remove the ported line once (`cp` a backup, not `git checkout`) and watch the test fail.
- Smoke the page that renders the fork's component as `vc-frontend:merge-upstream` step 7 describes,
  in the state the change is about (signed in, a breakpoint, a screen reader name via the accessibility tree).
- Commit the ports and the map together: `fix: port upstream <ticket> to <fork component>`, one commit
  per ticket. Add each port to the PR's QA checklist (`vc-frontend:merge-upstream` step 8) and to the
  log's Ports table, with the mutation its test was checked with.

## Common mistakes

| Mistake | Instead |
|---|---|
| Treating a clean merge as delivered | Run the report after every upstream merge |
| Mapping by file name similarity | Map by what the component does; confirm by reading both |
| Calling a change n/a because the markup differs | Check the fork's component for the same defect |
| Porting a lost feature unasked | Brief it; restoring a feature is the user's decision |
| `ignored` for a replaced or dropped file | A replacement entry (section C triages it), or leave it unmapped (section A shows it when upstream changes it) |
| Relying on upstream's test for the port | A test on the fork's component, mutation-checked |
