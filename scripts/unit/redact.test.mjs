// Direct unit tests for the shared secret-redaction module (plugins/vc-fix/hooks/redact.mjs).
// PR #143 R2 NA-3: redact()'s own rules (AKIA / github_pat_ / …) previously had ZERO direct
// coverage — they were only touched indirectly by upstream-reduce.test.mjs, which tests a
// DIFFERENT function (the closed-schema reducer, whose output is enum-only and never contains
// free text regardless of redact()). A regression to a redact() rule would have passed every
// test. This file guards redact() itself, and adds the NA-1 shapes (ADO_PAT / *_ACCESS_KEY /
// PRIVATE_KEY / *_CREDENTIAL) that used to leak into the local <sid>.jsonl. Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../../plugins/vc-fix/hooks/redact.mjs";

// Each case: [input, the secret substring that MUST be gone, an expected marker fragment].
const MUST_REDACT = [
  // secret token shapes (bare / prefixed) — the shapes the collector persists from tool output
  ["tok ghp_LEAKclassicTOKENabcdef1234567890 end", "ghp_LEAKclassicTOKENabcdef1234567890", "«gh-token»"],
  ["pat github_pat_LEAKfineGrained1234567890abcd end", "github_pat_LEAKfineGrained1234567890abcd", "«gh-token»"],
  ["aws AKIALEAKAWSKEY123456 end", "AKIALEAKAWSKEY123456", "«aws-key»"],            // AKIA + exactly 16
  ["gl glpat-LEAKgitlabTOKEN12345678 end", "glpat-LEAKgitlabTOKEN12345678", "«gitlab-token»"],
  ["sk xoxb-LEAKslackTOKEN12345 end", "xoxb-LEAKslackTOKEN12345", "«slack-token»"],
  ["u https://x?sig=LEAKsasSIG123&y", "LEAKsasSIG123", "sig=«redacted»"],
  ["jwt eyJLEAKheaderABCDEFGHIJKLMNOP.payload.sig", "eyJLEAKheaderABCDEFGHIJKLMNOP", "«jwt»"],
  ["card 4111 1111 1111 1111 end", "4111 1111 1111 1111", "«pan»"],
  // Authorization header — unquoted AND JSON-quoted value (the Round-1 finding)
  ["HTTP 401 Authorization: Bearer opaqueLEAKtok1234567890", "opaqueLEAKtok1234567890", "«redacted»"],
  ['err {"headers":{"Authorization":"Bearer LEAKjsonquoted9876543210"}}', "LEAKjsonquoted9876543210", "«redacted»"],
  ["Authorization: Basic dXNlcjpMRUFLYmFzaWNQQVQ=", "dXNlcjpMRUFLYmFzaWNQQVQ=", "«redacted»"],
  // key/value secrets — JSON + shell + connection-string forms
  ['body {"password":"LEAKpassS3cret"}', "LEAKpassS3cret", "«redacted»"],
  ["url postgres://svc:LEAKdbpw@h/x", "LEAKdbpw", "«redacted»"],
  ["conn AccountKey=LEAKazureAcct123== end", "LEAKazureAcct123==", "«redacted»"],
  ['json {"access_token":"LEAKoauthAccess123","refresh_token":"LEAKoauthRefresh123"}', "LEAKoauthAccess123", "«redacted»"],
  // apiKey / X-Api-Key — the rule at redact.mjs:52 targets `api[_-]?key` (JSON + header forms) but
  // had no direct coverage; a regression to that alternation would have passed (test review #5).
  ['json {"apiKey":"LEAKapiKeyVALUE1234567"}', "LEAKapiKeyVALUE1234567", "«redacted»"],
  ["hdr X-Api-Key: LEAKheaderApiKeyVALUE12345 end", "LEAKheaderApiKeyVALUE12345", "«redacted»"],
  // NA-1: credential-suffixed env-var KEYS the keyword list used to miss
  ["ADO_PAT=LEAKadoPatVALUE1234567890", "LEAKadoPatVALUE1234567890", "«redacted»"],
  ["BROWSERSTACK_ACCESS_KEY=LEAKbsAccessKey1234", "LEAKbsAccessKey1234", "«redacted»"],
  ["PRIVATE_KEY=LEAKprivKeyVALUE123456", "LEAKprivKeyVALUE123456", "«redacted»"],
  ["AZURE_CLIENT_CREDENTIAL=LEAKclientCred1234", "LEAKclientCred1234", "«redacted»"],
];

for (const [input, secret, marker] of MUST_REDACT) {
  test(`redact: removes secret + leaves a marker — ${input.slice(0, 42)}…`, () => {
    const out = redact(input);
    assert.ok(!out.includes(secret), `secret must be redacted but leaked: ${out}`);
    assert.ok(out.includes(marker), `expected redaction marker "${marker}" in: ${out}`);
  });
}

// Negatives — benign keys must survive so diagnostics keep their value. Paths and patterns are
// everywhere in tool inputs; over-redacting them would gut the collector. (`pat(?![a-z])` spares
// path/pattern/compatible; only a bare `compat=` would over-match — accepted fail-safe.)
const MUST_KEEP = [
  "path=/home/user/project/src/file.ts",
  "file_path=C:/repo/x.cs",
  "pattern=abc.*",
  "compatible=true",
  "monkey=banana",
  "status=passed",
  "category=security",
];
for (const input of MUST_KEEP) {
  test(`redact: keeps a benign key verbatim — ${input}`, () => {
    assert.equal(redact(input), input, `must not over-redact: ${input}`);
  });
}

test("redact: null/undefined coerce to empty string, never throws", () => {
  assert.equal(redact(null), "");
  assert.equal(redact(undefined), "");
});

// PR #143 R2 audit — R1 (multi-token value capture), R2 (PEM blocks), R3 (distinctive-prefix
// secrets). All LOCAL-persist hygiene (upstream is enum-only regardless). Guards against the
// `\S+`-first-token leak and the bare-PEM / Stripe / Slack-webhook / npm / Set-Cookie gaps.
const R2_MUST_REDACT = [
  ['{"password":"correct horse battery staple"}', "horse battery staple", "«redacted»"], // R1: multi-word quoted
  ['{"private_key":"-----BEGIN PRIVATE KEY----- MIIEvKEYMATERIALxyz -----END PRIVATE KEY-----"}', "KEYMATERIALxyz", "«"], // R1/R2 PEM-in-JSON
  ["-----BEGIN OPENSSH PRIVATE KEY----- b3BlSECRETbody -----END OPENSSH PRIVATE KEY-----", "SECRETbody", "«private-key»"], // R2 bare PEM
  ["-----BEGIN RSA PRIVATE KEY----- MIIEvTRUNCATEDbody0123456789abcdef", "TRUNCATEDbody", "«private-key»"], // round 5: END cut off (>8000-char tool_result cap) → truncated-PEM fallback
  // round 6: a LEGACY ENCRYPTED PEM whose END was cut — the Proc-Type/DEK-Info header lines must not
  // stop the fallback before it reaches the ciphertext body (the plain base64-run class did, at the `-`).
  ["-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: DES-EDE3-CBC,A1B2C3D4\n\nMIIEncCIPHERTEXTbody0123456789abcd", "CIPHERTEXTbody", "«private-key»"],
  ["redis://:MyRedisPw123@10.0.0.5:6379", "MyRedisPw123", "«redacted»"], // userless conn string
  ["using sk_live_51HxYzABCDEF1234567890", "sk_live_51HxYzABCDEF1234567890", "«stripe-key»"],
  ["whsec_ABCDEF1234567890abcdef", "whsec_ABCDEF1234567890abcdef", "«stripe-whsec»"],
  ["rotate npm_abcdef0123456789ABCDEF0123456789abcd", "npm_abcdef0123456789ABCDEF0123456789abcd", "«npm-token»"],
  ["post to https://hooks.slack.com/services/T00/B11/AbCdEf123", "AbCdEf123", "«slack-webhook»"],
  ["Set-Cookie: session=abc123def456ghi; Path=/", "abc123def456ghi", "«redacted»"],
  ["sessionid=9a8b7c6d5e4f0011", "9a8b7c6d5e4f0011", "«redacted»"],
];
for (const [input, secret, marker] of R2_MUST_REDACT) {
  test(`redact (R2 audit): removes secret + marker — ${input.slice(0, 40)}…`, () => {
    const out = redact(input);
    assert.ok(!out.includes(secret), `secret must be redacted but leaked: ${out}`);
    assert.ok(out.includes(marker), `expected marker "${marker}" in: ${out}`);
  });
}
// Negatives that the widened rules must NOT destroy (diagnostics value).
for (const input of ["commit=3a4f5e6d7c8b9a0f1e2d3c4b5a6978012345abcd", "session_count=5", "name=OrderService"]) {
  test(`redact (R2 audit): keeps benign — ${input}`, () => assert.equal(redact(input), input));
}

// round 6: the truncated-PEM fallback must redact the key BUT stop at the first non-key line, so a
// following log/prose line survives for triage (the greedy base64+whitespace class used to eat it).
test("redact (round 6): truncated PEM redacts the key but does NOT devour the following log line", () => {
  const out = redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEvSECRETkeymaterial0123456789abcdef\nERROR: connection refused to db-host:5432");
  assert.ok(!out.includes("SECRETkeymaterial"), `key material must be redacted: ${out}`);
  assert.ok(out.includes("«private-key»"), `marker present: ${out}`);
  assert.ok(out.includes("ERROR: connection refused to db-host"), `following prose must survive: ${out}`);
});
