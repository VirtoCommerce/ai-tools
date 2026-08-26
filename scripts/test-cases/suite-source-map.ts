/**
 * Suite → owning module → GitHub repo. The SOURCE axis of Dimension 11
 * (`/qa-review-tests --triangulate`, triangulation-criteria.md §2).
 *
 * Triangulation needs to know which `org:VirtoCommerce` repo implements the
 * behavior a suite asserts, so the auditor can anchor a `file:line`. Nothing in
 * the repo answered that: `config/test-suites.json` declares `requiresModules`
 * on only 47 of 120 suites, and `.claude/knowledge/execution/module-suite-map.md`
 * names modules in a prose table, not repo names.
 *
 * WHY DERIVE INSTEAD OF BACKFILLING THE MANIFEST. The obvious fix is to write
 * `requiresModules` into the 73 suites missing it. That transcribes
 * module-suite-map.md into a second location, and `.claude/rules/test-data.md`'s
 * GOLDEN RULE is explicit about what happens next: the copy is correct exactly
 * once and then rots silently. So the map stays the single source of truth and
 * this module reads it. A suite added tomorrow resolves with no manifest edit.
 *
 * RESOLUTION CHAIN (stops at the first hit, per triangulation-criteria.md §2):
 *   1. manifest `requiresModules`  — explicit wins when an author declared it
 *   2. module-suite-map.md Module Map — reverse-index suite id → module(s)
 *   3. ci/config/fix-repos.json `routing[]` — module context → repo name
 *
 * UNRESOLVED IS A REAL ANSWER. When no module can be found the caller must score
 * the source axis ABSENT ⇒ UNGROUNDED. It must never guess a repo: a wrong repo
 * still yields a confident `file:line` for unrelated code, which manufactures a
 * false CONFIRMED — strictly worse than no anchor at all.
 *
 * Caveat inherited from the map: module-suite-map.md is `applicability: reference`
 * (the vcst module set). On a client deployment the mapping differs, so a
 * client-specific suite legitimately resolves to nothing here.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP_PATH = join(REPO_ROOT, ".claude", "knowledge", "execution", "module-suite-map.md");
const FIX_REPOS_PATH = join(REPO_ROOT, "ci", "config", "fix-repos.json");

export interface ModuleMapRow {
  module: string;
  /** Raw suite tokens from the Frontend + Backend columns (e.g. "006-010", "050"). */
  suiteTokens: string[];
  adminSections: string;
  restPath: string;
  xapiModule: string;
}

export interface SuiteSource {
  /** Module display names from the map (or slugs when taken from the manifest). */
  modules: string[];
  /** Candidate `vc-module-*` / `vc-frontend` / `vc-platform` repo names. */
  repos: string[];
  /** Which link of the chain produced `modules`. */
  via: "manifest" | "module-suite-map" | "unresolved";
  restPaths: string[];
  xapiModules: string[];
}

/** `| **Catalog** | 001, 002, 003 | 051, 053 | … |` */
const MAP_ROW_RE = /^\|\s*\*\*(.+?)\*\*\s*\|(.*)$/;
const NUMERIC_RANGE_RE = /^(\d{3})\s*-\s*(\d{3})$/;

function cellTokens(cell: string): string[] {
  const t = cell.trim();
  if (!t || t === "—" || t === "-") return [];
  return t.split(",").map((s) => s.trim()).filter((s) => s && s !== "—" && s !== "-");
}

/** Parse the "## Module Map" table. Returns [] when the file is absent. */
export function parseModuleMap(mapText: string): ModuleMapRow[] {
  const rows: ModuleMapRow[] = [];
  let inMap = false;
  for (const line of mapText.split(/\r?\n/)) {
    if (/^##\s+Module Map/.test(line)) { inMap = true; continue; }
    // Any later `## ` heading ends the table (Selection Groups, Dependencies, …).
    if (inMap && /^##\s+/.test(line)) break;
    if (!inMap) continue;

    const m = MAP_ROW_RE.exec(line);
    if (!m) continue;
    const cols = m[2].split("|").map((c) => c.trim());
    // Frontend | Backend | Admin UI | REST | xAPI  (trailing empty cell from the
    // row's closing pipe is tolerated by index-based access).
    rows.push({
      module: m[1].trim(),
      suiteTokens: [...cellTokens(cols[0] ?? ""), ...cellTokens(cols[1] ?? "")],
      adminSections: cols[2] ?? "",
      restPath: cols[3] ?? "",
      xapiModule: cols[4] ?? "",
    });
  }
  return rows;
}

/**
 * Does a suite id fall under a map token?
 *
 * Three forms, all of which occur in the real table:
 *   exact   `050m`      → only that suite
 *   family  `050`       → 050a…050n (the map lists the GraphQL family as one token);
 *                          also `048` → `048c`
 *   range   `006-010`   → numeric prefix between the bounds, so `042-048` picks up
 *                          `048c` while `006-010` correctly excludes `011b`
 */
export function suiteMatchesToken(suiteId: string, token: string): boolean {
  if (suiteId === token) return true;

  const range = NUMERIC_RANGE_RE.exec(token);
  const prefix = /^(\d{3})/.exec(suiteId)?.[1];
  if (range) {
    if (!prefix) return false;
    const n = Number(prefix);
    return n >= Number(range[1]) && n <= Number(range[2]);
  }

  // Family: a bare 3-digit token covers every suite sharing that numeric prefix.
  if (/^\d{3}$/.test(token) && prefix === token) return true;
  return false;
}

interface RoutingRule { name: string; match: string }

function loadRouting(): RoutingRule[] {
  if (!existsSync(FIX_REPOS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(FIX_REPOS_PATH, "utf-8")).routing ?? [];
  } catch {
    return [];
  }
}

/**
 * Run the real `fix-repos.json` routing rules over a probe string built from the
 * module row, so repo naming stays owned by the router rather than duplicated here.
 *
 * THE MODULE NAME OUTRANKS THE CONTEXT CELLS. The routing regexes were written for
 * free-text bug descriptions, where every keyword is a signal. A Module Map row is
 * not free text: `adminSections` is an admin-menu PATH whose leading segment is the
 * parent menu, and it also names the row's *dependencies* — so the context cells
 * routinely mention other modules' vocabulary. Worked example: the **Sales Rep**
 * row's `adminSections` ends `…; store setting \`SalesRep.Enabled\``, which matched
 * `vc-module-store`'s `\bstore (setting|management|rounding)\b` and made all seven
 * sales-rep suites (050m, 089-091, 092, 092b, 093) resolve to the Store module —
 * a confident WRONG repo, the exact false-CONFIRMED failure §2 bans. (The real
 * **Store** row resolved to nothing at all: its own cells say "Stores →
 * Configuration, Rounding", which that rule does not match.)
 *
 * So the row's own NAME is tried first, and the context cells are consulted only
 * when the name routes to nothing. The name is the row's ownership claim; the other
 * cells are supporting context that can legitimately reference a neighbour.
 *
 * SECOND DEFENCE — A FOREIGN PARENT MENU IS A LOCATION, NOT AN OWNER. Name precedence
 * only helps a row whose own name routes. The other half of the contamination sits at
 * the FRONT of `adminSections`, which is written `Parent → Child, Child`: the parent is
 * where the blade LIVES in the admin menu, and it is very often another module's name.
 * That is how `Payment` ("Orders → Payments") resolved to `vc-module-order`, `SEO`
 * ("Marketing → SEO, Redirects") to `vc-module-marketing`, `Returns` ("Orders →
 * Returns, RMA") to `vc-module-order`, and `Channels` ("Catalog → Publishing, Data
 * Quality") to `vc-module-catalog` — four more confident-wrong anchors.
 *
 * `stripForeignParentMenu` drops that leading segment when, and only when, it names a
 * DIFFERENT row of this same map. The stop-list is therefore DERIVED from the map's own
 * module names — never a hardcoded word list (`.claude/rules/test-data.md` GOLDEN RULE);
 * a module renamed in the table changes this behaviour with no code edit. A parent that
 * is the row's own name (`Store` → "Stores → Configuration, Rounding", `Orders` →
 * "Orders → All Orders") or is not a module at all (`Settings` → "Settings → Security,
 * OAuth", which is the ONLY thing that anchors Authentication to `vc-platform`) is
 * KEPT — so the strip removes contamination without costing a single correct answer.
 *
 * NO SLUG FALLBACK, deliberately. An earlier revision synthesised
 * `vc-module-<slugified module name>` whenever the router did not match, which
 * produced confident nonsense: "B2B Features" → `vc-module-b2b-features` and
 * "Platform Core" → `vc-module-platform-core`, neither of which exists (the latter
 * is `vc-platform`). That is the exact failure triangulation-criteria.md §2 bans —
 * a wrong repo still yields a plausible `file:line` anchor, manufacturing a false
 * CONFIRMED. An empty list is the honest answer: the caller has the module NAME,
 * which IS grounded (it came from the map), and resolves the repo by searching
 * `org:VirtoCommerce` for it.
 */
/** "Orders" / "orders" / "Order" all collapse to `order`, so a menu segment can be
 *  compared with a row name without a hand-written synonym table. */
function normalizeModuleName(s: string): string {
  const bare = s.toLowerCase().replace(/[^a-z ]+/g, " ").trim();
  return bare.replace(/s\b/g, "");
}

/**
 * Drop the `Parent → …` prefix of an Admin UI cell when `Parent` names a DIFFERENT row
 * of the map. Returns the cell unchanged when the parent is this row's own name, is not
 * a module at all, or the cell has no `→` (e.g. "— (storefront-only)").
 */
export function stripForeignParentMenu(
  row: ModuleMapRow,
  allModuleNames: string[] = [],
): string {
  const arrow = row.adminSections.indexOf("→");
  if (arrow < 0) return row.adminSections;

  const parent = normalizeModuleName(row.adminSections.slice(0, arrow));
  if (!parent || parent === normalizeModuleName(row.module)) return row.adminSections;

  const isAnotherModule = allModuleNames.some(
    (n) => normalizeModuleName(n) === parent && normalizeModuleName(n) !== normalizeModuleName(row.module),
  );
  return isAnotherModule ? row.adminSections.slice(arrow + 1) : row.adminSections;
}

export function reposForModule(
  row: ModuleMapRow,
  routing: RoutingRule[],
  allModuleNames: string[] = [],
): string[] {
  const match = (probe: string): string[] => {
    const hits = new Set<string>();
    for (const r of routing) {
      try {
        if (new RegExp(r.match, "i").test(probe)) hits.add(r.name);
      } catch {
        // A malformed rule is fix-repos.json's problem, not ours — skip it.
      }
    }
    return [...hits].sort();
  };

  // Tier 1 — the row's own ownership claim.
  const byName = match(row.module.toLowerCase());
  if (byName.length) return byName;

  // Tier 2 — the module's own API surface. `/api/order/` and `xOrder` describe what the
  // module SERVES; unlike the admin cell they cannot name a parent menu or a dependency.
  const byApi = match([row.module, row.restPath, row.xapiModule].join(" ").toLowerCase());
  if (byApi.length) return byApi;

  // Tier 3 — the admin-menu cell, last and with any foreign parent segment removed. This
  // ordering is load-bearing: the Orders row's cell reads "Orders → All Orders, Payment
  // Requests", so consulting it for a row that already resolved from `/api/order/` would
  // add `vc-module-payment` to every orders suite — the same contamination, reversed.
  const admin = stripForeignParentMenu(row, allModuleNames);
  return match([row.module, admin, row.restPath, row.xapiModule].join(" ").toLowerCase());
}

export interface ResolveOptions {
  /** Injectable for tests; defaults to the on-disk map. */
  mapText?: string;
  routing?: RoutingRule[];
}

/**
 * Resolve the source axis for one suite. `manifestModules` is the suite's
 * `requiresModules` from config/test-suites.json when present.
 */
export function resolveSuiteSource(
  suiteId: string,
  manifestModules: string[] = [],
  opts: ResolveOptions = {},
): SuiteSource {
  const mapText = opts.mapText ?? (existsSync(MAP_PATH) ? readFileSync(MAP_PATH, "utf-8") : "");
  const routing = opts.routing ?? loadRouting();
  const rows = parseModuleMap(mapText);
  const matched = rows.filter((r) => r.suiteTokens.some((t) => suiteMatchesToken(suiteId, t)));
  // The map's own module names are the stop-list for a foreign parent menu.
  const allModuleNames = rows.map((r) => r.module);

  const repos = new Set<string>();
  const restPaths = new Set<string>();
  const xapiModules = new Set<string>();
  for (const r of matched) {
    for (const repo of reposForModule(r, routing, allModuleNames)) repos.add(repo);
    const rest = r.restPath.replace(/`/g, "").trim();
    if (rest && rest !== "—") restPaths.add(rest);
    const x = r.xapiModule.replace(/`/g, "").trim();
    if (x && x !== "—") for (const p of x.split(",").map((s) => s.trim()).filter(Boolean)) xapiModules.add(p);
  }

  // The manifest wins on `modules` when an author declared it, but the map still
  // contributes repo/REST/xAPI context — the two are complementary, not rival.
  // A manifest slug is NOT turned into a repo name for the same reason
  // reposForModule has no slug fallback: `requiresModules: ["orders"]` would give
  // `vc-module-orders` (right) but `["platform"]` would give `vc-module-platform`
  // (wrong — it is `vc-platform`). Only router-matched names are reported.
  if (manifestModules.length) {
    return {
      modules: manifestModules,
      repos: [...repos].sort(),
      via: "manifest",
      restPaths: [...restPaths].sort(),
      xapiModules: [...xapiModules].sort(),
    };
  }

  if (!matched.length)
    return { modules: [], repos: [], via: "unresolved", restPaths: [], xapiModules: [] };

  return {
    modules: matched.map((r) => r.module),
    repos: [...repos].sort(),
    via: "module-suite-map",
    restPaths: [...restPaths].sort(),
    xapiModules: [...xapiModules].sort(),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const manifestPath = join(REPO_ROOT, "config", "test-suites.json");
  const suites: Array<{ id: string; name: string; requiresModules?: string[] }> =
    JSON.parse(readFileSync(manifestPath, "utf-8")).suites ?? [];

  const only = argv.find((a) => !a.startsWith("--"));
  const rows = (only ? suites.filter((s) => s.id === only) : suites).map((s) => ({
    id: s.id,
    name: s.name,
    ...resolveSuiteSource(s.id, s.requiresModules ?? []),
  }));

  if (json) {
    console.log(JSON.stringify({ total: rows.length, unresolved: rows.filter((r) => r.via === "unresolved").length, suites: rows }, null, 2));
    process.exit(0);
  }

  const unresolved = rows.filter((r) => r.via === "unresolved");
  console.log(`\nSource-axis resolution — ${rows.length} suite(s), ${unresolved.length} unresolved\n`);
  console.log("  id     via                modules → repos");
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(6)} ${r.via.padEnd(18)} ${r.modules.join(", ") || "—"}` +
        `${r.repos.length ? ` → ${r.repos.join(", ")}` : ""}`,
    );
  }
  if (unresolved.length)
    console.log(
      `\n  ${unresolved.length} suite(s) unresolved (${unresolved.map((r) => r.id).join(", ")}) — ` +
        `source axis is ABSENT for these ⇒ UNGROUNDED. Add a Module Map row or the suite's ` +
        `requiresModules; never guess a repo.`,
    );
  process.exit(0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
