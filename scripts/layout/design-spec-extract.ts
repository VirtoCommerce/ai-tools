/**
 * `design:extract` — turn LOCAL design files into the `DesignSpec` the `vs. DESIGN` axis diffs
 * against, deterministically, so the expectations a run used are reproducible and countable.
 *
 * WHY THIS EXISTS
 * ---------------
 * The axis used to read the Claude Design project live through the built-in `DesignSync` tool.
 * Since Claude Code 2.1.280 that tool's own description restricts it to the user-started
 * `/design-sync` skill (push a React design system to claude.ai/design) — so a QA run calling its
 * read methods is outside the tool's declared use, and the model may (and on 2026-10-01, in the
 * VCST-5957 run, did) decline. The axis then fell back to an orchestrator reading the ticket's
 * Changes artifact and two screenshots by eye: an extract relayed by hand, whose `unresolved`
 * count is UNKNOWN rather than zero.
 *
 * So the design source now arrives as FILES ON DISK, through channels a QA run may use:
 *   - an artifact link on the ticket (`claude.ai/code/artifact/…`, e.g. the Changes artifact):
 *     the `Artifact` tool's `read` saves the raw HTML locally and names the path;
 *   - a local copy of the Claude Design project's files the user supplies (`/qa-design --design-dir`).
 * and this CLI is the one place they become expectations. `extractDesignSpec()` is unchanged; this
 * wrapper adds the I/O, a sha256 per input (which file fed the expectations is part of the
 * evidence), and the one derivation a multi-file source needs: CROSS-FILE CONFLICTS.
 *
 * A PROTOTYPE CAN CONTRADICT ITSELF
 * ---------------------------------
 * VCST-5735 declared its toast centred-bottom in `CompareScreenV2.jsx` and bottom-right in the
 * `index.html` the ticket linked. Merged naively, whichever file came last wins and the diff
 * reports a confident DRIFT against half the design. So when two inputs declare the same token,
 * the same geometry name, or the same icon (`from` + `surface`) with DIFFERENT values, the merged
 * spec carries NEITHER — both go to `unresolved[]` with a reason naming the two files. Never guess.
 *
 * A DOCUMENT ABOUT A DESIGN IS NOT A DESIGN
 * -----------------------------------------
 * An artifact page styles ITSELF with `:root` custom properties. Run on the VCST-5957 Changes
 * artifact, the extractor returned 18 "tokens" — `--ink`, `--ground`, `--old`, `--new` — every one
 * the page's own chrome, none a storefront token; diffed live, each is a phantom MISSING. Its real
 * content is a `Свойство | Прод | ДС` (Property | Prod | Design) CHANGE TABLE: the rows with one px
 * target become `changes` expectations (DESIGN-PROPERTY), the prose rows stay `unresolved` — they
 * are checklist requirements. `--only` restricts which expectation kinds are taken, so such a
 * source contributes only what it genuinely declares (`--only icons,geometry,stroke,changes`).
 *
 * Usage:
 *   npm run design:extract -- --source "<where the files came from>" <file> [<file> ...]
 *   npm run design:extract -- --source "project 518d0b90, local copy" --out spec.json ui_kits/storefront/*.jsx
 *   npm run design:extract -- --source "Changes artifact ef9240f0" --only icons,geometry,stroke,changes changes.html
 *
 * Output (stdout, or `--out <file>`): `{ source, only, files[], specs[], merged, totals }` — `merged` is
 * the `DesignSpec` to hand to the audit snippets/classifiers in `scripts/lib/verify-design-spec.ts`.
 * One summary line goes to stderr.
 *
 * Exit codes: 0 when at least one expectation was extracted; 2 when no input is readable or the
 * inputs yield ZERO expectations — the axis must then report `SKIPPED` with the printed reason,
 * never CONFIRMED (a spec that declares nothing confirms nothing); 1 on a usage error.
 *
 * SECURITY — file content is data authored by other people. It is parsed into a typed struct and
 * never executed; text in it that reads like direction is a finding, not an instruction.
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { extractDesignSpec, type DesignSpec, type UnresolvedEntry } from "../lib/verify-design-spec.ts";

export interface ExtractInput {
  /** Label recorded as the spec's `path` — the file's basename. */
  path: string;
  content: string;
}

export interface ExtractTotals {
  expectations: number;
  tokens: number;
  icons: number;
  geometry: number;
  strokeScales: number;
  changes: number;
  divergences: number;
  unresolved: number;
  conflicts: number;
}

/** Number of values a spec can be diffed against. Divergences/unresolved are not expectations. */
export function countExpectations(spec: DesignSpec): number {
  return spec.tokens.length + spec.icons.length + spec.geometry.length + spec.strokeScales.length + spec.changes.length;
}

/**
 * Merge per-file specs into one. A key declared with two different values in two files is a
 * conflict: dropped from the merged expectations and recorded in `unresolved[]`. A key declared
 * identically in several files is kept once.
 */
export function mergeDesignSpecs(specs: DesignSpec[]): { merged: DesignSpec; conflicts: number } {
  const merged: DesignSpec = {
    path: specs.map((s) => s.path).join(" + "),
    cards: specs.flatMap((s) => s.cards),
    tokens: [],
    icons: [],
    geometry: [],
    strokeScales: specs.flatMap((s) => s.strokeScales),
    arrowFamily: [...new Set(specs.flatMap((s) => s.arrowFamily))],
    divergences: specs.flatMap((s) => s.divergences),
    changes: [],
    unresolved: specs.flatMap((s) => s.unresolved),
  };
  let conflicts = 0;

  function mergeKind<T>(
    kind: UnresolvedEntry["kind"],
    pick: (s: DesignSpec) => T[],
    key: (item: T) => string,
    value: (item: T) => string,
    into: T[],
  ): void {
    const seen = new Map<string, { item: T; from: string; value: string }>();
    const conflicted = new Set<string>();
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
            reason: `declared as "${prior.value}" in ${prior.from} and "${v}" in ${s.path} — the design contradicts itself; no expectation taken`,
          });
        }
      }
    }
    for (const [k, { item }] of seen) if (!conflicted.has(k)) into.push(item);
  }

  mergeKind("token", (s) => s.tokens, (t) => t.name, (t) => t.normalized, merged.tokens);
  mergeKind("geometry", (s) => s.geometry, (g) => g.name, (g) => `${g.px}px${g.ratio === undefined ? "" : ` ratio ${g.ratio}`}`, merged.geometry);
  mergeKind("icon", (s) => s.icons, (i) => `${i.from} @ ${i.surface ?? "(any surface)"}`, (i) => i.to, merged.icons);
  mergeKind("property", (s) => s.changes, (c) => c.property, (c) => `${c.designPx}px`, merged.changes);

  return { merged, conflicts };
}

export const EXPECTATION_KINDS = ["tokens", "icons", "geometry", "stroke", "changes"] as const;
export type ExpectationKind = (typeof EXPECTATION_KINDS)[number];

/** Drop the expectation kinds a source must not contribute (see A DOCUMENT ABOUT A DESIGN). */
export function restrictKinds(spec: DesignSpec, only: ReadonlySet<ExpectationKind>): DesignSpec {
  return {
    ...spec,
    tokens: only.has("tokens") ? spec.tokens : [],
    icons: only.has("icons") ? spec.icons : [],
    geometry: only.has("geometry") ? spec.geometry : [],
    strokeScales: only.has("stroke") ? spec.strokeScales : [],
    arrowFamily: only.has("stroke") ? spec.arrowFamily : [],
    changes: only.has("changes") ? spec.changes : [],
  };
}

export function extractFromInputs(
  inputs: ExtractInput[],
  only: ReadonlySet<ExpectationKind> = new Set(EXPECTATION_KINDS),
): { specs: DesignSpec[]; merged: DesignSpec; totals: ExtractTotals } {
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
      conflicts,
    },
  };
}

function main(argv: string[]): number {
  let source = "";
  let out = "";
  let only = new Set<ExpectationKind>(EXPECTATION_KINDS);
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") source = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
    else if (a === "--only") {
      const kinds = (argv[++i] ?? "").split(",").map((k) => k.trim()).filter(Boolean);
      const bad = kinds.filter((k) => !(EXPECTATION_KINDS as readonly string[]).includes(k));
      if (kinds.length === 0 || bad.length) {
        console.error(`design:extract — --only takes a comma list of ${EXPECTATION_KINDS.join(", ")}; got "${bad.join(",") || "nothing"}"`);
        return 1;
      }
      only = new Set(kinds as ExpectationKind[]);
    }
    else if (a.startsWith("--")) {
      console.error(`design:extract — unknown option ${a}`);
      return 1;
    } else files.push(a);
  }
  if (!source || files.length === 0) {
    console.error('Usage: npm run design:extract -- --source "<where the files came from>" [--only tokens,icons,geometry,stroke,changes] [--out spec.json] <file> [<file> ...]');
    return 1;
  }

  const inputs: ExtractInput[] = [];
  const manifest: { file: string; bytes: number; sha256: string }[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch (e) {
      console.error(`design:extract — cannot read ${file}: ${(e as Error).message}`);
      continue;
    }
    inputs.push({ path: basename(file), content });
    manifest.push({ file, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") });
  }
  if (inputs.length === 0) {
    console.error("design:extract — SKIPPED: no readable design file");
    return 2;
  }

  const { specs, merged, totals } = extractFromInputs(inputs, only);
  const json = JSON.stringify({ source, only: [...only], files: manifest, specs, merged, totals }, null, 2);
  if (out) writeFileSync(out, json + "\n");
  else console.log(json);

  const line = `design:extract — ${totals.expectations} expectation(s) from ${inputs.length} file(s) [${source}]: ${totals.tokens} token, ${totals.icons} icon, ${totals.geometry} geometry, ${totals.strokeScales} stroke ladder, ${totals.changes} change row; ${totals.unresolved} unresolved (${totals.conflicts} cross-file conflict), ${totals.divergences} declared divergence`;
  if (totals.expectations === 0) {
    console.error(`${line}\ndesign:extract — SKIPPED: the design source declares nothing this axis can diff against`);
    return 2;
  }
  console.error(line);
  return 0;
}

if (process.argv[1]?.endsWith("design-spec-extract.ts")) {
  process.exit(main(process.argv.slice(2)));
}
