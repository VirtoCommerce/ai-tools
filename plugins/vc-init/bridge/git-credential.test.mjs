// The bridge's git credential helper answers only for the host a token belongs to
// (bridge/git-credential.mjs). A remote that points elsewhere must get nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { answerFor, parseCredentialInput } from "./git-credential.mjs";

const HELPER = fileURLToPath(new URL("./git-credential.mjs", import.meta.url));
const env = { GITHUB_FIX_BUGS_TOKEN: "ghp_TESTTOKEN0123456789", ADO_PAT: "adopat0123456789" };

test("github.com gets the GitHub token as x-access-token", () => {
  assert.equal(answerFor({ protocol: "https", host: "github.com" }, env), "username=x-access-token\npassword=ghp_TESTTOKEN0123456789\n");
  assert.equal(answerFor({ protocol: "https", host: "github.com" }, { GITHUB_TOKEN: "ghp_RENAMED0123456789" }), "username=x-access-token\npassword=ghp_RENAMED0123456789\n");
});

test("Azure DevOps hosts get the ADO PAT", () => {
  assert.match(answerFor({ protocol: "https", host: "dev.azure.com" }, env), /password=adopat0123456789/);
  assert.match(answerFor({ protocol: "https", host: "acme.visualstudio.com" }, env), /password=adopat0123456789/);
});

test("any other host, a non-https protocol, or a missing token gets no answer", () => {
  assert.equal(answerFor({ protocol: "https", host: "evil.example" }, env), "");
  assert.equal(answerFor({ protocol: "https", host: "github.com.evil.example" }, env), "");
  assert.equal(answerFor({ protocol: "https", host: "evilgithub.com" }, env), "");
  assert.equal(answerFor({ protocol: "http", host: "github.com" }, env), "");
  assert.equal(answerFor({ protocol: "https", host: "dev.azure.com" }, { GITHUB_FIX_BUGS_TOKEN: "x" }), "");
  // The GitHub token never answers an Azure host, and the reverse.
  assert.ok(!answerFor({ protocol: "https", host: "dev.azure.com" }, env).includes("ghp_"));
  assert.ok(!answerFor({ protocol: "https", host: "github.com" }, env).includes("adopat"));
});

test("a port on the host does not unpin it", () => {
  assert.match(answerFor({ protocol: "https", host: "github.com:443" }, env), /x-access-token/);
  assert.equal(answerFor({ protocol: "https", host: "evil.example:443" }, env), "");
});

test("the git credential protocol is parsed line by line", () => {
  assert.deepEqual(parseCredentialInput("protocol=https\r\nhost=github.com\npath=a/b.git\n\n"), { protocol: "https", host: "github.com", path: "a/b.git" });
});

test("as a process: get answers on stdout, store and erase print nothing", () => {
  const run = (action, input) => spawnSync(process.execPath, [HELPER, action], { input, env: { ...process.env, ...env }, encoding: "utf8" });
  assert.match(run("get", "protocol=https\nhost=github.com\n\n").stdout, /password=ghp_TESTTOKEN/);
  assert.equal(run("get", "protocol=https\nhost=evil.example\n\n").stdout, "");
  assert.equal(run("store", "protocol=https\nhost=github.com\nusername=u\npassword=p\n\n").stdout, "");
  assert.equal(run("erase", "protocol=https\nhost=github.com\n\n").stdout, "");
});
