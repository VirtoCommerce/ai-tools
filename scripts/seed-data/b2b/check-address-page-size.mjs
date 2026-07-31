/**
 * scripts/seed-data/b2b/check-address-page-size.mjs
 *
 * Drift guard for ADDRESSES_PER_PAGE — the one number in addresses-specs.mjs that is
 * TRANSCRIBED from another repo rather than derived.
 *
 * WHY THIS EXISTS. `.claude/rules/test-data.md` GOLDEN RULE: if a value has a source of
 * truth, read it from there and gate it, because a transcribed constant is correct exactly
 * once and then fails SILENTLY. addresses-specs.mjs carries a comment saying "re-derive from
 * that file if the storefront changes it" — but a comment is an instruction to a human, not a
 * gate. This is the gate.
 *
 * The failure mode it closes: vc-frontend changes the address-book page size from 6 to 8.
 * `td:validate:b2b` keeps passing, because assertContractCoherent() only checks INTERNAL
 * coherence (22 rows still yields >= MIN_PAGES at whatever number we believe). The 22-address
 * fixture quietly stops meaning "4 pages", and suite 011 CHK-060 / CHK-098 begin failing on
 * their page-count assertions with nothing pointing at the cause — exactly the silent staleness
 * Dimension 11 exists to catch, reintroduced by the fixture built to support it.
 *
 * Usage:
 *   node scripts/seed-data/b2b/check-address-page-size.mjs            # network, --ref dev
 *   npm run td:check:pagesize
 *   ... --ref master | --ref <sha>                                    # pin the vc-frontend ref
 *   ... --from ../vc-frontend                                         # local checkout, no network
 *
 * Exit codes follow scripts/maintenance/sync-design-tokens.mjs:
 *   0 — local constant matches the storefront
 *   1 — DRIFT: they disagree (or the constant could not be parsed out of the source)
 *   2 — source unreachable. NEVER silently passes: an unreachable source is not agreement.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { ADDRESSES_PER_PAGE, ADDRESSES_PER_PAGE_SOURCE } from "./addresses-specs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = "VirtoCommerce/vc-frontend";
const SOURCE_PATH = "client-app/shared/checkout/composables/useCheckout.ts";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const REF = argValue("--ref") ?? "dev";
const FROM = argValue("--from");

async function readSource() {
  if (FROM) {
    const p = resolve(HERE, "..", "..", "..", FROM, SOURCE_PATH);
    const direct = resolve(FROM, SOURCE_PATH);
    const path = existsSync(direct) ? direct : p;
    if (!existsSync(path)) throw new Error(`not found in --from checkout: ${path}`);
    return { text: readFileSync(path, "utf8"), origin: path };
  }
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${SOURCE_PATH}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return { text: await res.text(), origin: url };
}

/**
 * Narrow extraction. Deliberately anchored to the declaration rather than any occurrence of the
 * identifier, so a comment or a usage site cannot satisfy the match.
 */
function parsePageSize(text) {
  const m = text.match(/\bADDRESSES_PER_PAGE\s*(?::\s*number\s*)?=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  let source;
  try {
    source = await readSource();
  } catch (e) {
    console.error(`[td:check:pagesize] SOURCE UNREACHABLE — ${e.message}`);
    console.error(`  Cannot confirm ADDRESSES_PER_PAGE=${ADDRESSES_PER_PAGE}. Not treating this as agreement.`);
    console.error(`  Offline? Re-run against a local checkout:  --from ../vc-frontend`);
    process.exit(2);
  }

  const upstream = parsePageSize(source.text);
  if (upstream === null) {
    console.error(`[td:check:pagesize] DRIFT — could not find an ADDRESSES_PER_PAGE declaration in ${source.origin}`);
    console.error(`  The constant may have been renamed, moved, or replaced by a setting.`);
    console.error(`  Re-derive it and update ADDRESSES_PER_PAGE + ADDRESSES_PER_PAGE_SOURCE in`);
    console.error(`  scripts/seed-data/b2b/addresses-specs.mjs, then re-check the fixture size.`);
    process.exit(1);
  }

  if (upstream !== ADDRESSES_PER_PAGE) {
    console.error(`[td:check:pagesize] DRIFT — storefront says ${upstream}, we believe ${ADDRESSES_PER_PAGE}`);
    console.error(`  source: ${source.origin}`);
    console.error(`  Update ADDRESSES_PER_PAGE in scripts/seed-data/b2b/addresses-specs.mjs to ${upstream},`);
    console.error(`  then re-run 'npm run td:validate:b2b' — the fixture total may no longer yield`);
    console.error(`  MIN_PAGES pages with a partial last page, and suite 011 CHK-060 / CHK-098`);
    console.error(`  reference the page count in their preconditions.`);
    process.exit(1);
  }

  console.log(`[td:check:pagesize] OK — ADDRESSES_PER_PAGE=${ADDRESSES_PER_PAGE} matches the storefront`);
  console.log(`  source: ${source.origin}`);
  console.log(`  declared origin: ${ADDRESSES_PER_PAGE_SOURCE}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`[td:check:pagesize] unexpected: ${e.message}`);
  process.exit(2);
});
