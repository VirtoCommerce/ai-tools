/**
 * discover-variants.mjs — CLI for stage 1 of /qa-generate-data ("learn the feature live").
 *
 * Enumerates the real variant space per axis for a feature in the running env, so
 * the combination matrix is grounded in live cardinality, not assumptions. Output
 * is both a human-readable inventory and a JSON `factors` spec ready to pipe into
 * the pairwise generator (scripts/lib/combinatorial-generator.ts).
 *
 * Read-only (GET + /search POST). Honors TEST_ENV + the ENV_RISK prod guard via
 * seed-common (won't run admin reads against a production-risk env without override).
 *
 * Usage:
 *   node scripts/discover-variants.mjs loyalty            # readable inventory + spec
 *   node scripts/discover-variants.mjs promotions --json  # clean JSON spec on stdout (pipe-safe)
 *   node scripts/discover-variants.mjs                    # list known features
 *
 * In --json mode all status noise goes to stderr so stdout is pure JSON:
 *   node scripts/discover-variants.mjs promotions --json > spec.json
 */

const JSON_ONLY = process.argv.includes("--json");
const feature = process.argv.slice(2).find((a) => !a.startsWith("--"));

// Suppress dotenv's import-time banner so --json stdout stays clean. Must be set
// before seed-common (which loads dotenv) is imported → dynamic import below.
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? "true";

// In --json mode, route seed-common's Target/Auth console.log noise to stderr.
const origLog = console.log;
if (JSON_ONLY) console.log = (...a) => console.error(...a);

const { assertSafeTarget, auth } = await import("./lib/seed-common.mjs");
const { FEATURES, discoverFeature } = await import("./lib/feature-variants.mjs");

function toFactorSpec(result) {
  // Live axes with ≥1 value become factors directly; suggested design axes are
  // included too (the skill decides which to keep). Skip empty/unavailable axes.
  const factors = [];
  for (const ax of result.axes) {
    if (ax.values.length > 0) factors.push({ name: ax.axis, values: ax.values });
  }
  for (const ax of result.suggestedDesignAxes || []) {
    factors.push({ name: ax.axis, values: ax.values });
  }
  return { factors, constraints: [] };
}

if (!feature) {
  console.log = origLog;
  console.log(`Usage: node scripts/discover-variants.mjs <feature> [--json]`);
  console.log(`Known features: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(0);
}

// Graceful degrade: a feature without built-in live discovery still works — the
// skill supplies axes manually (from test-design + live-discover.ts). Emit guidance
// + an empty factor spec instead of erroring, so /qa-generate-data stays GENERAL.
if (!FEATURES[feature]) {
  console.log = origLog;
  const tmpl = { factors: [{ name: "<axis>", values: ["<state-a>", "<state-b>"] }], constraints: [] };
  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(tmpl, null, 2) + "\n");
  } else {
    console.log(`\nℹ No built-in live discovery for "${feature}".`);
    console.log(`Known features (auto-discovered): ${Object.keys(FEATURES).join(", ")}`);
    console.log(`\nThis is fine — /qa-generate-data is general. For an unlisted feature, supply the`);
    console.log(`axes yourself from test-design + scripts/lib/live-discover.ts, then feed the spec`);
    console.log(`straight to the generator. Starter spec:`);
    console.log(JSON.stringify(tmpl));
    console.log(`\n  npx tsx scripts/lib/combinatorial-generator.ts '<your-edited-spec>'`);
    console.log(`\nTo make this feature auto-discoverable, add it to the FEATURES registry in`);
    console.log(`scripts/lib/feature-variants.mjs (one async fn returning {axes, suggestedDesignAxes}).\n`);
  }
  process.exit(0);
}

try {
  assertSafeTarget();
  await auth();

  const result = await discoverFeature(feature);
  const spec = toFactorSpec(result);

  if (JSON_ONLY) {
    console.log = origLog; // restore for the one clean stdout write
    process.stdout.write(JSON.stringify(spec, null, 2) + "\n");
  } else {
    console.log(`\n📊 Variant space for "${result.feature}" (store ${result.storeId})\n`);
    console.log("LIVE axes (real entities found in this env):");
    for (const ax of result.axes) {
      const head =
        ax.source === "unavailable"
          ? `  ⚠ ${ax.axis} [unavailable]`
          : `  • ${ax.axis} — ${ax.count} variant(s)`;
      console.log(head);
      if (ax.values.length)
        console.log(
          `      values: ${ax.values.slice(0, 12).join(", ")}${ax.values.length > 12 ? ` … (+${ax.values.length - 12})` : ""}`
        );
      if (ax.note) console.log(`      note: ${ax.note}`);
    }
    console.log("\nSUGGESTED design axes (add via test-design — equivalence/boundary, not live entities):");
    for (const ax of result.suggestedDesignAxes || []) {
      console.log(`  • ${ax.axis}: ${ax.values.join(", ")}`);
      console.log(`      why: ${ax.rationale}`);
    }
    console.log(`\n▶ Factor spec for the pairwise generator (or re-run with --json):`);
    console.log(JSON.stringify(spec));
    console.log(
      `\nNext: npx tsx scripts/lib/combinatorial-generator.ts '<spec>'  → matrix, then author gaps via scripts/author-fixtures.ts\n`
    );
  }
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
