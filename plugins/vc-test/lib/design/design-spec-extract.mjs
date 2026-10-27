// GENERATED from scripts/layout/design-spec-extract.ts, scripts/lib/sync-stdio.mjs by npm run vc-test:design — do not edit; the TypeScript is canonical
// scripts/lib/sync-stdio.mjs
for (const stream of [process.stdout, process.stderr]) {
  try {
    const handle = (
      /** @type {{ setBlocking?: (b: boolean) => void } | undefined} */
      stream._handle
    );
    if (handle && typeof handle.setBlocking === "function") handle.setBlocking(true);
  } catch {
  }
}

// scripts/layout/design-spec-extract.ts
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { extractDesignSpec } from "./verify-design-spec.mjs";
function countExpectations(spec) {
  return spec.tokens.length + spec.icons.length + spec.geometry.length + spec.strokeScales.length + spec.changes.length;
}
function mergeDesignSpecs(specs) {
  const merged = {
    path: specs.map((s) => s.path).join(" + "),
    cards: specs.flatMap((s) => s.cards),
    tokens: [],
    icons: [],
    geometry: [],
    strokeScales: specs.flatMap((s) => s.strokeScales),
    arrowFamily: [...new Set(specs.flatMap((s) => s.arrowFamily))],
    divergences: specs.flatMap((s) => s.divergences),
    changes: [],
    unresolved: specs.flatMap((s) => s.unresolved)
  };
  let conflicts = 0;
  function mergeKind(kind, pick, key, value, into) {
    const seen = /* @__PURE__ */ new Map();
    const conflicted = /* @__PURE__ */ new Set();
    for (const s of specs) {
      for (const item of pick(s)) {
        const k = key(item);
        const v = value(item);
        const prior = seen.get(k);
        if (!prior) {
          seen.set(k, { item, from: s.path, value: v });
        } else if (prior.value !== v && !conflicted.has(k)) {
          conflicted.add(k);
          conflicts++;
          merged.unresolved.push({
            kind,
            fragment: k,
            reason: `declared as "${prior.value}" in ${prior.from} and "${v}" in ${s.path} \u2014 the design contradicts itself; no expectation taken`
          });
        }
      }
    }
    for (const [k, { item }] of seen) if (!conflicted.has(k)) into.push(item);
  }
  mergeKind("token", (s) => s.tokens, (t) => t.name, (t) => t.normalized, merged.tokens);
  mergeKind("geometry", (s) => s.geometry, (g) => g.name, (g) => `${g.px}px${g.ratio === void 0 ? "" : ` ratio ${g.ratio}`}`, merged.geometry);
  mergeKind("icon", (s) => s.icons, (i) => `${i.from} @ ${i.surface ?? "(any surface)"}`, (i) => i.to, merged.icons);
  mergeKind("property", (s) => s.changes, (c) => c.property, (c) => `${c.designPx}px`, merged.changes);
  return { merged, conflicts };
}
var EXPECTATION_KINDS = ["tokens", "icons", "geometry", "stroke", "changes"];
function restrictKinds(spec, only) {
  return {
    ...spec,
    tokens: only.has("tokens") ? spec.tokens : [],
    icons: only.has("icons") ? spec.icons : [],
    geometry: only.has("geometry") ? spec.geometry : [],
    strokeScales: only.has("stroke") ? spec.strokeScales : [],
    arrowFamily: only.has("stroke") ? spec.arrowFamily : [],
    changes: only.has("changes") ? spec.changes : []
  };
}
function extractFromInputs(inputs, only = new Set(EXPECTATION_KINDS)) {
  const specs = inputs.map((f) => restrictKinds(extractDesignSpec(f.content, { path: f.path }), only));
  const { merged, conflicts } = mergeDesignSpecs(specs);
  return {
    specs,
    merged,
    totals: {
      expectations: countExpectations(merged),
      tokens: merged.tokens.length,
      icons: merged.icons.length,
      geometry: merged.geometry.length,
      strokeScales: merged.strokeScales.length,
      changes: merged.changes.length,
      divergences: merged.divergences.length,
      unresolved: merged.unresolved.length,
      conflicts
    }
  };
}
function main(argv) {
  let source = "";
  let out = "";
  let only = new Set(EXPECTATION_KINDS);
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") source = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
    else if (a === "--only") {
      const kinds = (argv[++i] ?? "").split(",").map((k) => k.trim()).filter(Boolean);
      const bad = kinds.filter((k) => !EXPECTATION_KINDS.includes(k));
      if (kinds.length === 0 || bad.length) {
        console.error(`design:extract \u2014 --only takes a comma list of ${EXPECTATION_KINDS.join(", ")}; got "${bad.join(",") || "nothing"}"`);
        return 1;
      }
      only = new Set(kinds);
    } else if (a.startsWith("--")) {
      console.error(`design:extract \u2014 unknown option ${a}`);
      return 1;
    } else files.push(a);
  }
  if (!source || files.length === 0) {
    console.error('Usage: npm run design:extract -- --source "<where the files came from>" [--only tokens,icons,geometry,stroke,changes] [--out spec.json] <file> [<file> ...]');
    return 1;
  }
  const inputs = [];
  const manifest = [];
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch (e) {
      console.error(`design:extract \u2014 cannot read ${file}: ${e.message}`);
      continue;
    }
    inputs.push({ path: basename(file), content });
    manifest.push({ file, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") });
  }
  if (inputs.length === 0) {
    console.error("design:extract \u2014 SKIPPED: no readable design file");
    return 2;
  }
  const { specs, merged, totals } = extractFromInputs(inputs, only);
  const json = JSON.stringify({ source, only: [...only], files: manifest, specs, merged, totals }, null, 2);
  if (out) writeFileSync(out, json + "\n");
  else console.log(json);
  const line = `design:extract \u2014 ${totals.expectations} expectation(s) from ${inputs.length} file(s) [${source}]: ${totals.tokens} token, ${totals.icons} icon, ${totals.geometry} geometry, ${totals.strokeScales} stroke ladder, ${totals.changes} change row; ${totals.unresolved} unresolved (${totals.conflicts} cross-file conflict), ${totals.divergences} declared divergence`;
  if (totals.expectations === 0) {
    console.error(`${line}
design:extract \u2014 SKIPPED: the design source declares nothing this axis can diff against`);
    return 2;
  }
  console.error(line);
  return 0;
}
if (process.argv[1]?.endsWith("design-spec-extract.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
export {
  EXPECTATION_KINDS,
  countExpectations,
  extractFromInputs,
  mergeDesignSpecs,
  restrictKinds
};
