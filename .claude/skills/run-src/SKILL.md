---
name: run-src
description: Run a Jira ticket's change locally from source. Clones the changed repos (feature or PR branches) into <tickets root>\<KEY>\sources, installs the newest released platform and modules, builds the cloned modules (and vc-platform when it changed) and links them in, runs the storefront from its clone or the latest release, then starts everything on ticket-specific ports and checks it. Use when asked to run, test or continue a ticket from its branches, e.g. "/run-src VCST-1234".
argument-hint: <KEY> [repo@branch | repo#PR ...] [prepare-only]
---

# Run a ticket from source

Arguments: $ARGUMENTS

The shared part lives in `ticket-core`, next to this skill's folder. Read `${CLAUDE_SKILL_DIR}\..\ticket-core\GUIDE.md`
first: rules, folder layout, scripts. Scripts: `$core = "${CLAUDE_SKILL_DIR}\..\ticket-core\scripts"`.

1. **Folder.** `init.ps1 -Key <KEY> -Mode src` (GUIDE §3).
2. **Branches.** The ones given (`repo@branch`; `repo#PR` means the PR's head branch), else found from the ticket
   (GUIDE §4): its PRs' branches; without PRs, ask for `repo@branch`. Show the table with the migration notes and
   get a yes.
3. **Clones** in `<dir>\sources\<repo>`:
   - missing: `git clone --filter=blob:none --branch <branch> https://github.com/VirtoCommerce/<repo>.git <dir>\sources\<repo>`
   - present: uncommitted changes, stop and ask; another branch checked out, ask; otherwise `git pull --ff-only`
     when the branch has an upstream.
4. **Storefront.** vc-frontend among the clones: `front.ps1 -TicketDir <dir> -Source <dir>\sources\vc-frontend`.
   Otherwise the latest release: `front.ps1 -TicketDir <dir> -Url <zip>` (GUIDE §6).
5. **Backend.** Stop the ticket's servers if they run (`stop.cmd`).
   1. `manifest.ps1 -TicketDir <dir> -ModuleManifest <each module clone's src\*.Web\module.manifest> -Linked <their
      module ids> -FrontPackages <dir>\sources\vc-frontend\backend-packages.json` (for a released storefront
      `-FrontRef <release tag>` instead), then `install.ps1` when needed (GUIDE §5). A NEEDS line for the platform
      can be met by adding vc-platform (`dev` or a branch) as a clone.
   2. `build.ps1 -TicketDir <dir> -Repo <clone>` for every module clone and for vc-platform. The platform needs no
      link: `start-back.cmd` runs it from its clone.
   3. Collect the link commands that `build.ps1` printed into one block. Ask the developer to run them in an
      elevated cmd (Run as administrator) and to say when done. Then check each:
      `(Get-Item <dir>\back\modules\<Id>).LinkTarget`. Later `vc-build install` runs keep these links.
6. **Start, health, report:** as in run-pr steps 5-7 (GUIDE §7-8). The report also lists each clone's branch and
   head commit.

After code changes: `stop.cmd`, `build.ps1` for the changed clones, then start again. No reinstall needed.
