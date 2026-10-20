/**
 * bridge/redact.mjs — mask the secrets a bridged child was given, in what it prints.
 *
 * The bridge's inner side hands a token to `gh`, `git` or a plugin script through the environment.
 * A child that echoes it — a verbose HTTP trace, an error that quotes the request, `git` printing a
 * remote URL somebody built with the token in it — would put it into the agent's transcript, and from
 * there into a log, a report or a tracker comment. Everything the child writes to stdout and stderr
 * goes through here first.
 *
 * Masked forms of each secret value:
 *   - the raw value at ANY length (a password can be short), its URL-encoded and JSON-escaped spellings
 *     when they differ (a child that prints a JSON body escapes `"`, `\\` and control characters);
 *   - Basic-auth base64 of `<user>:<value>` for the usernames this tooling uses ("" — Azure DevOps'
 *     `:PAT`, `x-access-token` — GitHub, `pat`, and the Jira e-mail when it is known), and of the bare
 *     value. Base64 of a string with an UNKNOWN prefix cannot be matched as a substring (its alignment
 *     shifts with the prefix length), which is why the prefixes are enumerated rather than guessed.
 *
 * Streaming-safe: a value split across two chunks is still masked. The redactor holds back the last
 * (longest form − 1) characters of each chunk until the next one arrives, so a prefix of a secret is
 * never emitted before its end has been seen. A multi-byte character split across chunks is decoded
 * whole (StringDecoder).
 */
import { StringDecoder } from "node:string_decoder";

export const MASK = "«redacted»";

/**
 * Every spelling of `value` the redactor masks. The raw value and its escaped spellings are masked at
 * any length; the derived base64 forms only from 6 characters, where a match is no longer a coincidence.
 */
export function secretForms(value, { emails = [] } = {}) {
  const v = String(value ?? "");
  if (!v) return [];
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const exact = new Set([v]);
  const enc = encodeURIComponent(v);
  if (enc !== v) exact.add(enc);
  const json = JSON.stringify(v).slice(1, -1);
  if (json !== v) exact.add(json);
  const forms = new Set([b64(v)]);
  for (const user of ["", "x-access-token", "pat", "PAT", "git", ...emails.filter(Boolean)]) {
    const full = b64(`${user}:${v}`);
    forms.add(full);
    // Without its `=` padding, as some loggers trim it.
    forms.add(full.replace(/=+$/, ""));
  }
  return [...new Set([...exact, ...[...forms].filter((f) => f.length >= 6)])].sort((a, b) => b.length - a.length);
}

/** Replace every occurrence of every form in `text`. Longest form first, so a shorter one cannot split a longer. */
export function redactText(text, forms) {
  let out = String(text);
  for (const f of forms) {
    if (f && out.includes(f)) out = out.split(f).join(MASK);
  }
  return out;
}

/**
 * A chunk-boundary-safe redactor for one output stream.
 * @param {string[]} secrets  the raw secret values
 * @param {{ emails?: string[] }} [opts]
 * @returns {{ push(chunk: Buffer|string): string, end(): string }}
 */
export function createRedactor(secrets, opts = {}) {
  const forms = [...new Set(secrets.flatMap((s) => secretForms(s, opts)))].sort((a, b) => b.length - a.length);
  const hold = forms.length ? Math.max(...forms.map((f) => f.length)) - 1 : 0;
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const drain = (final) => {
    const text = redactText(pending, forms);
    if (final || hold === 0) {
      pending = "";
      return text;
    }
    // Keep the tail that could be the start of a form whose end has not arrived yet. Redaction ran
    // over the whole buffer first, so a COMPLETE form inside the tail is already masked; only a
    // proper prefix (shorter than the longest form) can still be there, and `hold` covers it.
    const cut = Math.max(0, text.length - hold);
    pending = text.slice(cut);
    return text.slice(0, cut);
  };
  return {
    push(chunk) {
      pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
      return drain(false);
    },
    end() {
      pending += decoder.end();
      return drain(true);
    },
  };
}
