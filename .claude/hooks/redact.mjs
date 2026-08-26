/**
 * hooks/redact.mjs — the shared source of secret-redaction rules for the
 * vc-fix self-diagnostics subsystem.
 *
 * Used by hooks/session-telemetry.mjs — the passive collector — to scrub the snippets
 * it persists to the LOCAL <sid>.jsonl. (Historically deliver.mjs also imported this to
 * scrub its outbound report; since PR #143 R2 the upstream artifact is a closed-vocabulary
 * enum/number struct with NO free text, so the former client-shape scrubbers were removed
 * and deliver no longer imports redact — the closed schema is the sole upstream guard.)
 *
 * Each rule redacts
 * the CREDENTIAL/VALUE and keeps just enough as signal (scheme word, key name,
 * username). Ordering matters — the URL-userinfo rule runs first so a connection-
 * string password is gone before any later rule sees the line.
 */
export const REDACTIONS = [
  // URL userinfo — scheme://user:PASSWORD@host (postgres/mysql/redis/amqp/http proxy connection
  // strings, common in Bash tool inputs). Keep the username as signal, drop the password.
  [/\b([a-z][\w+.-]*:\/\/)([^\s:@/]*):[^\s@/]+@/gi, "$1$2:«redacted»@"],
  // PEM private-key blocks (SSH id_rsa / RSA / EC / OpenSSH) echoed by a failed ssh/git/cat — a
  // bare multiline secret with no keyword and no `=`, so no other rule fires (PR #143 R2 NA-1/H1).
  // Runs BEFORE the key/value rule so a PEM-in-JSON value is collapsed first; `[^-]*` matches the
  // `OPENSSH `/`RSA `/`EC ` variant word, `[\s\S]*?` the base64 body (spaces after the \s+ collapse).
  [/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/gi, "«private-key»"],
  // TRUNCATED PEM fallback: a lone `-----BEGIN…PRIVATE KEY-----` header whose matching `-----END-----`
  // was cut off — e.g. a key > the 8000-char tool_result body cap in session-telemetry.mjs, so the
  // block rule above can't match (code review round 5). Runs AFTER the full-block rule, so a complete
  // key is handled there; this only fires on a header with no END. It consumes, line by line: the
  // optional legacy-encrypted headers (`Proc-Type:`/`DEK-Info:`, which the earlier plain base64-run
  // class stopped at because of their `-` — round 6 security note), a blank line, and base64 body
  // lines (a contiguous run ≥16 chars — so it does NOT devour a following log/prose line, whose words
  // are <16 chars or carry punctuation — round 6 quality note). Every branch consumes ≥1 char and the
  // classes are near-disjoint by leading char, so it stays linear (no ReDoS). Local `<sid>.jsonl`
  // hygiene only — the upstream artifact is enum-only regardless.
  [/-----BEGIN[^-]*PRIVATE KEY-----[ \t]*\r?\n?(?:(?:proc-type|dek-info):[^\r\n]*\r?\n?|[A-Za-z0-9+/=]{16,}[ \t]*\r?\n?|[ \t]*\r?\n)*/gi, "«private-key»"],
  // Authorization header — redact the CREDENTIAL, not just the scheme word. An optional scheme
  // (Bearer/Basic/Digest/Negotiate/NTLM) is consumed so `Authorization: Basic <b64>` and
  // `Authorization: Bearer <tok>` alike lose the credential. A `:`/`=` is required so prose
  // "authorization" is not mangled; a header-less `Bearer/Basic <cred>` is caught by the next rule.
  // The `"?` before the scheme group consumes an opening quote on the VALUE too, so the JSON-quoted
  // shape `"Authorization":"Bearer <tok>"` (axios/requests/curl error dumps) redacts the token — the
  // old rule stopped `\S+` at `"Bearer` and LEAKED the credential (PR #143 review, Lenajava1).
  [/\b(authorization)\b"?\s*[:=]\s*"?(?:(?:bearer|basic|digest|negotiate|ntlm)\s+)?\S+/gi, "$1 «redacted»"],
  [/\b(bearer|basic|digest|negotiate|ntlm)\s+\S+/gi, "$1 «redacted»"],
  // key/value secrets — optional quotes around BOTH key and value so the JSON form
  // (`"password":"x"`, `"apiKey": "x"`), the shell form (`password=x`), the header form
  // (`X-Api-Key: x`) and the Azure connection-string form (`AccountKey=…`, `SharedAccessSignature=…`)
  // all redact the value. The bounded `[\w-]{0,40}?` PREFIX + `[\w-]{0,40}` SUFFIX around the keyword
  // redact COMPOUND key names (`access_token`, `refresh_token`, `client_secret`, `sessionToken`,
  // `aws_secret_access_key`) that the old `\b(keyword)\b` anchor missed — those had no word boundary
  // on one side and LEAKED the value into the jsonl → the public upstream via deliver (PR #143 review).
  // The prefix is lazy + length-capped so backtracking stays linear; over-redaction of a benign
  // `*secret*`-named field is the intended fail-safe direction. Group 1 keeps the FULL key as signal.
  // PR #143 R2 (NA-1): added `access[_-]?key` / `private[_-]?key` / `credential(s)` / `pat` so the
  // plugin's OWN `ADO_PAT` (Azure DevOps token), `BROWSERSTACK_ACCESS_KEY`, and `PRIVATE_KEY` no
  // longer LEAK into the local `<sid>.jsonl` (upstream stays safe by the closed schema regardless —
  // this is local secret-at-rest hygiene). `pat(?![a-z])` matches `ADO_PAT`/`_PAT=` but spares
  // `path`/`pattern`; over-redacting a rare `compat=…` key is the accepted fail-safe direction.
  // The value is captured as EITHER a fully-quoted string (`"[^"]*"?`) OR a single unquoted token
  // (`\S+`). The quoted branch is what fixes PR #143 R2 H2: the old trailing `"?\S+` ate only the
  // FIRST whitespace-delimited token, so a multi-word quoted value (`"password":"correct horse
  // battery staple"`, a JSON `private_key` PEM body) leaked everything after its first space.
  [/\b([\w-]{0,40}?(?:token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|secret|password|passwd|pwd|accountkey|sharedaccesssignature|session[_-]?id|pat(?![a-z]))[\w-]{0,40})"?\s*[:=]\s*(?:"[^"]*"?|\S+)/gi, "$1=«redacted»"],
  [/\beyJ[A-Za-z0-9._-]{16,}/g, "«jwt»"], // JWTs
  [/\b\d(?:[ -]?\d){12,18}\b/g, "«pan»"], // card numbers
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "«gh-token»"], // GitHub classic tokens (ghp_/gho_/ghu_/ghs_/ghr_)
  // GitHub FINE-GRAINED PAT (`github_pat_…`, GitHub's default format since Oct 2022 — and what
  // GITHUB_FIX_BUGS_TOKEN typically IS). The classic `gh[pousr]_` rule above does NOT match it
  // (3rd char `i`), and the key/value rule fires only on `keyword[:=]value`, so a bare / space-
  // separated / prose `github_pat_…` (e.g. a `.netrc` "password github_pat_…" line, or "rotate
  // github_pat_…") leaked to the PUBLIC upstream. Underscores are \w so one class spans the whole token.
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "«gh-token»"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "«aws-key»"], // AWS access key IDs (bare, no key=value wrapper)
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, "«gitlab-token»"], // GitLab personal access tokens
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "«slack-token»"], // Slack tokens (xoxb/xoxa/xoxp/xoxr/xoxs)
  [/\bsig=[^&\s]+/gi, "sig=«redacted»"], // Azure SAS signature query param
  // PR #143 R2 (R3) — distinctive-prefix secrets with no false-positive risk (bare, no key=value):
  [/\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}\b/g, "«stripe-key»"], // Stripe secret/restricted keys
  [/\bwhsec_[A-Za-z0-9]{10,}\b/g, "«stripe-whsec»"], // Stripe webhook signing secret
  [/\bnpm_[A-Za-z0-9]{36}\b/g, "«npm-token»"], // npm automation/publish token
  [/https:\/\/hooks\.slack\.com\/services\/\S+/gi, "«slack-webhook»"], // Slack incoming-webhook URL (secret is the path)
  [/\bset-cookie\b\s*:\s*\S+/gi, "set-cookie: «redacted»"], // Set-Cookie header value (session hijack)
];

/**
 * Distinctive-prefix credential shapes as ONE non-global matcher, for callers that need to ASK
 * "does this string contain a credential?" rather than rewrite it — /project-init's .mcp.json
 * secret-hygiene audit (VCST-5774 B4) is the first.
 *
 * It lives here, beside REDACTIONS, because the alternative is what actually happened: the audit
 * shipped its own shorter copy (`gh[pousr]_|github_pat_|PMAK-`), so a `glpat-`/`xoxb-`/`sk_live_`/
 * `AKIA`/JWT literal the REDACTOR already knew about sailed past the DETECTOR. One list, one place.
 *
 * NON-global on purpose: `.test()` on a /g regex is stateful and alternates true/false across
 * calls. Floors are deliberately a little looser than the REDACTIONS rules above — a detector
 * that under-matches stays silent, whereas an over-matching redactor only costs a masked word.
 */
export const SECRET_PREFIX_RE = new RegExp([
  /gh[pousr]_[A-Za-z0-9]{16,}/,          // GitHub classic (ghp_/gho_/ghu_/ghs_/ghr_)
  /github_pat_[A-Za-z0-9_]{16,}/,        // GitHub fine-grained
  /glpat-[A-Za-z0-9_-]{16,}/,            // GitLab
  /xox[baprs]-[A-Za-z0-9-]{10,}/,        // Slack
  /[rs]k_(?:live|test)_[A-Za-z0-9]{10,}/, // Stripe secret/restricted
  /whsec_[A-Za-z0-9]{10,}/,              // Stripe webhook signing
  /npm_[A-Za-z0-9]{36}/,                 // npm automation/publish
  /AKIA[0-9A-Z]{16}/,                    // AWS access key id
  // JWT — THREE base64url segments joined by dots. It used to be `eyJ[A-Za-z0-9._-]{16,}`, which
  // matches any base64 of a JSON object (`{"` encodes to `eyJ`), so an ordinary
  // `APP_CONFIG_B64: "eyJ0aGVtZSI6ImRhcmsi…"` was reported as a CERTAIN credential and FAILed
  // readiness — the exact "blocks onboarding on a harmless value" failure the confidence split
  // exists to prevent. Requiring the dots costs nothing: a JWT without them is not a JWT.
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/, // JWT (header.payload.signature)
  /PMAK-[A-Za-z0-9-]{10,}/,              // Postman API key
].map((r) => r.source).join("|"));

/** Apply every redaction rule to `s`. Never throws; coerces null/undefined to "". */
export function redact(s) {
  let out = String(s ?? "");
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}
