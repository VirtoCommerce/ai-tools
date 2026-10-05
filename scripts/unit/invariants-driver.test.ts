// End-to-end test of the REQ-03 live driver (scripts/invariants/run.ts) and the REQ-01 response mutants
// (scripts/detection/mutant-preload.mjs) against an in-process mock of the xAPI `products` / `product`
// operations. The pure verdicts have their own tests; this one pins what only the whole path can get wrong:
// paging by offset, the exit-code contract (0 pass · 2 violated · 3 could not run), the silent-200 class
// reported as a violation, and DETECTION_OP scoping a mutant to one layer so a parity check can see it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";

const TSX = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const RUN = fileURLToPath(new URL("../invariants/run.ts", import.meta.url));
const PRELOAD = pathToFileURL(fileURLToPath(new URL("../detection/mutant-preload.mjs", import.meta.url))).href;

const ITEMS = Array.from({ length: 45 }, (_, i) => ({
  id: `p${String(i + 1).padStart(2, "0")}`,
  code: `SKU-${i + 1}`,
  name: `Item ${i + 1}`,
  price: { actual: { amount: 10 + i } },
}));

function mockXapi(): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const { query, variables: v } = JSON.parse(raw);
      let data: unknown;
      if (/product\(id/.test(query)) data = { product: ITEMS.find((x) => x.id === v.id) ?? null };
      else {
        const list = v.sort === "price:desc" ? [...ITEMS].reverse() : ITEMS;
        const from = Number(v.after ?? 0);
        data = { products: { totalCount: list.length, items: list.slice(from, from + (v.first ?? 20)) } };
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function run(port: number, args: string[], extra: Record<string, string> = {}): Promise<{ exit: number | null; out: string }> {
  // A TEST_ENV with no .env.<env> file, so nothing on disk overrides the mock's BACK_URL; config.js still
  // demands its core variables, which get throwaway values.
  const env = {
    ...process.env,
    TEST_ENV: "invdrivertest",
    BACK_URL: `http://127.0.0.1:${port}`,
    STORE_ID: "mock",
    FRONT_URL: "http://127.0.0.1:1",
    ADMIN: "x",
    ADMIN_PASSWORD: "x",
    USER_EMAIL: "x",
    USER_PASSWORD: "x",
    NO_PROXY: "127.0.0.1,localhost",
    ...extra,
  };
  // Async, not spawnSync: the mock server lives in this process and must keep answering while the driver runs.
  return new Promise<{ exit: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [TSX, RUN, ...args], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (exit) => resolve({ exit, out }));
  });
}

const mutated = (id: string, op?: string) => ({
  NODE_OPTIONS: `--import=${PRELOAD}`,
  DETECTION_MUTANT: id,
  ...(op ? { DETECTION_OP: op } : {}),
});

test("the driver passes a clean listing and fails each mutant of its own bug class", async () => {
  const server = await mockXapi();
  const { port } = server.address() as AddressInfo;
  try {
    assert.equal((await run(port, ["page-walk"])).exit, 0);
    assert.equal((await run(port, ["sort-set", "--sort", "price:desc"])).exit, 0);
    assert.equal((await run(port, ["layer-parity", "--limit", "5"])).exit, 0);

    const truncated = await run(port, ["page-walk"], mutated("TRUNCATE_PAGE"));
    assert.equal(truncated.exit, 2, truncated.out);
    assert.match(truncated.out, /page 1 is short \(1 of 20\) but is not the last page/);

    const silent = await run(port, ["page-walk"], mutated("SILENT_ERROR"));
    assert.equal(silent.exit, 2, silent.out);
    assert.match(silent.out, /carried errors\[\] next to data/);

    assert.equal((await run(port, ["sort-set", "--sort", "price:desc"], mutated("SORT_REVERSED"))).exit, 2);

    // A mutant on every response changes both layers the same way; scoped to the listing it must be seen.
    assert.equal((await run(port, ["layer-parity", "--limit", "5"], mutated("MONEY_ZERO"))).exit, 0);
    const parity = await run(port, ["layer-parity", "--limit", "5"], mutated("MONEY_ZERO", "products\\("));
    assert.equal(parity.exit, 2, parity.out);
    assert.match(parity.out, /price is 0 in the listing, 10 live/);
  } finally {
    server.close();
  }
});

test("a check that cannot reach the stand exits 3, never 0 and never 2", async () => {
  const r = await run(1, ["page-walk"]);
  assert.equal(r.exit, 3, r.out);
  assert.match(r.out, /could not run/);
});
