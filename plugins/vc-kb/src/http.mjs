// One rule governs this file: an extractor that cannot reach a deployment reports SKIPPED and
// never PASS. So a transport failure is a distinct, typed thing that callers cannot mistake for
// an empty result -- "no documents" and "could not ask" must not look alike downstream.

export class Unreachable extends Error {
  constructor(url, cause) {
    super(`unreachable: ${url} (${cause})`);
    this.name = 'Unreachable';
    this.url = url;
    this.cause = cause;
  }
}

const TIMEOUT_MS = 30_000;

async function once(url, init) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function getText(url) {
  let r;
  try {
    r = await once(url);
  } catch (e) {
    throw new Unreachable(url, e.name === 'AbortError' ? `no response in ${TIMEOUT_MS}ms` : e.message);
  }
  if (!r.ok) throw new Unreachable(url, `HTTP ${r.status}`);
  return await r.text();
}

export async function getJson(url) {
  const text = await getText(url);
  try {
    return JSON.parse(text);
  } catch (e) {
    // A 200 carrying HTML is the shape a reverse proxy returns for a route that does not exist.
    // Treating it as an empty document would record "this module exposes nothing" as a fact.
    throw new Unreachable(url, `200 but not JSON (${e.message})`);
  }
}

export async function postJson(url, body, headers = {}) {
  let r;
  try {
    r = await once(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Unreachable(url, e.name === 'AbortError' ? `no response in ${TIMEOUT_MS}ms` : e.message);
  }
  const text = await r.text();
  if (!r.ok) throw new Unreachable(url, `HTTP ${r.status}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Unreachable(url, `200 but not JSON (${e.message})`);
  }
}

export async function postForm(url, fields) {
  const body = new URLSearchParams(fields).toString();
  let r;
  try {
    r = await once(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    throw new Unreachable(url, e.name === 'AbortError' ? `no response in ${TIMEOUT_MS}ms` : e.message);
  }
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* the caller decides whether that matters */ }
  return { ok: r.ok, status: r.status, json, text };
}
