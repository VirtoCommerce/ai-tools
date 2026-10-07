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
    }
  ],
  "ignored": [{ "upstream": "client-app/pages/home.vue", "reason": "demo-home replaces the page wholesale" }]
}
```

No map, or entries in sections D–E: read each fork component and its candidates side by side, and draft
the entries — a fork component that only *uses* an upstream composable replaces nothing. An unrendered
upstream file from section A maps to the fork component that took its place, or goes to `ignored` with
a reason, or, when nothing took its place, is a **lost feature**. The drafted entries go in the brief;
the map is committed with the port.

## 3. Triage each upstream commit

For every commit in sections A, A2, B and C read `git show <sha> -- <upstream file>` and its PR, then decide one:

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
- + <new entry> / ignored: <file> — <reason>

### ❓ Your call
1. <lost feature: bring it back?>
```

Nothing is ported before the user answers.

## 5. Port and prove it

- Port each approved change into the fork's component in the fork's own markup, keeping upstream's
  behavior exactly (attribute values, conditions, i18n keys, emitted events).
- Upstream's tests cover upstream's component, not the fork's. Write `<fork component>.upstream.test.ts`
  next to the fork's component, adapting upstream's assertions for that change; name `describe`/`it` by
  behavior. Remove the ported line once (`cp` a backup, not `git checkout`) and watch the test fail.
- Smoke the page that renders the fork's component as `vc-frontend:merge-upstream` step 7 describes,
  in the state the change is about (signed in, a breakpoint, a screen reader name via the accessibility tree).
- Commit the ports and the map together: `fix: port upstream <ticket> to <fork component>`, one commit
  per ticket. Add each port to the PR's QA checklist (`vc-frontend:merge-upstream` step 8).

## Common mistakes

| Mistake | Instead |
|---|---|
| Treating a clean merge as delivered | Run the report after every upstream merge |
| Mapping by file name similarity | Map by what the component does; confirm by reading both |
| Calling a change n/a because the markup differs | Check the fork's component for the same defect |
| Porting a lost feature unasked | Brief it; restoring a feature is the user's decision |
| Relying on upstream's test for the port | A test on the fork's component, mutation-checked |
