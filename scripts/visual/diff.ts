#!/usr/bin/env tsx
/**
 * visual:diff — compare two `visual:snap` capture sets (stories or pages), target by target.
 *
 * The comparison half of the PIXEL instrument (`.claude/skills/qa-visual-regression/`). It reports
 * WHAT changed; whether a change is intended, a regression or noise is the triage step of that skill,
 * read against the PR diff — never decided here.
 *
 * Per story, one status:
 *   same          some base shot and some head shot are fewer than --min-diff-px pixels apart
 *   changed       every base shot differs from every head shot (diff PNG of the closest pair written)
 *   unstable      changed, AND the story's own shots disagree with each other (only knowable with
 *                 `--repeat` > 1): it renders more than one way, so a human reads the diff
 *   size-changed  every pair differs in width/height — itself a layout change
 *   added/removed in one set only (a new or deleted story)
 *   unrendered    the story failed to render in base, head or both, or a `--har` replay found no
 *                 recorded answer for one of its API calls (`replayMisses`) — never counted as `same`
 *
 * WHY NO PIXEL THRESHOLD BY DEFAULT (--min-diff-px 1): same build shot twice, the noisiest story
 * differed by 10 px — and a REAL seeded regression (VcBadge radius −2 px) moved only 12 px on its
 * outline story (`docs/superpowers/plans/2026-10-26-visual-regression.md` §Evidence). A threshold that
 * hides the noise hides that regression too. Noise is handled by repetition instead: shoot the flagged
 * stories again with `visual:snap --repeat 3` and diff those — a story that only renders differently
 * sometimes then has a matching pair and comes back `same`.
 *
 * USAGE
 *   npm run visual:diff -- --base <snap out dir> --head <snap out dir> --out <dir>
 *     --threshold <0..1>     pixelmatch colour threshold (default 0.1)
 *     --min-diff-px <n>      pairs closer than this count as equal (default 1)
 *
 * OUTPUT  <out>/visual-diff.json, <out>/diff/<set>/<storyId>.png, <out>/flagged-ids.txt (the
 *         changed / unstable / size-changed ids: `visual:snap --grep-file` input for the confirmation
 *         pass; removed when none), a summary grouped by component. The confirmation pass re-shoots only
 *         those, so this pass's unrendered / added / removed rows carry forward into the verdict.
 * EXIT    0 nothing changed · 1 something changed or failed to render · 2 inputs unusable or a bad flag.
 */
import "../lib/sync-stdio.mjs";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { flagValue, intFlag, rejectUnknownFlags } from "../lib/cli-args.ts";
import type { Shot, SnapshotManifest } from "./snap.ts";

type Status = "same" | "changed" | "unstable" | "size-changed" | "added" | "removed" | "unrendered";
interface Row { set: string; id: string; title: string; status: Status; diffPx?: number; diffPct?: number; diff?: string; note?: string }

const argv = process.argv.slice(2);
const VALUED = ["--base", "--head", "--out", "--threshold", "--min-diff-px"];
rejectUnknownFlags(argv, VALUED, VALUED, 2);
const baseDir = flagValue(argv, "--base");
const headDir = flagValue(argv, "--head");
const out = flagValue(argv, "--out");
if (!baseDir || !headDir || !out) {
  console.error("usage: npm run visual:diff -- --base <dir> --head <dir> --out <dir> [--threshold 0.1] [--min-diff-px 1]");
  process.exit(2);
}
const threshold = Number(flagValue(argv, "--threshold") ?? 0.1);
if (!(threshold >= 0 && threshold <= 1)) { console.error("✗ --threshold expects 0..1"); process.exit(2); }
const minDiffPx = Math.max(1, intFlag(argv, "--min-diff-px", 1, 2));

function readManifest(dir: string): SnapshotManifest {
  const p = join(dir, "snapshots.json");
  if (!existsSync(p)) { console.error(`✗ ${p} not found — run visual:snap first`); process.exit(2); }
  return JSON.parse(readFileSync(p, "utf-8"));
}

const base = readManifest(baseDir);
const head = readManifest(headDir);
const warnings: string[] = [];
if ((base.kind ?? "storybook") !== (head.kind ?? "storybook")) warnings.push(`base is a ${base.kind} set, head a ${head.kind} set — ids will not line up`);
if (base.browser !== head.browser) warnings.push(`base and head were shot by different browsers (${base.browser} vs ${head.browser}) — expect rendering noise`);
const setNames = (m: SnapshotManifest) => m.sets.map((s) => s.name).sort().join(",");
if (setNames(base) !== setNames(head)) warnings.push(`capture sets differ (base: ${setNames(base)} · head: ${setNames(head)}) — only common sets are compared`);

const readPng = (dir: string, file: string) => PNG.sync.read(readFileSync(join(dir, file)));
/** Pixels apart, or -1 when the two shots differ in size. */
function pixelsApart(A: PNG, B: PNG, D?: PNG): number {
  if (A.width !== B.width || A.height !== B.height) return -1;
  return pixelmatch(A.data, B.data, D ? D.data : null, A.width, A.height, { threshold });
}
/** Do a story's own shots disagree with each other? */
function selfUnstable(dir: string, files: string[]): boolean {
  const imgs = files.map((f) => readPng(dir, f));
  return imgs.slice(1).some((img) => pixelsApart(imgs[0], img) !== 0);
}

const key = (s: Shot) => `${s.set}/${s.id}`;
const baseMap = new Map(base.stories.map((s) => [key(s), s]));
const headMap = new Map(head.stories.map((s) => [key(s), s]));
const commonSets = new Set(base.sets.map((s) => s.name).filter((n) => head.sets.some((h) => h.name === n)));

const rows: Row[] = [];
for (const k of new Set([...baseMap.keys(), ...headMap.keys()])) {
  const b = baseMap.get(k);
  const h = headMap.get(k);
  const any = (h ?? b)!;
  if (!commonSets.has(any.set)) continue;
  const row: Row = { set: any.set, id: any.id, title: any.title, status: "same" };
  if (!b) row.status = "added";
  else if (!h) row.status = "removed";
  else if (!b.files.length || !h.files.length) {
    row.status = "unrendered";
    row.note = [b.error && `base: ${b.error}`, h.error && `head: ${h.error}`].filter(Boolean).join(" · ");
  } else if (b.replayMisses?.length || h.replayMisses?.length) {
    // Rendered, but not on the recorded data: two identical error states would compare `same`.
    row.status = "unrendered";
    row.note = [b.replayMisses?.length && `base replay missed: ${b.replayMisses.join(", ")}`,
      h.replayMisses?.length && `head replay missed: ${h.replayMisses.join(", ")}`].filter(Boolean).join(" · ");
  } else {
    // The closest base × head pair decides: a story that renders two ways is unchanged if the ways overlap.
    let best: { n: number; bf: string; hf: string } | null = null;
    let sizes = "";
    for (const bf of b.files) for (const hf of h.files) {
      const A = readPng(baseDir, bf);
      const B = readPng(headDir, hf);
      const n = pixelsApart(A, B);
      if (n < 0) { sizes ||= `${A.width}×${A.height} → ${B.width}×${B.height}`; continue; }
      if (!best || n < best.n) best = { n, bf, hf };
    }
    if (!best) { row.status = "size-changed"; row.note = sizes; }
    else {
      const A = readPng(baseDir, best.bf);
      const D = new PNG({ width: A.width, height: A.height });
      pixelsApart(A, readPng(headDir, best.hf), D);
      row.diffPx = best.n;
      row.diffPct = Math.round((best.n / (A.width * A.height)) * 1e4) / 100;
      if (best.n >= minDiffPx) {
        const unstable = selfUnstable(baseDir, b.files) || selfUnstable(headDir, h.files);
        row.status = unstable ? "unstable" : "changed";
        row.diff = join("diff", h.files[0]);
        mkdirSync(dirname(join(out, row.diff)), { recursive: true });
        writeFileSync(join(out, row.diff), PNG.sync.write(D));
      }
    }
  }
  rows.push(row);
}

const STATUSES: Status[] = ["same", "changed", "unstable", "size-changed", "added", "removed", "unrendered"];
const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
const flagged = rows.filter((r) => r.status !== "same");
// The component is the story's title (Components/Molecules/VcButton) — the unit a triager reads.
const byComponent = new Map<string, Row[]>();
for (const r of flagged) byComponent.set(r.title, [...(byComponent.get(r.title) ?? []), r]);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "visual-diff.json"), JSON.stringify({
  base: { dir: baseDir, source: base.source, browser: base.browser, repeat: base.repeat },
  head: { dir: headDir, source: head.source, browser: head.browser, repeat: head.repeat },
  threshold, minDiffPx, warnings, counts,
  components: [...byComponent.entries()].map(([title, rs]) => ({ title, stories: rs })),
}, null, 2));

console.log(`visual:diff  ${rows.length} compared · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const [title, rs] of [...byComponent.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const worst = rs.reduce((m, r) => ((r.diffPx ?? 0) > (m.diffPx ?? 0) ? r : m), rs[0]);
  const max = worst.diffPx ? `; max ${worst.diffPx} px (${worst.diffPct}%)` : "";
  console.log(`  ${title}: ${rs.length} stor${rs.length === 1 ? "y" : "ies"} (${[...new Set(rs.map((r) => r.status))].join(", ")}${max})`);
}
const ids = [...new Set(flagged.filter((r) => ["changed", "unstable", "size-changed"].includes(r.status)).map((r) => r.id))];
// Removed when empty: a list left by an earlier run in this --out must not feed the next pass.
rmSync(join(out, "flagged-ids.txt"), { force: true });
if (ids.length) {
  writeFileSync(join(out, "flagged-ids.txt"), ids.join("\n"));
  if (Math.max(base.repeat ?? 1, head.repeat ?? 1) === 1) {
    console.log(`  confirm: visual:snap --grep-file ${join(out, "flagged-ids.txt")} --repeat 3 on base and head, then diff again`);
  }
}
const carried = flagged.filter((r) => ["unrendered", "added", "removed"].includes(r.status)).length;
if (carried && Math.max(base.repeat ?? 1, head.repeat ?? 1) === 1) {
  console.log(`  ${carried} unrendered / added / removed row(s) are not re-shot: they carry forward into the verdict`);
}
console.log(`  report: ${join(out, "visual-diff.json")}`);
process.exit(flagged.length ? 1 : 0);
