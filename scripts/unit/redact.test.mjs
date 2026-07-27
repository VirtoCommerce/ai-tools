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
