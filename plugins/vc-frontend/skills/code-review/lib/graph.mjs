// The module graph from the repository's own dependency-cruiser, so fan-out is what the bundler
// resolves, not a grep; and the questions asked of it: who consumes a file, what the facade exposes,
// which critical flow renders it.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { escapeRe } from "./globs.mjs";
import { gitGrep, readHead } from "./git.mjs";
import { BARREL, CRITICAL_REACH_DEPTH, CRITICAL_REACH_MAX_CONSUMERS, CRITICAL_ZONES, FACADE_ENTRY, HUB, PUBLIC_BARREL, TEST_LIKE, zoneOf } from "./zones.mjs";

export function moduleGraph(ctx) {
  if (!existsSync(".dependency-cruiser.cjs") && !existsSync(".dependency-cruiser.js")) return null;
  const config = existsSync(".dependency-cruiser.cjs") ? ".dependency-cruiser.cjs" : ".dependency-cruiser.js";
  let out;
  try {
    // tsPreCompilationDeps: count `import type` too; the facade exports many types.
    out = execFileSync("npx", ["--no-install", "depcruise", "client-app", "--config", config, "--output-type", "json", "--ts-pre-compilation-deps"], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    ctx.warnings.push(`dependency-cruiser failed: ${String(e.stderr || e.message).split("\n")[0]}`);
    return null;
  }
  const modules = JSON.parse(out).modules;
  const deps = new Map();
  const rev = new Map();
  // Import specifier → resolved path per module, for the impact map: `@/shared/cart` means a file.
  const resolve = new Map();
  for (const m of modules) {
    const targets = m.dependencies.map((d) => d.resolved).filter((r) => r.startsWith("client-app/"));
    deps.set(m.source, targets);
    resolve.set(m.source, new Map(m.dependencies.map((d) => [d.module, d.resolved])));
    for (const t of targets) {
      if (!rev.has(t)) rev.set(t, new Set());
      rev.get(t).add(m.source);
    }
  }
  return { deps, rev, resolve, consumers: new Map(), tagUsers: new Map() };
}

export function isBarrel(p) {
  return BARREL.test(p);
}

// Direct consumers, looking through barrel files. A module that imports the barrel counts only if it
// names something this file exports: a barrel import alone says nothing about which export is used.
export function consumersThroughBarrels(g, file) {
  if (g.consumers.has(file)) return g.consumers.get(file);
  const names = exportedNames(file);
  let nameRe = null;
  const usesName = (c) => {
    if (!names.length) return false;
    nameRe ??= new RegExp(`(^|[^\\w-])(${names.map(escapeRe).join("|")})([^\\w-]|$)`);
    return nameRe.test(readHead(c));
  };
  const consumers = new Set();
  const barrels = new Set();
  const seen = new Set([file]);
  const queue = [...(g.rev.get(file) ?? [])].map((c) => ({ c, viaBarrel: false }));
  while (queue.length) {
    const { c, viaBarrel } = queue.shift();
    if (seen.has(c)) continue;
    seen.add(c);
    if (TEST_LIKE.test(c)) continue;
    if (isBarrel(c) && !c.startsWith("client-app/core-api/")) {
      barrels.add(c);
      queue.push(...[...(g.rev.get(c) ?? [])].map((x) => ({ c: x, viaBarrel: true })));
      continue;
    }
    if (!viaBarrel || usesName(c)) consumers.add(c);
  }
  const result = { consumers: [...consumers].sort(), barrels: [...barrels] };
  g.consumers.set(file, result);
  return result;
}

// ui-kit components are registered globally, so templates use their tag without any import: those
// users come from a grep, run once per component name.
export function directConsumers(g, file) {
  const { consumers: found, barrels } = consumersThroughBarrels(g, file);
  const consumers = new Set(found);
  const names = exportedNames(file);
  if (file.startsWith("client-app/ui-kit/") && file.endsWith(".vue") && names.length) {
    const key = names.join("|");
    if (!g.tagUsers.has(key)) g.tagUsers.set(key, gitGrep(names, "client-app", ["*.vue"]));
    for (const c of g.tagUsers.get(key)) if (c !== file && !TEST_LIKE.test(c)) consumers.add(c);
  }
  return { consumers: [...consumers].sort(), barrels: barrels.filter((b) => PUBLIC_BARREL.test(b)).sort() };
}

// A file outside the critical zones that a critical flow still renders or calls — the address form
// inside checkout's shipping step. Walks importers upward and stops at the app shell (router, bootstrap,
// module registration), which imports everything and would make every file "critical". It goes
// CRITICAL_REACH_DEPTH importers up, and never from or through a widely used file: a constant that
// checkout imports among forty others is not checkout code.
export function criticalReach(g, file) {
  const own = zoneOf(file);
  if (own && CRITICAL_ZONES.includes(own.id)) return null;
  const wide = (m) => consumersThroughBarrels(g, m).consumers.length > CRITICAL_REACH_MAX_CONSUMERS;
  if (wide(file)) return null;
  const parent = new Map([[file, null]]);
  const depth = new Map([[file, 0]]);
  const queue = [file];
  while (queue.length) {
    const m = queue.shift();
    if (depth.get(m) >= CRITICAL_REACH_DEPTH) continue;
    for (const c of consumersThroughBarrels(g, m).consumers) {
      if (parent.has(c) || TEST_LIKE.test(c) || HUB.test(c)) continue;
      parent.set(c, m);
      depth.set(c, depth.get(m) + 1);
      const z = zoneOf(c);
      if (z && CRITICAL_ZONES.includes(z.id)) {
        const chain = [];
        for (let x = c; x; x = parent.get(x)) chain.push(x.replace(/^client-app\//, ""));
        chain.reverse();
        return { zone: z.id, chain };
      }
      if (!wide(c)) queue.push(c);
    }
  }
  return null;
}

// What a module exports, as consumers would write it: `vc-popover.vue` → VcPopover and vc-popover;
// a .ts module → its exported declarations and export lists.
export function exportedNames(file, text = null) {
  const base = path.basename(file).replace(/\.(vue|ts|tsx|js|mjs)$/, "");
  if (file.endsWith(".vue")) {
    const pascal = base.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase());
    return [...new Set([pascal, base])];
  }
  const source = text ?? readHead(file);
  const names = new Set();
  for (const m of source.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function\*?|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of source.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
      if (name && name !== "default") names.add(name);
    }
  }
  return [...names];
}

// Files the plugin facade re-exports. Through a barrel only the files whose exports the facade names
// count: `export { VcPopover } from "@/ui-kit/components/molecules"` exposes vc-popover.vue, not every molecule.
export function facadeExportSet(g) {
  const entries = [...g.deps.keys()].filter((m) => FACADE_ENTRY.test(m));
  const facadeText = entries.map((m) => readHead(m)).join("\n");
  const named = (m) => exportedNames(m).some((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(facadeText));
  const out = new Set();
  const queue = entries.flatMap((m) => g.deps.get(m)).map((m) => ({ m, viaBarrel: false }));
  const seen = new Set();
  while (queue.length) {
    const { m, viaBarrel } = queue.shift();
    if (seen.has(m)) continue;
    seen.add(m);
    if (m.startsWith("client-app/core-api/")) continue;
    if (isBarrel(m)) queue.push(...(g.deps.get(m) ?? []).map((x) => ({ m: x, viaBarrel: true })));
    else if (!viaBarrel || named(m)) out.add(m);
  }
  return out;
}
