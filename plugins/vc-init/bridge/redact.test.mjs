// The redactor masks what a bridged child prints (bridge/redact.mjs). A token split across two
// output chunks, or echoed as a Basic-auth header, is the case a naive per-chunk replace misses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MASK, createRedactor, redactText, secretForms } from "./redact.mjs";

const TOKEN = "ghp_0123456789abcdefABCDEF0123456789abcd";
const b64 = (s) => Buffer.from(s).toString("base64");

function feed(secrets, chunks, opts) {
  const r = createRedactor(secrets, opts);
  return chunks.map((c) => r.push(c)).join("") + r.end();
}

test("the raw value is masked", () => {
  assert.equal(feed([TOKEN], [`token=${TOKEN}\n`]), `token=${MASK}\n`);
});

test("a value split across chunks at every position is still masked", () => {
  const text = `before ${TOKEN} after\n`;
  for (let i = 1; i < text.length; i++) {
    const out = feed([TOKEN], [text.slice(0, i), text.slice(i)]);
    assert.equal(out, `before ${MASK} after\n`, `split at ${i}`);
    assert.ok(!out.includes(TOKEN.slice(0, 12)), `no prefix leaks at split ${i}`);
  }
});

test("a value delivered one byte at a time is masked", () => {
  const text = `x${TOKEN}y`;
  assert.equal(feed([TOKEN], [...Buffer.from(text)].map((b) => Buffer.from([b]))), `x${MASK}y`);
});

test("Basic-auth spellings are masked: Azure DevOps :PAT, GitHub x-access-token, a known Jira e-mail", () => {
  const pat = "adopat0123456789abcdefghijklmnopqrstuvwxyz0123456789ab";
  assert.equal(feed([pat], [`Authorization: Basic ${b64(`:${pat}`)}`]), `Authorization: Basic ${MASK}`);
  assert.equal(feed([TOKEN], [`Basic ${b64(`x-access-token:${TOKEN}`)}`]), `Basic ${MASK}`);
  const jira = "ATATT3xFfGF0abcdefghijklmnop";
  assert.equal(feed([jira], [`Basic ${b64(`qa@acme.com:${jira}`)}`], { emails: ["qa@acme.com"] }), `Basic ${MASK}`);
  assert.equal(feed([TOKEN], [`b64=${b64(TOKEN)}`]), `b64=${MASK}`);
});

test("a URL-encoded spelling is masked", () => {
  const odd = "p@ss/w0rd+with%chars";
  assert.equal(redactText(`u=${encodeURIComponent(odd)}`, secretForms(odd)), `u=${MASK}`);
});

test("multi-byte text around a secret survives a split inside a character", () => {
  const text = Buffer.from(`ё ${TOKEN} ✓`);
  const cut = 1; // inside the 2-byte "ё"
  assert.equal(feed([TOKEN], [text.subarray(0, cut), text.subarray(cut)]), `ё ${MASK} ✓`);
});

test("a password of any length is masked, with its JSON-escaped spelling; no secrets ⇒ passthrough", () => {
  assert.ok(secretForms("abc").includes("abc"));
  assert.deepEqual(secretForms(""), []);
  assert.equal(feed(["pw1"], ["login pw1 ok"]), `login ${MASK} ok`);
  assert.equal(feed(["p\"w\\1"], [JSON.stringify({ password: "p\"w\\1" })]), `{"password":"${MASK}"}`);
  assert.equal(feed([], ["plain ", "text"]), "plain text");
});

test("several secrets at once, longest form first", () => {
  const a = "AAAAAAAAAAAAAAAAAAAA";
  const out = feed([a, TOKEN], [`${a}|${TOKEN}`]);
  assert.equal(out, `${MASK}|${MASK}`);
});
