// Unit tests for the VCST-5509 additions to plugins/vc-fix/skills/vc-self-check/deliver.mjs:
// feedback.mode consent gating (feedbackMode), /vc-feedback capture readback
// (readSessionFeedback), the feedback-folded fingerprint (the D2 fix — a feedback-only
// report must not collapse to one constant fingerprint across clients), and buildDraft's
// mode-dependent handling of the operator's free-form feedback note (ask keeps it, auto
// drops it — B-F1). Pure module-level imports, no child process — VC_FIX_HOME is set/reset
// around each test for isolation. Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  fingerprint,
  findingSig,
  buildDraft,
  feedbackMode,
  readSessionFeedback,
  scrubText,
} from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

function withHome(home, fn) {
  const prev = process.env.VC_FIX_HOME;
  process.env.VC_FIX_HOME = home;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.VC_FIX_HOME;
    else process.env.VC_FIX_HOME = prev;
  }
}

const finding = (over = {}) => ({ skill: "/qa-fix", verdict: "BROKEN", sev: "S1", signal: "x", fix: "y", rootcause: "", ...over });

// ─── findingSig / fingerprint ───────────────────────────────────────────────────
test("findingSig: identity ignores whitespace differences in `fix`", () => {
  const a = findingSig(finding({ fix: "add a null-guard" }));
  const b = findingSig(finding({ fix: "  add   a null-guard  " }));
  assert.equal(a, b);
});

test("fingerprint: identical findings + no feedback are stable across calls (dedup works)", () => {
  const f1 = fingerprint([finding()]);
  const f2 = fingerprint([finding()]);
  assert.equal(f1, f2);
});

test("fingerprint: a feedback-only report (no findings) does NOT collapse to one constant fingerprint (D2)", () => {
  const fpA = fingerprint([], [{ verdict: "down", text: "the fix broke pagination" }]);
  const fpB = fingerprint([], [{ verdict: "down", text: "totally different report about checkout" }]);
  assert.notEqual(fpA, fpB, "distinct feedback notes must produce distinct fingerprints, not collapse to one issue");
});

test("fingerprint: identical feedback text still dedups to the same fingerprint", () => {
  const fpA = fingerprint([], [{ verdict: "down", text: "the fix broke pagination" }]);
  const fpB = fingerprint([], [{ verdict: "down", text: "the fix broke pagination" }]);
  assert.equal(fpA, fpB);
});

// ─── feedbackMode ────────────────────────────────────────────────────────────────
test("feedbackMode: defaults to 'ask' when no project-profile.json exists", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    withHome(home, () => assert.equal(feedbackMode(), "ask"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("feedbackMode: reads a valid mode from project-profile.json", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "auto" } }));
    withHome(home, () => assert.equal(feedbackMode(), "auto"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("feedbackMode: an invalid/garbage mode value falls back to 'ask', never 'auto'", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "yolo" } }));
    withHome(home, () => assert.equal(feedbackMode(), "ask"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── readSessionFeedback ─────────────────────────────────────────────────────────
test("readSessionFeedback: reads only feedback-typed records for the given session", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    const dir = join(home, ".vc-fix", "diagnostics");
    mkdirSync(dir, { recursive: true });
    const lines = [
      { type: "session_start", sessionId: "s1" },
      { type: "feedback", sessionId: "s1", verdict: "down", text: "broke pagination" },
      { type: "span", sessionId: "s1", kind: "command" },
      { type: "feedback", sessionId: "s1", verdict: "up", text: "" },
    ];
    writeFileSync(join(dir, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    withHome(home, () => {
      const fb = readSessionFeedback("s1");
      assert.equal(fb.length, 2);
      assert.deepEqual(fb.map((f) => f.verdict), ["down", "up"]);
      assert.equal(fb[0].text, "broke pagination");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("readSessionFeedback: no session id or missing file returns an empty array, never throws", () => {
  const home = mkdtempSync(join(tmpdir(), "deliver-fb-"));
  try {
    withHome(home, () => {
      assert.deepEqual(readSessionFeedback(null), []);
      assert.deepEqual(readSessionFeedback("nope"), []);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── buildDraft feedback rendering (mode-dependent, B-F1) ───────────────────────
test("buildDraft: mode=ask includes the feedback note prose", () => {
  const d = buildDraft({
    route: "issue",
    pluginVersion: "1.0",
    findings: [],
    fp: "t1",
    feedback: [{ verdict: "down", text: "the fix broke pagination" }],
    mode: "ask",
  });
  assert.match(d.body, /broke pagination/);
  assert.match(d.title, /operator feedback/);
});

test("buildDraft: mode=auto drops the feedback note prose, keeps only the verdict mark", () => {
  const d = buildDraft({
    route: "issue",
    pluginVersion: "1.0",
    findings: [],
    fp: "t2",
    feedback: [{ verdict: "down", text: "the fix broke pagination" }],
    mode: "auto",
  });
  assert.ok(!/broke pagination/.test(d.body), "auto-mode delivery must not carry unreviewed free-form prose");
  assert.match(d.body, /👎/, "the verdict mark itself should still be present");
});

// NOTE: isClientSpecific()'s clientTerms() memoizes project-profile.json PER PROCESS on
// first call (see deliver.mjs), so a profile-derived org term (e.g. a configured `acme`)
// set up mid-file wouldn't reliably apply here regardless of test order. Use a fixture the
// GENERIC (profile-independent) shape heuristics catch — a PascalCase client identifier —
// matching tests/self-check-containment.test.mjs's own "noprofile" regression-guard cases.
test("buildDraft: a client-specific feedback note is withheld even in mode=ask", () => {
  const d = buildDraft({
    route: "issue",
    pluginVersion: "1.0",
    findings: [],
    fp: "t3",
    feedback: [{ verdict: "down", text: "at AcmeCorp.Web.Controllers.CartController.Checkout()" }],
    mode: "ask",
  });
  assert.ok(!/AcmeCorp/.test(d.body), "a client-specific identifier must never reach the outbound draft");
});

// ─── scrubText secret redaction — shared hardened rules (PR #143 review, Finding 1) ──────────
// deliver.mjs scrubs every outbound cell before it reaches the PUBLIC upstream. It used to carry
// its OWN pre-#143 `\b(keyword)\b` array that leaked compound-key / Basic-auth / AccountKey / SAS
// shapes; it now shares hooks/redact.mjs with the collector, so these must all be redacted.
test("scrubText: shared redaction covers the shapes deliver's old weak array leaked", () => {
  const cases = [
    ['{"access_token":"AKtokenLEAK1234567890"}', "AKtokenLEAK1234567890"],
    ['{"refresh_token":"RTtokenLEAK1234567890"}', "RTtokenLEAK1234567890"],
    ["client_secret=CSsecretLEAK1234567890", "CSsecretLEAK1234567890"],
    ["aws_secret_access_key=AWSsecretLEAK1234567890", "AWSsecretLEAK1234567890"],
    ['body {"password":"PWjsonLEAK1234"}', "PWjsonLEAK1234"],
    ["HTTP 401 Authorization: Basic dXNlcjpMRUFLYmFzaWNQQVQ=", "dXNlcjpMRUFLYmFzaWNQQVQ="], // base64 PAT blob
    ["conn AccountKey=AcctKeyLEAK1234567890== end", "AcctKeyLEAK1234567890=="],
  ];
  for (const [input, secret] of cases) {
    const out = scrubText(input);
    assert.ok(!out.includes(secret), `scrubText must redact "${secret}" but leaked it: ${out}`);
    assert.ok(/«redacted»/.test(out), `a redaction marker must appear for: ${input}`);
  }
});
