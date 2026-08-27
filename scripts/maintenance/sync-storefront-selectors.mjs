#!/usr/bin/env node
/**
 * Derive the storefront `data-test-id` surface straight from the vc-frontend source, instead
 * of hand-transcribing it into two markdown files.
 *
 * WHY THIS EXISTS — measured, not hypothetical
 * -------------------------------------------
 * `.claude/knowledge/automation/storefront-selectors.md` and
 * `.claude/knowledge/execution/test-execution-preflight.md` hand-list selectors. Diffed
 * against vc-frontend@dev on 2026-08-26:
 *
 *   - the docs assert 78 distinct selectors; the source has 161 static ones
 *   - 24 of the 78 (31%) DO NOT EXIST in the source
 *   - 107 real selectors are undocumented
 *   - `data-testid` (no dash) has ZERO occurrences, static or dynamic — yet
 *     test-execution-preflight.md says "a few legacy spots may use data-testid … either
 *     should work with Playwright locators". An agent that believes it writes a locator that
 *     can never match.
 *
 * The worst of the 24 is not obscure. The preflight doc's selector table — presented as
 * "verified live 2026-04-24" — gives `main-layout.top-header.account-menu-button` and
 * `main-layout.top-header.account-menu.sign-out-button` as THE sign-in/sign-out selectors.
 * The real ones are `account-menu` and `sign-out-button` (client-app/shared/layout/components/
 * header/_internal/top-header.vue); the `main-layout.` prefix appears once in the whole
 * source, in App.vue, unrelated. `[PRE:SIGNIN_AS]` / `[PRE:SIGNOUT]` are reached by 1,572
 * cases, so this is a live contributor to the measured ~29% artefactual-BLOCKED rate — an
 * agent looks for an element that was never there and either fails the precondition or falls
 * back to guessing by text.
 *
 * This is the `measure-layout.ts` spacing-grid mistake on a larger surface, and unlike that
 * one the failure mode is FAILs against a working product. GOLDEN RULE
 * (`.claude/rules/test-data.md`): if a value has a source of truth, read it from there.
 *
 * WHY IT CLONES RATHER THAN FETCHING FILES
 * ---------------------------------------
 * Unlike `sync-design-tokens.mjs`, which reads four named files, this has to ENUMERATE a tree
 * (454 .vue + 916 .ts). `raw.githubusercontent.com` cannot list a directory, so the source is
 * a shallow, sparse, blobless clone — or a local checkout via `--from`, which is what CI and
 * a developer machine should prefer.
 *
 * THE EXTRACTOR NEVER GUESSES
 * --------------------------
 * A static `data-test-id="add-to-cart-button"` becomes a literal. A dynamic
 * `:data-test-id="`filter-${facet.paramName}`"` becomes a PREFIX PATTERN, never a literal —
 * inventing `filter-price` from a template is exactly the transcription error this file
 * exists to stop (and `filter-price` is in fact one of the 24 phantom selectors). A binding
 * that is a bare expression (`:data-test-id="item.dataTestId"`) yields nothing extractable and
 * is recorded as UNRESOLVED with its reason and location, so the count is visible instead of
 * the gap being silent.
 *
 * USAGE
 *   npm run selectors:sync                  # clone vc-frontend@dev, rewrite the generated file
 *   npm run selectors:sync -- --from ../vc-frontend
 *   npm run selectors:check                 # CI drift gate
 *   --ref <ref>   git ref to read (default: dev)
 *
 * EXIT CODES
 *   0  in sync (check) / written (sync)
 *   1  drift detected (check) — run `npm run selectors:sync` and review the diff
 *   2  could not reach a source (network/checkout) — advisory, NEVER a silent pass
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const OUT_FILE = join(REPO_ROOT, "scripts", "lib", "storefront-selectors.generated.ts");

const REPO = "VirtoCommerce/vc-frontend";
/** The only subtree that carries storefront markup. */
const SUBTREE = "client-app";
/** The attribute the source actually uses. Measured: `data-testid` has zero occurrences. */
const ATTRIBUTE = "data-test-id";

const args = process.argv.slice(2);
const MODE = args.includes("--check") ? "check" : "sync";

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}
const REF = argValue("--ref") ?? "dev";
const FROM = argValue("--from");

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

/** @returns {{root: string, commit: string, cleanup: () => void}} */
function loadSource() {
  if (FROM) {
    const root = resolve(FROM);
    if (!existsSync(join(root, SUBTREE))) {
      throw new Error(`--from checkout has no ${SUBTREE}/: ${root}`);
    }
    let commit = "(local checkout)";
    try {
      commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      /* a plain directory with no git metadata is still a usable source */
    }
    return { root, commit, cleanup: () => {} };
  }

  const dir = mkdtempSync(join(tmpdir(), "vc-frontend-"));
  // Shallow + blobless + sparse: the tree is what we need, not the history or every blob.
  execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", "--branch", REF,
    `https://github.com/${REPO}.git`, dir], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "sparse-checkout", "init", "--cone"], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "sparse-checkout", "set", SUBTREE], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "checkout"], { stdio: "pipe" });
  const commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { root: dir, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(p, out);
    } else if (/\.(vue|ts|tsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** `data-test-id="literal"` — but NOT `:data-test-id=` (a binding) and not `foo-data-test-id`. */
const STATIC_RE = new RegExp(String.raw`(?<![:\w-])${ATTRIBUTE}="([^"]+)"`, "g");
/** `:data-test-id="..."` — a Vue binding; the value is an expression, not a name. */
const BOUND_RE = new RegExp(String.raw`:${ATTRIBUTE}="([^"]+)"`, "g");
/** A template literal whose leading run is static: `filter-${x}` → prefix `filter-`. */
const TEMPLATE_PREFIX_RE = /^`([^`$]*)\$\{/;

/**
 * `test-id-input="literal"` — a UI-kit PROP, not an attribute, and a second source of real
 * rendered test ids that this generator originally missed entirely.
 *
 * Several UI-kit components take the test id as a prop and render it themselves:
 * `vc-input.vue` declares `testIdInput?: string` and emits `:data-test-id="testIdInput"` on the
 * inner `<input>`. So `test-id-input="sign-up-password-input"` puts
 * `data-test-id="sign-up-password-input"` in the DOM — the prop value IS the rendered id,
 * verbatim, and it is every bit as statically readable as the attribute form.
 *
 * Scanning only the attribute form cost 39 real selectors across the sign-in form, the whole
 * sign-up form, the search bar, the address form, the bank-card form, and the checkout
 * method selectors — i.e. exactly the form controls a smoke suite drives. Worse, the omission
 * was then written up as a finding: the previous documentation stated that `sign-in-form.vue`,
 * `sign-up.vue` and `search-bar.vue` "never pass it", which is measurably false — all three do.
 * A generator that silently covers half its surface is the same failure as a hand-maintained
 * list, just harder to notice.
 *
 * `test-id-dropdown`, `test-id-button`, … are the same shape, so the pattern accepts any
 * `test-id-<word>` prop rather than enumerating the ones that happen to exist today.
 */
const PROP_STATIC_RE = /(?<![:\w-])test-id-[a-z]+="([^"]+)"/g;
/** `:test-id-input="expr"` — bound prop; the value is an expression, same rules as BOUND_RE. */
const PROP_BOUND_RE = /:test-id-[a-z]+="([^"]+)"/g;

export function extractSelectors(files, readFile, rootForRel) {
  const staticNames = new Map(); // name -> first file that declares it
  const patterns = new Map(); // prefix -> {template, file}
  const unresolved = [];

  for (const file of files) {
    const src = readFile(file);
    const rel = rootForRel ? file.slice(rootForRel.length).replace(/^[\\/]/, "").split("\\").join("/") : file;

    for (const m of [...src.matchAll(STATIC_RE), ...src.matchAll(PROP_STATIC_RE)]) {
      const name = m[1].trim();
      if (!name || name.includes("${")) continue;
      if (!staticNames.has(name)) staticNames.set(name, rel);
    }

    for (const m of [...src.matchAll(BOUND_RE), ...src.matchAll(PROP_BOUND_RE)]) {
      const expr = m[1].trim();
      const t = expr.match(TEMPLATE_PREFIX_RE);
      if (t && t[1]) {
        const prefix = t[1];
        if (!patterns.has(prefix)) patterns.set(prefix, { template: expr, file: rel });
        continue;
      }
      // A bare expression yields no name we could know. Recorded, never guessed at: an
      // invented literal fails every correct implementation, which is the whole failure mode
      // this generator exists to remove.
      unresolved.push({ expr, file: rel, reason: t ? "template with an empty static prefix" : "value is a bare expression" });
    }
  }

  return {
    staticNames: [...staticNames.entries()].map(([name, file]) => ({ name, file })).sort((a, b) => a.name.localeCompare(b.name)),
    patterns: [...patterns.entries()].map(([prefix, v]) => ({ prefix, ...v })).sort((a, b) => a.prefix.localeCompare(b.prefix)),
    unresolved: unresolved.sort((a, b) => a.file.localeCompare(b.file) || a.expr.localeCompare(b.expr)),
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render({ staticNames, patterns, unresolved, commit, sourcedFrom }) {
  const lit = (s) => JSON.stringify(s);
  return `/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * The storefront's \`${ATTRIBUTE}\` surface, read from the vc-frontend source so test
 * authoring and the preflight macros target REAL elements instead of a hand-transcribed list.
 * When this file was first generated, 24 of the 78 selectors the knowledge files asserted did
 * not exist in the source at all — including the canonical sign-in/sign-out pair.
 *
 * Source:      https://github.com/${REPO}
 * Ref:         ${REF}
 * Commit:      ${commit}
 * Subtree:     ${SUBTREE}/
 * Regenerate:  npm run selectors:sync
 * Drift-guard: npm run selectors:check   (CI gate)
 */

/**
 * The attribute the storefront actually uses. \`data-testid\` (no dash) has ZERO occurrences
 * in the source — a locator written against it can never match, whatever the docs used to say.
 */
export const TEST_ID_ATTRIBUTE = ${lit(ATTRIBUTE)} as const;

/** Every statically-declared \`${ATTRIBUTE}\` value, sorted. */
export const STATIC_SELECTORS: readonly string[] = [
${staticNames.map((s) => `  ${lit(s.name)},`).join("\n")}
] as const;

/**
 * Selectors built from a template literal. These are PREFIXES, not names — the suffix comes
 * from runtime data (a facet name, an address id). Never write the whole thing as a literal:
 * \`filter-price\` was one of the phantom selectors that motivated this file.
 */
export const SELECTOR_PATTERNS: readonly { readonly prefix: string; readonly template: string }[] = [
${patterns.map((p) => `  { prefix: ${lit(p.prefix)}, template: ${lit(p.template)} },`).join("\n")}
] as const;

/**
 * Bindings whose value could not be resolved statically (a bare expression like
 * \`:${ATTRIBUTE}="item.dataTestId"\`). Recorded rather than guessed at: a fabricated
 * expectation fails every correct implementation. A non-zero count means the surface is
 * WIDER than \`STATIC_SELECTORS\` — treat an unknown selector as unverified, not as invalid.
 */
export const UNRESOLVED_BINDINGS: readonly { readonly expr: string; readonly file: string; readonly reason: string }[] = [
${unresolved.map((u) => `  { expr: ${lit(u.expr)}, file: ${lit(u.file)}, reason: ${lit(u.reason)} },`).join("\n")}
] as const;

/** CSS selector for a test id, in the one spelling that exists. */
export function testIdSelector(name: string): string {
  return \`[\${TEST_ID_ATTRIBUTE}="\${name}"]\`;
}

/**
 * Is this a selector the storefront can actually produce? True for a static value or for
 * anything matching a known template prefix. Returns false for an invented name — which is
 * what makes it usable as a review gate rather than documentation.
 */
export function isKnownSelector(name: string): boolean {
  if ((STATIC_SELECTORS as readonly string[]).includes(name)) return true;
  return SELECTOR_PATTERNS.some((p) => name.startsWith(p.prefix) && name.length > p.prefix.length);
}

export const SOURCE = {
  repo: ${lit(REPO)},
  ref: ${lit(REF)},
  commit: ${lit(commit)},
  sourcedFrom: ${lit(sourcedFrom)},
  staticCount: ${staticNames.length},
  patternCount: ${patterns.length},
  unresolvedCount: ${unresolved.length},
} as const;
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const sourcedFrom = FROM ? `local checkout ${resolve(FROM)}` : `https://github.com/${REPO}@${REF}`;
  let extracted, commit, cleanup = () => {};
  try {
    const src = loadSource();
    commit = src.commit;
    cleanup = src.cleanup;
    const root = join(src.root, SUBTREE);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
    const files = walk(root);
    if (files.length === 0) throw new Error(`no .vue/.ts files under ${root}`);
    extracted = extractSelectors(files, (f) => readFileSync(f, "utf8"), src.root);
  } catch (err) {
    cleanup();
    console.error(`[selectors:${MODE}] CANNOT REACH SOURCE — ${err.message}`);
    console.error(`[selectors:${MODE}] This is advisory, not a pass. Re-run with network, or`);
    console.error(`[selectors:${MODE}] point at a local checkout: --from ../vc-frontend`);
    process.exit(2);
  }
  cleanup();

  const next = render({ ...extracted, commit, sourcedFrom });

  console.log(`[selectors:${MODE}] source     : ${sourcedFrom} @ ${commit.slice(0, 12)}`);
  console.log(`[selectors:${MODE}] static     : ${extracted.staticNames.length}`);
  console.log(`[selectors:${MODE}] patterns   : ${extracted.patterns.length} (${extracted.patterns.map((p) => p.prefix).slice(0, 6).join(", ")}${extracted.patterns.length > 6 ? ", …" : ""})`);
  console.log(`[selectors:${MODE}] unresolved : ${extracted.unresolved.length} binding(s) — the surface is wider than the static list`);

  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;
  // Commit/ref/source lines move on every run; the SELECTORS are what must not drift silently.
  const normalize = (s) =>
    (s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/^ \* (Ref|Commit|Source):.*$/gm, "")
      .replace(/^  (commit|ref|sourcedFrom): .*$/gm, "");

  if (MODE === "check") {
    if (prev === null) {
      console.error(`[selectors:check] FAIL — ${OUT_FILE} missing. Run \`npm run selectors:sync\`.`);
      process.exit(1);
    }
    if (normalize(prev) !== normalize(next)) {
      console.error(`[selectors:check] FAIL — committed selectors DRIFTED from ${REPO}@${REF}.`);
      console.error(`[selectors:check] A renamed or removed test id makes every case using it FAIL against a`);
      console.error(`[selectors:check] working product. Run \`npm run selectors:sync\`, review the diff, and fix`);
      console.error(`[selectors:check] the affected cases before the next run.`);
      process.exit(1);
    }
    console.log(`[selectors:check] OK — committed selectors match ${REPO}@${REF}.`);
    process.exit(0);
  }

  writeFileSync(OUT_FILE, next, "utf8");
  const changed = normalize(prev) !== normalize(next);
  console.log(`[selectors:sync] ${changed ? "UPDATED" : "unchanged"} → scripts/lib/storefront-selectors.generated.ts`);
  if (changed && prev !== null) {
    console.log(`[selectors:sync] The selector surface moved — check the cases that reference the changed ids.`);
  }
  process.exit(0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
