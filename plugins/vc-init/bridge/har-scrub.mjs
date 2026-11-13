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
 * and a password-like name is parsed. The result replaces the file through a temp file + rename, only
 * when something was masked. A `.har-scrub.json` stamp beside the HAR remembers the size and mtime of the
 * last scrubbed version, so an unchanged file is not scanned again.
 */
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync, watch as fsWatch } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { MASK, secretForms } from "./redact.mjs";

/** A body field or form parameter whose value is a password. */
export const FIELD_RE = /pass(?:word|wd)|^pwd$|^client_secret$/i;
/** Shortest spelling of a known value masked by pass 2. */
export const MIN_FORM = 6;
const HINT_RE = /pass(?:word|wd)|pwd|client_secret/i;
const STAMP = ".har-scrub.json";

/** The spellings pass 2 masks, longest first. Pure. */
export function harForms(secrets) {
  const all = new Set();
  for (const s of secrets || []) for (const f of secretForms(s)) if (f.length >= MIN_FORM) all.add(f);
  return [...all].sort((a, b) => b.length - a.length);
}

function maskJson(node) {
  let n = 0;
  if (Array.isArray(node)) {
    for (const v of node) n += maskJson(v);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && v && v !== MASK && FIELD_RE.test(k)) {
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

function maskForms(text, forms) {
  let out = text;
  let n = 0;
  for (const f of forms) {
    if (!out.includes(f)) continue;
    const parts = out.split(f);
    n += parts.length - 1;
    out = parts.join(MASK);
  }
  return { text: out, masked: n };
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

function readStamps(file) {
  try {
    return JSON.parse(readFileSync(stampPath(file), "utf8")) || {};
  } catch {
    return {};
  }
}

function writeStamp(file) {
  try {
    const st = statSync(file);
    const stamps = readStamps(file);
    stamps[basename(file)] = { size: st.size, mtimeMs: st.mtimeMs };
    writeFileSync(stampPath(file), JSON.stringify(stamps, null, 2));
  } catch {
    /* a missing stamp only costs a re-scan */
  }
}

/** Whether `file` is unchanged since its last scrub. */
export function isStamped(file) {
  try {
    const st = statSync(file);
    const s = readStamps(file)[basename(file)];
    return !!s && s.size === st.size && s.mtimeMs === st.mtimeMs;
  } catch {
    return false;
  }
}

function replace(tmp, file) {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, file);
      return;
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

function settle(file, tmp, result) {
  if (!result.complete) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    return { status: "incomplete", masked: 0 };
  }
  if (!result.masked) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    writeStamp(file);
    return { status: "clean", masked: 0 };
  }
  replace(tmp, file);
  writeStamp(file);
  return { status: "scrubbed", masked: result.masked };
}

const tmpFor = (file) => `${file}.${process.pid}.${Date.now()}.scrub.tmp`;

/**
 * Scrub one HAR file in place (streamed).
 * @returns {Promise<{ status: "missing"|"skipped"|"incomplete"|"clean"|"scrubbed"|"error", masked: number, error?: string }>}
 */
export async function scrubHarFile(file, { secrets = [], force = false, highWaterMark = 1 << 22 } = {}) {
  if (!existsSync(file)) return { status: "missing", masked: 0 };
  if (!force && isStamped(file)) return { status: "skipped", masked: 0 };
  const tmp = tmpFor(file);
  const s = createHarScrubber(harForms(secrets));
  try {
    const out = createWriteStream(tmp, { encoding: "utf8" });
    const done = new Promise((ok, fail) => {
      out.on("finish", ok);
      out.on("error", fail);
    });
    for await (const chunk of createReadStream(file, { encoding: "utf8", highWaterMark })) {
      const text = s.push(chunk);
      if (text && !out.write(text)) await new Promise((ok) => out.once("drain", ok));
    }
    out.end();
    await done;
    return settle(file, tmp, s.end());
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* never created */ }
    return { status: "error", masked: 0, error: e.message };
  }
}

/** The same, synchronously — for a process `exit` handler, where nothing asynchronous runs. */
export function scrubHarFileSync(file, { secrets = [], force = false, chunkBytes = 1 << 22 } = {}) {
  if (!existsSync(file)) return { status: "missing", masked: 0 };
  if (!force && isStamped(file)) return { status: "skipped", masked: 0 };
  const tmp = tmpFor(file);
  const s = createHarScrubber(harForms(secrets));
  const decoder = new StringDecoder("utf8");
  let fin;
  let fout;
  try {
    fin = openSync(file, "r");
    fout = openSync(tmp, "w");
    const buf = Buffer.alloc(chunkBytes);
    for (;;) {
      const n = readSync(fin, buf, 0, buf.length, null);
      if (!n) break;
      const text = s.push(decoder.write(buf.subarray(0, n)));
      if (text) writeSync(fout, text);
    }
    const tail = s.push(decoder.end());
    if (tail) writeSync(fout, tail);
    closeSync(fin);
    closeSync(fout);
    fin = fout = undefined;
    return settle(file, tmp, s.end());
  } catch (e) {
    for (const fd of [fin, fout]) if (fd !== undefined) try { closeSync(fd); } catch { /* closed */ }
    try { unlinkSync(tmp); } catch { /* never created */ }
    return { status: "error", masked: 0, error: e.message };
  }
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
      // Playwright is still writing it: look again shortly, a bounded number of times.
      if (r.status === "incomplete" && tries < 20) schedule(file, tries + 1);
    });
  };
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
