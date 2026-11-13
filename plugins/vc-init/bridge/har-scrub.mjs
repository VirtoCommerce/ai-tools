/**
 * bridge/har-scrub.mjs — take the login passwords out of a Playwright lane's HAR file.
 *
 * A lane types a password by NAME and Playwright MCP masks the value in every tool response — but the
 * lane's `recordHar` (`content: "embed"`) still writes the request the page sent, and a sign-in request
 * carries the password in its body: the Admin SPA's `POST /api/platform/security/login` (JSON
 * `password`) and the storefront's `POST /connect/token` (form `grant_type=password&…&password=`).
 * Measured 2026-11-13 on the chrome and firefox lanes: the value sat in `session.har` in plain text.
 * The HAR stays — the repo rule is "always capture HAR" — and only the secrets leave it.
 *
 * Two passes over every request/page record of the HAR (`log.entries[]`, `log.pages[]`):
 *   1. by FIELD NAME, without knowing any value: a request body field or form parameter named like a
 *      password (`password`, `newPassword`, `client_secret`, …) gets MASK — JSON bodies at any depth,
 *      form-urlencoded bodies and their `params[]`, multipart parts;
 *   2. by VALUE: every known secret (what the bridge handed the lane, or the lane's env files) is masked
 *      wherever it appears — URL, header, response body — in each spelling `redact.mjs` knows. Forms
 *      shorter than MIN_FORM characters are skipped here: a short value would also match unrelated text
 *      and mangle a capture; pass 1 still covers a short password in a sign-in body.
 *
 * Playwright writes the HAR in one go when the browser context closes (`browser_close`, or the server
 * shutting down), so a scrub runs after that write and never during it: a file that does not end as
 * complete JSON is reported `incomplete` and left alone. Lane HARs reach hundreds of MB, so the file is
 * streamed: a JSON scanner splits it into its records and only a record that mentions both `postData`
 * and a password-like name is parsed. A first pass only counts; only a file with something to mask is
 * written again (temp file + rename), and the rename is dropped when the HAR changed since it was read
 * (Playwright rewrote it, or another scrubber got there first). A `.har-scrub.json` stamp beside the HAR
 * remembers the size and mtime of the last scrubbed version and a tag of each value it was scrubbed with,
 * so a file is scanned again only when it changed or a scrubber knows a value it was not scrubbed with
 * (the hook knows the env files' values, the bridge also those in vc-secrets). The tag is an HMAC keyed
 * with a key kept in the plugin's data folder, never beside the HAR: a stamp copied along with a HAR
 * must not let anyone test a guessed password against it offline.
 */
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync, watch as fsWatch } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { MASK, redactText, secretForms } from "./redact.mjs";

/** A body field or form parameter whose value is a password. */
export const FIELD_RE = /pass(?:word|wd)|^pwd$|^client_secret$/i;
/** Shortest spelling of a known value masked by pass 2. */
export const MIN_FORM = 6;
const HINT_RE = /pass(?:word|wd)|pwd|client_secret/i;
const STAMP = ".har-scrub.json";

/** The spellings pass 2 masks, longest first. Pure. */
export function harForms(secrets) {
  const all = new Set();
  for (const s of secrets || []) {
    // A form body spells the value as URLSearchParams does: `+` for a space, `!'()~` escaped too.
    const form = new URLSearchParams({ v: String(s ?? "") }).toString().slice(2);
    for (const f of [...secretForms(s), ...(s && form !== String(s) ? [form] : [])]) {
      if (f.length < MIN_FORM) continue;
      all.add(f);
      // A value inside a JSON body that is itself a HAR string is escaped twice.
      const twice = JSON.stringify(f).slice(1, -1);
      if (twice !== f) all.add(twice);
    }
  }
  return [...all].sort((a, b) => b.length - a.length);
}

function maskJson(node) {
  let n = 0;
  if (Array.isArray(node)) {
    for (const v of node) n += maskJson(v);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (((typeof v === "string" && v && v !== MASK) || typeof v === "number") && FIELD_RE.test(k)) {
        node[k] = MASK;
        n++;
      } else n += maskJson(v);
    }
  }
  return n;
}

function decodeForm(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** Mask password-named fields in a request body text. Pure. @returns {{ text: string, masked: number }} */
export function maskBodyText(text, mimeType = "") {
  const t = String(text ?? "");
  const trimmed = t.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const body = JSON.parse(t);
      const masked = maskJson(body);
      return masked ? { text: JSON.stringify(body), masked } : { text: t, masked: 0 };
    } catch {
      /* not JSON after all — try the other shapes */
    }
  }
  if (/multipart\/form-data/i.test(mimeType) || /name="[^"]+"\r?\n/.test(t)) {
    let masked = 0;
    const out = t.replace(/(name="([^"]+)"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n)([^\r\n]*)/g, (all, head, name, value) => {
      if (!value || value === MASK || !FIELD_RE.test(name)) return all;
      masked++;
      return head + MASK;
    });
    if (masked) return { text: out, masked };
  }
  if (/x-www-form-urlencoded/i.test(mimeType) || /^[^=&\s]+=[^&]*(?:&[^=&\s]+=[^&]*)*$/.test(t)) {
    let masked = 0;
    const out = t
      .split("&")
      .map((part) => {
        const eq = part.indexOf("=");
        if (eq < 0) return part;
        const value = part.slice(eq + 1);
        if (!value || value === MASK || !FIELD_RE.test(decodeForm(part.slice(0, eq)))) return part;
        masked++;
        return `${part.slice(0, eq)}=${MASK}`;
      })
      .join("&");
    return { text: out, masked };
  }
  return { text: t, masked: 0 };
}

/** Pass 1 on one HAR entry, in place. @returns {number} fields masked */
export function maskEntry(entry) {
  const pd = entry?.request?.postData;
  if (!pd) return 0;
  let n = 0;
  for (const p of Array.isArray(pd.params) ? pd.params : []) {
    if (p && typeof p.value === "string" && p.value && p.value !== MASK && FIELD_RE.test(String(p.name))) {
      p.value = MASK;
      n++;
    }
  }
  if (typeof pd.text === "string" && pd.text) {
    const r = maskBodyText(pd.text, pd.mimeType);
    if (r.masked) {
      pd.text = r.text;
      n += r.masked;
    }
  }
  return n;
}

const countMasks = (t) => t.split(MASK).length - 1;

function maskForms(text, forms) {
  const out = redactText(text, forms);
  return { text: out, masked: out === text ? 0 : countMasks(out) - countMasks(text) };
}

/** Both passes over one serialized HAR record. Pure. @returns {{ text: string, masked: number }} */
export function scrubRecord(text, forms = []) {
  let out = text;
  let masked = 0;
  if (out.includes('"postData"') && HINT_RE.test(out)) {
    try {
      const entry = JSON.parse(out);
      const n = maskEntry(entry);
      if (n) {
        out = JSON.stringify(entry);
        masked += n;
      }
    } catch {
      /* not a whole record — leave it to pass 2 */
    }
  }
  const r = maskForms(out, forms);
  return { text: r.text, masked: masked + r.masked };
}

/**
 * The streaming half: feed the HAR text in any chunks, get the scrubbed text back. It tracks JSON
 * string and nesting state only, and hands each object directly inside an array of the `log` object
 * (`log.entries[i]`, `log.pages[i]`) to scrubRecord whole; everything around them passes through.
 */
export function createHarScrubber(forms = []) {
  const stack = [];
  let inStr = false;
  let esc = false;
  let rec = null;
  let masked = 0;
  return {
    push(chunk) {
      let out = "";
      let from = 0;
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk.charCodeAt(i);
        if (inStr) {
          if (esc) esc = false;
          else if (c === 92) esc = true;
          else if (c === 34) inStr = false;
          continue;
        }
        if (c === 34) inStr = true;
        else if (c === 123 || c === 91) {
          if (c === 123 && rec === null && stack.length === 3 && stack[0] === 123 && stack[1] === 123 && stack[2] === 91) {
            out += chunk.slice(from, i);
            from = i;
            rec = [];
          }
          stack.push(c);
        } else if (c === 125 || c === 93) {
          stack.pop();
          if (rec !== null && stack.length === 3) {
            rec.push(chunk.slice(from, i + 1));
            from = i + 1;
            const r = scrubRecord(rec.join(""), forms);
            masked += r.masked;
            out += r.text;
            rec = null;
          }
        }
      }
      if (rec !== null) rec.push(chunk.slice(from));
      else out += chunk.slice(from);
      return out;
    },
    /** Whether the text seen so far was one complete JSON value, and how many values were masked. */
    end() {
      return { complete: stack.length === 0 && !inStr && rec === null, masked };
    },
  };
}

/** Scrub a whole HAR text at once. Pure. @returns {{ text: string, masked: number, complete: boolean }} */
export function scrubHarText(text, secrets = []) {
  const s = createHarScrubber(harForms(secrets));
  const out = s.push(String(text));
  return { text: out, ...s.end() };
}

function stampPath(file) {
  return join(dirname(file), STAMP);
}

function readStampFile(file) {
  try {
    const j = JSON.parse(readFileSync(stampPath(file), "utf8"));
    // v2: tags keyed outside the HAR folder. An older stamp (a salt beside its tags) is dropped whole.
    if (j && j.v === 2 && j.files && typeof j.files === "object") return j;
  } catch {
    /* none yet, or unreadable — start over */
  }
  return { v: 2, files: {} };
}

/** Where the tag key lives: vc-init's data folder (`$VC_RUN` lives there too), never a HAR folder. */
export function tagKeyFile(env = process.env) {
  return join(env.HOME || homedir(), ".claude", "plugins", "data", "vc-init-ai-tools", "har-scrub.key");
}

let cachedKey;
/** The machine's tag key, created on first use; null when it cannot be read or written. */
function tagKey() {
  const file = tagKeyFile();
  if (cachedKey?.file === file) return cachedKey.key;
  let key = null;
  for (let attempt = 0; attempt < 2 && !key; attempt++) {
    try {
      const k = readFileSync(file, "utf8").trim();
      if (/^[0-9a-f]{64}$/.test(k)) key = k;
      else break;
    } catch {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
      } catch {
        /* another scrubber created it first (read it again), or the folder is not writable */
      }
    }
  }
  cachedKey = { file, key };
  return key;
}

/**
 * A tag per value pass 2 can use, keyed with the machine's key: tells "scrubbed with this value" apart,
 * and is useless to anyone holding only the HAR folder. No key ⇒ null, and no file counts as scrubbed with
 * a value (a re-scan costs time, never a secret).
 */
function tagsFor(secrets) {
  const vals = [...new Set((secrets || []).filter((v) => harForms([v]).length))];
  if (!vals.length) return [];
  const key = tagKey();
  if (!key) return null;
  return vals.map((v) => createHmac("sha256", key).update(String(v)).digest("hex").slice(0, 16));
}

const sameStat = (a, b) => !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs;

function statOrNull(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

/** The tags a file's stamp carries, if the stamp describes `st` (the version about to be read). */
function carriedTags(file, st) {
  const entry = readStampFile(file).files[basename(file)];
  return sameStat(entry, st) && Array.isArray(entry.tags) ? entry.tags : [];
}

function writeStamp(file, secrets, carried) {
  try {
    const st = statSync(file);
    const stamp = readStampFile(file);
    const tags = [...new Set([...carried, ...(tagsFor(secrets) || [])])];
    stamp.files[basename(file)] = { size: st.size, mtimeMs: st.mtimeMs, tags };
    writeFileSync(stampPath(file), JSON.stringify(stamp, null, 2));
  } catch {
    /* a missing stamp only costs a re-scan */
  }
}

/** Whether `file` is unchanged since a scrub that knew every one of `secrets`. */
export function isStamped(file, secrets = []) {
  const st = statOrNull(file);
  const stamp = readStampFile(file);
  const entry = stamp.files[basename(file)];
  if (!st || !sameStat(entry, st)) return false;
  const have = new Set(Array.isArray(entry.tags) ? entry.tags : []);
  const want = tagsFor(secrets);
  return want !== null && want.every((t) => have.has(t));
}

/** Rename `tmp` over `file` unless `file` changed since `before`. @returns {boolean} whether it was replaced */
function replace(tmp, file, before) {
  for (let attempt = 0; ; attempt++) {
    // Checked again before every attempt: Playwright may write a new HAR while a retry waits, and the
    // scrubbed old one must not overwrite it.
    if (!sameStat(statOrNull(file), before)) return false;
    try {
      renameSync(tmp, file);
      return true;
    } catch (e) {
      // Windows: a reader holding the file open makes the rename fail for a moment.
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      const until = Date.now() + 100 * (attempt + 1);
      while (Date.now() < until) {
        /* short synchronous back-off; this also runs in an exit handler */
      }
    }
  }
}

/** Temp files of scrubs in flight in this process — an exit handler removes what they leave. */
const activeTmps = new Set();
const dropTmp = (tmp) => {
  activeTmps.delete(tmp);
  try { unlinkSync(tmp); } catch { /* already gone, or renamed */ }
};
const tmpFor = (file) => {
  const tmp = `${file}.${process.pid}.${Date.now()}.scrub.tmp`;
  activeTmps.add(tmp);
  return tmp;
};
const TMP_RE = /\.scrub\.tmp$/;

/** The outcome once the file has been read (and, when something was masked, rewritten into `tmp`). */
function settle(file, tmp, result, before, secrets, carried) {
  if (!result.complete) {
    if (tmp) dropTmp(tmp);
    return { status: "incomplete", masked: 0 };
  }
  // Rewritten since it was read: Playwright wrote a new HAR, or another scrubber replaced it.
  if (!sameStat(statOrNull(file), before)) {
    if (tmp) dropTmp(tmp);
    return { status: "changed", masked: 0 };
  }
  if (!result.masked) {
    if (tmp) dropTmp(tmp);
    writeStamp(file, secrets, carried);
    return { status: "clean", masked: 0 };
  }
  if (!replace(tmp, file, before)) {
    dropTmp(tmp);
    return { status: "changed", masked: 0 };
  }
  activeTmps.delete(tmp);
  writeStamp(file, secrets, carried);
  return { status: "scrubbed", masked: result.masked };
}

/**
 * Scrub one HAR file in place (streamed): a counting pass, then a writing pass only when there is
 * something to mask.
 * @returns {Promise<{ status: "missing"|"skipped"|"incomplete"|"changed"|"clean"|"scrubbed"|"error", masked: number, error?: string }>}
 */
export async function scrubHarFile(file, { secrets = [], force = false, highWaterMark = 1 << 22 } = {}) {
  if (!existsSync(file)) return { status: "missing", masked: 0 };
  if (!force && isStamped(file, secrets)) return { status: "skipped", masked: 0 };
  const forms = harForms(secrets);
  let tmp;
  try {
    const before = statSync(file);
    const carried = carriedTags(file, before);
    const count = createHarScrubber(forms);
    for await (const chunk of createReadStream(file, { encoding: "utf8", highWaterMark })) count.push(chunk);
    const counted = count.end();
    if (!counted.complete || !counted.masked) return settle(file, null, counted, before, secrets, carried);
    tmp = tmpFor(file);
    const s = createHarScrubber(forms);
    const out = createWriteStream(tmp, { encoding: "utf8" });
    const done = new Promise((ok, fail) => {
      out.on("finish", ok);
      out.on("error", fail);
    });
    done.catch(() => {}); // a write error is returned below, never left unhandled
    for await (const chunk of createReadStream(file, { encoding: "utf8", highWaterMark })) {
      const text = s.push(chunk);
      // An error already emitted never brings 'drain': race the wait against the stream's outcome.
      if (text && !out.write(text)) await Promise.race([once(out, "drain"), done]);
    }
    out.end();
    await done;
    return settle(file, tmp, s.end(), before, secrets, carried);
  } catch (e) {
    if (tmp) dropTmp(tmp);
    return { status: "error", masked: 0, error: e.message };
  }
}

function readEachSync(file, chunkBytes, fn) {
  const decoder = new StringDecoder("utf8");
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(chunkBytes);
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      fn(decoder.write(buf.subarray(0, n)));
    }
    fn(decoder.end());
  } finally {
    closeSync(fd);
  }
}

/** The same, synchronously — for a process `exit` handler and the hook, where nothing asynchronous runs. */
export function scrubHarFileSync(file, { secrets = [], force = false, chunkBytes = 1 << 22 } = {}) {
  if (!existsSync(file)) return { status: "missing", masked: 0 };
  if (!force && isStamped(file, secrets)) return { status: "skipped", masked: 0 };
  const forms = harForms(secrets);
  let tmp;
  let fout;
  try {
    const before = statSync(file);
    const carried = carriedTags(file, before);
    const count = createHarScrubber(forms);
    readEachSync(file, chunkBytes, (t) => count.push(t));
    const counted = count.end();
    if (!counted.complete || !counted.masked) return settle(file, null, counted, before, secrets, carried);
    tmp = tmpFor(file);
    fout = openSync(tmp, "w");
    const s = createHarScrubber(forms);
    readEachSync(file, chunkBytes, (t) => {
      const text = s.push(t);
      if (text) writeSync(fout, text);
    });
    closeSync(fout);
    fout = undefined;
    return settle(file, tmp, s.end(), before, secrets, carried);
  } catch (e) {
    if (fout !== undefined) try { closeSync(fout); } catch { /* closed */ }
    if (tmp) dropTmp(tmp);
    return { status: "error", masked: 0, error: e.message };
  }
}

/** Remove `*.scrub.tmp` files older than `maxAgeMs` beside the given HAR paths — left by a scrub cut short. */
export function sweepStaleTmp(harPaths, maxAgeMs = 10 * 60 * 1000) {
  let removed = 0;
  for (const dir of new Set(harPaths.map((p) => dirname(p)))) {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of names) {
      if (!TMP_RE.test(f)) continue;
      const st = statOrNull(join(dir, f));
      if (!st || Date.now() - st.mtimeMs < maxAgeMs) continue;
      try {
        unlinkSync(join(dir, f));
        removed++;
      } catch {
        /* in use — next time */
      }
    }
  }
  return removed;
}

/** `recordHar.path` of a Playwright MCP config file, absolute (relative paths resolve against `cwd`), or null. */
export function configHarPath(configFile, cwd = process.cwd()) {
  try {
    const cfg = JSON.parse(readFileSync(resolve(cwd, configFile), "utf8"));
    const p = cfg?.browser?.contextOptions?.recordHar?.path;
    return typeof p === "string" && p ? (isAbsolute(p) ? p : resolve(cwd, p)) : null;
  } catch {
    return null;
  }
}

/** `--config <file>` / `--config=<file>` in a lane's CLI args, or null. Pure. */
export function configArg(args) {
  for (let i = 0; i < (args || []).length; i++) {
    if (args[i] === "--config") return args[i + 1] ?? null;
    if (String(args[i]).startsWith("--config=")) return args[i].slice("--config=".length);
  }
  return null;
}

/** Every `*.har` in the directories of the given HAR paths (the lane's own file and any sibling). */
export function harFilesIn(paths) {
  const out = new Set();
  for (const p of paths) {
    const dir = dirname(p);
    try {
      for (const f of readdirSync(dir)) if (f.endsWith(".har")) out.add(join(dir, f));
    } catch {
      /* no directory yet — nothing recorded */
    }
  }
  return [...out];
}

/**
 * Keep a running lane's HAR directory scrubbed: once now, after every write Playwright finishes there
 * (a `browser_close`), and synchronously at exit (the server's own shutdown writes the last HAR).
 * @returns {{ close(): void }}
 */
export function watchHarDirs(harPaths, { secrets = [], watch = fsWatch, onResult = () => {}, settleMs = 300 } = {}) {
  const timers = new Map();
  const running = new Set();
  const schedule = (file, tries = 0) => {
    clearTimeout(timers.get(file));
    const t = setTimeout(() => {
      timers.delete(file);
      run(file, tries);
    }, settleMs);
    t.unref?.();
    timers.set(file, t);
  };
  const run = (file, tries = 0) => {
    if (running.has(file)) return schedule(file, tries);
    running.add(file);
    scrubHarFile(file, { secrets }).then((r) => {
      running.delete(file);
      onResult(file, r);
      // Playwright is still writing it, or it changed under the scrub: look again, a bounded number of times.
      if ((r.status === "incomplete" || r.status === "changed") && tries < 20) schedule(file, tries + 1);
    });
  };
  sweepStaleTmp(harPaths);
  for (const f of harFilesIn(harPaths)) run(f);
  const watchers = [];
  for (const dir of new Set(harPaths.map((p) => dirname(p)))) {
    try {
      mkdirSync(dir, { recursive: true });
      const w = watch(dir, (_event, name) => {
        const files = name ? [join(dir, String(name))] : harFilesIn([join(dir, "x.har")]);
        for (const f of files) if (f.endsWith(".har")) schedule(f);
      });
      w?.unref?.();
      if (w) watchers.push(w);
    } catch {
      /* no watcher — the start and exit scrubs still run */
    }
  }
  const atExit = () => {
    for (const t of timers.values()) clearTimeout(t);
    // An async scrub cut short by the exit leaves its temp file; the sync scrub below redoes its work.
    for (const tmp of [...activeTmps]) dropTmp(tmp);
    for (const f of harFilesIn(harPaths)) onResult(f, scrubHarFileSync(f, { secrets }));
  };
  process.on("exit", atExit);
  return {
    close() {
      process.off("exit", atExit);
      for (const t of timers.values()) clearTimeout(t);
      for (const w of watchers) w.close?.();
    },
  };
}

/**
 * A project's lane HAR paths and the password values its env files hold — for a lane that does NOT run
 * through this bridge (`.mcp.json` option A: `npx @playwright/mcp … --secrets .env.playwright.local`),
 * which nothing scrubs in-process. Lanes: `config/mcp-playwright-*.config.json`; values: every
 * password-named key of `.env.playwright.*` and `.env.local` (any env's suffix).
 * @returns {{ harPaths: string[], secrets: string[] }}
 */
export function projectHarTargets(root, { passwordValues }) {
  const harPaths = [];
  try {
    for (const f of readdirSync(join(root, "config"))) {
      if (!/^mcp-playwright-[a-z0-9-]+\.config\.json$/.test(f)) continue;
      const p = configHarPath(join(root, "config", f), root);
      if (p) harPaths.push(p);
    }
  } catch {
    /* no config/ — no project lane configs */
  }
  const secrets = new Set();
  let names = [];
  try {
    names = readdirSync(root).filter((f) => /^\.env\.playwright\.[\w.-]+$/.test(f) || f === ".env.local");
  } catch {
    /* unreadable root */
  }
  for (const f of names) {
    try {
      for (const v of passwordValues(readFileSync(join(root, f), "utf8"))) secrets.add(v);
    } catch {
      /* unreadable file — pass 1 still runs */
    }
  }
  return { harPaths, secrets: [...secrets] };
}
