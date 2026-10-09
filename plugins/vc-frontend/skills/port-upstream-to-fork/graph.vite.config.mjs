// Wraps the repository's own vite.config.ts and adds one plugin that writes the module graph of a
// production build to $GRAPH_OUT: for every app module, what it imports by name (from the parsed AST,
// resolved by Vite's own resolver), what it re-exports, and how much of it survived tree-shaking.
// fork-drift.mjs copies this file into a temporary worktree and runs `vite build --config` on it.

import fs from "node:fs";
import path from "node:path";
import { loadConfigFromFile, mergeConfig } from "vite";

const root = process.cwd();
const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, path.join(root, "vite.config.ts"), root);

const APP = `${root}/client-app/`;
const parsed = new Map(); // id -> { imports: [{ source, names }], reexports: [{ source, imported, exported }] }

function walkDynamic(node, out) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "ImportExpression" && node.source?.type === "Literal") out.push(node.source.value);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) value.forEach((v) => walkDynamic(v, out));
    else if (value && typeof value === "object" && key !== "parent") walkDynamic(value, out);
  }
}

const graphDump = {
  name: "fork-drift-graph",
  enforce: "post",
  moduleParsed(info) {
    if (!info.id.startsWith(APP) || !info.ast) return;
    const imports = [];
    const reexports = [];
    for (const node of info.ast.body) {
      if (node.type === "ImportDeclaration") {
        const names = node.specifiers.length
          ? node.specifiers.map((s) => (s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportNamespaceSpecifier" ? "*" : s.imported.name ?? s.imported.value))
          : ["*"];
        imports.push({ source: node.source.value, names });
      } else if (node.type === "ExportNamedDeclaration" && node.source) {
        for (const s of node.specifiers) {
          reexports.push({ source: node.source.value, imported: s.local.name ?? s.local.value, exported: s.exported.name ?? s.exported.value });
        }
      } else if (node.type === "ExportAllDeclaration") {
        reexports.push({ source: node.source.value, imported: "*", exported: node.exported ? (node.exported.name ?? node.exported.value) : "*" });
      }
    }
    const dynamic = [];
    walkDynamic(info.ast, dynamic);
    for (const source of dynamic) imports.push({ source, names: ["*"] });
    parsed.set(info.id, { imports, reexports });
  },
  async generateBundle(_, bundle) {
    const rendered = {};
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== "chunk") continue;
      for (const [id, m] of Object.entries(chunk.modules)) rendered[id] = m.renderedLength;
    }
    const modules = {};
    for (const id of this.getModuleIds()) {
      if (!id.startsWith(APP)) continue;
      const info = this.getModuleInfo(id);
      const own = parsed.get(id) ?? { imports: [], reexports: [] };
      const resolve = async (source) => (await this.resolve(source, id))?.id ?? null;
      modules[id] = {
        rendered: rendered[id] ?? 0,
        exports: info.exports ?? [],
        imports: await Promise.all(own.imports.map(async (i) => ({ id: await resolve(i.source), source: i.source, names: i.names }))),
        reexports: await Promise.all(own.reexports.map(async (r) => ({ id: await resolve(r.source), source: r.source, imported: r.imported, exported: r.exported }))),
        // Glob and template-literal imports are expanded by Vite into these; names are unknown, so all.
        dynamicallyImportedIds: info.dynamicallyImportedIds,
        importedIds: info.importedIds,
      };
    }
    // Every file the build read, including Sass partials pulled in by @use/@import, which are not modules.
    const watched = this.getWatchFiles().filter((f) => f.startsWith(APP));
    fs.writeFileSync(process.env.GRAPH_OUT, JSON.stringify({ root, modules, watched }));
  },
};

export default mergeConfig(loaded.config, {
  plugins: [graphDump],
  build: { outDir: process.env.GRAPH_DIST, emptyOutDir: true, sourcemap: false },
  logLevel: "warn",
});
