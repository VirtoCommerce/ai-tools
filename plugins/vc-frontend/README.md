# vc-frontend

**Keeps a Virto Commerce frontend fork up to date with upstream, without losing the fork's look. And adds a
storefront plugin to a backend module.**

> The fork owns how it looks. Upstream owns how it behaves.

> [!WARNING]
> **The skills can make mistakes.** They resolve conflicts, port code, write tests and edit a module's build
> files on their own judgement, and a passing build, test run or check does not prove the result is right.
> Every change they make — the merge, each port, the map, the log, the module edits — has to be reviewed by a
> person before it is merged. The person who merges the PR owns the result.

## Install

```
/plugin marketplace add VirtoCommerce/ai-tools
/plugin install vc-frontend@ai-tools
/reload-plugins
```

It installs disabled. Enable it in `/plugin`, or with `claude plugin enable vc-frontend@ai-tools`.

## Which skill, when

| You want to… | Run |
|---|---|
| Bring upstream into the fork (`upstream/dev`, a release tag, or `origin/<base>` into a redesign branch) | `/vc-frontend:merge-upstream <ref>` |
| Find upstream fixes the fork never got, because it renders its own component instead | `/vc-frontend:port-upstream-to-fork` |
| Make a backend module ship a storefront plugin (Module Federation) | `/vc-frontend:mf-new-plugin <name> <*.Web path>` |

`merge-upstream` runs `port-upstream-to-fork` itself. Run the second one alone only to audit a fork.

## What happens in a merge

1. **It maps every conflict.** Nothing is changed yet.
2. **[PAUSE] You answer a brief.** One block per conflict, with a recommendation. Only the real decisions are questions.
3. It resolves them, then runs types, lint, tests, locales and the build.
4. **It checks nothing upstream got lost**, line by line, and in components the fork replaced.
5. **[PAUSE] A second brief, if needed:** fixes to port into the fork's own components.
6. It writes tests for ported code nothing covered, and proves each one fails when the port is removed.
7. It smoke-tests the built app against a backend you name.
8. **[PAUSE] You say when to push.** It opens the PR — or updates the branch's existing one — with a QA checklist.

## The rules that matter

- 🔀 **Merge the PR with "Create a merge commit".** Never squash, never rebase. Either one makes the
  next upstream merge replay every conflict again.
- 📓 **Every merge leaves a log** in the fork: `upstream-merges/<date>-<slug>.md`. The next merge reads
  it first, so decisions aren't asked twice.
- 🗺 **`fork-map.json`** (fork root) says which upstream files the fork's components replace. The skill
  proposes updates to it at every merge. Use `ignored` rarely: it hides a file from every future report.
- 🔁 **`git rerere`** is a safety net for a merge that has to be redone: it replays a resolution only
  for the identical conflict, never stages it, and every replay is still reviewed in the brief.
- 🧪 **`*.upstream.test.ts`** files guard upstream behavior inside the fork's markup. Keep them green.

## What it needs

- A clone of the fork, with its history shared with upstream (not a copy).
- Node and Yarn, as the fork uses them.
- A reachable backend for the smoke test (`APP_BACKEND_URL` in `.env.local`).
- `gh`, for the repo settings check and the PR.

## A storefront plugin in a backend module

`mf-new-plugin` follows scenario S1a of vc-frontend's Module Federation docs. vc-frontend's generator creates the
plugin in the module's `StorefrontApp/` and never edits the module's own files. The skill makes those edits
(`.csproj`, `module.manifest`, `.gitignore`), and `yarn check:plugin-module` decides when it is done.

1. **[PAUSE] You confirm** the plugin name and options.
2. It scaffolds, then runs the check to list what the module still lacks.
3. **[PAUSE] You approve the diffs.** Raising the module's platform or dependency versions is called out: it
   changes who can install the module.
4. It builds the plugin and runs the full check. It never commits.
5. On request: the plugin in a local storefront, the module's package (`--artifact`), a local platform.

It needs:

- a vc-frontend checkout with `yarn install` done, whose facade is not newer than the storefronts the plugin is
  for (it becomes the plugin's floor);
- for the vc-frontend checkout, corepack and a Node version its `engines.node` accepts; the module build takes 22 or 24;
- the module repo on a branch, with no uncommitted changes;
- for the package: the .NET SDK the module targets, and `vc-build`.

Full details: [`skills/merge-upstream/SKILL.md`](skills/merge-upstream/SKILL.md),
[`skills/port-upstream-to-fork/SKILL.md`](skills/port-upstream-to-fork/SKILL.md) and
[`skills/mf-new-plugin/SKILL.md`](skills/mf-new-plugin/SKILL.md).
