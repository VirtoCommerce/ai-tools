/**
 * `knowledge:refs` — the knowledge base is read by people who do NOT have this repository.
 *
 * WHAT THIS GUARDS. A client install is `vc-fix` + `vc-kb` + a read-only checkout of
 * VirtoCommerce/vc-knowledge. It is not this repository. So a base page that says "see
 * `regression/suites/048c-layout-stability.csv`" or "run `/qa-exploratory` Step 5a" is pointing at
 * something the reader cannot open, and the reader has no way to tell that from a pointer they
 * simply have not found yet.
 *
 * WHY ANNOTATE RATHER THAN STRIP. The references are worth keeping: `BL-CART-003` citing the suite
 * that covers it is how WE navigate from an invariant to its coverage, and deleting that would make
 * the base poorer for the people who use it most. What a client needs is not the absence of the
 * pointer but the knowledge that it is provenance — where a claim was checked — rather than a step
 * they are failing to follow. So each such page carries one banner, and this gate is what keeps a
 * new page from arriving without one.
 *
 * (The same call was already made once, by hand, in `plugins/vc-fix/knowledge/`: its copies "omit or
 * annotate" exactly these references — `mirror-check.mjs`'s `plugin-scope`. That hand-maintained
 * scrubbing is what this replaces, and it is why those duplicate copies can be retired once this
 * has run over the whole base.)
 *
 * NEEDS A BASE, and says so rather than passing vacuously — a gate that reports OK because it found
 * nothing to check is worse than no gate.
 *
 *   npm run knowledge:refs
 *
 * Exit: 0 clean · 1 a page cites internal paths or commands without the banner · 2 no base.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { knowledgeRoot, KnowledgeBaseMissing } from "../lib/knowledge-base.mjs";

/** The banner's identifying phrase. Matched on substance, not on the whole wording. */
export const MARKER = "Virto-internal references";

/**
 * A path into the working repository. Deliberately anchored on the directory NAMES rather than on
 * "any slash": `api/order-creation-matrix.md` is a path INSIDE the base and must not count, while
 * `scripts/seed-data/...` is not.
 */
export const OUTWARD_PATH =
  /(?:\.claude|scripts|ci|config|regression\/suites|test-data|templates|docs|reports)\/[A-Za-z0-9._*-]/;

/**
 * A slash command. Some `/qa-*` DO ship in vc-fix, so this deliberately does not try to decide
 * which: the banner covers the class, and a per-command allowlist would be a second registry to
 * keep in step with two plugins' manifests.
 */
export const OUTWARD_CMD = /\/(?:qa|ba)-[a-z-]+/;

export function needsBanner(text) {
  return OUTWARD_PATH.test(text) || OUTWARD_CMD.test(text);
}

export function hasBanner(text) {
  return text.includes(MARKER);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".md")) out.push(full);
  }
  return out;
}

/** @returns {{checked: number, annotated: number, missing: string[]}} */
export function audit(root) {
  const missing = [];
  let checked = 0;
  let annotated = 0;
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    if (!needsBanner(text)) continue;
    checked += 1;
    if (hasBanner(text)) annotated += 1;
    else missing.push(relative(root, file).split(sep).join("/"));
  }
  return { checked, annotated, missing };
}

function main() {
  let root;
  try {
    root = knowledgeRoot();
  } catch (e) {
    if (e instanceof KnowledgeBaseMissing) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
  if (!existsSync(root)) {
    console.error(`[knowledge:refs] ${root} does not exist — the base holds no knowledge tree yet.`);
    return 2;
  }

  const { checked, annotated, missing } = audit(root);
  if (!missing.length) {
    console.log(`[knowledge:refs] OK — ${annotated} of ${checked} page(s) citing internal paths or commands carry the banner`);
    return 0;
  }

  console.error(
    `[knowledge:refs] FAIL — ${missing.length} page(s) cite paths or commands a client install does not have, `
      + "with nothing telling the reader so:",
  );
  for (const m of missing) console.error(`  ${m}`);
  console.error(
    "\nAdd the banner under the page's H1. It says these are PROVENANCE — where a claim was checked —"
      + "\nnever steps the reader has to follow, and that every statement stands without them."
      + "\nCopy the wording from any annotated page; the gate matches on "
      + `"${MARKER}".`,
  );
  return 1;
}

const isCli = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join("/"));
if (isCli) process.exit(main());
