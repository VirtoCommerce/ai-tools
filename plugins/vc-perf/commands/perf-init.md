---
description: Onboard vc-perf onto a deployment — reuse vc-fix's /project-init, then add the perf block to project-profile.json and install perf prerequisites.
argument-hint: "[env-name]"
disable-model-invocation: true
---

# perf-init

Thin onboarding **on top of vc-fix**. vc-perf declares a dependency on vc-fix, so `/project-init`
and `project-profile.json` already exist — this command REUSES them and adds only the perf-specific
config. Do NOT duplicate vc-fix's onboarding, tracker/host/auth questions, or profile machinery.

## Steps

1. **Ensure the base profile exists.** If `project-profile.json` is absent, run vc-fix's
   `/project-init` first (it collects env name, tracker, code host, auth → writes the profile +
   `.env.<env>` + `.mcp.json`). vc-perf reuses that verbatim — the repo UUID / tracker / contribution
   mode the perf PR needs already live there (`repos.client[]`, `tracker`).

2. **Install perf prerequisites** (detect-then-install, per layer — mirror vc-fix's project-init
   prerequisite step; do not bundle binaries):
   - **L3** (universal): `dotnet tool install -g dotnet-counters dotnet-trace dotnet-gcdump`.
   - **L2** (only if load testing): the `k6` binary, or the `grafana/k6` container.
   - **L1** (only if the project extends an XAPI module that has a benchmark engine — Cart/Order
     today): .NET 10 SDK + the project's benchmark runner projects.
   - **L0 companion lenses (optional, soft prerequisite).** The generic .NET perf lenses live in a
     *different* marketplace, so vc-perf does not hard-depend on them. Detect whether `dotnet-diag`
     (`analyzing-dotnet-performance`) and `dotnet-data` (`optimizing-ef-core-queries`) are installed;
     if not, print the commands to add them and let the operator opt in — do not force:
     `/plugin marketplace add VirtoCommerce/dotnet-agent-skills` (confirm the exact source) then
     `/plugin install dotnet-diag@... dotnet-data@...`. The VC-specific L0 list
     (`$pluginRoot/knowledge/vc-perf-antipatterns.md` — `$pluginRoot` = this plugin's active install
     path, resolved once per task via `claude plugin list --json`, see `knowledge/plugin-root.md`;
     NOT a shell variable, `$CLAUDE_PLUGIN_ROOT` does not expand in the Bash tool shell) ships with
     this plugin and needs nothing installed.

3. **Add the `perf` block to `project-profile.json`** — additive deepMerge, never rewrite the
   vc-fix profile. Ask only what is perf-specific and not already derivable:
   - how the backend runs locally → `perf.aspireHostPath` (Aspire) or `perf.backendUrl` (plain URL)
   - the store context for load tests → `perf.storeId` + `perf.currencyCode` / `perf.cultureName`
     (defaults `USD` / `en-US`)
   - the platform process name for trace attribution → `perf.platformProcess` (default `VirtoCommerce.Platform.Web`)
   - which XAPI modules the project extends (L1 candidates) → `perf.benchmark.xapiTargets` + `runnerDirs`
   - load-test fixtures (a buyable product / org / config ids) — discover from the live catalog where
     possible, don't hardcode → `perf.loadtest.fixtures`. Note: the harness does not read this key
     directly — export it as `PRODUCT_IDS` (comma-separated) when invoking `run.sh` (see
     `perf-loadtest/SKILL.md`). `perf.loadtest.seedEndpoint` is likewise recorded for reference only;
     no script currently consumes it.
   See `project-profile.example.json` for the block shape.

4. **Collect the load-test credentials** (only if load testing — L2). The harness authenticates as a
   real user on the target deployment through `PERF_API_USER` / `PERF_API_PASSWORD` — `run.sh` hard-requires
   both (`: "${PERF_API_USER:?}"`), so onboarding must obtain them or the first run aborts. Ask the operator
   for a load-test user that can complete the scenario end to end (e.g. place an order for `cart-order-loop`),
   and write the pair to the **gitignored `.env.local`** (the vc-fix per-developer secrets file) — never
   `project-profile.json` and never a committed `.env.<env>`. These are the **local** load credentials, and
   they are deliberately distinct from the cloud `LOGIN` / `PASSWORD` the pipeline environment uses: keep the
   two separate, do not reuse or fall back between them.

5. **Verify** — print the resolved `perf` block and the detected toolchain (which layers are runnable
   given the installed prerequisites), and confirm `PERF_API_USER` / `PERF_API_PASSWORD` are present in
   `.env.local` when L2 is in scope (report presence only — never echo the values). Do not proceed to a run.
