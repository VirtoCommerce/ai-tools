// A file's tier: its path zone is the floor; changed lines and fan-out can only raise it.

import { gitShow, metadataOnly, readHead, rewrittenFix } from "./git.mjs";
import { criticalReach, directConsumers } from "./graph.mjs";
import {
  CODE_FILE,
  CONTENT_SIGNALS,
  EXTENSION_POINT,
  HOST_LAYER,
  HTML_INJECTION,
  MAX_CONTAINED_CONSUMERS,
  MODULE_IMPORT,
  VERSION_ONLY_ZONE,
  WIDE_ZONES,
  zoneOf,
} from "./zones.mjs";

export function resolveZone(f, mergeBase = null) {
  const metadata = f.path === "package.json" && f.status === "M" && mergeBase && metadataOnly(gitShow(`${mergeBase}:package.json`), readHead("package.json"));
  return metadata ? VERSION_ONLY_ZONE : zoneOf(f.path);
}

// ctx: { graph, facadeExports, mergeBase, commits }.
export function classifyFile(ctx, f) {
  f.reasons = [];
  f.consumers = [];
  f.external = [];

  const zone = resolveZone(f, ctx.mergeBase);
  f.zone = zone?.id ?? null;
  f.tier = zone ? zone.tier : 1;
  f.reasons.push(zone ? zone.reason : "no zone: tier from fan-out");

  if (f.zone === "locales" && f.deleted > f.added) {
    f.tier = Math.max(f.tier, 1);
    f.reasons.push("more lines removed than added: keys may be gone");
  }
  if (f.tier === 0) return;

  if (CODE_FILE.test(f.path)) contentSignals(ctx, f);
  else pathSignals(f);

  const { graph, facadeExports } = ctx;
  if (!graph || !CODE_FILE.test(f.path)) return;
  if (f.status === "D") {
    f.tier = Math.max(f.tier, 2);
    f.reasons.push("deleted module: anything outside this repo that imported it breaks");
    return;
  }

  const { consumers, barrels } = directConsumers(graph, f.path);
  f.consumers = consumers;
  if (facadeExports.has(f.path)) f.external.push("re-exported by core-api: Module Federation plugins import it");
  if (f.path.startsWith("client-app/ui-kit/")) f.external.push("ui-kit: registered globally, restyled by forks");
  if (barrels.length) f.external.push(`exported from ${barrels.join(", ")}: theme forks and modules import it`);
  if (f.path.startsWith("client-app/") && EXTENSION_POINT.test(readHead(f.path))) f.external.push("touches extension points: plugins register into them");

  const critical = WIDE_ZONES.includes(f.zone) ? null : criticalReach(graph, f.path);
  if (critical) {
    f.reaches = critical;
    f.reasons.push(`used by the ${critical.zone} flow: ${critical.chain.join(" ← ")}`);
    if (f.tier < 2) f.tier = 2;
  }

  if (facadeExports.has(f.path)) {
    f.tier = 3;
    f.reasons.push("part of the plugin facade (@vc-frontend/core)");
  } else if (f.tier < 2 && (consumers.length > MAX_CONTAINED_CONSUMERS || barrels.length || f.external.length)) {
    f.tier = 2;
    f.reasons.push(consumers.length > MAX_CONTAINED_CONSUMERS ? `${consumers.length} direct consumers` : "visible outside its own folder");
  } else if (f.tier < 2) {
    f.reasons.push(consumers.length ? `contained: ${consumers.length} direct consumer(s)` : "no consumers in this repo");
  }
}

// Signals in changed lines. A signal bound to paths names the flow more precisely than the file's wide
// zone (a guard in the router is auth, not app shell), so it also takes over the zone it raises.
function pathSignals(f) {
  const changed = [...f.addedText, ...f.deletedText];
  for (const s of CONTENT_SIGNALS) {
    if (s.paths ? !s.paths.test(f.path) : !CODE_FILE.test(f.path)) continue;
    if (!changed.some((l) => s.re.test(l))) continue;
    f.reasons.push(s.reason);
    if (f.tier < s.tier) {
      f.tier = s.tier;
      if (s.zone && (s.paths || !f.zone)) f.zone = s.zone;
    }
  }
}

// What the changed lines of a code file say, whatever its path: injection surface, mechanisms that
// broke before, a host layer importing a module, and lines a recent fix wrote.
function contentSignals(ctx, f) {
  if (f.addedText.some((l) => HTML_INJECTION.test(l))) {
    if (f.tier < 3) f.zone = "html-injection";
    f.tier = 3;
    f.reasons.push("adds HTML or script injection surface (v-html, innerHTML, sanitizer, eval)");
  }
  pathSignals(f);
  if (HOST_LAYER.test(f.path) && f.addedText.some((l) => MODULE_IMPORT.test(l))) {
    f.reasons.push("core, shared or page code imports a module directly");
    f.tier = Math.max(f.tier, 2);
  }
  const fix = rewrittenFix(ctx, f);
  if (fix) {
    f.reasons.push(`rewrites lines from a recent fix: ${fix}`);
    f.tier = Math.max(f.tier, 2);
  }
}
