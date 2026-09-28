// sync-stdio — the behaviour it exists for: output written right before process.exit() survives
// a PIPE. Measured in a child process, because the bug only exists across a real pipe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const helper = fileURLToPath(new URL("../lib/sync-stdio.mjs", import.meta.url));
const bytes = 300_000; // several pipe buffers, so an unflushed tail cannot hide inside the first one
const child = (withFix) =>
  spawnSync(process.execPath, ["--input-type=module", "-e",
    `${withFix ? `await import(${JSON.stringify(pathToFileURL(helper).href)});` : ""}
     process.stdout.write("x".repeat(${bytes})); process.exit(0);`], { maxBuffer: 10 * bytes });

test("output written just before process.exit() reaches a pipe in full", () => {
  const r = child(true);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.length, bytes);
});

test("the helper is a no-op outside a pipe and never throws", async () => {
  await import(pathToFileURL(helper).href); // the test runner's own stdio — whatever it is, importing must not fail
});

// The guard, so a NEW script cannot reintroduce the bug: any CLI in scripts/ or ci/ that writes to
// stdout and calls process.exit() must import the helper. plugins/** and .claude/hooks/** are out of
// scope on purpose — the plugin ships its own copies (a change there is a release), and hooks print a
// few bytes of hook JSON.
test("every script that prints and then calls process.exit() imports sync-stdio", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const missing = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "unit") walk(p);
      } else if (/\.(mjs|js|ts)$/.test(e.name) && !p.endsWith("sync-stdio.mjs")) {
        const src = readFileSync(p, "utf8");
        if (/process\.exit\(/.test(src) && /console\.log|process\.stdout\.write/.test(src) && !src.includes("sync-stdio.mjs")) {
          missing.push(relative(root, p).replace(/\\/g, "/"));
        }
      }
    }
  };
  for (const d of ["scripts", "ci"]) walk(join(root, d));
  assert.deepEqual(missing, [], `add \`import "<rel>/scripts/lib/sync-stdio.mjs";\` as the first import of: ${missing.join(", ")}`);
});
