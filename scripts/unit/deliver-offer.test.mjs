// Tests for the delivery OFFER loop (VCST-5582 G) —
// plugins/vc-fix/skills/vc-self-check/deliver.mjs one-shot guard + the dry-run offer contract,
// plus the SKILL.md rules that drive it.
//
// The defect: the skill's Step 6 told BOTH paths "that is `deliver` … do not run it here", so
// the profile's default `feedback.mode: "ask"` (literally "ask each time") was unreachable and
// the only route was the operator typing `/vc-self-check deliver` — which no client does. The
// DIAG footer printed exactly that as a hint: a dead one. Step 6b now runs `deliver` DRY (local
// draft, nothing sent) and presents ONE Show/Send/Don't-send question, guarded against re-nag.
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempHome } from "./_test-helpers.mjs";
import { main, readOfferGuard, markOffered } from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SID = "s-offer-1";

function seed(home, { mode = "ask", verdict = "BROKEN", withState = true } = {}) {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode } }));
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `DIAG-${SID}-20260101T000000Z.md`), [
    `# DIAG — ${SID}`, `- Session: ${SID} · Plugin: 0.8.2`, "## Findings",
    "| Skill | Verdict | Sev | Outcome | Signal | Root | Fix |",
    `| /qa-bug (command) | ${verdict} | S2 | failed | perm denied | auth | check token |`,
  ].join("\n"));
  if (withState) writeFileSync(join(dir, `${SID}.state.json`), JSON.stringify({ sid: SID }));
  return dir;
}

/** Drive deliver.main() with a stubbed fetch; returns the JSON plan + whether anything POSTed. */
async function dry(home, argv = ["--json"]) {
  const calls = [];
  const prev = { fetch: globalThis.fetch, tok: process.env.GITHUB_FIX_BUGS_TOKEN, write: process.stdout.write, exit: process.exitCode };
  let out = "";
  process.env.GITHUB_FIX_BUGS_TOKEN = "ghp_classic_test_token";
  process.stdout.write = (s) => { out += s; return true; };
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    calls.push({ url: String(url), method });
    if (method === "POST") return { ok: true, json: async () => ({ number: 42, html_url: "http://issue/42" }) };
    if (String(url).endsWith("/user")) {
      // A CLASSIC token with the repo scope → an honest, fork-capable route.
      return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === "x-oauth-scopes" ? "repo, gist" : null) }, json: async () => ({ login: "qa-bot" }) };
    }
    if (String(url).includes("/search/issues")) return { ok: true, json: async () => ({ items: [] }) };
    if (String(url).includes("/issues")) return { ok: true, json: async () => [] };
    return { ok: true, headers: { get: () => null }, json: async () => ({ permissions: {} }) };
  };
  try { await main(argv); } finally {
    globalThis.fetch = prev.fetch; process.stdout.write = prev.write; process.exitCode = prev.exit;
    if (prev.tok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN; else process.env.GITHUB_FIX_BUGS_TOKEN = prev.tok;
  }
  let plan = null;
  try { plan = JSON.parse(out.trim().split("\n").pop()); } catch { /* non-JSON output */ }
  return { plan, out, posted: calls.some((c) => c.method === "POST"), calls };
}

// ─── the dry run IS the offer: a draft, and nothing sent ──────────────────────────
test("G: a BROKEN DIAG in mode=ask produces a DELIVERY draft and sends NOTHING", async () => {
  await withTempHome(async (home) => {
    const dir = seed(home);
    const { plan, posted } = await dry(home);
    assert.equal(posted, false, "the offer must never send");
    assert.equal(plan.dryRun, true);
    assert.equal(plan.mode, "ask");
    assert.ok(plan.deliveryDraft, "a DELIVERY-*.md draft is written for [Show what would be sent]");
    assert.ok(existsSync(plan.deliveryDraft));
    assert.ok(readdirSync(dir).some((f) => f.startsWith("DELIVERY-")));
  });
});

test("G: the route shown in the offer is the HONEST one for the token in hand", async () => {
  await withTempHome(async (home) => {
    seed(home);
    const { plan } = await dry(home);
    // A classic token with `repo`, no push on the plugin repo ⇒ it can open an upstream Issue,
    // which is the only route a telemetry report ever takes (item 4 removed pr/fork-pr).
    assert.equal(plan.route, "issue");
    assert.match(plan.reason, /upstream rights/);
    // item 5 — whatever the operator is expected to do next is a FIELD, not only prose.
    assert.ok(Array.isArray(plan.nextSteps) && plan.nextSteps.length > 0);
    assert.match(plan.nextSteps.join("\n"), /--confirm/);
  });
});

// ─── the one-shot guard (anti-nag) ────────────────────────────────────────────────
test("G: the offer is ONE-SHOT — the second dry run reports alreadyOffered", async () => {
  await withTempHome(async (home) => {
    seed(home);
    const first = await dry(home);
    assert.equal(first.plan.alreadyOffered, false, "the first run offers");
    assert.equal(first.plan.offerGuard, "session-state");
    const second = await dry(home);
    assert.equal(second.plan.alreadyOffered, true, "the second run must NOT re-ask");
  });
});

test("G: the guard is keyed by finding FINGERPRINT (a different finding may still be offered)", async () => {
  await withTempHome(async (home) => {
    const dir = seed(home);
    const first = await dry(home);
    assert.equal(first.plan.alreadyOffered, false);
    const fpA = first.plan.fingerprint;
    // A DIFFERENT finding in the same session → a different fingerprint → offerable.
    assert.equal(readOfferGuard(SID, fpA).alreadyOffered, true);
    assert.equal(readOfferGuard(SID, "some-other-fingerprint").alreadyOffered, false);
    assert.ok(existsSync(join(dir, `${SID}.state.json`)));
  });
});

test("G: no session state (capture off) ⇒ the guard degrades to unavailable, never throws", async () => {
  await withTempHome(async (home) => {
    seed(home, { withState: false });
    const { plan } = await dry(home);
    assert.equal(plan.offerGuard, "unavailable");
    assert.equal(plan.alreadyOffered, false);
  });
});

test("markOffered / readOfferGuard: pure guard helpers are idempotent and non-throwing", () => withTempHome(async (home) => {
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sX.state.json"), JSON.stringify({ sid: "sX" }));
  assert.equal(markOffered("sX", "fp1"), true);
  assert.equal(markOffered("sX", "fp1"), false, "idempotent");
  assert.equal(readOfferGuard("sX", "fp1").alreadyOffered, true);
  // Missing session / corrupt file must never throw.
  assert.equal(markOffered("nope", "fp1"), false);
  assert.deepEqual(readOfferGuard("", "fp1"), { available: false, alreadyOffered: false });
  writeFileSync(join(dir, "sBad.state.json"), "{not json");
  assert.deepEqual(readOfferGuard("sBad", "fp1"), { available: false, alreadyOffered: false });
}));

// ─── silence rules ────────────────────────────────────────────────────────────────
test("G: feedback.mode=off stays SILENT — no draft, no offer, nothing sent", async () => {
  await withTempHome(async (home) => {
    const dir = seed(home, { mode: "off" });
    const { plan, posted } = await dry(home);
    assert.equal(posted, false);
    assert.equal(plan.action, "disabled");
    assert.equal(plan.reason, "feedback.mode=off");
    assert.equal(readdirSync(dir).some((f) => f.startsWith("DELIVERY-")), false, "mode=off writes no draft at all");
  });
});

test("G: an all-OK DIAG stays SILENT — nothing worth contributing", async () => {
  await withTempHome(async (home) => {
    const dir = seed(home, { verdict: "OK" });
    const { plan, posted } = await dry(home);
    assert.equal(posted, false);
    assert.equal(plan.action, "none", "no actionable finding ⇒ the deliver path is a no-op");
    assert.equal(plan.actionable, 0);
    assert.equal(readdirSync(dir).some((f) => f.startsWith("DELIVERY-")), false);
  });
});

test("G: a DEGRADED row alone is enough to offer (not only BROKEN)", async () => {
  await withTempHome(async (home) => {
    seed(home, { verdict: "DEGRADED" });
    const { plan } = await dry(home);
    assert.equal(plan.dryRun, true);
    assert.ok(plan.deliveryDraft);
  });
});

test("G: nothing is EVER sent without --confirm; with it, the Issue route files", async () => {
  await withTempHome(async (home) => {
    seed(home);
    assert.equal((await dry(home, ["--json"])).posted, false, "dry ⇒ no POST");
    assert.equal((await dry(home, ["--json", "--as", "issue", "--confirm"])).posted, true, "Send ⇒ POST");
  });
});

// ─── the SKILL rules that drive the offer ─────────────────────────────────────────
test("G: SKILL.md Step 6b defines the offer, its silence rules, and the ordering", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/skills/vc-self-check/SKILL.md"), "utf8");
  assert.match(md, /Show what would be sent/, "the three-way question is specified");
  assert.match(md, /\*\*"Send"\*\*/);
  assert.match(md, /\*\*"Don't send"\*\*/);
  assert.match(md, /≥1 row with verdict BROKEN or DEGRADED/, "keys on any BROKEN/DEGRADED row…");
  assert.match(md, /flagged span's verdict was \*\*OK\*\*/, "…explicitly NOT on the flagged span's verdict");
  assert.match(md, /feedback\.mode !== "off"/);
  assert.match(md, /alreadyOffered/, "the one-shot guard is wired into the instruction");
  assert.match(md, /no operator question is pending/, "shares item D's deferral");
  // item 8 — the ordering is now verdict → offer, and there is no third step: the cleanup
  // QUESTION was removed, so a turn is one line plus at most one question.
  assert.match(md, /verdict line \*\*FIRST\*\* → delivery offer \(at most\s*\none question\) → nothing else/, "the terminal-Stop ordering");
  assert.match(md, /cleanup \*\*question is gone\*\*/, "cleanup no longer asks anything");
  assert.match(md, /ONE question per turn/, "the one-question-per-turn rule is stated");
  assert.match(md, /HONEST route/, "the route shown is the real one for the token in hand");
});

test("G: the DIAG footer states the ACTUAL state — the dead `deliver` hint is gone (BOTH surfaces)", () => {
  // The footer TEMPLATE line is what gets copied into every DIAG. It must no longer end in the
  // hint nobody ever acted on. (The phrase may still appear in prose EXPLAINING the old defect —
  // that is why this matches the footer line specifically, not the phrase anywhere.)
  const deadFooter = /_Local report only[^\n]*To contribute this upstream/;
  for (const rel of ["plugins/vc-fix/skills/vc-self-check/SKILL.md", ".claude/skills/vc-self-check/SKILL.md"]) {
    const md = readFileSync(join(ROOT, rel), "utf8");
    assert.doesNotMatch(md, deadFooter, `${rel} still ships the dead footer hint`);
    assert.match(md, /draft prepared: .*DELIVERY-/, `${rel}: …replaced by the real state`);
    assert.match(md, /upstream delivery is off \(feedback\.mode=off\)/, rel);
    assert.match(md, /nothing to contribute — no BROKEN\/DEGRADED finding/, rel);
  }
});
