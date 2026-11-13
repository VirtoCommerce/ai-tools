// The lane HAR scrub (bridge/har-scrub.mjs): a sign-in request's password leaves the HAR, everything else
// stays byte for byte. The two login surfaces measured 2026-11-13 are the fixtures: the Admin SPA's JSON
// `POST /api/platform/security/login/` and the storefront's form `POST /connect/token`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configArg, configHarPath, createHarScrubber, harFilesIn, harForms, projectHarTargets, scrubHarFile, scrubHarFileSync, scrubHarText, watchHarDirs } from "./har-scrub.mjs";
import { MASK } from "./redact.mjs";
import { envFilePasswordValues } from "../skills/project-init/lib/passwords.mjs";

const PW = "S3cr3t-pw\"!"; // a quote, to exercise the escaped spellings
const STOREFRONT_PW = "Shop+Pass 9";

function entry(method, url, extra = {}) {
  return {
    startedDateTime: "2026-11-13T12:00:00.000Z",
    time: 12,
    request: { method, url, httpVersion: "HTTP/1.1", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0, ...extra.request },
    response: { status: 200, statusText: "OK", httpVersion: "HTTP/1.1", headers: [], cookies: [], content: { size: 0, mimeType: "text/plain", text: "ok" }, redirectURL: "", headersSize: -1, bodySize: 0, ...extra.response },
    cache: {},
    timings: { send: 0, wait: 1, receive: 1 },
  };
}

const adminLogin = entry("POST", "https://stand.example/api/platform/security/login/", {
  request: { postData: { mimeType: "application/json;charset=UTF-8", text: JSON.stringify({ userName: "admin", password: PW, rememberMe: false }) } },
});
const storefrontLogin = entry("POST", "https://stand.example/connect/token", {
  request: {
    postData: {
      mimeType: "application/x-www-form-urlencoded",
      text: `grant_type=password&storeId=B2B-store&username=user%40example.com&password=${encodeURIComponent(STOREFRONT_PW)}`,
      params: [
        { name: "grant_type", value: "password" },
        { name: "username", value: "user@example.com" },
        { name: "password", value: encodeURIComponent(STOREFRONT_PW) },
      ],
    },
  },
});
const changePassword = entry("POST", "https://stand.example/graphql", {
  request: { postData: { mimeType: "application/json", text: JSON.stringify({ operationName: "ChangePassword", variables: { command: { oldPassword: "old-one", newPassword: "new-one" } } }) } },
});
const oauthCode = entry("GET", "https://stand.example/callback?code=abc123&state=xyz");
// A response that echoes the admin password (a debug page, an error that quotes the request): pass 2.
const echo = entry("GET", "https://stand.example/echo", { response: { content: { size: 10, mimeType: "text/plain", text: `you sent ${PW}` } } });

function har(entries) {
  // The shape Playwright writes: one line, pages before entries.
  return JSON.stringify({ log: { version: "1.2", creator: { name: "Playwright", version: "1.64" }, browser: { name: "chromium", version: "1" }, pages: [{ id: "page@1", title: "Sign in" }], entries } });
}

test("the admin JSON sign-in and the storefront form sign-in lose their passwords, nothing else", () => {
  const input = har([adminLogin, storefrontLogin, oauthCode]);
  const { text, masked, complete } = scrubHarText(input, []);
  assert.equal(complete, true);
  assert.equal(masked, 3); // admin body, storefront body, storefront params
  const out = JSON.parse(text).log.entries;
  assert.deepEqual(JSON.parse(out[0].request.postData.text), { userName: "admin", password: MASK, rememberMe: false });
  assert.equal(out[1].request.postData.text, `grant_type=password&storeId=B2B-store&username=user%40example.com&password=${MASK}`);
  assert.deepEqual(out[1].request.postData.params.map((p) => p.value), ["password", "user@example.com", MASK]);
  // The record with no secret is untouched, byte for byte — the OAuth code a tester reads stays.
  assert.ok(text.includes(JSON.stringify(oauthCode)));
  assert.ok(!text.includes(encodeURIComponent(STOREFRONT_PW)));
});

test("a password-named field at any depth of a JSON body is masked; a non-string one is kept", () => {
  const flag = entry("POST", "https://stand.example/api/x", { request: { postData: { mimeType: "application/json", text: JSON.stringify({ passwordExpired: true, user: { password: "" } }) } } });
  const { text, masked } = scrubHarText(har([changePassword, flag]), []);
  assert.equal(masked, 2);
  const [cp, fl] = JSON.parse(text).log.entries;
  assert.deepEqual(JSON.parse(cp.request.postData.text).variables.command, { oldPassword: MASK, newPassword: MASK });
  assert.deepEqual(JSON.parse(fl.request.postData.text), { passwordExpired: true, user: { password: "" } });
});

test("a known value is masked wherever it appears, and a second scrub changes nothing", () => {
  const first = scrubHarText(har([adminLogin, echo]), [PW]);
  assert.ok(!first.text.includes(PW) && !first.text.includes(JSON.stringify(PW).slice(1, -1)));
  assert.equal(JSON.parse(first.text).log.entries[1].response.content.text, `you sent ${MASK}`);
  const second = scrubHarText(first.text, [PW]);
  assert.equal(second.masked, 0);
  assert.equal(second.text, first.text);
});

test("a short known value is not used to mask the whole capture", () => {
  assert.deepEqual(harForms(["admin"]).filter((f) => f === "admin"), []);
  const { text } = scrubHarText(har([oauthCode]), ["admin"]);
  assert.ok(text.includes(JSON.stringify(oauthCode)));
});

test("streaming in tiny chunks gives the same file as one pass", () => {
  const input = har([adminLogin, storefrontLogin, changePassword, echo, oauthCode]);
  const whole = scrubHarText(input, [PW, STOREFRONT_PW]);
  const s = createHarScrubber(harForms([PW, STOREFRONT_PW]));
  let out = "";
  for (let i = 0; i < input.length; i += 7) out += s.push(input.slice(i, i + 7));
  assert.equal(out, whole.text);
  assert.deepEqual(s.end(), { complete: true, masked: whole.masked });
});

function tmpHar(text) {
  const dir = mkdtempSync(join(tmpdir(), "har-scrub-"));
  const file = join(dir, "session.har");
  writeFileSync(file, text);
  return { dir, file };
}

test("the file is rewritten in place, stamped, and skipped while unchanged (async and sync agree)", async () => {
  const input = har([adminLogin, storefrontLogin, echo]);
  const a = tmpHar(input);
  const b = tmpHar(input);
  const ra = await scrubHarFile(a.file, { secrets: [PW], highWaterMark: 64 });
  const rb = scrubHarFileSync(b.file, { secrets: [PW], chunkBytes: 64 });
  assert.equal(ra.status, "scrubbed");
  assert.deepEqual(rb, ra);
  const scrubbed = readFileSync(a.file, "utf8");
  assert.equal(readFileSync(b.file, "utf8"), scrubbed);
  assert.ok(!scrubbed.includes(PW) && !scrubbed.includes(encodeURIComponent(STOREFRONT_PW)));
  assert.equal(JSON.parse(scrubbed).log.entries.length, 3);
  assert.equal((await scrubHarFile(a.file, { secrets: [PW] })).status, "skipped");
  assert.equal((await scrubHarFile(a.file, { secrets: [PW], force: true })).status, "clean");
  // No temp file is left behind.
  assert.deepEqual(harFilesIn([a.file]), [a.file]);
});

test("a HAR still being written is left alone", async () => {
  const input = har([adminLogin]);
  const { file } = tmpHar(input.slice(0, -10));
  assert.equal((await scrubHarFile(file, { secrets: [PW] })).status, "incomplete");
  assert.equal(readFileSync(file, "utf8"), input.slice(0, -10));
  assert.equal(scrubHarFileSync(file, { secrets: [PW] }).status, "incomplete");
  assert.equal((await scrubHarFile(join(tmpdir(), "no-such-dir-x", "session.har"))).status, "missing");
});

test("the lane's HAR path comes from its --config, and a project's from config/ + its env files", () => {
  const root = mkdtempSync(join(tmpdir(), "har-proj-"));
  mkdirSync(join(root, "config"));
  const cfg = { browser: { contextOptions: { recordHar: { path: "./test-results/chrome/har/session.har", content: "embed" } } } };
  writeFileSync(join(root, "config", "mcp-playwright-chrome.config.json"), JSON.stringify(cfg));
  writeFileSync(join(root, "config", "mcp-playwright-edge.config.json"), JSON.stringify({ browser: {} }));
  writeFileSync(join(root, ".env.playwright.all"), `ADMIN_PASSWORD_VCST=${"from-all-file"}\nADMIN_LOGIN=admin\n`);
  writeFileSync(join(root, ".env.local"), `USER_PASSWORD=from-local-file\nGITHUB_TOKEN=not-a-password\n`);
  const har = join(root, "test-results", "chrome", "har", "session.har");
  assert.equal(configArg(["--browser", "chromium", "--config", "c.json"]), "c.json");
  assert.equal(configArg(["--config=c.json"]), "c.json");
  assert.equal(configArg(["--isolated"]), null);
  assert.equal(configHarPath(join("config", "mcp-playwright-chrome.config.json"), root), har);
  assert.equal(configHarPath(join("config", "mcp-playwright-edge.config.json"), root), null);
  const t = projectHarTargets(root, { passwordValues: envFilePasswordValues });
  assert.deepEqual(t.harPaths, [har]);
  assert.deepEqual(t.secrets.sort(), ["from-all-file", "from-local-file"]);
  assert.equal(existsSync(har), false);
  assert.deepEqual(harFilesIn(t.harPaths), []);
});

test("a running lane scrubs the HAR left from before, and the one Playwright writes at browser_close", async () => {
  const dir = mkdtempSync(join(tmpdir(), "har-watch-"));
  const file = join(dir, "har", "session.har");
  mkdirSync(join(dir, "har"));
  writeFileSync(file, har([adminLogin]));
  const seen = [];
  let fire;
  const lane = watchHarDirs([file], { secrets: [PW], settleMs: 5, watch: (_d, cb) => ((fire = cb), { close() {} }), onResult: (f, r) => seen.push(r.status) });
  const until = async (pred) => { for (let i = 0; i < 200 && !pred(); i++) await new Promise((r) => setTimeout(r, 10)); };
  await until(() => seen.includes("scrubbed"));
  assert.ok(!readFileSync(file, "utf8").includes(PW));
  // browser_close: Playwright writes the file in pieces; the half-written state is left alone, the whole one is scrubbed.
  const next = har([storefrontLogin, echo]);
  writeFileSync(file, next.slice(0, 50));
  fire("change", "session.har");
  await until(() => seen.includes("incomplete"));
  writeFileSync(file, next);
  fire("change", "session.har");
  await until(() => seen.filter((x) => x === "scrubbed").length === 2);
  lane.close();
  const out = readFileSync(file, "utf8");
  assert.ok(!out.includes(PW) && !out.includes(encodeURIComponent(STOREFRONT_PW)));
});
