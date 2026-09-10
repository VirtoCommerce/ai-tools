#!/usr/bin/env node
/**
 * check-domain-maps — the freshness ratchet for `.claude/knowledge/domain/*.md`.
 *
 *   npm run domain:check        exit 1 on a STALE or malformed map, 0 otherwise
 *   npm run domain:check -- --json
 *
 * WHY. A domain map is the feature-scoped, persistent answer to "what is this thing and where are its
 * surfaces" — the counterpart to a per-ticket test model. It exists because `/qa-test`'s context step is
 * ticket-scoped and so inherits the ticket's narrowness: measured on VCST-5317, one predicate on one
 * control was tested in depth while the feature's Admin surface, its second switcher component and 585
 * existing cases went unexamined. Rationale: docs/decisions/qa-test-evolution.md §Domain maps.
 *
 * THE ASYMMETRY THIS SCRIPT ENCODES, and it is deliberate:
 *
 *   a STALE map FAILS      — a map read as current while describing a build that has moved does more
 *                            damage than no map, because it arrives with a written artifact's authority.
 *   a MISSING map PASSES   — 12 of 13 domains have none. A hard gate on absence would stop every ticket
 *                            in the repo. `/qa-test` RECOMMENDS a map for an all-layer FULL run and
 *                            records `Domain map: ABSENT` when there is none; absence is written down,
 *                            not blocked.
 *
 * CHECKS
 *   DOMAIN-001  `generated` older than `stale_after_days`                                   (hard)
 *   DOMAIN-002  `generated` older than `expires_after_days`                                 (hard, louder)
 *   DOMAIN-003  a map missing a required frontmatter field                                  (hard)
 *   DOMAIN-004  two maps claiming the same `domain_slug`                                    (hard)
 *   DOMAIN-005  a `domain_slug` that is not a real `bl:extract` domain                      (hard)
 *   DOMAIN-006  a map with no §3 cross-layer section and no explicit "compared, they agree" (warn)
 *
 * A file with NO `domain_slug` is not a map and is skipped — that is how `domain-map.md` (the shape) and
 * the generated `release-ledger.md` / `sitemap.md` sit in the same directory without being audited as maps.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname — a space in the repo path URL-encodes to %20 and existsSync fails SILENTLY,
// which reads as "no maps to check" and passes. Measured on this repo (".../My Projects/...").
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DOMAIN_DIR = join(ROOT, ".claude", "knowledge", "domain");
const BL_ORACLE = join(ROOT, ".claude", "knowledge", "oracles", "business-logic.md");
const REQUIRED = ["domain_slug", "generated", "rev", "stale_after_days", "sources"];
const json = process.argv.includes("--json");

/** Valid slugs come from the oracle itself, never a transcribed list (GOLDEN RULE). */
function validSlugs() {
  if (!existsSync(BL_ORACLE)) return null; // unreadable source ⇒ skip DOMAIN-005 rather than guess
  const text = readFileSync(BL_ORACLE, "utf8");
  return new Set([...text.matchAll(/^#+\s*Domain\s+\d+[a-z]?:.*\(BL-([A-Z0-9]+)\)/gim)].map((m) => m[1].toLowerCase()));
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-z_]+):\s*(.*)$/i);
    if (!kv) continue;
    let value = kv[2].trim();
    // A block list (`sources:` then `  - …`) or a block scalar (`rationale: |`) carries its value on the
    // FOLLOWING indented lines. Treating those keys as absent is a false DOMAIN-003 against a valid map.
    if (value === "" || value === "|" || value === ">") {
      const block = [];
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) block.push(lines[j].trim());
      value = block.join(" ").replace(/^-\s*/, "");
    }
    out[kv[1]] = value;
  }
  return out;
}

const findings = [];
const maps = [];
const slugSeen = new Map();
const slugs = validSlugs();

if (!existsSync(DOMAIN_DIR)) {
  console.log("[domain:check] no .claude/knowledge/domain/ — nothing to check");
  process.exit(0);
}

for (const file of readdirSync(DOMAIN_DIR).filter((f) => f.endsWith(".md"))) {
  const path = join(DOMAIN_DIR, file);
  const text = readFileSync(path, "utf8");
  const fm = frontmatter(text);

  // Not a map: no frontmatter, or no domain_slug. The shape file and the generated indexes live here too.
  if (!fm || !fm.domain_slug) continue;

  const slug = fm.domain_slug;
  maps.push({ file, slug, rev: fm.rev, generated: fm.generated });

  for (const key of REQUIRED) {
    if (!fm[key]) findings.push({ code: "DOMAIN-003", file, msg: `missing required frontmatter field \`${key}\`` });
  }

  if (slugSeen.has(slug)) {
    findings.push({ code: "DOMAIN-004", file, msg: `duplicate domain_slug \`${slug}\` — also in ${slugSeen.get(slug)}` });
  } else slugSeen.set(slug, file);

  if (slugs && slugs.size && !slugs.has(slug)) {
    findings.push({
      code: "DOMAIN-005",
      file,
      msg: `domain_slug \`${slug}\` is not a bl:extract domain — a map nothing can look up. Run \`npm run bl:extract -- --list\``,
    });
  }

  if (fm.generated) {
    const ageDays = Math.floor((Date.now() - Date.parse(fm.generated)) / 86_400_000);
    const stale = Number(fm.stale_after_days) || 60;
    const expires = Number(fm.expires_after_days) || 0;
    if (expires && ageDays > expires) {
      findings.push({
        code: "DOMAIN-002",
        file,
        msg: `EXPIRED — generated ${fm.generated} (${ageDays}d ago), expires_after_days ${expires}. Its verdicts are no longer citable: \`/qa-domain-map ${slug} --refresh\``,
      });
    } else if (ageDays > stale) {
      findings.push({
        code: "DOMAIN-001",
        file,
        msg: `STALE — generated ${fm.generated} (${ageDays}d ago), stale_after_days ${stale}. Refresh: \`/qa-domain-map ${slug} --refresh\``,
      });
    }
  }

  // §3 is the highest-value section; an empty one with no statement is the failure it exists to prevent.
  const hasDisagreements = /^\|\s*\*?\*?D\d+/m.test(text);
  const saysTheyAgree = /compared[^.\n]*agree|layers?[^.\n]*agree/i.test(text);
  if (!hasDisagreements && !saysTheyAgree) {
    findings.push({
      code: "DOMAIN-006",
      file,
      msg: "no cross-layer disagreement rows (D1…) and no explicit \"compared and they agree\" — silence here is indistinguishable from agreement",
    });
  }
}

const hard = findings.filter((f) => f.code !== "DOMAIN-006");

if (json) {
  console.log(JSON.stringify({ maps, findings }, null, 2));
} else {
  console.log(`[domain:check] ${maps.length} map(s): ${maps.map((m) => `${m.slug}@rev${m.rev}`).join(", ") || "none"}`);
  for (const f of findings) console.log(`  ${f.code}  ${basename(f.file)}  ${f.msg}`);
  if (!findings.length) console.log("[domain:check] OK — every map is fresh and well-formed");
  if (!maps.length) {
    console.log("[domain:check] no maps yet — that is NOT a failure. `/qa-test` recommends one for an all-layer FULL run.");
  }
}

process.exit(hard.length ? 1 : 0);
