#!/usr/bin/env node
/**
 * Generate the visual lane's measurement code for the vc-test plugin.
 *
 * WHY THIS EXISTS. The layout, design-spec and contrast measurements are TypeScript in this repository
 * (`scripts/lib/measure-layout.ts`, `scripts/lib/verify-design-spec.ts`, `scripts/layout/design-spec-extract.ts`).
 * A plugin is self-contained (plugins/CLAUDE.md) and runs on a client with no `tsx` and no repository scripts, so it
 * carries its own copy as plain ESM: `plugins/vc-test/lib/design/*.mjs`. A hand-kept copy would be a transcribed
 * constant that goes stale at the next edit and fails silently — so the copy is GENERATED (esbuild, no minify) and
 * `--check` (wired into `npm test`) fails with the stale file named when the TypeScript moves.
 *
 * It also renders `plugins/vc-test/knowledge/bl-ui.md`: the rules the visual lane judges against (`BL-UI-*`,
 * `BL-A11Y-*` and the three cross-cutting ids its Layer 1 cites), sliced from the BL oracle with `extract-bl.ts`'s own
 * exports — the text `npm run bl:extract` prints, minus the oracle-wide counts that would make the file stale on every
 * unrelated BL edit.
 *
 * The repository's TypeScript and `npm run design:extract` stay as they are (code consumers keep the repository's half).
 *
 * USAGE
 *   npm run vc-test:design         # write the four generated files
 *   npm run vc-test:design:check   # write nothing; exit 1 and name each stale file
 *
 * Output is deterministic: no timestamps, sorted inputs, LF line endings (the check compares with CRLF folded to LF, so
 * a Windows autocrlf checkout does not read as drift).
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = "npm run vc-test:design";
const OUT_DIR = "plugins/vc-test/lib/design";
const BL_UI_OUT = "plugins/vc-test/knowledge/bl-ui.md";

/**
 * One bundle per entry. `siblings` maps an import specifier to the sibling bundle that already holds that module, so
 * the shared code exists once: `verify-design-spec` imports `measure-layout`, `design-spec-extract` imports
 * `verify-design-spec`. `cliGuard` is a module whose `process.argv[1]?.endsWith("<name>.ts")` CLI test must become
 * `.mjs` — the bundle is what gets run, and a guard that never matches would make the CLI exit 0 silently.
 */
const BUNDLES = [
  { entry: "scripts/lib/measure-layout.ts", out: "measure-layout.mjs", siblings: {} },
  {
    entry: "scripts/lib/verify-design-spec.ts",
    out: "verify-design-spec.mjs",
    siblings: { "./measure-layout.js": "./measure-layout.mjs" },
  },
  {
    entry: "scripts/layout/design-spec-extract.ts",
    out: "design-spec-extract.mjs",
    siblings: { "../lib/verify-design-spec.ts": "./verify-design-spec.mjs" },
    cliGuard: { from: 'endsWith("design-spec-extract.ts")', to: 'endsWith("design-spec-extract.mjs")' },
  },
];

/** BL rules the visual lane judges against: two whole domains and the three ids its Layer 1 cites. */
const BL_DOMAINS = ["ui", "a11y"];
const BL_IDS = ["BL-PRICE-003", "BL-CAT-002", "BL-CHK-001"];

const lf = (s) => s.replace(/\r\n/g, "\n");
const posix = (p) => p.split("\\").join("/");

async function bundle(spec) {
  const entryAbs = resolve(ROOT, spec.entry);
  const plugin = {
    name: "vc-test-design",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        const mapped = spec.siblings[args.path];
        return mapped ? { path: mapped, external: true } : null;
      });
      if (spec.cliGuard) {
        b.onLoad({ filter: /.*/ }, (args) => {
          if (args.path !== entryAbs) return null;
          const text = readFileSync(args.path, "utf8");
          if (!text.includes(spec.cliGuard.from)) {
            throw new Error(`${spec.entry}: the CLI guard ${spec.cliGuard.from} is gone — update BUNDLES in ${posix(relative(ROOT, fileURLToPath(import.meta.url)))}`);
          }
          return { contents: text.replace(spec.cliGuard.from, spec.cliGuard.to), loader: "ts", resolveDir: dirname(args.path) };
        });
      }
    },
  };
  const result = await build({
    entryPoints: [entryAbs],
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node18",
    minify: false,
    legalComments: "none",
    metafile: true,
    logLevel: "silent",
    outfile: join(ROOT, OUT_DIR, spec.out),
    plugins: [plugin],
  });
  const inputs = Object.keys(result.metafile.inputs).map(posix).sort();
  const banner = `// GENERATED from ${inputs.join(", ")} by ${SCRIPT} — do not edit; the TypeScript is canonical\n`;
  return banner + lf(result.outputFiles[0].text);
}

async function renderBlUi() {
  // extract-bl.ts reads the oracle relative to the working directory.
  process.chdir(ROOT);
  const { tsImport } = await import("tsx/esm/api");
  const bl = await tsImport(pathToFileURL(join(ROOT, "scripts/knowledge/extract-bl.ts")).href, import.meta.url);
  const { oracleText, BL_DIR } = await tsImport(pathToFileURL(join(ROOT, "scripts/knowledge/bl-yaml.ts")).href, import.meta.url);
  const slices = bl.sliceOracle(lf(oracleText()));
  const selected = bl.selectSlices(slices, { domains: BL_DOMAINS, ids: BL_IDS });
  const have = new Set(selected.map((s) => s.id));
  const missing = BL_IDS.filter((id) => !have.has(id));
  for (const prefix of ["BL-UI-", "BL-A11Y-"]) {
    if (![...have].some((id) => id.startsWith(prefix))) missing.push(`${prefix}*`);
  }
  if (missing.length) throw new Error(`bl-ui.md: the oracle holds no ${missing.join(", ")} — fix BL_DOMAINS / BL_IDS in this generator`);
  const dir = posix(BL_DIR);
  const sources = [...BL_DOMAINS, ...BL_IDS.map((id) => id.split("-")[1].toLowerCase())]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .map((d) => `${d}.yaml`);
  return (
    [
      `<!-- GENERATED from ${dir}/{${sources.join(",")}} by ${SCRIPT} — do not edit; the BL oracle YAML is canonical -->`,
      "",
      "# BL invariants — UI display, accessibility, and the three cross-cutting rules the visual lane cites",
      "",
      `> Verbatim slice of the BL oracle: the rules the visual lane judges against.`,
      `> (in this repository: rendered from \`${dir}/*.yaml\`; printed by \`npm run bl:extract -- --domain ${BL_DOMAINS.join(",")} --id ${BL_IDS.join(",")}\`)`,
      "> **This is a SUBSET.** An invariant outside it is not absent — if the work touches another domain, do not conclude",
      "> that no rule applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.",
      "",
      `**Included:** ${selected.map((s) => s.id).join(", ")}`,
      "",
      "---",
      "",
      selected.map((s) => lf(s.markdown)).join("\n\n"),
      "",
    ].join("\n")
  );
}

/** Every generated file: path (repo-relative, posix) → content. */
async function generate() {
  const files = new Map();
  for (const spec of BUNDLES) files.set(`${OUT_DIR}/${spec.out}`, await bundle(spec));
  files.set(BL_UI_OUT, await renderBlUi());
  return files;
}

async function main() {
  const check = process.argv.includes("--check");
  const files = await generate();
  if (check) {
    const stale = [];
    for (const [path, content] of files) {
      const abs = join(ROOT, path);
      if (!existsSync(abs)) stale.push(`${path} (missing)`);
      else if (lf(readFileSync(abs, "utf8")) !== content) stale.push(path);
    }
    if (stale.length) {
      console.error(`vc-test:design:check — stale, run \`${SCRIPT}\` and commit the result:`);
      for (const s of stale) console.error(`  ${s}`);
      process.exit(1);
    }
    console.log(`vc-test:design:check — ${files.size} generated files current`);
    return;
  }
  for (const [path, content] of files) {
    const abs = join(ROOT, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(`vc-test:design — ${e?.stack ?? e}`);
  process.exit(1);
});
