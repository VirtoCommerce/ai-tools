// .claude/skills/qa-test-strategy/lib/floors.mjs — the floors F1–F11, computed from the /ticket-context bundle.
// R2 of the /qa-test redesign: a floor is a gate rule, never a model judgment. This script reads signals; it
// never chooses a risk. F9 (doubt ⇒ the floor applies) is built in: a signal that cannot be read fires its floor.
// Specs: docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md §6 (F1–F9),
//        docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md §5, §5a (F10, F11).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The tracker's names for P0/P1 (this site: Highest/High). A name not listed reads as P2+; extend it, never guess.
const P01 = /^(p0|p1|highest|high|blocker|critical)$/i;
// qa-test/visual-axis.md §1 source 1 — a rendering file.
const VISUAL = /\.(vue|scss|css|html)$|\/Scripts\/.*\.html$|\/icons?\/|design-tokens?|_tokens?\.scss$/i; // not a bare "token": TokenService.cs is not a rendering file
// ticket-routing.md §5c — the change IS the design system.
const UI_KIT = /client-app\/ui-kit\/|_ui-kit-tokens\.scss$|\/_colors\.scss$|\/_dark\.scss$|\/preflight\.scss$|client-app\/assets\/presets\/[^/]+\.json$|\.storybook\/|storybook-styles\/|\.stories\./i;
// F4 — revenue-critical flows.
const REVENUE = /\b(cart|checkout|payment|pric(e|ing)|orders?|quote)\b/i;
// F10 — B2B org context (test-model redesign §5).
const ORG = /organizationId|organization_id|xapi:my_organization|my_organization|\/organizations?\b|sales-rep|salesrep|loginOnBehalf|CanImpersonate|impersonat/i;
// F11 — configuration (test-model redesign §5a, layers 1–3).
const CONFIG = /ModuleConstants\.Settings|settingsManager|SettingsManager|store\.settings|\$cfg\./;

const floor = (id, fired, signal, requires = []) => ({ id, fired, signal, requires: fired ? requires : [] });

export function computeFloors(bundle, { domainMapText = null } = {}) {
  const fields = bundle.fields ?? {};
  const prs = (bundle.change?.prs ?? []).filter((p) => !p.context_only && !p.gap);
  const paths = prs.flatMap((p) => Object.values(p.layers ?? {}).flat());
  const surface = [
    ...paths, ...prs.flatMap((p) => [...(p.operations ?? []), ...(p.endpoints ?? []), ...(p.settings ?? []),
      ...(p.hotspots ?? []).flatMap((h) => [h.source, h.risk]), ...(p.claims ?? []).map((c) => c.text)]),
  ].join("\n");
  const changeGap = (bundle.gaps ?? []).find((g) => g.where === "change" || g.where.startsWith("change."));
  // No product PR: when the search ran and found nothing, diff floors are "not fired"; when it never ran, doubt (F9).
  const diffUnread = !prs.length && changeGap && changeGap.reason !== "not-found" ? `doubt: diff not read (${changeGap.reason})` : null;
  const noPr = !prs.length ? "no product PR" : null;
  const diffFloor = (id, re, label, requires) => {
    if (diffUnread) return floor(id, true, diffUnread, requires);
    if (noPr) return floor(id, false, noPr);
    const hit = surface.match(re);
    return floor(id, !!hit, hit ? `${label}: ${hit[0]}` : `no ${label} in the diff surface`, requires);
  };

  const pri = fields.priority;
  const f1 = pri == null ? floor("F1", true, "doubt: no priority in the bundle", ["test model", "exploratory"])
    : floor("F1", P01.test(pri), `priority ${pri}${P01.test(pri) ? " (P0/P1)" : ""}; the High/Critical-risk half is checked on the register`, ["test model", "exploratory"]);

  const isStory = /^story$/i.test(fields.type ?? "");
  const dm = bundle.known?.domain_map ?? {};
  const f2 = !isStory ? floor("F2", false, `type ${fields.type ?? "unknown"}, not a Story`)
    : dm.state !== "PRESENT" || domainMapText == null ? floor("F2", true, `doubt: domain map ${dm.state ?? "unknown"} — purpose not readable`, ["test model", "exploratory"])
    : floor("F2", /\*\*Purpose:[^*]*UNDECLARED/i.test(domainMapText), "domain map §1 Purpose", ["test model", "exploratory"]);

  const visualPaths = paths.filter((p) => VISUAL.test(p));
  const f3 = diffUnread ? floor("F3", true, diffUnread, ["visual lane"])
    : noPr ? floor("F3", false, noPr)
    : floor("F3", visualPaths.length > 0, visualPaths.length ? `rendering files: ${visualPaths.slice(0, 3).join(", ")}` : "no rendering file in the diff", ["visual lane"]);

  const revenueText = [...paths, ...(fields.components ?? []), ...(bundle.domains_guess?.value ?? [])].join("\n");
  const rev = revenueText.match(REVENUE);
  const f4 = floor("F4", !!rev, rev ? `revenue-critical: ${rev[0]}` : "no revenue-critical flow named", ["no risk on it below Medium"]);

  const atRisk = bundle.known?.cases_at_risk ?? [];
  const f5 = floor("F5", atRisk.length > 0, `${atRisk.length} suite(s) at risk${atRisk.length ? `: ${atRisk.slice(0, 5).map((c) => c.suite).join(", ")}` : ""}`, ["coverage triage + regression after the staleness check"]);

  const notDeployed = (bundle.blockers ?? []).filter((b) => /^NOT DEPLOYED:/.test(b));
  const f6 = floor("F6", notDeployed.length > 0, notDeployed[0] ?? "no NOT DEPLOYED blocker", ["BLOCKED before any browser opens"]);

  const f7 = floor("F7", /^review task$/i.test(fields.type ?? ""), `type ${fields.type ?? "unknown"}`, ["oracles from the diff only", "F5 on"]);

  const kit = paths.filter((p) => UI_KIT.test(p));
  const f8 = diffUnread ? floor("F8", false, `${diffUnread} — F8 fails closed (ticket-routing §5c)`)
    : floor("F8", kit.length > 0, kit.length ? `ui-kit files: ${kit.slice(0, 3).join(", ")}` : "no ui-kit file", ["visual lane", "token audit"]);

  const f10 = diffFloor("F10", ORG, "org context", ["an org-context risk with technique MODEL"]);
  const hb = (bundle.change?.hidden_behaviour ?? []).filter((r) => r.answer === "yes" && /feature-flags|default-values/.test(r.item));
  const settingsChanged = prs.some((p) => (p.settings ?? []).length > 0);
  const f11 = diffUnread ? floor("F11", true, diffUnread, ["a configuration risk with technique MODEL", "stand values in Inputs"])
    : settingsChanged || hb.length ? floor("F11", true, settingsChanged ? "the PR changes settings" : `hidden behaviour: ${hb.map((r) => r.item).join(", ")}`, ["a configuration risk with technique MODEL", "stand values in Inputs"])
    : diffFloor("F11", CONFIG, "setting read", ["a configuration risk with technique MODEL", "stand values in Inputs"]);

  return { product_prs: prs.length, floors: [f1, f2, f3, f4, f5, f6, f7, f8,
    floor("F9", false, "doubt rule — applied inside every floor above"), f10, f11] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--bundle");
  if (i < 0 || !process.argv[i + 1]) { console.error("usage: floors.mjs --bundle <bundle.json>"); process.exit(1); }
  const bundle = JSON.parse(readFileSync(process.argv[i + 1], "utf8"));
  const dmPath = bundle.known?.domain_map?.path;
  const domainMapText = dmPath && existsSync(dmPath) ? readFileSync(dmPath, "utf8") : null;
  console.log(JSON.stringify(computeFloors(bundle, { domainMapText }), null, 2));
}
