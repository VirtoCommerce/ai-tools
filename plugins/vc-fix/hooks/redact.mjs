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
  [/\b([a-z][\w+.-]*:\/\/)([^\s:@/]+):[^\s@/]+@/gi, "$1$2:«redacted»@"],
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
  [/\b([\w-]{0,40}?(?:token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|secret|password|passwd|pwd|accountkey|sharedaccesssignature|pat(?![a-z]))[\w-]{0,40})"?\s*[:=]\s*"?\S+/gi, "$1=«redacted»"],
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
];

/** Apply every redaction rule to `s`. Never throws; coerces null/undefined to "". */
export function redact(s) {
  let out = String(s ?? "");
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}
