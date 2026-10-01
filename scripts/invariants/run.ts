/**
 * `inv:run` — run one cross-cutting invariant (REQ-03) against the live xAPI and print its verdict.
 *
 * This file only FETCHES. The verdict is the pure function in the check's own module, so what it decides
 * is unit-tested without a stand (`scripts/unit/invariants.test.ts`). Context comes from the layered env
 * (`BACK_URL`, `STORE_ID`, `CURRENCY_CODE`, `CULTURE_NAME`) through `contextFromEnv`, never from literals.
 *
 * Usage:
 *   npm run inv:run -- page-walk    [--query <q>] [--filter <f>] [--page-size 20] [--expected <n>]
 *   npm run inv:run -- sort-set     --sort "price:asc" [--query <q>] [--filter <f>] [--page-size 20]
 *   npm run inv:run -- layer-parity [--query <q>] [--filter <f>] [--limit 20]
 *
 * Exit codes: 0 pass · 2 the invariant is VIOLATED · 3 the check could not run (network, GraphQL errors,
 * bad arguments) · 1 is `config.js` refusing a missing core env var, which is also "could not run". A check
 * that could not run is never reported as a pass, and never as a violation either.
 */
import "../../config.js"; // loads the .env layers into process.env
import "../lib/sync-stdio.mjs";
import { fileURLToPath } from "url";
import { executeOperation } from "../lib/graphql-executor.ts";
import { contextFromEnv, type DiscoverContext } from "../lib/live-discover.ts";
import { flagValue, intFlag, rejectUnknownFlags } from "../lib/cli-args.ts";
import { pageWalk, type Verdict, type WalkedPage } from "./page-walk.ts";
import { sortSet } from "./sort-set.ts";
import { layerParity, type Fields } from "./layer-parity.ts";

const MAX_PAGES = 50;

const Q_PAGE = `
  query($storeId: String!, $userId: String, $currencyCode: String, $cultureName: String,
        $query: String, $filter: String, $sort: String, $first: Int, $after: String) {
    products(storeId: $storeId, userId: $userId, currencyCode: $currencyCode, cultureName: $cultureName,
             query: $query, filter: $filter, sort: $sort, first: $first, after: $after) {
      totalCount
      items { id code name price { actual { amount } } }
    }
  }
`;

const Q_PRODUCT = `
  query($id: String!, $storeId: String!, $userId: String, $currencyCode: String, $cultureName: String) {
    product(id: $id, storeId: $storeId, userId: $userId, currencyCode: $currencyCode, cultureName: $cultureName) {
      id code name price { actual { amount } }
    }
  }
`;

interface Item { id: string; code: string; name: string; price?: { actual?: { amount?: number } } }

/**
 * A `200` whose body carries `errors[]` next to `data` is the silent-200 bug class: the caller gets an
 * answer that looks fine. It is a VIOLATION of every check, never "could not run" and never a pass.
 */
class Silent200 extends Error {}

async function gql<T>(ctx: DiscoverContext, query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await executeOperation(query, { storeId: ctx.storeId, userId: ctx.userId, currencyCode: ctx.currencyCode, cultureName: ctx.cultureName, ...variables }, {
    backUrl: ctx.backUrl,
    token: ctx.token,
    timeoutMs: ctx.timeoutMs,
  });
  if (r.ok && r.errors.length && r.data) throw new Silent200(`HTTP ${r.status} carried errors[] next to data: ${r.errors.map((e) => e.message).join("; ")}`);
  if (!r.ok || r.errors.length) throw new Error(`GraphQL ${r.status}: ${r.errors.map((e) => e.message).join("; ") || r.rawBody.slice(0, 200)}`);
  return r.data as T;
}

/** Walk a listing to its end by offset; `after` is the number of items already read. */
async function walk(ctx: DiscoverContext, args: { query?: string; filter?: string; sort?: string }, pageSize: number) {
  const pages: WalkedPage[] = [];
  const items: Item[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql<{ products: { totalCount: number; items: Item[] } }>(ctx, Q_PAGE, { ...args, first: pageSize, after: String(items.length) });
    pages.push({ ids: d.products.items.map((x) => x.id), totalCount: d.products.totalCount });
    items.push(...d.products.items);
    if (!d.products.items.length || items.length >= d.products.totalCount) return { pages, items };
  }
  throw new Error(`the listing is longer than ${MAX_PAGES} pages of ${pageSize}; narrow it with --query or --filter`);
}

const priceOf = (x: Item) => x.price?.actual?.amount;
const fieldsOf = (x: Item): Fields => ({ code: x.code, name: x.name, price: priceOf(x) });

async function run(check: string, argv: readonly string[]): Promise<Verdict> {
  const ctx = contextFromEnv();
  const args = { query: flagValue(argv, "--query"), filter: flagValue(argv, "--filter") };
  const pageSize = intFlag(argv, "--page-size", 20);

  if (check === "page-walk") {
    const expected = flagValue(argv, "--expected");
    const { pages } = await walk(ctx, args, pageSize);
    return pageWalk(pages, { pageSize, expectedCount: expected === undefined ? undefined : Number(expected) });
  }
  if (check === "sort-set") {
    const sort = flagValue(argv, "--sort");
    if (!sort) throw new Error('sort-set needs --sort "<field>:<asc|desc>"');
    const [field, dir] = sort.split(":");
    const base = await walk(ctx, args, pageSize);
    const sorted = await walk(ctx, { ...args, sort }, pageSize);
    const walkIssues = [pageWalk(base.pages, { pageSize }), pageWalk(sorted.pages, { pageSize })].flatMap((v) => v.violations);
    const key = (x: Item) => (field === "price" ? priceOf(x) : field === "name" ? x.name : undefined);
    const v = sortSet(base.items.map((x) => x.id), sorted.items.map((x) => ({ id: x.id, key: key(x) })), {
      direction: dir === "asc" || dir === "desc" ? dir : undefined,
    });
    const violations = [...walkIssues, ...v.violations];
    return { pass: violations.length === 0, violations };
  }
  if (check === "layer-parity") {
    const limit = intFlag(argv, "--limit", 20);
    const { items } = await walk(ctx, args, Math.min(pageSize, limit));
    const listed = new Map(items.slice(0, limit).map((x) => [x.id, fieldsOf(x)]));
    const live = new Map<string, Fields | null>();
    for (const id of listed.keys()) {
      const d = await gql<{ product: Item | null }>(ctx, Q_PRODUCT, { id });
      live.set(id, d.product ? fieldsOf(d.product) : null);
    }
    return layerParity(listed, live, ["code", "name", "price"]);
  }
  throw new Error(`unknown check "${check}" (page-walk | sort-set | layer-parity)`);
}

async function main(argv: string[]): Promise<number> {
  rejectUnknownFlags(argv.slice(1), ["--query", "--filter", "--sort", "--page-size", "--expected", "--limit"], [
    "--query", "--filter", "--sort", "--page-size", "--expected", "--limit",
  ]);
  const check = argv[0] ?? "";
  try {
    const v = await run(check, argv.slice(1));
    console.log(JSON.stringify({ check, ...v }, null, 2));
    return v.pass ? 0 : 2;
  } catch (e) {
    if (e instanceof Silent200) {
      console.log(JSON.stringify({ check, pass: false, violations: [e.message] }, null, 2));
      return 2;
    }
    console.error(`inv:run ${check}: could not run — ${(e as Error).message}`);
    return 3;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).then((c) => process.exit(c));
