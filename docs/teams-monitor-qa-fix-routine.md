# Teams monitor → `/qa-fix` routine

How the Cowork Teams watcher and the local `vc-fix` autofix loop connect.
Two independent schedulers, one queue in Jira. Neither knows the other exists.

---

## The contract

| | Cloud (Cowork scheduled task) | Local (Claude Code routine) |
|---|---|---|
| Runs | hourly, 06:00–16:00 UTC, Mon–Fri | hourly, on this machine |
| Reads | Teams: *Platform team*, *Platform Support ↔ QA* | Jira: VCST |
| Writes | VCST Bug + labels | branch + PR, ticket transitions |
| Needs | nothing local | checkout, profile, PAT |

Handoff is the **`qa-autofix` label** plus status. `/qa-fix` moves the ticket to
in-progress at Gate 1 and in-review when the PR opens, so it falls out of the
query on its own — no shared cursor, no state to reconcile. Laptop off → tickets
queue up labelled and get picked up on the next fire.

The cloud task withholds `qa-autofix` unless the report has real repro steps
*and* an environment/version, so thin reports never reach the routine. It also
never writes a Fix Routing block — Gate 1 derives the route via `suggestRepo()`.

---

## Preflight — do this once, before enabling the routine

### 1. Confirm the installed plugin version

```
claude plugin list --json
```

Expect vc-fix **0.9.x**. `.claude-plugin/marketplace.json` here is `vc-tools`
0.9.4 (2026-08-30), so the source tree is current; only the install needs
confirming. `claude plugin update vc-fix` if it is behind.

The profile's baked `pluginRoot` points at **0.6.0**, but it was written
2026-07-30 — six weeks before 0.9.4 — and `qa-fix.md` says never to read the
plugin path from the profile, because none is baked there. Resolve it at runtime
via the command above. The stale field is metadata rot, not an old install.

### 2. GitHub credential — RESOLVED 2026-09-14

The first probe (10:10 UTC) came back `fine-grained` / `no` — the VCST-5582 A
trap. `GITHUB_FIX_BUGS_TOKEN` was replaced with a classic PAT carrying the
`repo` scope, and `/project-init --check` re-probed at 11:01 UTC:

```json
"vcs": { "clientHost": "github", "auth": "pat",
         "authEnv": "GITHUB_FIX_BUGS_TOKEN",
         "githubTokenKind": "classic",
         "githubForkCapable": "yes" }
"upstream": { "org": "VirtoCommerce", "contributionMode": "direct",
              "fileIssues": true }
```

`forkCapable: "yes"` clears `assert-profile.mjs`'s `github_fork_capability`
check and the Gate 1 upstream preflight. `contributionMode: "direct"` is now
coherent with the credential: the classic token has push on
`VirtoCommerce/vc-platform`, so platform PRs go straight upstream, no fork.

The same `--check` run also dropped the obsolete baked `paths.pluginRoot`
(which had pointed at vc-fix 0.6.0) — confirming that field was stale metadata,
not an old install.

**Keeping it working.** Note the token's expiry and rotate before it lapses; an
expired credential will fail unattended runs silently. And never hand-write
`"yes"` into the profile — the field records a probe result, and faking it moves
the failure from a clean pre-clone STOP to a dead run at fork time, after the
branch and commits exist.

**For reference — the probe, if you ever need it directly.**
`reconcile-profile.mjs` does not probe: in `PROFILE_DEFAULTS` both fields are
plain `""` with no `ask`/`rescan` policy. The probe lives in
`derive-context.mjs` (`probe-lib.classifyGithubTokenKind()`) and is read-only:

```bash
TEST_ENV=vcst node "$CLAUDE_PLUGIN_ROOT/skills/project-init/derive-context.mjs" \
  --tracker jira --client-vcs github
```

Sanity check without printing the secret: classic tokens start `ghp_`,
fine-grained `github_pat_`.

---

## The routine

In Claude Code, from this repo, run `/schedule` with an hourly cron and:

```
Find the oldest auto-fixable VCST bug and fix it.

1. Atlassian MCP, searchJiraIssuesUsingJql, cloudId
   d65ef426-3a47-426a-86ed-c07bb86ae0d7, maxResults 1:
   project = VCST AND labels = qa-autofix AND statusCategory = "To Do"
   ORDER BY created ASC
2. Nothing returned → stop, report "no eligible tickets".
3. Otherwise run /qa-fix <KEY> and let it run to its terminal state.
4. Report: ticket key, terminal outcome (PR opened / Gate 0 BAIL /
   Gate n STOP), and the PR URL if one opened.
```

One ticket per run, oldest first — one PR at a time is easiest to review and a
bad run can't cascade.

`statusCategory = "To Do"` rather than a named status: VCST has Draft, To do and
REFINEMENT all in that category and it isn't yet established which one the
monitor's tickets land in. Only the monitor applies `qa-autofix`, so the broader
category filter cannot over-select.

Routine cron minimum is 1h. The work branch is `claude/qa-autofix/VCST-XXXX`
because routines may only push `claude/*` by default.

---

## What this pipeline cannot do

**Screenshots.** The M365 connector does not return Teams inline images. A
screenshot-only bug report arrives at the cloud task as a near-empty body. It
flags these as "needs a human look" with sender, timestamp and message id, and
pushes a notification — it files nothing and never guesses at the image. The
vision step and the evidence attachment both have to happen locally, where the
image is reachable and `/qa-bug` can embed it inline.

**Live verification.** `/qa-fix` stops at On Review with the PR open. Moving a
ticket toward Ready for QA is `/qa-verify-fix`'s job, post-merge and
post-deploy.

---

## Notes

- Intermittency is not disqualifying. A report saying the symptom is not always
  reproducible, or that other QA could not reproduce it, does not by itself
  withhold `qa-autofix` — a flaky-looking symptom can have a deterministic code
  cause. VCST-5940 is the worked example: reported as "не всегда срабатывает" on
  OPUS, fixed same day by a single PR, released in vc-module-notification
  3.1014.0.
- Local shell is currently down on this machine: a Windows update released
  2026-09-08 blocks the Claude workspace from mounting connected folders
  (`no Plan9 drive shares mounted`). Claude Code is unaffected. This is why the
  routine must be created from Claude Code rather than driven remotely.
- A Cowork scheduled task cannot host `/qa-fix` even when the shell works: its
  per-call cap is 45 seconds and a fix run takes minutes. Device binding also
  has to be set at task creation and can never be added later.
