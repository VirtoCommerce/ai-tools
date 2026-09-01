/**
 * Allocate DISJOINT case-ID blocks from ONE corpus scan, so concurrent layer
 * batches cannot collide.
 *
 * WHY: `append-test-cases-to-suite.ts --check-global-ids` reads the corpus at
 * APPEND time (`collectCorpusIds`). That is correct for a single author and
 * unsound for several: two batches that both scan before either writes both
 * pass the check, then both write. A cross-suite duplicate ID silently
 * overwrites the other suite's per-case results and failure evidence at run
 * time (memory `reference_case_ids_must_be_globally_unique`, enforced
 * corpus-wide by `npm run suites:lint`), so the collision is not caught by a
 * later gate — it is caught by a confusing regression report weeks on.
 *
 * The fix is to move ID allocation BEFORE the fan-out: the orchestrator runs
 * this once, hands each batch a block, and `tc:scaffold --id-block` refuses to
 * spill past the block it was given.
 *
 * SCOPE, honestly stated: this makes allocation deterministic WITHIN one
 * planning step. It is not a lock. Two SESSIONS allocating concurrently against
 * the same working tree get the same block — that is the shared-tree
 * one-author problem (`.claude/rules/regression.md`), and the answer there is
 * to agree who is authoring, not to add a lockfile.
 *
 * Usage:
 *   npx tsx scripts/test-cases/alloc-case-ids.ts --prefix MISA \
 *     --block admin=12 --block storefront=9 [--root regression/suites] [--json]
 *
 * Exit code: 0 on success; 1 on a bad argument or an unreadable corpus root.
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { collectCorpusIds } from "./append-test-cases-to-suite.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

export interface Block {
  name: string;
  count: number;
}

export interface Allocation {
  name: string;
  count: number;
  start: number;
  end: number;
  /** The `--id-block` argument to hand this batch, verbatim. */
  idBlock: string;
  first: string;
  last: string;
}

export const ID_WIDTH = 3;

export function formatId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(ID_WIDTH, "0")}`;
}

/**
 * Highest numeric suffix already used by `prefix` anywhere in the corpus.
 * Returns 0 when the prefix is new. Deliberately corpus-wide, not per-file:
 * an ID belongs to exactly one file, so the next free number is a global fact.
 */
export function highestUsed(prefix: string, corpusIds: Iterable<string>): number {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of corpusIds) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Lay the requested blocks out contiguously after the highest used id. Pure, so
 * the tests exercise the arithmetic without touching the filesystem.
 */
export function allocate(prefix: string, blocks: Block[], highest: number): Allocation[] {
  let next = highest + 1;
  return blocks.map((b) => {
    const start = next;
    const end = start + b.count - 1;
    next = end + 1;
    return {
      name: b.name,
      count: b.count,
      start,
      end,
      idBlock: `${prefix}-${String(start).padStart(ID_WIDTH, "0")}..${prefix}-${String(end).padStart(ID_WIDTH, "0")}`,
      first: formatId(prefix, start),
      last: formatId(prefix, end),
    };
  });
}

export function parseBlockArg(arg: string): Block {
  const m = /^([A-Za-z][\w-]*)=(\d+)$/.exec(arg.trim());
  if (!m) throw new Error(`--block "${arg}" is not <name>=<count> (e.g. admin=12)`);
  const count = Number(m[2]);
  if (count < 1) throw new Error(`--block "${arg}" must request at least one id`);
  return { name: m[1], count };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const prefix = get("--prefix");
  const blocks = argv.map((a, i) => (a === "--block" ? argv[i + 1] : null)).filter((v): v is string => v !== null);
  const json = argv.includes("--json");
  const root = resolve(REPO_ROOT, get("--root") ?? "regression/suites");

  if (!prefix || !/^[A-Z][A-Z0-9]*$/.test(prefix)) {
    process.stderr.write(
      "Usage: alloc-case-ids.ts --prefix PREFIX --block <name>=<count> [--block ...] [--root <dir>] [--json]\n",
    );
    process.exit(1);
  }
  if (blocks.length === 0) {
    process.stderr.write("At least one --block <name>=<count> is required.\n");
    process.exit(1);
  }
  if (!existsSync(root)) {
    process.stderr.write(
      `Corpus root ${root} does not exist. Refusing to allocate: without a scan every block would start at 001 ` +
        `and collide with the whole corpus.\n`,
    );
    process.exit(1);
  }

  const parsed = blocks.map(parseBlockArg);
  const highest = highestUsed(prefix, collectCorpusIds(root).keys());
  const allocations = allocate(prefix, parsed, highest);

  if (json) {
    process.stdout.write(JSON.stringify({ prefix, highestUsed: highest, allocations }, null, 2) + "\n");
    return;
  }
  process.stdout.write(
    `${prefix}: highest id in use is ${highest === 0 ? "<none — new prefix>" : formatId(prefix, highest)}\n\n`,
  );
  for (const a of allocations) process.stdout.write(`  ${a.name.padEnd(12)} --id-block ${a.idBlock}   (${a.count} ids)\n`);
  process.stdout.write(
    "\nHand each batch its own --id-block and nothing else. Blocks are disjoint by construction;\n" +
      "`tc:scaffold` refuses to spill past the block it was given.\n",
  );
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(1);
  }
}
