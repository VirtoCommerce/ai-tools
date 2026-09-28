#!/usr/bin/env node
/**
 * check-test-models — the gate for the two semantic layers between the domain map and the suites:
 * the Test Mind Map (`.claude/knowledge/domain/*.mind-map.json`, "how can this domain behave?") and the
 * Test Data Model (`test-data/models/*.data-model.json`, "what state must exist before it runs?").
 *
 *   npm run models:check                        exit 1 on any error-severity finding
 *   npm run models:check -- --json              machine output (findings + derived coverage + suspects)
 *   npm run models:check -- --plan <profile-id> the ordered requirement plan /qa-seed-data executes
 *   npm run models:check -- --base <git-ref>    stable-id baseline (default HEAD)
 *
 * WHY. A suite CSV row was the only artifact that said what a case covers and what data it needs, so
 * every behaviour change had to be re-found by reading prose. These two layers make both questions
 * machine-readable; this script is what keeps them honest. The design and the deviations from the
 * original proposal: docs/decisions/test-mind-map-and-data-model.md.
 *
 * WHAT IS NOT IN HERE, deliberately:
 *   - field-level rules — they live in the two JSON Schemas (`.claude/templates/mind-map.schema.json`,
 *     `.claude/templates/test-data-model.schema.json`), loaded through ajv. One copy of each rule.
 *   - which case covers which behaviour — DERIVED from `Behavior:` / `DataProfile:` stamps in suite
 *     References, never stored in the map, so the link has exactly one writer.
 *   - any vocabulary — technique tokens, BL/ECL ids, aliases, seed scripts are read from the file that
 *     owns them at run time (`.claude/rules/test-data.md` GOLDEN RULE). An unreadable oracle, alias
 *     registry or library ⇒ that check is skipped, never guessed; an unreadable technique table exits
 *     non-zero, exactly as the appender that owns the loader does.
 *
 * THE ASYMMETRY (same as `domain:check`): a MISSING model passes; a WRONG one fails.
 *
 * CODES — error unless marked
 *   TM-001 mind map fails its schema             TM-020 data model fails its schema
 *   TM-002 duplicate node id                     TM-021 duplicate requirement / profile id
 *   TM-003 node id not prefixed `<slug>.`        TM-022 requirement id not prefixed `data.<slug>.`
 *   TM-004 edge endpoint / via unknown           TM-023 td_alias does not resolve in aliases.json
 *   TM-005 requires/produces id unknown          TM-024 seed_capability does not resolve
 *   TM-006 oracle ref / BL evidence unresolved   TM-025 discover_fn / generator not exported
 *   TM-007 status inconsistent with evidence     TM-026 relationship / source reference unknown
 *   TM-008 state-transition inconsistency        TM-027 requirement dependency cycle
 *   TM-009 depends_on cycle                      TM-028 profile does not fit its behaviour
 *   TM-010 orphan node (warn)                    TM-029 requirement used by nothing (warn)
 *   TM-011 map behind its domain map rev (warn)  TM-030 a stable id was removed (mark OBSOLETE)
 *   TM-012 domain_slug has no domain map         TM-031 produced requirement not DERIVED (warn)
 *   TM-013 technique token not in vocabulary
 *   TM-014 behaviour/branch with no linked case (info — the audit's coverage input)
 *   TM-015 Behavior: stamp names an unknown node (error) / an OBSOLETE one (warn)
 *   TM-016 DataProfile: stamp names an unknown profile
 *   TM-017 suspect case — linked to a DRIFT, OBSOLETE or changed node (warn)
 *   TM-018 DRIFT route names no trackable owner (warn)
 *   TM-019 suite CSV unparsable, or a legacy header hides its stamps (warn)
 *   TM-032 integration point — a cross-domain depends_on / affected_by edge no case exercises (info)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { ENTRY_RE } from "../knowledge/lint-bl.ts";
import { SECTION_RE } from "../knowledge/lint-ecl.ts";
import { parseSuite, loadDesignVocabulary, isCanonicalHeader } from "../test-cases/append-test-cases-to-suite.ts";

// fileURLToPath, not .pathname — a space in the repo path ("My Projects") URL-encodes to %20.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MAP_DIR = join(ROOT, ".claude", "knowledge", "domain");
const MODEL_DIR = join(ROOT, "test-data", "models");
const SUITES_DIR = join(ROOT, "regression", "suites");
const SCHEMA_MAP = join(ROOT, ".claude", "templates", "mind-map.schema.json");
const SCHEMA_MODEL = join(ROOT, ".claude", "templates", "test-data-model.schema.json");

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Severity = "error" | "warn" | "info";
export interface Finding {
  code: string;
  severity: Severity;
  file: string;
  id?: string;
  msg: string;
}

export interface Evidence {
  class: string;
  ref: string;
  note?: string;
  date?: string;
}
export interface MapNode {
  id: string;
  type: "feature" | "capability" | "behavior" | "branch" | "state";
  name: string;
  status: "CONFIRMED" | "UNVERIFIED" | "DRIFT" | "OBSOLETE";
  evidence: Evidence[];
  maturity?: "released" | "new";
  state_before?: string;
  state_after?: string;
  terminal?: boolean;
  technique?: string;
  requires?: string[];
  produces?: string[];
  oracle_refs?: string[];
  last_verified?: string;
  drift?: { expected: string; observed: string; route?: string };
  [k: string]: unknown;
}
export interface MapEdge {
  from: string;
  to: string;
  type: "contains" | "branches_to" | "transitions_to" | "depends_on" | "affected_by";
  via?: string;
}
export interface MindMap {
  domain_slug: string;
  domain_map_rev: number;
  nodes: MapNode[];
  edges: MapEdge[];
  [k: string]: unknown;
}
export interface Requirement {
  id: string;
  entity: string;
  lifecycle: string;
  acquisition: {
    strategy: string;
    executor?: "seed" | "case";
    discover_fn?: string;
    generator?: string;
    [k: string]: unknown;
  };
  relationships?: { requirement: string; required: boolean }[];
  source?: { produced_by?: string; requirement?: string; field?: string };
  seed_capability?: string;
  td_alias?: string;
  status: string;
  evidence?: Evidence[];
  [k: string]: unknown;
}
export interface Profile {
  id: string;
  behavior: string;
  requirements: string[];
  [k: string]: unknown;
}
export interface DataModel {
  domain_slug: string;
  requirements: Requirement[];
  profiles: Profile[];
  [k: string]: unknown;
}
export interface Loaded<T> {
  file: string;
  doc: T;
}

/** A suite row's stamps, as read from its References cell. */
export interface CaseStamps {
  suite: string;
  behaviors: string[];
  profiles: string[];
}

/** Everything the cross-file checks resolve against. `null` = source unreadable ⇒ check skipped. */
export interface Context {
  domainMapRevs: Map<string, number> | null;
  blIds: Set<string> | null;
  eclIds: Set<string> | null;
  techniques: Set<string> | null;
  aliases: Record<string, Record<string, unknown>> | null;
  scripts: Set<string> | null;
  /** `path#EXPORT` → does that spec module export it? */
  specExport: (ref: string) => boolean | null;
  discoverFns: Set<string> | null;
  generators: Set<string> | null;
  cases: Map<string, CaseStamps>;
  /** Tracker project keys a DRIFT route may cite (`JIRA_PROJECT_KEY`, the profile's tracker key). */
  trackerKeys?: Set<string>;
}

/* ------------------------------------------------------------------ *
 * Schema validation — the schemas are the rules; this only applies them
 * ------------------------------------------------------------------ */

export function compileSchemas(mapSchema: object, modelSchema: object) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
  ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
  return { map: ajv.compile(mapSchema), model: ajv.compile(modelSchema) };
}

export function schemaFindings(validate: ValidateFunction, doc: unknown, file: string, code: string): Finding[] {
  if (validate(doc)) return [];
  return (validate.errors ?? []).map((e) => ({
    code,
    severity: "error" as const,
    file,
    msg: `schema: ${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  }));
}

/* ------------------------------------------------------------------ *
 * Graph helpers — pure
 * ------------------------------------------------------------------ */

/** Every cycle-closing path in a directed graph, as the list of ids on the cycle. */
export function findCycles(adj: Map<string, string[]>): string[][] {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (n: string): void => {
    colour.set(n, GREY);
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      const c = colour.get(m) ?? WHITE;
      if (c === GREY) cycles.push([...stack.slice(stack.indexOf(m)), m]);
      else if (c === WHITE) visit(m);
    }
    stack.pop();
    colour.set(n, BLACK);
  };
  for (const n of adj.keys()) if ((colour.get(n) ?? WHITE) === WHITE) visit(n);
  return cycles;
}

/** A node's ancestors through `contains` / `branches_to` — a branch inherits its behaviour's data needs. */
export function ancestors(nodeId: string, edges: MapEdge[]): string[] {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== "contains" && e.type !== "branches_to") continue;
    parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
  }
  const out: string[] = [];
  const seen = new Set<string>([nodeId]);
  const queue = [...(parents.get(nodeId) ?? [])];
  while (queue.length) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    queue.push(...(parents.get(p) ?? []));
  }
  return out;
}

/** The data dependencies of one requirement: what must exist before it can. */
export function requirementDeps(req: Requirement, nodes: Map<string, MapNode>, edges: MapEdge[]): string[] {
  const deps = new Set<string>();
  for (const r of req.relationships ?? []) if (r.required) deps.add(r.requirement);
  if (req.source?.requirement) deps.add(req.source.requirement);
  // A DERIVED requirement exists only after its producing behaviour ran — so that behaviour's own
  // requirements come first. This is what turns "order.id" into "customer → order → order.id".
  if (req.source?.produced_by) for (const r of nodeRequires(req.source.produced_by, nodes, edges)) deps.add(r);
  deps.delete(req.id);
  return [...deps];
}

/** A node's direct requires plus everything its ancestors require. */
export function nodeRequires(nodeId: string, nodes: Map<string, MapNode>, edges: MapEdge[]): Set<string> {
  const out = new Set<string>(nodes.get(nodeId)?.requires ?? []);
  for (const a of ancestors(nodeId, edges)) for (const r of nodes.get(a)?.requires ?? []) out.add(r);
  return out;
}

/** The full requirement closure of a node — its requires, transitively through data dependencies. */
export function requiresClosure(
  nodeId: string,
  nodes: Map<string, MapNode>,
  edges: MapEdge[],
  reqs: Map<string, Requirement>,
): Set<string> {
  const out = new Set<string>();
  const queue = [...nodeRequires(nodeId, nodes, edges)];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    const r = reqs.get(id);
    if (r) queue.push(...requirementDeps(r, nodes, edges));
  }
  return out;
}

/**
 * The ordered seeding plan for one profile: every requirement it names plus what they depend on,
 * dependencies first. This is the contract `/qa-seed-data --profile` executes — it picks the
 * executor per row and never re-derives the order.
 */
export function seedPlan(
  profile: Profile,
  nodes: Map<string, MapNode>,
  edges: MapEdge[],
  reqs: Map<string, Requirement>,
): { order: Requirement[]; missing: string[] } {
  const order: Requirement[] = [];
  const missing: string[] = [];
  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id) || onPath.has(id)) return; // a cycle is TM-027's finding, not a plan hang
    const r = reqs.get(id);
    if (!r) {
      if (!missing.includes(id)) missing.push(id);
      return;
    }
    onPath.add(id);
    for (const d of requirementDeps(r, nodes, edges)) visit(d);
    onPath.delete(id);
    done.add(id);
    order.push(r);
  };
  for (const id of profile.requirements) visit(id);
  return { order, missing };
}

/**
 * Who reaches a requirement's state. EXISTING/DISCOVER/GENERATE are resolved at run time by the resolver,
 * live-discover and random-data; only CREATE/TRANSITION/DERIVE have a seeder-or-case executor.
 */
export function executorOf(r: Requirement): "seed" | "case" | "resolve" | "discover" | "generate" {
  switch (r.acquisition.strategy) {
    case "EXISTING":
      return "resolve";
    case "DISCOVER":
      return "discover";
    case "GENERATE":
      return "generate";
    default:
      return r.acquisition.executor ?? "seed";
  }
}

/** Node ids / requirement ids present in `prev` but absent in `next` — a stable id may never vanish. */
export function removedIds(prevIds: Iterable<string>, nextIds: Iterable<string>): string[] {
  const next = new Set(nextIds);
  return [...prevIds].filter((id) => !next.has(id));
}

/** Nodes whose behavioural content changed between two revisions (last_verified alone is not a change). */
export function changedNodes(prev: MindMap, next: MindMap): string[] {
  // Re-verifying a node is not a change. Neither is attaching its FIRST data contract: the behaviour is
  // the same, and flagging every stamped case of a map that just gained a data model would make the
  // suspect list useless. Editing an existing requires/produces still counts.
  const strip = (n: MapNode, p?: MapNode) =>
    JSON.stringify({
      ...n,
      last_verified: undefined,
      ...(p && !p.requires?.length ? { requires: undefined } : {}),
      ...(p && !p.produces?.length ? { produces: undefined } : {}),
    });
  const before = new Map(prev.nodes.map((n) => [n.id, n]));
  return next.nodes
    .filter((n) => before.has(n.id) && strip(before.get(n.id)!, before.get(n.id)) !== strip(n, before.get(n.id)))
    .map((n) => n.id);
}

const BEHAVIOR_STAMP_RE = /\bBehavior:\s*([a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*)+)/g;
const PROFILE_STAMP_RE = /\bDataProfile:\s*(profile\.[a-z0-9]+(?:\.[a-z0-9][a-z0-9-]*)+)/g;

/** Read the model stamps out of one References cell. */
export function parseStamps(references: string): { behaviors: string[]; profiles: string[] } {
  const behaviors = [...(references ?? "").matchAll(BEHAVIOR_STAMP_RE)].map((m) => m[1]);
  const profiles = [...(references ?? "").matchAll(PROFILE_STAMP_RE)].map((m) => m[1]);
  return { behaviors, profiles };
}

/** node id → the case ids that stamp it. The ONLY place "linked tests" come from. */
export function linkedTests(cases: Map<string, CaseStamps>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [caseId, s] of cases) for (const b of s.behaviors) out.set(b, [...(out.get(b) ?? []), caseId]);
  return out;
}

/** Does `ALIAS.field` resolve in the alias registry the resolver reads? */
export function aliasResolves(aliases: Record<string, Record<string, unknown>>, ref: string): boolean {
  const dot = ref.indexOf(".");
  const alias = aliases[ref.slice(0, dot)];
  if (!alias) return false;
  const field = ref.slice(dot + 1).split(".")[0];
  const fields = alias.fields as Record<string, unknown> | undefined;
  return fields && typeof fields === "object" ? field in fields || field in alias : field in alias;
}

/* ------------------------------------------------------------------ *
 * The checks
 * ------------------------------------------------------------------ */

const QUALIFYING = new Set(["SPEC", "BL", "DOC", "OBSERVED"]);
const RELEASED_QUALIFYING = new Set(["BL", "DOC", "OBSERVED"]);

/** CONFIRMED is a claim about evidence, so the evidence has to carry it. */
export function statusProblem(status: string, evidence: Evidence[] = [], maturity = "released"): string | null {
  if (status !== "CONFIRMED") return null;
  const classes = new Set(evidence.map((e) => e.class));
  if (![...classes].some((c) => QUALIFYING.has(c))) return "CONFIRMED with only {HYPOTHESIS} (or no) evidence — mark it UNVERIFIED";
  if (maturity === "released" && ![...classes].some((c) => RELEASED_QUALIFYING.has(c))) {
    return "CONFIRMED released behaviour rests on {SPEC} alone — released behaviour needs {DOC}, {BL} or {OBSERVED} (CLAUDE.md §Product context)";
  }
  return null;
}

/**
 * A DRIFT is a recorded conflict, and it is only resolved if its route reaches someone who will act.
 * A route that names only a draft bug, a team or "open defect" parks the conflict in the map, where
 * nobody but the map's next reader finds it.
 *
 * Trackable = a key of THIS deployment's tracker project (read from the env / project profile, never
 * a generic UPPER-123 shape, which case ids like MSN-032 and checker codes like TM-018 also match),
 * an issue/PR in a named repo (`vc-frontend#2501`), a tracker issue URL, an oracle audit or a kb dispute.
 * A documentation URL or an oracle id is the EXPECTED side of the conflict, never an owner.
 * A route that says `UNFILED` is flagged whatever else it names — that marker is the author saying
 * the owner does not exist yet, and TM-018 is what keeps it visible until it does.
 */
const ISSUE_URL_RE = /\bhttps?:\/\/\S*(?:\/browse\/|\/issues\/|\/pull\/|\/_workitems\/)\S*/;
const REPO_REF_RE = /\b[A-Za-z0-9][\w.-]*#\d+\b/;
const OTHER_OWNERS_RE = [/\/qa-review-oracles\b/, /kb[ _-]dispute/i];

export function driftRouteProblem(route: string | undefined, trackerKeys: Iterable<string> = []): string | null {
  if (!route?.trim()) return "DRIFT has no route — name who resolves it";
  if (/\bUNFILED\b/.test(route)) return "DRIFT route is marked UNFILED — file it, then put the key in the route";
  const keys = [...trackerKeys].filter((k) => /^[A-Z][A-Z0-9]*$/.test(k));
  const keyRe = keys.length ? new RegExp(`(?<![A-Za-z0-9-])(?:${keys.join("|")})-\\d+\\b`) : null;
  if ((keyRe && keyRe.test(route)) || ISSUE_URL_RE.test(route) || REPO_REF_RE.test(route) || OTHER_OWNERS_RE.some((re) => re.test(route))) {
    return null;
  }
  const draft = /reports\/bugs\/open\//.test(route) ? " (it points at an unfiled draft bug)" : "";
  return `DRIFT route names no trackable owner${draft} — file a ticket, or route it to /qa-review-oracles or a kb dispute`;
}

export interface CheckInput {
  mindMaps: Loaded<MindMap>[];
  dataModels: Loaded<DataModel>[];
  /** Previous revision of each file (by `file`), for the stable-id and change checks. */
  baseline?: Map<string, MindMap | DataModel>;
}
export interface CheckResult {
  findings: Finding[];
  coverage: Record<string, string[]>;
  suspects: { caseId: string; node: string; why: string }[];
  /** Cross-domain depends_on / affected_by edges and the cases that exercise both sides. */
  crossings: { from: string; to: string; type: string; cases: string[] }[];
}

/**
 * An INTEGRATION POINT is a depends_on / affected_by edge between two domains — the seam where a
 * feature meets functionality another domain owns, and where the bugs a feature's own suite never
 * sees live (a loyalty goal and the checkout discount; barcode search and a configurable product).
 * The domain of a node is its id prefix, which TM-003 already enforces.
 */
export function crossDomainEdges(edges: MapEdge[]): MapEdge[] {
  const dom = (id: string) => id.split(".")[0];
  return edges.filter((e) => (e.type === "depends_on" || e.type === "affected_by") && dom(e.from) !== dom(e.to));
}

/**
 * A case exercises an integration point when its stamps reach BOTH sides — each side either stamped
 * itself or reached through a stamped descendant (a branch under the behaviour). A case on one side
 * only is that domain's test, not a test of the seam.
 */
export function crossingCases(edge: MapEdge, cases: Map<string, CaseStamps>, edges: MapEdge[]): string[] {
  const reach = new Map<string, Set<string>>();
  const reached = (id: string) => {
    if (!reach.has(id)) reach.set(id, new Set([id, ...ancestors(id, edges)]));
    return reach.get(id)!;
  };
  const out: string[] = [];
  for (const [caseId, s] of cases) {
    const sides = s.behaviors.map(reached);
    if (sides.some((r) => r.has(edge.from)) && sides.some((r) => r.has(edge.to))) out.push(caseId);
  }
  return out;
}

export function checkModels(input: CheckInput, ctx: Context): CheckResult {
  const findings: Finding[] = [];
  const add = (code: string, severity: Severity, file: string, msg: string, id?: string) =>
    findings.push({ code, severity, file, msg, ...(id ? { id } : {}) });

  // ---- index everything first, so every later check resolves against the whole pool
  const nodes = new Map<string, MapNode>();
  const nodeFile = new Map<string, string>();
  const edges: MapEdge[] = [];
  for (const { file, doc } of input.mindMaps) {
    for (const n of doc.nodes) {
      if (nodes.has(n.id)) add("TM-002", "error", file, `duplicate node id — also in ${nodeFile.get(n.id)}`, n.id);
      else {
        nodes.set(n.id, n);
        nodeFile.set(n.id, file);
      }
    }
    edges.push(...doc.edges);
  }
  const reqs = new Map<string, Requirement>();
  const reqFile = new Map<string, string>();
  const profiles = new Map<string, Profile>();
  for (const { file, doc } of input.dataModels) {
    for (const r of doc.requirements) {
      if (reqs.has(r.id)) add("TM-021", "error", file, `duplicate requirement id — also in ${reqFile.get(r.id)}`, r.id);
      else {
        reqs.set(r.id, r);
        reqFile.set(r.id, file);
      }
    }
    for (const p of doc.profiles) {
      if (profiles.has(p.id)) add("TM-021", "error", file, "duplicate profile id", p.id);
      else profiles.set(p.id, p);
    }
  }
  const produced = new Map<string, string[]>();
  for (const n of nodes.values()) for (const r of n.produces ?? []) produced.set(r, [...(produced.get(r) ?? []), n.id]);

  // ---- mind maps
  for (const { file, doc } of input.mindMaps) {
    const slug = doc.domain_slug;
    if (ctx.domainMapRevs) {
      const rev = ctx.domainMapRevs.get(slug);
      if (rev === undefined) add("TM-012", "error", file, `domain_slug \`${slug}\` has no domain map — build it first (/qa-domain-map)`);
      else if (doc.domain_map_rev < rev) {
        add("TM-011", "warn", file, `derived from domain map rev ${doc.domain_map_rev}, the map is now rev ${rev} — run the update mode`);
      }
    }
    const incoming = new Set(doc.edges.filter((e) => e.type === "contains" || e.type === "branches_to").map((e) => e.to));
    for (const n of doc.nodes) {
      if (!n.id.startsWith(`${slug}.`)) add("TM-003", "error", file, `node id must start with \`${slug}.\``, n.id);
      for (const r of [...(n.requires ?? []), ...(n.produces ?? [])]) {
        if (!reqs.has(r)) add("TM-005", "error", file, `requires/produces \`${r}\` is not a data-model requirement`, n.id);
      }
      if (ctx.blIds && ctx.eclIds) {
        for (const o of n.oracle_refs ?? []) {
          const known = o.startsWith("BL-") ? ctx.blIds.has(o) : ctx.eclIds.has(o);
          if (!known) add("TM-006", "error", file, `oracle ref \`${o}\` is not a promoted entry`, n.id);
        }
      }
      if (ctx.blIds) {
        for (const e of n.evidence) {
          if (e.class === "BL" && /^BL-/.test(e.ref) && !ctx.blIds.has(e.ref.split(/\s/)[0])) {
            add("TM-006", "error", file, `{BL} evidence \`${e.ref}\` does not resolve`, n.id);
          }
        }
      }
      const sp = statusProblem(n.status, n.evidence, n.maturity);
      if (sp) add("TM-007", "error", file, sp, n.id);
      if (n.status === "DRIFT") {
        const rp = driftRouteProblem(n.drift?.route, ctx.trackerKeys ?? []);
        if (rp) add("TM-018", "warn", file, rp, n.id);
      }
      if (n.technique && ctx.techniques && !ctx.techniques.has(n.technique)) {
        add("TM-013", "error", file, `technique \`${n.technique}\` is not a §0 token (${[...ctx.techniques].join(", ")})`, n.id);
      }
      if (n.type !== "feature" && !incoming.has(n.id) && n.type !== "state") {
        add("TM-010", "warn", file, "no incoming contains/branches_to edge — orphan", n.id);
      }
      // behaviour ↔ transition consistency
      for (const k of ["state_before", "state_after"] as const) {
        const s = n[k];
        if (s && nodes.get(s)?.type !== "state") add("TM-008", "error", file, `${k} \`${s}\` is not a state node`, n.id);
      }
      if (n.state_before && n.state_after && n.state_before !== n.state_after) {
        const ok = doc.edges.some((e) => e.type === "transitions_to" && e.from === n.state_before && e.to === n.state_after && e.via === n.id);
        if (!ok) add("TM-008", "error", file, `moves ${n.state_before} → ${n.state_after} but no transitions_to edge names it as \`via\``, n.id);
      }
    }
    const dependsAdj = new Map<string, string[]>();
    for (const e of doc.edges) {
      for (const end of [e.from, e.to, ...(e.via ? [e.via] : [])]) {
        if (!nodes.has(end)) add("TM-004", "error", file, `edge ${e.from} -${e.type}-> ${e.to} references unknown node \`${end}\``);
      }
      if (e.type === "transitions_to") {
        const [a, b] = [nodes.get(e.from), nodes.get(e.to)];
        if ((a && a.type !== "state") || (b && b.type !== "state")) {
          add("TM-008", "error", file, `transitions_to ${e.from} → ${e.to} must join two state nodes`);
        }
        if (a?.terminal) add("TM-008", "error", file, `transition leaves terminal state \`${e.from}\` — impossible transition`);
        const via = e.via ? nodes.get(e.via) : undefined;
        if (via && via.type !== "behavior" && via.type !== "branch") {
          add("TM-008", "error", file, `transition via \`${e.via}\` is not a behaviour/branch node`);
        }
      }
      if (e.type === "depends_on") dependsAdj.set(e.from, [...(dependsAdj.get(e.from) ?? []), e.to]);
    }
    for (const c of findCycles(dependsAdj)) add("TM-009", "error", file, `depends_on cycle: ${c.join(" → ")}`);
  }

  // ---- data models
  const referenced = new Set<string>();
  for (const n of nodes.values()) for (const r of [...(n.requires ?? []), ...(n.produces ?? [])]) referenced.add(r);
  for (const p of profiles.values()) for (const r of p.requirements) referenced.add(r);

  const reqAdj = new Map<string, string[]>();
  for (const { file, doc } of input.dataModels) {
    for (const r of doc.requirements) {
      if (!r.id.startsWith(`data.${doc.domain_slug}.`)) add("TM-022", "error", file, `requirement id must start with \`data.${doc.domain_slug}.\``, r.id);
      if (r.td_alias && ctx.aliases && !aliasResolves(ctx.aliases, r.td_alias)) {
        add("TM-023", "error", file, `td_alias \`${r.td_alias}\` does not resolve in test-data/aliases.json`, r.id);
      }
      if (r.seed_capability) {
        const cap = r.seed_capability;
        const ok = cap.includes("#") ? ctx.specExport(cap) : ctx.scripts ? ctx.scripts.has(cap) : null;
        if (ok === false) add("TM-024", "error", file, `seed_capability \`${cap}\` is neither a package.json script nor a spec-module export`, r.id);
      }
      const fn = r.acquisition.discover_fn;
      if (fn && ctx.discoverFns && !ctx.discoverFns.has(fn)) add("TM-025", "error", file, `discover_fn \`${fn}\` is not exported by scripts/lib/live-discover.ts`, r.id);
      const gen = r.acquisition.generator;
      if (gen && ctx.generators && !ctx.generators.has(gen)) add("TM-025", "error", file, `generator \`${gen}\` is not exported by scripts/lib/random-data.ts`, r.id);
      for (const rel of r.relationships ?? []) {
        if (!reqs.has(rel.requirement)) add("TM-026", "error", file, `relationship to unknown requirement \`${rel.requirement}\``, r.id);
      }
      if (r.source?.requirement && !reqs.has(r.source.requirement)) {
        add("TM-026", "error", file, `source requirement \`${r.source.requirement}\` is unknown`, r.id);
      }
      if (r.source?.produced_by) {
        const p = nodes.get(r.source.produced_by);
        if (!p) add("TM-026", "error", file, `source.produced_by \`${r.source.produced_by}\` is not a mind-map node`, r.id);
        else if (!(p.produces ?? []).includes(r.id)) {
          add("TM-026", "error", file, `source.produced_by \`${p.id}\` does not list this requirement in its \`produces\``, r.id);
        }
      }
      if (produced.has(r.id) && r.lifecycle !== "DERIVED") {
        add("TM-031", "warn", file, `produced by ${produced.get(r.id)!.join(", ")} but lifecycle is ${r.lifecycle}, not DERIVED`, r.id);
      }
      const sp = statusProblem(r.status, r.evidence ?? []);
      if (sp) add("TM-007", "error", file, sp, r.id);
      if (!referenced.has(r.id)) add("TM-029", "warn", file, "no node requires/produces it and no profile uses it", r.id);
      const deps: string[] = [];
      for (const rel of r.relationships ?? []) if (rel.required) deps.push(rel.requirement);
      if (r.source?.requirement) deps.push(r.source.requirement);
      reqAdj.set(r.id, deps);
    }
    for (const p of doc.profiles) {
      const n = nodes.get(p.behavior);
      if (!n) {
        add("TM-028", "error", file, `profile behaviour \`${p.behavior}\` is not a mind-map node`, p.id);
        continue;
      }
      for (const r of p.requirements) if (!reqs.has(r)) add("TM-028", "error", file, `profile names unknown requirement \`${r}\``, p.id);
      for (const r of n.requires ?? []) {
        if (!p.requirements.includes(r)) add("TM-028", "error", file, `misses \`${r}\`, a direct requirement of ${n.id}`, p.id);
      }
      const closure = requiresClosure(n.id, nodes, edges, reqs);
      for (const r of p.requirements) {
        if (reqs.has(r) && !closure.has(r)) {
          add("TM-028", "warn", file, `\`${r}\` is outside ${n.id}'s requires-closure — minimal-data principle`, p.id);
        }
      }
    }
  }
  for (const c of findCycles(reqAdj)) add("TM-027", "error", reqFile.get(c[0]) ?? "?", `requirement dependency cycle: ${c.join(" → ")}`);

  // ---- stable ids + change detection against the baseline
  const changed = new Set<string>();
  for (const { file, doc } of [...input.mindMaps, ...input.dataModels] as Loaded<MindMap | DataModel>[]) {
    const prev = input.baseline?.get(file);
    if (!prev) continue;
    const isMap = (d: MindMap | DataModel): d is MindMap => Array.isArray((d as MindMap).nodes);
    const idsOf = (d: MindMap | DataModel) =>
      isMap(d) ? d.nodes.map((n) => n.id) : [...(d.requirements ?? []).map((r) => r.id), ...(d.profiles ?? []).map((p) => p.id)];
    for (const id of removedIds(idsOf(prev), idsOf(doc))) {
      add("TM-030", "error", file, "stable id removed — keep it and set status OBSOLETE (with `obsolete.reason`) instead", id);
    }
    if (isMap(doc) && isMap(prev)) for (const id of changedNodes(prev, doc)) changed.add(id);
  }

  // ---- case stamps → derived coverage + suspects
  const coverage = linkedTests(ctx.cases);
  const suspects: CheckResult["suspects"] = [];
  for (const [caseId, s] of ctx.cases) {
    for (const b of s.behaviors) {
      const n = nodes.get(b);
      if (!n) add("TM-015", "error", s.suite, `${caseId} stamps unknown behaviour \`${b}\``, caseId);
      else if (n.status === "OBSOLETE") add("TM-015", "warn", s.suite, `${caseId} stamps OBSOLETE behaviour \`${b}\``, caseId);
      if (n && (n.status === "DRIFT" || n.status === "OBSOLETE" || changed.has(b))) {
        const why = changed.has(b) ? "node changed since baseline" : `node is ${n.status}`;
        suspects.push({ caseId, node: b, why });
        add("TM-017", "warn", s.suite, `${caseId} is suspect — ${b}: ${why}`, caseId);
      }
    }
    for (const p of s.profiles) if (!profiles.has(p)) add("TM-016", "error", s.suite, `${caseId} stamps unknown data profile \`${p}\``, caseId);
  }
  for (const n of nodes.values()) {
    if ((n.type === "behavior" || n.type === "branch") && n.status !== "OBSOLETE" && !coverage.has(n.id)) {
      add("TM-014", "info", nodeFile.get(n.id)!, "no suite case stamps this node", n.id);
    }
  }

  const allEdges = input.mindMaps.flatMap((m) => m.doc.edges);
  const crossings = crossDomainEdges(allEdges).map((e) => ({ from: e.from, to: e.to, type: e.type, cases: crossingCases(e, ctx.cases, allEdges) }));
  for (const c of crossings) {
    if (!c.cases.length) add("TM-032", "info", nodeFile.get(c.from) ?? "?", `integration point ${c.from} -${c.type}-> ${c.to}: no case exercises both sides`, c.from);
  }

  return { findings, coverage: Object.fromEntries(coverage), suspects, crossings };
}

/* ------------------------------------------------------------------ *
 * Context loading — every vocabulary from the file that owns it
 * ------------------------------------------------------------------ */

/**
 * This deployment's tracker keys: `JIRA_PROJECT_KEY` from the env layers + the profile's tracker key.
 * The layers are PARSED, in config.js's order, rather than config.js imported: config.js exits the
 * process when a secret is missing, which is every CI run and every fresh clone.
 */
async function trackerKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const { parse } = await import("dotenv");
    const { resolveTestEnv } = await import(pathToFileURL(join(ROOT, "scripts", "lib", "resolve-test-env.js")).href);
    const { loadProjectProfile } = await import(pathToFileURL(join(ROOT, "scripts", "lib", "project-profile.mjs")).href);
    const layers = [".env.defaults", `.env.${resolveTestEnv("vcst")}`, ".env.local"].map((f) => readIf(join(ROOT, f)));
    const merged = Object.assign({}, ...layers.filter((t): t is string => t !== null).map((t) => parse(t)), process.env);
    for (const k of [merged.JIRA_PROJECT_KEY, loadProjectProfile(ROOT)?.tracker?.projectKey]) if (k) keys.add(k);
  } catch {
    // An unreadable env or profile ⇒ no key is trusted, and every tracker-only route warns. Loud, not guessed.
  }
  return keys;
}

function readIf(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function exportNames(text: string | null): Set<string> | null {
  if (text == null) return null;
  return new Set([...text.matchAll(/export\s+(?:async\s+)?(?:function\s*\*?|const|let)\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
}

function domainMapRevs(): Map<string, number> | null {
  if (!existsSync(MAP_DIR)) return null;
  const out = new Map<string, number>();
  for (const f of readdirSync(MAP_DIR).filter((x) => x.endsWith(".md"))) {
    const fm = readFileSync(join(MAP_DIR, f), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const slug = fm?.[1].match(/^domain_slug:\s*(\S+)/m)?.[1];
    const rev = fm?.[1].match(/^rev:\s*(\d+)/m)?.[1];
    if (slug) out.set(slug, Number(rev ?? 0));
  }
  return out;
}

function blIds(): Set<string> | null {
  const t = readIf(join(ROOT, ".claude", "knowledge", "oracles", "business-logic.md"));
  if (t == null) return null;
  const out = new Set<string>();
  for (const line of t.split(/\r?\n/)) {
    const m = ENTRY_RE.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

function eclIds(): Set<string> | null {
  const t = readIf(join(ROOT, ".claude", "knowledge", "oracles", "e-commerce-edge-cases-library.md"));
  if (t == null) return null;
  const out = new Set<string>();
  for (const line of t.split(/\r?\n/)) {
    const m = SECTION_RE.exec(line);
    if (m) out.add(`ECL-${m[1]}.${m[2]}`);
  }
  return out;
}

/**
 * The suite parser maps a legacy (TestRail-style) header onto the enriched column names BY POSITION,
 * so a stamp in a legacy `References` cell lands under another name and is never read — silently.
 * Only a file that actually carries a stamp is worth a warning; legacy suites without one are not.
 */
export function stampsUnreadable(text: string): boolean {
  return /\b(?:Behavior|DataProfile):/.test(text) && !isCanonicalHeader(text);
}

export function loadCases(findings: Finding[]): Map<string, CaseStamps> {
  const out = new Map<string, CaseStamps>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".csv")) {
        const suite = relative(ROOT, p).replace(/\\/g, "/");
        let rows;
        let text: string;
        try {
          text = readFileSync(p, "utf8");
          rows = parseSuite(text).rows;
        } catch {
          findings.push({ code: "TM-019", severity: "warn", file: suite, msg: "suite does not parse — its model stamps were not read" });
          continue;
        }
        if (stampsUnreadable(text)) {
          findings.push({ code: "TM-019", severity: "warn", file: suite, msg: "legacy header — columns are read by position, so its model stamps were not read; migrate the suite to the enriched header first" });
          continue;
        }
        for (const r of rows) {
          const s = parseStamps(r.References ?? "");
          if (s.behaviors.length || s.profiles.length) out.set(r.ID, { suite, ...s });
        }
      }
    }
  };
  if (existsSync(SUITES_DIR)) walk(SUITES_DIR);
  return out;
}

async function specExportResolver(models: Loaded<DataModel>[]): Promise<(ref: string) => boolean | null> {
  const cache = new Map<string, Set<string> | null>();
  for (const { doc } of models) {
    for (const r of doc.requirements) {
      const cap = r.seed_capability;
      if (!cap?.includes("#")) continue;
      const path = cap.split("#")[0];
      if (cache.has(path)) continue;
      const full = join(ROOT, path);
      // Spec modules are side-effect-free by convention (test-data-authoring.md §3), so importing one is safe.
      cache.set(path, existsSync(full) ? new Set(Object.keys(await import(pathToFileURL(full).href))) : new Set());
    }
  }
  return (ref) => {
    const [path, name] = ref.split("#");
    const names = cache.get(path);
    return names == null ? null : names.has(name);
  };
}

function loadJsonDir<T>(dir: string, suffix: string, findings: Finding[]): Loaded<T>[] {
  if (!existsSync(dir)) return [];
  const out: Loaded<T>[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(suffix)).sort()) {
    const file = relative(ROOT, join(dir, f)).replace(/\\/g, "/");
    try {
      out.push({ file, doc: JSON.parse(readFileSync(join(dir, f), "utf8")) as T });
    } catch (e) {
      findings.push({ code: suffix.includes("mind") ? "TM-001" : "TM-020", severity: "error", file, msg: `not valid JSON: ${(e as Error).message}` });
    }
  }
  return out;
}

function baselineOf(files: string[], ref: string): Map<string, MindMap | DataModel> {
  const out = new Map<string, MindMap | DataModel>();
  for (const file of files) {
    const r = spawnSync("git", ["show", `${ref}:${file}`], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) continue; // new file, or ref unavailable — nothing to compare against
    try {
      out.set(file, JSON.parse(r.stdout));
    } catch {
      /* an unparsable baseline cannot constrain the working copy */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const opt = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const planFor = opt("--plan");
  const base = opt("--base") ?? "HEAD";

  const findings: Finding[] = [];
  const mindMaps = loadJsonDir<MindMap>(MAP_DIR, ".mind-map.json", findings);
  const dataModels = loadJsonDir<DataModel>(MODEL_DIR, ".data-model.json", findings);

  if (!mindMaps.length && !dataModels.length && !findings.length) {
    console.log("[models:check] no mind maps or data models yet — that is NOT a failure (a missing model passes).");
    process.exit(0);
  }

  const schemas = compileSchemas(JSON.parse(readFileSync(SCHEMA_MAP, "utf8")), JSON.parse(readFileSync(SCHEMA_MODEL, "utf8")));
  for (const m of mindMaps) findings.push(...schemaFindings(schemas.map, m.doc, m.file, "TM-001"));
  for (const m of dataModels) findings.push(...schemaFindings(schemas.model, m.doc, m.file, "TM-020"));
  // A document that fails its schema cannot be cross-checked safely — its shape is not what the checks assume.
  const bad = new Set(findings.filter((f) => f.code === "TM-001" || f.code === "TM-020").map((f) => f.file));
  const okMaps = mindMaps.filter((m) => !bad.has(m.file));
  const okModels = dataModels.filter((m) => !bad.has(m.file));

  // The appender's own loader: an unreadable technique table exits non-zero there and here alike.
  const techniques = loadDesignVocabulary().techniques;
  const pkg = readIf(join(ROOT, "package.json"));
  const ctx: Context = {
    domainMapRevs: domainMapRevs(),
    blIds: blIds(),
    eclIds: eclIds(),
    techniques,
    aliases: (() => {
      const t = readIf(join(ROOT, "test-data", "aliases.json"));
      return t ? (JSON.parse(t) as Record<string, Record<string, unknown>>) : null;
    })(),
    scripts: pkg ? new Set(Object.keys(JSON.parse(pkg).scripts ?? {})) : null,
    specExport: await specExportResolver(okModels),
    discoverFns: exportNames(readIf(join(ROOT, "scripts", "lib", "live-discover.ts"))),
    generators: exportNames(readIf(join(ROOT, "scripts", "lib", "random-data.ts"))),
    cases: loadCases(findings),
    trackerKeys: await trackerKeys(),
  };

  const baseline = baselineOf([...okMaps, ...okModels].map((m) => m.file), base);
  const result = checkModels({ mindMaps: okMaps, dataModels: okModels, baseline }, ctx);
  findings.push(...result.findings);

  if (planFor) {
    const nodes = new Map(okMaps.flatMap((m) => m.doc.nodes.map((n) => [n.id, n] as const)));
    const edges = okMaps.flatMap((m) => m.doc.edges);
    const reqs = new Map(okModels.flatMap((m) => m.doc.requirements.map((r) => [r.id, r] as const)));
    const profile = okModels.flatMap((m) => m.doc.profiles).find((p) => p.id === planFor);
    if (!profile) {
      console.error(`[models:check] no profile \`${planFor}\``);
      process.exit(1);
    }
    const plan = seedPlan(profile, nodes, edges, reqs);
    const rows = plan.order.map((r, i) => ({
      step: i + 1,
      requirement: r.id,
      lifecycle: r.lifecycle,
      strategy: r.acquisition.strategy,
      executor: executorOf(r),
      seed_capability: r.seed_capability ?? null,
      td_alias: r.td_alias ?? null,
      in_profile: profile.requirements.includes(r.id),
    }));
    if (json) console.log(JSON.stringify({ profile: profile.id, behavior: profile.behavior, plan: rows, missing: plan.missing }, null, 2));
    else {
      console.log(`[models:check] plan for ${profile.id} (behaviour ${profile.behavior})`);
      for (const r of rows) {
        console.log(`  ${r.step}. ${r.requirement}  [${r.lifecycle} · ${r.strategy}/${r.executor}]  ${r.seed_capability ?? "—"}  ${r.td_alias ? `@td(${r.td_alias})` : ""}${r.in_profile ? "" : "  (dependency)"}`);
      }
      if (plan.missing.length) console.log(`  missing: ${plan.missing.join(", ")}`);
    }
    process.exit(plan.missing.length ? 1 : 0);
  }

  const errors = findings.filter((f) => f.severity === "error");
  if (json) {
    console.log(JSON.stringify({ mind_maps: mindMaps.map((m) => m.file), data_models: dataModels.map((m) => m.file), findings, coverage: result.coverage, suspects: result.suspects, crossings: result.crossings }, null, 2));
  } else {
    const nodeCount = okMaps.reduce((s, m) => s + m.doc.nodes.length, 0);
    const reqCount = okModels.reduce((s, m) => s + m.doc.requirements.length, 0);
    console.log(`[models:check] ${mindMaps.length} mind map(s) · ${nodeCount} node(s) · ${dataModels.length} data model(s) · ${reqCount} requirement(s) · ${ctx.cases.size} stamped case(s)`);
    for (const f of findings.filter((x) => x.severity !== "info")) console.log(`  ${f.code} [${f.severity}] ${basename(f.file)}${f.id ? ` ${f.id}` : ""}  ${f.msg}`);
    const gaps = findings.filter((f) => f.code === "TM-014").length;
    if (gaps) console.log(`  TM-014 [info] ${gaps} behaviour/branch node(s) have no stamped case — see --json or the audit mode`);
    const seams = findings.filter((f) => f.code === "TM-032").length;
    if (result.crossings.length) console.log(`  TM-032 [info] ${seams} of ${result.crossings.length} integration point(s) have no case exercising both sides — see --json \`crossings\``);
    console.log(errors.length ? `[models:check] FAIL — ${errors.length} error(s)` : "[models:check] OK");
  }
  process.exit(errors.length ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) void main();
