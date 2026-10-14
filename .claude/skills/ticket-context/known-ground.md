# Block 4 — known ground

## The script half

`node "<skill>/lib/cli.mjs" known --prepare <prepare_path>` → `known.json`. The domain is the one given
to `prepare --domain`. Run it after CHANGE returned, so its GraphQL operations and endpoints feed
`tc:scope`, an endpoint as its literal path (`GET /api/orders/{id}` → `/api/orders`: cases name the path, not the method); a name with unexpected characters (or a leading `-`), or a route under two literal segments, is not passed and is a gap. Each lookup
runs only when this install declares the script; otherwise it is `GAP: not-available-in-install`.

| What | Script | In the bundle |
|---|---|---|
| domain map state | `domain:check --json` | `known.domain_map` — `PRESENT` / `STALE` / `ABSENT` / `unresolved`, path |
| mind map | the domain map's file name with `.mind-map.json` | `known.mind_map.path` |
| BL invariants | `bl:extract --domain <slug> --json` | `known.bl` — id, title, severity |
| cases at risk | `regression:select` per repo (staleness-rotation picks dropped) · `tc:scope` with the operations | `known.cases_at_risk` |
| prior runs and bugs | `reports/tickets/*/<KEY>/`, `reports/ba/test-models/<KEY>-*`, `reports/bugs/**` naming the key | `known.prior_runs` |

A `STALE` map is read as hypotheses. This skill never builds or refreshes a map.

## The `kb` half — you

What the platform was **observed** to do is looked up, never grepped. The `kb` tools are deferred:
load them with `ToolSearch` `select:mcp__kb__kb_ask,mcp__kb__kb_show,mcp__kb__kb_none`. Without the
server, use `npm run kb -- ask "<q>" --json`, `show`, `none`.

**Two different empties — never write them alike.** `npm run kb` exit 1 (nobody has written it down)
⇒ that coordinate's row with `entries: []`. Exit 3, or neither the server nor the CLI available ⇒ the
base was **not read**: write `kb.out.json` as
`{"kb":[{"coordinate":"*","entries":[],"trust":"not-read","answer":"the base was not read (<reason>)"}]}`.
Step 7 then reports `kb: not read (<reason>)`. **A client install never asks:** when `prepare.json`
`project_type` is `client`, write that not-read row with the reason `client install (O3)` and skip the
steps below — the base is public, and a client's coordinates do not go into it.

1. **Coordinates.** The GraphQL operations, REST endpoints and storefront page paths in
   `change.out.json`, at most 5, most specific first. A coordinate covered by the caller's `--kb-hits`
   is not asked again.
2. **The question is the coordinate plus what is asked of it, in product words** —
   `"<OperationName> GraphQL operation — what does it return when <condition>?"`. Never ticket text,
   customer names, hosts or ids: the base stores questions verbatim in a **public** repository.
3. **Close every ask** with its handle: `kb_show` the entry you rely on, or `kb_none`. A list of close
   entries is not an answer.
4. **Write `<run_dir>/kb.out.json`:**
   `{"kb":[{"coordinate":"…","entries":["KB-…"],"trust":"…","answer":"<one line, what the entry says>"}]}`.
   An empty `entries` means the base has nothing — a finding for the consumer, who owns capture. This
   skill never captures, confirms or disputes.
