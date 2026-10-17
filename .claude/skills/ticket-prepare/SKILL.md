---
name: ticket-prepare
description: Prepare a Jira ticket for implementation. Reads the ticket, agrees with the developer which repos it touches, clones them into <tickets root>\<KEY>\sources, creates feat/ or fix/ branches from dev, then runs the ticket from source (run-src). Use when starting work on a ticket, e.g. "/ticket-prepare VCST-1234".
argument-hint: <KEY> [repo ...] [prepare-only]
---

# Prepare a ticket for implementation

Arguments: $ARGUMENTS

The shared part lives in `ticket-core`, next to this skill's folder. Read `${CLAUDE_SKILL_DIR}\..\ticket-core\GUIDE.md`
first: rules, folder layout, scripts. Scripts: `$core = "${CLAUDE_SKILL_DIR}\..\ticket-core\scripts"`.

1. **Folder.** `init.ps1 -Key <KEY> -Mode src` (GUIDE §3).
2. **Ticket.** Read it with the Jira tools: `summary`, `issuetype`, `status`, `description`, `comment`,
   `attachment`, `issuelinks`, `parent`, `customfield_10175` (Acceptance), `customfield_10176` (Test scenario),
   `customfield_10178` (Non-functional requirements), `customfield_10186` (Platform components). If Jira fails, stop
   and ask. Look at attached designs: the Jira tools return attachment metadata only, so download the files with a
   Jira API token if you keep one (for example `email:token` in `~/.atlassian-token`), for attachments only.
3. **Branch name.** `fix/<KEY>-<short-description>` for a Bug, `feat/<KEY>-<short-description>` otherwise. Propose
   two to four kebab-case words from the summary. The same name goes into every repo.
4. **Repos.** The ones given; else propose them from the ticket. Platform components is only a hint; the
   description, the acceptance criteria and the linked tickets name modules, GraphQL types and pages. Find the code
   the ticket touches on `dev` (`git grep origin/dev` in the repos) and say per repo whether it changes and why.
   Add vc-frontend when the storefront changes and vc-platform when the platform does. Confirm the repos and the
   branch name with the developer. Also ask for the **base**: `origin/dev`, or the head of an unmerged PR the work
   depends on (VCST-6314 went on top of vc-module-sales-rep#13, the storefront plugin).
5. **Branches.** For each repo, check whether the ticket already has a branch:
   `git ls-remote --heads https://github.com/VirtoCommerce/<repo>.git`, filtered by the key. If one exists, someone
   started already: ask whether to continue on it (it then goes to run-src as `repo@branch`).
   For a new branch: `git clone --filter=blob:none https://github.com/VirtoCommerce/<repo>.git <dir>\sources\<repo>`,
   then in the clone `git switch --no-track -c <branch> origin/<base>` (`origin/dev`, or the PR's head branch). With
   no upstream, a bare `git push` cannot reach dev. A repo without `dev` branches from its default branch. An existing clone follows the run-src rules
   (no uncommitted changes; ask before switching).
6. **Run.** Invoke the run-src skill with `<KEY> <repo>@<branch> ...`, plus prepare-only when it was given. The new
   branches exist only locally; run-src uses the clones as they are.
7. **Report.** The branches, the acceptance criteria in a few lines, and run-src's report.
