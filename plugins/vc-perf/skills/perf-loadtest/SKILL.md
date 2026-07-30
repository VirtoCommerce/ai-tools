---
name: perf-loadtest
description: Run the L2 k6 load harness against the live Aspire-hosted backend and produce a summary + optional dotnet-counters CSV. Use to answer "how does the running system behave under load" — throughput, p95 latency, GC pressure — as opposed to L1 (BenchmarkDotNet, code-level) or L3 (dotnet-trace, attribution).
---

# perf-loadtest — L2 of the three-layer performance loop

The middle layer of the loop (**L1 bench → L2 load → L3 diagnose**, see skill `perf-loop`
for the router and cross-layer discipline). L2 drives the real backend with k6 and answers "how
does the system behave under load" — throughput, p95 latency, error rate, GC counters — as
opposed to L1's mocked-I/O code-level verdict or L3's WHY-attribution.

## Running it

> **Resolving `$pluginRoot`**: every command below uses `$pluginRoot` as a placeholder for this
> plugin's active install path — resolve it once per task via `claude plugin list --json` (see
> [`../../knowledge/plugin-root.md`](../../knowledge/plugin-root.md)) and reuse it. It is NOT a
> shell variable and `$CLAUDE_PLUGIN_ROOT` does **not** expand in the Bash tool shell.

```bash
$pluginRoot/skills/perf-loadtest/loadtests/run.sh smoke    # 1 VU × 3 iterations — liveness
$pluginRoot/skills/perf-loadtest/loadtests/run.sh steady   # ramp + hold
```

Target the backend at `perf.backendUrl` from `project-profile.json` (pass it as `BASE_URL`, the
harness's own env knob — k6 has no direct file-read access to the profile). Pass
`perf.platformProcess` as `PLATFORM_PROCESS` so the L3 EventPipe sidecar attaches to the right
backend process (projects that rename the host binary must set this, or the sidecar silently
skips):

```bash
BASE_URL="$(jq -r .perf.backendUrl "${PROJECT_PROFILE_PATH:-project-profile.json}")" \
  STORE_ID="$(jq -r .perf.storeId "${PROJECT_PROFILE_PATH:-project-profile.json}")" \
  CURRENCY_CODE="$(jq -r '.perf.currencyCode // "USD"' "${PROJECT_PROFILE_PATH:-project-profile.json}")" \
  CULTURE_NAME="$(jq -r '.perf.cultureName // "en-US"' "${PROJECT_PROFILE_PATH:-project-profile.json}")" \
  PLATFORM_PROCESS="$(jq -r '.perf.platformProcess // "VirtoCommerce.Platform.Web"' "${PROJECT_PROFILE_PATH:-project-profile.json}")" \
  $pluginRoot/skills/perf-loadtest/loadtests/run.sh steady
```

Full knob list, prerequisites (k6 binary, credentials, `dotnet-counters`), the user-pool mechanism
for multi-user concurrency, and orchestration gotchas: `loadtests/README.md`.

### `perf.loadtest.*` profile keys are operator-bridged, not auto-read

`run.sh` and the k6 scenarios read **env vars only** (k6 has no direct file-read access to the
profile) — the `perf.loadtest` keys in `project-profile.json` are not piped in automatically:

- `perf.loadtest.fixtures.productIds` — export `PRODUCT_IDS=<comma-separated ids>` yourself (e.g.
  `PRODUCT_IDS="$(jq -r '.perf.loadtest.fixtures.productIds | join(",")' "${PROJECT_PROFILE_PATH:-project-profile.json}")"`)
  before invoking `run.sh`; the scenarios read `__ENV.PRODUCT_IDS`, not the profile file.
- `perf.loadtest.seedEndpoint` — currently **reserved/unused**: no script or scenario in this
  harness reads it. Treat it as documentation of where a seed-users endpoint lives, not a wired
  knob, until a consumer is added.

## Consumer scenarios/queries: point `PAYLOAD_DIR` at your own dir — do NOT edit the install

Everything under `loadtests/scenarios/` and `loadtests/queries/` scripts the **standard
vc-frontend** GraphQL operations (`getFullCart`, `addItemsCart`, `createOrderFromCart`) — with one
deliberate exception, `clearCart.graphql`, a schema-valid, vendor-neutral fixture document (no
standard storefront mutation clears a whole cart). If your client project overrides the storefront
schema, the shipped documents may not match it exactly — re-resolve them against your own frontend
before relying on the numbers.

**Do NOT edit the plugin's own `scenarios/`/`queries/`.** This skill runs from an install-managed
clone (marketplace/cache), so edits there are ephemeral (wiped on plugin update) and pollute a repo
you don't own. Instead keep your project's scenarios (+ queries) in a **consumer-owned directory**
and point the harness at it with `PAYLOAD_DIR`:

```bash
# in your repo, e.g.  perf-payload/{scenarios/<name>.js, queries/*.graphql}
PAYLOAD_DIR="$PWD/perf-payload" SCENARIO=<name> \
  BASE_URL=... STORE_ID=... \
  $pluginRoot/skills/perf-loadtest/loadtests/run.sh steady
```

`run.sh` assembles a temp run-dir combining the plugin's generic transport (`lib/auth.js`,
`lib/gql.js`) + `config.js` with your `PAYLOAD_DIR/scenarios/` (and `queries/` if present), so you
reuse the stable auth/gql layer and own only the project-specific documents. `PAYLOAD_DIR` must
contain a `scenarios/` dir; `queries/` is optional. Keep the transport generic — never copy `lib/`
into your payload. Set `STORE_ID` (backs `config.js`'s `STORE.storeId`) from `perf.storeId`.

## Role in the loop

Use L2 to answer "how does N/RATE affect latency/GC on the real stack?" — for "did my code
change regress?" use L1 (`perf-benchmark`); for "who is responsible?" run L3
(`perf-trace` skill / `perftools/`) under an L2 scenario driving load.
