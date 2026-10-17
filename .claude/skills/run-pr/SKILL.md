---
name: run-pr
description: Run a Jira ticket's change locally from its PR build artifacts. Creates <tickets root>\<KEY> with a backend (the newest released platform and modules plus the PRs' module builds) and a storefront (the PR's theme build or the latest release), starts both on ticket-specific ports and checks them. Use when asked to run, test or try a ticket's PRs locally, e.g. "/run-pr VCST-1234".
argument-hint: <KEY> [repo#PR | PR URL ...] [prepare-only]
---

# Run a ticket from its PR builds

Arguments: $ARGUMENTS

The shared part lives in `ticket-core`, next to this skill's folder. Read `${CLAUDE_SKILL_DIR}\..\ticket-core\GUIDE.md`
first: rules, folder layout, scripts. Scripts: `$core = "${CLAUDE_SKILL_DIR}\..\ticket-core\scripts"`.

1. **Folder.** `init.ps1 -Key <KEY> -Mode pr` (GUIDE §3).
2. **PRs.** The ones given, else found from the ticket (GUIDE §4). For each PR:
   `gh pr view <n> --repo VirtoCommerce/<repo> --json state,headRefOid,body,files`.
   - The artifact is the head commit's PR build: a module blob `<Id>_<version>-pr-<n>-<first 4 of the head>.zip`, a
     theme `vc-theme-b2b-vue-<version>-pr-<n>-<first 4>-<first 8>.zip`. The URL under `### Artifact URL:` in the
     body gives the `<Id>`, but it is whatever CI wrote last: it can be an alpha from a manual "Publish nuget" run
     (vc-module-x-cart#147 shows `3.1042.0-alpha.302-vcst-6089-...` while `-pr-147-7f7c` exists). So find the head's
     build by listing: `https://vc3prerelease.blob.core.windows.net/packages?restype=container&comp=list&prefix=<Id>_<version>-pr-<n>-`
     (the version from the body URL; for the theme `prefix=vc-theme-b2b-vue-`), names containing `-pr-<n>-<first 4>`.
     None for the head (CI running or failed): say so and ask whether to wait or take the newest older `-pr-<n>-` build.
   - Merged PRs keep their builds (the blobs are not cleaned up). If the base already has the module at the PR
     build's version or higher, the change is released: leave the PR out unless the developer wants it (GUIDE §4.5).
     Merged but not released yet: use the PR's own build (the reviewed code), not the module's newest dev alpha.
   - vc-platform PRs publish only a container image and cannot run here: suggest `/run-src` for that ticket.

   Show the table with the migration notes (GUIDE §4.5-4.6) and get a yes.
3. **Storefront.** The vc-frontend PR's theme zip, else the latest release: `front.ps1 -TicketDir <dir> -Url <zip>`
   (GUIDE §6).
4. **Backend.** Stop the ticket's servers if they run (`stop.cmd`). `manifest.ps1 -TicketDir <dir> -Blob <module
   blob names> -FrontRef <the front PR's head sha | the release tag>`, then `install.ps1` when needed (GUIDE §5).
5. **Start.** `write-start.ps1 -TicketDir <dir>`, then start both unless prepare-only (GUIDE §7).
6. **Health.** GUIDE §8: `health.ps1`, the field probe when the change adds GraphQL fields, then short browser checks
   with the developer: admin login, storefront login, menu, a product list, the ticket's page, a clean console.
7. **Report.** What runs (base, each PR build, storefront), the URLs (backend and admin, storefront), the health
   results, the migration notes, and how to run without Claude: `start-back.cmd`, `start-front.cmd`, `stop.cmd`.

After new commits on a PR: run `/run-pr <KEY>` again. It picks up the new builds, reinstalls what changed and restarts.
