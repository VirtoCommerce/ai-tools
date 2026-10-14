# Ticket environments: shared guide

Used by the skills `run-pr`, `run-src` and `ticket-prepare`. Each ticket gets its own backend and storefront in
`<root>\<KEY>\`, built from the newest released platform and modules plus the ticket's changes, the way
vcptcore-dev/qa are deployed, but local: files on disk, the developer's own database and search engine.

Scripts are in `scripts\` next to this guide; the skills set `$core` to that folder
(`${CLAUDE_SKILL_DIR}\..\ticket-core\scripts`, `ticket-core` sitting next to the skill folders). Run them from the
PowerShell tool:
`pwsh -NoProfile -File "$core\<script>.ps1" <args>`. Long ones (install, build, yarn install, health on a first
start) go in the background.

## 1. Rules

- **Jira or GitHub fails** (not logged in, unreachable, 401/403/404 on something that should exist): stop and ask the
  developer what to do. No workarounds, no other credentials.
- **No login or password is ever written to a file or asked for in chat.** Logins are typed by the developer in the
  browser (Chrome DevTools MCP).
- **Never touch uncommitted work.** A clone with uncommitted changes: stop and ask. A clone on another branch than
  expected: ask before switching.
- **Ask before stopping a process that is not this ticket's** (a busy port, e.g. the developer's main backend).
- **The database is the developer's**, from the ticket's `back\appsettings.json` (a copy of the template), usually
  shared between tickets. The backend applies the migrations of its platform and modules to it on start. Backends
  running side by side on one database share its Hangfire jobs, and each caches data separately: restart one when
  data changed through the other looks stale.
- **prepare-only** in the arguments: do everything up to the start scripts, start nothing. The developer may then
  edit `back\appsettings.json` (e.g. a dedicated database) and start with `start-back.cmd` / `start-front.cmd`.

## 2. Ticket folder

```
<root>\<KEY>\
  back\            platform + modules: vc-package.json, appsettings.json, modules\ (links for source modules)
  front\           the storefront build, when the storefront runs from an artifact
  sources\<repo>\  git clones (run-src, ticket-prepare); the storefront clone is sources\vc-frontend
  logs\            back.log, front.log (rewritten on each start), install.log, build-<repo>.log, yarn-install.log
  .work\           downloads and intermediate files
  ticket.json      written by the scripts: mode (pr|src), ports, base, front, platform
  start-back.cmd   start-front.cmd   stop.cmd
```

Ports come from the ticket number: backend `10000 + n % 10000`, storefront `20000 + n % 10000`
(VCST-6315: backend http://localhost:16315, storefront http://localhost:26315, or https for a storefront from source).

## 3. First run, templates, init

`init.ps1 -Key <KEY> -Mode <pr|src>` creates or reopens the folder and prints JSON: `dir`, `ports`, `templates`,
`installed`, `sources`, `front`, `busyPorts`.

- **Exit 2, ROOT_NOT_SET:** ask the developer which folder should hold the ticket folders (for example
  `D:\tickets`), rerun with `-Root <path>`. It is remembered in `~/.vc-tickets.json`.
- **Exit 3, MODE_MISMATCH:** the folder was set up by the other skill. Ask; to switch, rerun with `-Force`. From
  sources to artifacts, first remove the links in `back\modules` (`cmd /c rmdir <link>` removes only the link).
- **Templates** in `<root>\_template\`, copied into tickets as they are:
  - `appsettings.json` (required): the backend config with the developer's database provider and connection,
    search provider and file roots. Missing: ask for the path of a working backend `appsettings.json` (for example
    their main backend's) and copy it there. Relative paths in it (`app_data/lucene`, `upload`, `~/assets`) give
    each ticket its own search index and files; absolute paths share them.
  - `.env.local` (only for a storefront from source): missing, ask for their vc-frontend `.env.local`. Its
    `APP_BACKEND_URL` does not matter; `start-front.cmd` sets the ticket's backend as an environment variable,
    which wins over `.env.local`.
- **busyPorts:** this ticket's own servers, run `stop.cmd`; anything else, show the process and ask.

## 4. Finding the change

What the developer passed wins: PRs (`vc-module-catalog#914`, a PR URL) or branches
(`vc-module-catalog@feat/VCST-1234-short-name`). Only when nothing is passed:

1. Read the ticket with the Jira tools: `summary`, `issuetype`, `status`, `description`, `comment`,
   `customfield_10186` (Platform components).
2. PRs: GitHub links in the description and comments, plus
   `gh search prs --owner VirtoCommerce "<KEY>" --json repository,number,state,title,url --limit 30`.
3. Keep the repos that run: `vc-module-*`, `vc-platform`, `vc-frontend`. Others (`vc-deploy-dev`, `ai-tools`,
   docs, tests) are listed as ignored.
4. No PR: ask for `repo@branch`. Platform components is only a hint (VCST-6089 says `vc-module-experience-api`;
   its PRs were in x-cart, x-order and quote).
5. Show one table and get a yes before downloading or cloning: repo, PR and state, branch, head commit, what
   runs (artifact or source). A merged PR whose module the base already has at the same or a higher version is
   released: leave it out unless the developer wants it.
6. **EF migrations:** list the changed files (`gh pr view <n> --repo VirtoCommerce/<repo> --json files --jq
   '.files[].path'`, or `git diff --name-only origin/dev...HEAD` in a clone). Paths with `/Migrations/` add one line
   under the table: "adds EF migrations <names>; they are applied to the ticket's database on start". No stop.

## 5. Backend

1. `manifest.ps1 -TicketDir <dir> [...]` writes `back\vc-package.json`: the base (vc-deploy-dev@vcptcore-demo
   `backend/packages.json`, the newest releases, pinned in ticket.json on the first run) plus the ticket's
   changes. It rebuilds from the base each time, so **pass all of the ticket's changes on every run**:
   - `-Blob <Id>_<version>.zip ...` PR artifacts of modules (run-pr)
   - `-FrontRef <PR head sha | release tag>` or `-FrontPackages <clone>\backend-packages.json`: the storefront's
     minimum backend versions
   - `-ModuleManifest <clone>\src\<X>.Web\module.manifest ...` and `-Linked <module ids>`: modules from source
   - `-Floor Id=Version`, `-Platform <version>`, `-RefreshBase` (move the base to today's releases)

   It prints each difference from the base, then `CHANGED` or `UNCHANGED`. **Exit 4 with NEEDS lines**: a minimum
   the base cannot meet. Show them and agree with the developer: `-RefreshBase`, `-Floor`, `-Platform`, or the
   platform from source (run-src).
2. `install.ps1 -TicketDir <dir>` runs `vc-build install`; run it when `manifest.ps1` printed `CHANGED` or init
   said `installed: false` (background: about 2-3 minutes the first time, 1-2 later). The ticket's servers must be stopped. vc-build
   removes modules that left the manifest and installs a PR artifact into a folder named after the blob
   (`VirtoCommerce.Catalog_3.1050.0-pr-914-f223`). The first install copies the template `appsettings.json`;
   later installs keep the ticket's own file. On failure the last log lines name the cause;
   `ValidateDependencies` errors name the versions to raise (`-Floor`).

## 6. Storefront

- **Artifact** (`front.ps1 -TicketDir <dir> -Url <zip>`): the vc-frontend PR's theme build, or the latest release:
  `gh release view --repo VirtoCommerce/vc-frontend --json tagName,assets --jq '.tagName + " " + (.assets[] |
  select(.name | test("^vc-theme-b2b-vue-.*\\.zip$")) | .url)'`. The zip's `default\` folder is unpacked into
  `front\` and served by `serve-theme.mjs`: static files, page routes fall back to `index.html`, and the platform
  paths (`/graphql` with WebSockets, `/api`, `/connect`, `/cms-content`, ...) go to the backend, like the cloud
  storefront. Pass the same ref to `manifest.ps1 -FrontRef`.
- **Source** (`front.ps1 -TicketDir <dir> -Source <dir>\sources\vc-frontend`): `.env.local` from the template when
  the clone has none, then `yarn install`. Runs with `yarn dev` (Vite, https). Pass
  `-FrontPackages <dir>\sources\vc-frontend\backend-packages.json` to `manifest.ps1`.

## 7. Start

1. `write-start.ps1 -TicketDir <dir>` writes `start-back.cmd`, `start-front.cmd`, `stop.cmd`. Each start script
   opens its own window and also writes `logs\back.log` / `logs\front.log`. A platform from source runs from its
   clone's build output with `back\` as the working folder (`--webroot` = the clone's wwwroot).
2. Unless prepare-only: `Start-Process "<dir>\start-back.cmd"`, then `Start-Process "<dir>\start-front.cmd"`.
   Tell the developer that the backend applies the migrations of its platform and modules to the database in
   `back\appsettings.json`.
3. Stop: `cmd /c "<dir>\stop.cmd"` (finds the processes by the ticket's ports in their command lines).

## 8. Health

1. `health.ps1 -TicketDir <dir>` (background on a first start; it waits up to 15 minutes for the backend): backend
   `/health`, "Loaded modules: N, with errors: 0", ERR/FTL lines in `logs\back.log`, the GraphQL schema
   (`{ __typename }`), the storefront page and the storefront's `/graphql` through its proxy.
2. When the change adds GraphQL fields, check them in the schema (introspection needs no login):
   `{ __type(name: "<Type>") { fields { name } } }` posted to `http://localhost:<back>/graphql`.
3. Browser checks with Chrome DevTools MCP, with real clicks (QA hooks may block `evaluate_script`). Keep them
   short: no walkthroughs of the admin UI, VC-Shell apps or storefront features. The developer types every login.
   1. Open `http://localhost:<back>/`; the developer logs in to the admin.
   2. Open the storefront; the developer signs in as a storefront user. Check: the menu loads, a category lists
      products, the ticket's page loads (if it has one), and `list_console_messages` (errors and warnings) is empty.
      A storefront from source (`yarn dev`) compiles on the first request: the first page can take 30 s or more,
      so a navigation timeout there is not a failure; wait for the page text instead.

   No reindex step: the platform's scheduled indexing job fills a new ticket's empty index by itself, products and
   categories within a minute or two of the first start (orders can take about 30 minutes on a big database). An
   empty catalog right after the first start means the job has not finished yet.

## 9. Reruns

Running a skill again on the same ticket updates it: new PR commits mean new artifacts, clones are pulled,
the manifest is rebuilt from the pinned base, and the servers restart. Checks before changing anything, and only
these: the mode (init exit 3), uncommitted changes in a clone, a clone on an unexpected branch. Stop the
ticket's servers before install or build.

## 10. Troubleshooting

- `/graphql` returns `FILE_NOT_FOUND`, or a module's fields or controllers are missing while the log says "errors:
  0": a module was built against newer dependency versions than installed (modules from source carry no
  dependency DLLs). Raise those modules (`-Floor`), or compare the clone's `PackageReference` versions.
- Behaviour lags the build after a version went down: `back\app_data\modules` keeps the higher version. Stop,
  delete `back\app_data\modules\<Module>.*`, start.
- Admin UI blank for a linked module (`$injector:nomod`): its admin UI was not built; run `build.ps1` again.
- The platform does not start: "...\Content\<app> directory doesn't exist": a VC-Shell app was not built; `build.ps1`.
- A storefront section is missing (e.g. no Sales Rep Hub, its pages 404): on vc-frontend `dev` such parts come
  as Module Federation plugins that a module ships in `plugins\vc-frontend` (built from its `StorefrontApp` by
  `dotnet publish`). `build.ps1` builds it for a linked module; a released module without the plugin, or a
  storefront that still expects one, leaves the section out.
- vc-build fails on locked DLLs: a server is still running; `stop.cmd`.
- A storefront from source does not come up and `logs\front.log` was never written: the first start of a fresh
  clone can stall while it creates the clone's HTTPS certificate (`.certificates\`). Stop the processes with
  `--port <front>` in their command line and run `start-front.cmd` again (VCST-5690).
- The ticket's backend is gone and `logs\back.log` ends without a crash line: it was stopped from outside. Run
  `start-back.cmd` again. Other processes and ports are not this skill's business: developers run several tickets
  and backends side by side, starting and stopping them.
- Product images fail (`ERR_CONNECTION_REFUSED`, `ERR_NAME_NOT_RESOLVED`): their URLs come from the template's
  `Assets:FileSystem:PublicUrl` or from external hosts in the sample data. Not a ticket problem; ignore those
  console lines.
- More log lines: the backend runs as Production (Serilog: errors plus startup lines). Add
  `set Serilog__MinimumLevel__Override__<Namespace>=Information` to `start-back.cmd` before the pwsh line.
