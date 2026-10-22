// .claude/skills/qa-test-strategy/lib/floors.mjs — the floors F1–F12, computed from the /ticket-context bundle.
// R2 of the /qa-test redesign: a floor is a gate rule, never a model judgment. This script reads signals; it
// never chooses a risk. F9 (doubt ⇒ the floor applies) is built in: a signal that cannot be read fires its floor.
// Specs: docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md §6 (F1–F9),
//        docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md §5, §5a (F10, F11).
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The tracker's names for P0/P1 come from project-profile.json `tracker.p0p1Priorities` (an array of names); with no
// profile entry, this default (Jira's Highest/High plus the P0/P1/Blocker/Critical spellings). A name not listed reads as P2+.
const P01_DEFAULT = ["p0", "p1", "highest", "high", "blocker", "critical"];
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."); // lib → skill → skills → .claude → repo
// qa-test/visual-axis.md §1 source 1 — a rendering file.
const VISUAL = /\.(vue|scss|css|html)$|\/Scripts\/.*\.html$|\/icons?\/|design-tokens?|_tokens?\.scss$/i; // not a bare "token": TokenService.cs is not a rendering file
// ticket-routing.md §5c — the change IS the design system.
const UI_KIT = /client-app\/ui-kit\/|_ui-kit-tokens\.scss$|\/_colors\.scss$|\/_dark\.scss$|\/preflight\.scss$|client-app\/assets\/presets\/[^/]+\.json$|\.storybook\/|storybook-styles\/|\.stories\./i;
// F4 — revenue-critical flows, matched on names only (paths, operations, endpoints, settings, components, domains),
// never on prose. No word boundary: `shopping_cart.vue`, `CartController`, `addItemToCart` are revenue flows too.
// "order" needs a non-letter before it or a camelCase join (`OrdersModule`, `CustomerOrder`), so `border` is not one.
const REVENUE = [/cart|checkout|payments?|pric(?:e|es|ing)|quotes?/i, /(?<![A-Za-z])orders?/i, /(?<=[a-z])Orders?/];
// A partly-read PR diff (github.mjs: a truncated diff, files over cap, patches GitHub withheld). Only these: a
// `pr:<ref>:endpoints|settings|hidden_behaviour|threads` gap is the CHANGE agent's field note about a diff it read.
const PARTIAL = /^pr:([^:]+)(?::[^:]+)*:(diff|patches|files)$/;
// F10 — B2B org context (test-model redesign §5).
const ORG = /organizationId|organization_id|xapi:my_organization|my_organization|\/organizations?\b|sales-rep|salesrep|loginOnBehalf|CanImpersonate|impersonat/i;
// F11 — configuration (test-model redesign §5a, layers 1–3).
const CONFIG = /ModuleConstants\.Settings|settingsManager|SettingsManager|store\.settings|\$cfg\./;
// F11 — a settings entry is the CHANGE agent's prose; only a named key is a signal. A dotted PascalCase key
// (`Return.NotifyOrganizationEmail`), not inside a path and not a package id followed by its version
// (`VirtoCommerce.Return 3.1002.0`). A CSS custom property (`--vc-…`) is a theme key, not a setting.
const SETTING_KEY = /(?<![\w./$@-])[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)+(?!\w)(?![\w.]*\s+v?\d+\.\d)/;
const CSS_VAR = /--[\w-]+/g;
// An entry that says nothing changed ("No feature flags added or changed") is never a signal, for any floor.
const NEGATIVE = /^\s*no\s/i;

// What a fired floor puts into the strategy (floors.md). None names the test model itself: it runs if and only if a
// risk has technique MODEL (test-model redesign M9), so F2/F10/F11 require their own MODEL risk, Source carrying `floor:<id>` (M10).
const F1_REQUIRES = ["exploratory", "MODEL on a High/Critical risk with a {HYPOTHESIS} oracle (M1)"];
const F2_REQUIRES = ["a purpose risk with technique MODEL, Source carrying floor:F2", "exploratory"];

const floor = (id, fired, signal, requires = []) => ({ id, fired, signal, requires: fired ? requires : [] });

/** A PR closed without merge never shipped: it is not change surface (check-bundle counts it out the same way). */
export const isAbandoned = (p) => p.state === "closed" && p.merged === false;

export function computeFloors(bundle, { domainMapText = null, p01Names = P01_DEFAULT, changeMap = null } = {}) {
  const fields = bundle.fields ?? {};
  const p01 = new Set(p01Names.map((n) => String(n).toLowerCase()));
  const prs = (bundle.change?.prs ?? []).filter((p) => !p.context_only && !p.gap && !isAbandoned(p));
  const paths = prs.flatMap((p) => Object.values(p.layers ?? {}).flat());
  const settingsOf = (p) => (p.settings ?? []).filter((s) => typeof s === "string" && !NEGATIVE.test(s));
  const surface = [
    ...paths, ...prs.flatMap((p) => [...(p.operations ?? []), ...(p.endpoints ?? []), ...settingsOf(p),
      ...(p.hotspots ?? []).flatMap((h) => [h.source, h.risk]), ...(p.claims ?? []).map((c) => c.text)]),
  ].join("\n");
  const gaps = bundle.gaps ?? [];
  // A change-search gap (`change`, `change.*`; not `change.deployed`, which is the deploy check) means a PR may be
  // missing: doubt even beside a read PR. Only "searched and found nothing" with no product PR is "not fired".
  const changeGap = gaps.find((g) => (g.where === "change" || g.where.startsWith("change.")) && g.where !== "change.deployed"
    && (prs.length || g.reason !== "not-found"));
  // A whole-PR gap (where `pr:<ref>`, also on the PR entry as `gap`) is an unread part of the diff, even beside a read PR.
  const gappedPr = (bundle.change?.prs ?? []).find((p) => !p.context_only && p.gap && !isAbandoned(p));
  // A part of a product PR's diff not read (truncated diff, files over cap, patches withheld): doubt too.
  const contextRefs = new Set((bundle.change?.prs ?? []).filter((p) => p.context_only || isAbandoned(p)).map((p) => `${p.repo}#${p.number}`.toLowerCase()));
  const partial = gaps.find((g) => { const m = PARTIAL.exec(g.where); return m && !contextRefs.has(m[1].toLowerCase()); });
  const unreadReason = gappedPr ? gappedPr.gap.reason : changeGap ? `${changeGap.where}: ${changeGap.reason}`
    : partial ? `${partial.where}: ${partial.reason}` : null;
  const diffUnread = unreadReason ? `doubt: diff not read (${unreadReason})` : null;
  const noPr = !prs.length ? "no product PR" : null;
  // F3, F10, F11: the positive signal, from what WAS read, comes first and fires with its own signal; doubt fires
  // only when nothing read matched AND part of the diff is unread; "not fired" needs the whole diff read.
  const diffFloor = (id, positive, none, requires) => positive ? floor(id, true, positive, requires)
    : diffUnread ? floor(id, true, diffUnread, requires)
    : floor(id, false, noPr ?? none);

  const pri = fields.priority;
  const f1 = pri == null ? floor("F1", true, "doubt: no priority in the bundle", F1_REQUIRES)
    : floor("F1", p01.has(pri.toLowerCase()), `priority ${pri}${p01.has(pri.toLowerCase()) ? " (P0/P1)" : ""}; the High/Critical-risk half is checked on the register`, F1_REQUIRES);

  const noType = fields.type == null;
  const isStory = /^story$/i.test(fields.type ?? "");
  const dm = bundle.known?.domain_map ?? {};
  const f2 = noType ? floor("F2", true, "doubt: no type in the bundle", F2_REQUIRES)
    : !isStory ? floor("F2", false, `type ${fields.type}, not a Story`)
    : dm.state !== "PRESENT" || domainMapText == null ? floor("F2", true, `doubt: domain map ${dm.state ?? "unknown"} — purpose not readable`, F2_REQUIRES)
    : floor("F2", /\*\*Purpose:[^*]*UNDECLARED/i.test(domainMapText), "domain map §1 Purpose", F2_REQUIRES);

  const visualPaths = paths.filter((p) => VISUAL.test(p));
  const f3 = diffFloor("F3", visualPaths.length ? `rendering files: ${visualPaths.slice(0, 3).join(", ")}` : null,
    "no rendering file in the diff", ["visual lane"]);

  const revenueText = [...paths, ...prs.flatMap((p) => [...(p.operations ?? []), ...(p.endpoints ?? []), ...settingsOf(p)]),
    ...(fields.components ?? []), ...[].concat(bundle.domains_guess?.value ?? [])].join("\n");
  const rev = REVENUE.map((re) => revenueText.match(re)).find(Boolean);
  const f4 = floor("F4", !!rev, rev ? `revenue-critical: ${rev[0]}` : "no revenue-critical flow named", ["no risk on it below Medium"]);

  const atRisk = bundle.known?.cases_at_risk ?? [];
  // A failed lookup of the suite set is doubt (F9): the cases at risk were never read.
  // So is a `known.domain` gap: without a domain, tc:scope never ran over the suites.
  const failedLookup = gaps.find((g) => g.where === "known.domain" || g.where.startsWith("known.tc:scope") || g.where.startsWith("known.regression:select"));
  const f5 = atRisk.length > 0 ? floor("F5", true, `${atRisk.length} suite(s) at risk: ${atRisk.slice(0, 5).map((c) => c.suite).join(", ")}`, ["coverage triage + regression after the staleness check"])
    : failedLookup ? floor("F5", true, `doubt: ${failedLookup.where} (${failedLookup.reason})`, ["coverage triage + regression after the staleness check"])
    : floor("F5", false, "0 suite(s) at risk", ["coverage triage + regression after the staleness check"]);

  const notDeployed = (bundle.blockers ?? []).filter((b) => /^NOT DEPLOYED:/.test(b));
  const f6 = floor("F6", notDeployed.length > 0, notDeployed[0] ?? "no NOT DEPLOYED blocker", ["BLOCKED before any browser opens"]);

  const f7 = noType ? floor("F7", true, "doubt: no type in the bundle", ["F5 on"])
    : floor("F7", /^review task$/i.test(fields.type), `type ${fields.type}`, ["oracles from the diff only", "F5 on"]);

  const kit = paths.filter((p) => UI_KIT.test(p));
  // Fails closed on what was NOT read; a ui-kit path in the part that was read still fires it.
  const f8 = kit.length ? floor("F8", true, `ui-kit files: ${kit.slice(0, 3).join(", ")}`, ["visual lane", "token audit"])
    : floor("F8", false, diffUnread ? `${diffUnread} — F8 fails closed (ticket-routing §5c)` : "no ui-kit file");

  const org = surface.match(ORG);
  const f10 = diffFloor("F10", org ? `org context: ${org[0]}` : null, "no org context in the diff surface", ["an org-context risk with technique MODEL, Source carrying floor:F10"]);
  const hb = (bundle.change?.hidden_behaviour ?? []).filter((r) => r.answer === "yes" && /feature-flags|default-values/.test(r.item));
  // Every entry, the "No …" ones included: "No longer defaults to true: Return.SendNotifications" still names a key.
  const key = prs.flatMap((p) => (p.settings ?? []).filter((x) => typeof x === "string")).map((s) => s.replace(CSS_VAR, " ").match(SETTING_KEY)).find(Boolean);
  const read = surface.match(CONFIG);
  const f11 = diffFloor("F11", key ? `setting: ${key[0]}` : hb.length ? `hidden behaviour: ${hb.map((r) => r.item).join(", ")}` : read ? `setting read: ${read[0]}` : null,
    "no setting key, setting read or feature-flags/default-values row", ["a configuration risk with technique MODEL, Source carrying floor:F11", "stand values in Inputs"]);

  // F12 reads vc-test's layer-0 change map, only when the caller passes one (vc-test spec U47). Doubt fires it (F9): a
  // map with no hotspots list, or a hotspot with no zone, may hide a significant one.
  const spots = changeMap?.hotspots;
  const zoneOf = (h) => (typeof h?.zone === "string" && h.zone.trim()) || null;
  const zoned = Array.isArray(spots) ? spots.filter((h) => zoneOf(h)?.toLowerCase() !== "none") : [];
  const f12req = ["exploratory on the significant-zone hotspots"];
  const f12 = !changeMap ? floor("F12", false, "no change map (vc-test layer 0 did not run)")
    : !Array.isArray(spots) ? floor("F12", true, "doubt: the change map has no hotspots list", f12req)
    : floor("F12", zoned.length > 0, zoned.length ? `significant-zone hotspots: ${zoned.slice(0, 5).map((h) => `${h?.id ?? "?"} (${zoneOf(h) ?? "no zone — doubt"})`).join(", ")}`
      : "no hotspot in a significant zone", f12req);

  return { product_prs: prs.length, floors: [f1, f2, f3, f4, f5, f6, f7, f8,
    floor("F9", false, "doubt rule — applied inside every floor above"), f10, f11, f12] };
}

/** A JSON file, or one line naming the file and the reason, then exit 2 — never a stack trace. */
export function readJsonOrExit(path, script) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) {
    console.error(`${script}: cannot read ${path} (${e.code ?? e.message})`);
    process.exit(2);
  }
}
/** The domain map a bundle names, or null when it has none or the file is gone (F2 then fires on doubt). The path is
 *  repo-relative: tried against the working directory, then against this skill's repo, so any cwd gets one answer. */
export function domainMapTextOf(bundle) {
  const dmPath = bundle?.known?.domain_map?.path;
  if (!dmPath) return null;
  const hit = (isAbsolute(dmPath) ? [dmPath] : [resolve(dmPath), resolve(REPO_ROOT, dmPath)]).find((p) => existsSync(p));
  return hit ? readFileSync(hit, "utf8") : null;
}
/** `tracker.p0p1Priorities` from project-profile.json (VC_FIX_HOME or cwd), else the default names. */
export function p01NamesOf() {
  const file = resolve(process.env.VC_FIX_HOME || process.cwd(), "project-profile.json");
  try { const names = JSON.parse(readFileSync(file, "utf8"))?.tracker?.p0p1Priorities; if (Array.isArray(names) && names.length) return names; } catch { /* no profile ⇒ default */ }
  return P01_DEFAULT;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--bundle");
  if (i < 0 || !process.argv[i + 1]) { console.error("usage: floors.mjs --bundle <bundle.json> [--change-map <change-map.json>]"); process.exit(1); }
  const bundle = readJsonOrExit(process.argv[i + 1], "floors.mjs");
  const m = process.argv.indexOf("--change-map");
  const changeMap = m < 0 ? null : (readJsonOrExit(process.argv[m + 1], "floors.mjs") ?? {}); // a `null` file is a map in doubt
  console.log(JSON.stringify(computeFloors(bundle, { domainMapText: domainMapTextOf(bundle), p01Names: p01NamesOf(), changeMap }), null, 2));
}
