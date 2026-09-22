# loadtests — L2 walking skeleton (k6, T0 tier)

The missing middle of the perf loop (**bench → load → diagnose → optimize**): a k6 load
harness against the local Aspire-hosted backend. **T0 tier**: k6 binary + `dotnet-counters`,
file-first artifacts, no Grafana/TSDB — the consumer of the results is an agent, not a dashboard.

The scenarios and queries here script the **standard vc-frontend** storefront GraphQL operations
(`getFullCart`, `addItemsCart`, `createOrderFromCart` — see `../queries/`) — with one deliberate
exception, `clearCart.graphql`, a schema-valid, vendor-neutral fixture document (no standard
storefront mutation clears a whole cart). They are examples to adapt: if your client project
overrides the storefront schema, re-resolve these documents against your own frontend before using
them for load testing.

## Prerequisites

- Backend up — via Aspire (`cd <your-aspire-host-dir> && aspire run`, see `perf.aspireHostPath` in the
  profile) or any other way; GraphQL at `<perf.backendUrl>/graphql`.
- k6 binary on PATH (or point `K6` at it). Single Go binary, no Node.
- Credentials: `PERF_API_USER` / `PERF_API_PASSWORD` env vars (required).
- Optional: `dotnet-counters` (`dotnet tool install -g dotnet-counters`) for backend CPU/GC/threadpool capture.

## Run

```bash
loadtests/run.sh smoke    # 1 VU × 3 iterations — liveness + first numbers
loadtests/run.sh steady   # open-model ramp 0→RATE/s over 10s, hold 120s (HOLD to stretch)

SCENARIO=cart-read-loop loadtests/run.sh steady   # read-path subject (see «Scenarios»)
```

Knobs (env): `SCENARIO` (scenario basename under `scenarios/`, default `cart-order-loop`;
non-default scenarios write to `results/<scenario>/<profile>/`) ·
`NO_COUNTERS=1` (skip the dotnet-counters sidecar — REQUIRED when `dotnet-trace` will attach to
the backend pid during the load window; EventPipe is single-consumer) ·
`TRACE=1` (attach `dotnet-trace --profile gc-verbose` INSTEAD of the counters sidecar and write a
`.nettrace` for allocation attribution; it owns the pid exclusively and never falls back to
counters. A capture whose collector had to be force-stopped is renamed `*.suspect.nettrace` — it
has no guaranteed footer and may fail to parse) ·
`TRACE_INT_GRACE` (integer seconds the teardown waits for the trace sidecar to honour SIGINT before
escalating to SIGTERM, default 3. A background child of a non-interactively run script inherits
`SIGINT` as `SIG_IGN`, so on Linux/WSL the signal never lands and a short grace only avoids appending
post-load idle to the capture. On **Windows/Git Bash the collector is a native process and this is
unmeasured** — if traces come back renamed `*.suspect.nettrace` and unparseable there, raise this so
the tool reaches its own `--duration` instead of being force-stopped) ·
`HOLD` (steady hold duration, default `120s` — long holds host sequential L3 captures inside one
run so all captures share identical knobs by construction) ·
`ITEMS` (items per iteration, default 5) · `RATE` (steady arrivals/s, default 5) ·
`PRODUCT_IDS` (comma-separated product ids cycled across items) / `PRODUCT_ID` / `PRODUCT_FILTER`
(else setup discovers the first buyable non-configurable product) ·
`DISTINCT_PRODUCTS` (cart-read-loop only; 0 = all items share one product — max duplication,
best case for per-product memoization; N = discover up to N distinct buyable products and cycle
them across items — the realistic-mix band; setup logs how many were actually found) ·
`SKIP_ORDER=0` (enable the `createOrderFromCart` leg — see «Order leg» below) · `BASE_URL` ·
`STORE_ID` (your store id) · `CURRENCY_CODE` / `CULTURE_NAME` (store currency and culture,
defaults `USD` / `en-US`) · `USER_POOL` (multi-user concurrency, see below) ·
`SEED_PASSWORD` / `SEED_EMAIL_FORMAT` ·
`K6` (k6 binary path — default `k6` on PATH; set it to an off-PATH binary) ·
`PAYLOAD_DIR` (a consumer-owned dir with `scenarios/` (+ optional `queries/`) to run instead of the
bundled ones — the harness combines it with the plugin's generic `lib/` + `config.js` in a temp
run-dir; use this rather than editing the install, see `../SKILL.md`) ·
`RESULTS_DIR` (artifact base dir, default `<install>/results` — set to a workspace path, e.g.
`RESULTS_DIR="$PWD/.vc-perf/results"`, so artifacts survive plugin updates and don't land in the
install-managed clone) ·
`OP_TAG=1` (label requests for L3 attribution, see below) ·
`PERF_SHA` (override the artifact stamp; default is `git rev-parse --short HEAD` of the **cwd**,
and the run header echoes which repo it came from — a shell sitting in another repo otherwise
mislabels the artifact silently).

### `OP_TAG=1` — make requests attributable per operation

Every GraphQL operation POSTs to the same `/graphql` path, so a server-side trace cannot tell
`getFullCart` from `createOrderFromCart`. With `OP_TAG=1` the harness posts to
`/graphql?op=<operation>` instead, which makes each request self-labelling for
`perftools/op_attrib.mjs` (L3). Default OFF, so the measured request is byte-identical unless
attribution is explicitly asked for — GraphQL ignores unknown query parameters, and the harness's
own "no GraphQL errors" check is what proves it per backend.

**Runtime caveat:** this relies on the server span carrying the query string as `url.query`, which
is version-dependent — verified on .NET 10 / Aspire (2026-07-26), but ASP.NET Core has historically
omitted `url.query` pending redaction support. `op_attrib.mjs` warns loudly (`0 of N requests carried
an "op=" label`) rather than silently pooling every operation under `/graphql`, since that output
would otherwise look identical to a correct run with the flag unset.

Pair it with a **1 VU** capture (`smoke`): attribution assigns each client span to the request whose
time interval contains it, which requires non-overlapping requests.

```bash
aspire otel spans backend --apphost "$AH" --follow --format Json --non-interactive > spans.json &
OP_TAG=1 ITERATIONS=6 loadtests/run.sh smoke        # 1 VU, sequential
kill %1
node ../perf-trace/perftools/op_attrib.mjs spans.json --last   # paths relative to skills/perf-loadtest/
```

## User pool (multi-user concurrency)

A single-user run serializes on one cart (the aggregate cache + per-user lock), so it cannot
surface GC-pressure/contention on the save path. `USER_POOL>0` fans the load across N distinct
seeded users — each VU picks one by `__VU`, so N carts hit the per-user save path concurrently.

Seeding a pool of login-capable users is project-specific (there is no standard storefront
endpoint for this) — adapt to whatever seeding mechanism your project provides, then point
`SEED_EMAIL_FORMAT` / `SEED_PASSWORD` at the seeded accounts:

```bash
USER_POOL=50 RATE=20 loadtests/run.sh steady
```

> **Claude Code sandbox note:** to dial the local backend, `run.sh` must run OUTSIDE the CC
> sandbox, which means its command must match an entry in `sandbox.excludedCommands`. The skill
> invokes it by **absolute path without a `bash` prefix** (`<pluginRoot>/skills/perf-loadtest/loadtests/run.sh …`),
> so a relative `bash loadtests/run.sh:*` entry does **not** match — add the resolved absolute form
> instead: `<pluginRoot>/skills/perf-loadtest/loadtests/run.sh:*` (the path is per-install — resolve
> `$pluginRoot` via `claude plugin list --json`). Once matched, k6 dials the backend fine — just run
> it normally. Do **NOT** pass `dangerouslyDisableSandbox` (it doesn't help here and breaks AF_UNIX
> for sibling tooling like `dotnet-trace`). For L3 trace capture during the load window, see the
> `perf-trace` skill's `perftools/README.md` → "Agentic run".

## Scenarios

| Scenario (`SCENARIO=`) | Iteration shape | Measures |
|---|---|---|
| `cart-order-loop` (default) | clearCart → add items → read → (optional) order, per iteration | mutation path (per-user lock, save path) |
| `cart-read-loop` | carts built ONCE in `setup()` (`ITEMS` = cart size, one cart per pool user), measured loop is a pure `getFullCart`; carts are not cleaned up between runs — `clearCart` empties a cart, it does not delete one, and there is still no standard cart-removal op | read path (aggregate cache, GraphQL projection); `ITEMS` is the cart-size band knob (5/50/200) |

## What one iteration does (cart-order-loop)

Default (`SKIP_ORDER=1`, the walking skeleton): `clearCart` → `addItemsCart` (ITEMS items in one
call) → `getFullCart`.

`SKIP_ORDER=0`: the same, plus `createOrderFromCart` on the resulting cart. Whether an
otherwise-empty/default cart already satisfies your store's checkout validation rules is
project-specific — verify before relying on this leg for a real number.

Every measured operation uses the **standard vc-frontend** GraphQL document (`../queries/`, with
fragments inlined for k6 since it sends one document per request). Product discovery (both
scenarios) uses a minimal, non-storefront setup query — see `setup()`.

## Measurement discipline

- HTTP 200 with a GraphQL `errors` body **counts as failure** (`gql()` checks both). The fixture
  `clearCart` call is the one exception: it goes through `gqlQuiet`, which warns on a GraphQL
  errors body but records no check — deliberately kept out of the measured thresholds, not a
  measurement subject.
- **PRODUCT_IDS drift:** `addItemsCart` can no-op on a stale/disabled product id instead of
  erroring (the platform's async-settle / disabled-product-is-a-silent-no-op behavior) — a
  green HTTP 200 with no GraphQL errors but an effectively empty cart. Both scenarios assert
  the settled `itemsQuantity` (total unit count), NOT `items.length` — adding the same product
  multiple times consolidates into one line item with quantity summed (see cart platform's
  same-SKU-merges-not-duplicates rule), so `items.length` varies with how many distinct
  products an iteration used while `itemsQuantity` is always `ITEMS` regardless of
  consolidation. `cart-order-loop` checks this via a `getFullCart` check per iteration;
  `cart-read-loop` verifies it once in `setup()` before the cart is handed to the measured
  loop — so a drifted `PRODUCT_IDS` fails loud instead of silently measuring the wrong
  workload/cart-size band. Refresh `PRODUCT_IDS` (or reseed your test data) if this fires.
- Per-operation latency via `http_req_duration{name:<op>}` sub-metrics; thresholds are loose
  skeleton ceilings — tighten after a baseline.
- Token acquired **once** in `setup()`, reused across VUs.
- Artifacts land in `$RESULTS_DIR/<profile>/<stamp>-<sha>.summary.json` (+ `.counters.csv` when
  `dotnet-counters` is available) — commit SHA in the name so runs compare like-with-like.
  `RESULTS_DIR` defaults to `<install>/results` (ephemeral — wiped on plugin update); set it to a
  workspace path to keep artifacts.
- **Co-location caveat:** k6 + backend + DB on one machine → relative comparisons only, no
  absolute CPU claims. State the topology with every number.
- L2 is noisy: compare distributions across repeated runs, never single p95s.
- **Reduce each rep with `tools/parse_rep.mjs <summary.json>`** rather than reading summaries side by
  side — it emits iterations, rate, iteration duration, per-operation p95/med/count and the
  scenario's own counters as one small JSON. Iteration count is
  `metrics.iterations.values.count`; the shallower `metrics.iterations.count` is `undefined`, which
  silently becomes 0 and turns any per-iteration figure into a division by zero. A counter the
  scenario never declared is omitted rather than printed as 0 — "this scenario places no orders" and
  "this run placed no orders" must not look alike.

## Orchestration gotchas (cost real time once, 2026-07-09)

- **`VAR=x && cmd > "$VAR" &` backgrounds the WHOLE `&&` chain** — including the variable
  assignments, which then never reach the parent shell (empty `$VAR` downstream). Assign
  variables on their own lines first; background only the command (`ENV=x cmd &`).
- **`pgrep -f 'k6 run'` matches the orchestrating shell's own command line** (the script text
  contains the words) — a "wait for k6 to exit" loop deadlocks on itself. Use `pgrep -x k6`.
- **`kill $!` on a backgrounded wrapper does not kill its k6 child** — the run keeps loading
  the backend after the wrapper dies. Kill the process group or `pkill -x k6`.

## Not yet built (next increments)

- Full-surface **smoke sweep** over the operation catalog — the skeleton scenarios cover
  the Class-A representative, the order terminal flow, and the read-path subject.
- Mutation × read **interleave** profile (the `CartProducts` race probe).
- `USER_POOL` read band — N distinct cached aggregates (memory-footprint axis of the aggregate
  cache); `cart-read-loop` supports the pool, the band run hasn't been done.
- DB seed/reset step between runs — currently no cleanup between runs; plan DB hygiene
  separately for your project.
