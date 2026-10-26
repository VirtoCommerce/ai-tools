---
description: "[Setup] Onboard vc-test onto a deployment — after vc-init's /project-init, declare which environments a run may write to and where the project's knowledge store is (the profile's `test` block, through vc-init's writer), and check every test environment has an admin and a storefront account. Never asks for or writes a password."
argument-hint: "[--writable <env,…|none>] [--store <path>] [--routing <json>]"
disable-model-invocation: true
---

# /vc-test:init — the `test` block, and nothing else

vc-init owns `project-profile.json`; this command only fills vc-test's own block through vc-init's
`profile-set.mjs` (spec U21). Accounts and passwords stay vc-init's: a missing account is answered with
`/project-init --add-user`, never here. `<plugin>` is this plugin's folder; run everything from the project root.

1. **Profile.** `node <plugin>/lib/profile.mjs --check`. Exit 2 ⇒ STOP: "run /project-init (vc-init) first".
   Exit 3 ⇒ STOP with its message. An error naming `Cannot find package` means the plugin's own dependencies are
   not installed yet (a fresh install): run `npm install --omit=dev --prefix "<plugin>"` once, then this step again.
2. **Where vc-init is.** `node "$VC_RUN" --where` → `vcInit` (its install path; `$VC_RUN` unset ⇒ STOP:
   "run /project-init --check, then restart Claude Code").
3. **The environments and their accounts.**
   `mkdir -p .vc-fix/vc-test && node "<vcInit>/skills/project-init/add-user.mjs" --list > .vc-fix/vc-test/accounts.json` — the envs this
   project defines and their users. Print nothing from it but the env names.
4. **Ask once** (one AskUserQuestion, skip any question the arguments already answer):
   - *Which environments may a run create or change data on?* (multi-select, the envs from step 3, plus
     "none"). Say plainly: a production stand must never be chosen; an env not chosen stays read-only, and a
     scenario that needs a write there is BLOCKED (spec U16).
   - *Where should this project's knowledge store live?* default `qa-knowledge/` (a folder in this repository,
     versioned with it).
   - *Which statuses mean a Bug is ready for test, ready on a hotfix line, not fixed yet?* Three free-text answers
     (comma-separated status names), one per role: `fix-ready`, `hotfix-ready`, `not-fixed`. Prefill from the profile's stored `test.routing`; where none, on Azure from
     `tracker.azure.roleStates`: `ready-for-test`, `testing` ⇒ fix-ready; `in-progress`, `in-review`, `reopen` ⇒
     not-fixed; hotfix-ready empty. A role left empty is fine: a Bug in an unlisted status is asked at run time.
     Pass `--routing '{"fix-ready":[…],"hotfix-ready":[…],"not-fixed":[…]}'` in step 5 only when the operator changed an
     answer; otherwise omit it, so a re-run keeps what is stored.
5. **Plan.** `node <plugin>/lib/init-plan.mjs --list .vc-fix/vc-test/accounts.json --writable <envs|none>
   --store <path> [--routing <json>]`. Exit 1 ⇒ show its message, ask again. Show its `warnings` verbatim.
6. **Write.** `node "<vcInit>/skills/project-init/profile-set.mjs" --merge 'test=@<file from step 5>'`. Not
   `written` ⇒ STOP with its JSON.
7. **Accounts.** For each entry in step 5's `gaps`: one line, `<env> has no <role> account — run <fix>`. Never
   ask for a login or a password here.
8. **Check.** `node <plugin>/lib/capabilities.mjs --key INIT-0 --mcp <the MCP servers this session has>`; print
   each declared env's `stand.writable` and `reason` for the current env, and the knowledge store's path. Delete
   `.vc-fix/vc-test/accounts.json` and `.vc-fix/vc-test/INIT-0/`.

Re-running is safe: the block is merged, not replaced, and an env no longer chosen is written back as read-only.
