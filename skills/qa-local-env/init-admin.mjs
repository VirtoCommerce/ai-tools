#!/usr/bin/env node
// init-admin.mjs — ensure the local platform's admin password is the QA value, idempotently.
//
// WHY
//   start-local seeds admin/store on a FRESH database. The QA convention is to change it to
//   Password1! after the first bring-up (or after a DB wipe). On a PRESERVED database the
//   password is already Password1!, so this must be a no-op there. Detection is auth-based and
//   therefore idempotent: try the new password first; only if that fails (→ still the seed
//   password) do we change it. After success the new password is written to .env.local so the
//   rest of the QA tooling (TEST_ENV=localhost) authenticates correctly.
//
// USAGE
//   node init-admin.mjs                       # back=localhost:8090, store→Password1!, write .env.local
//   node init-admin.mjs --back http://localhost:8090 --old store --new 'Password1!'
//   node init-admin.mjs --no-write-env        # change password but don't touch .env.local
//
//   --back <url>     platform base URL (default $BACK_URL or http://localhost:8090)
//   --user <name>    admin user name (default "admin")
//   --old <pw>       seed password (default "store")
//   --new <pw>       target password (default "Password1!")
//   --env-file <p>   .env file to upsert (default <repo>/.env.local)
//   --env-key <k>    key to upsert (default "ADMIN_PASSWORD_LOCALHOST")
//   --no-write-env   skip the .env.local upsert
//
// Exit 0 if the admin password ends up == --new (whether it already was, or we changed it).
// Zero dependencies, Node 18+ (global fetch).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function parseArgs(argv) {
  const o = {
    back: (process.env.BACK_URL || "http://localhost:8090").replace(/\/$/, ""),
    user: "admin", old: "store", new: "Password1!",
    envFile: resolve(REPO, ".env.local"), envKey: "ADMIN_PASSWORD_LOCALHOST", writeEnv: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--back") o.back = next().replace(/\/$/, "");
    else if (a === "--user") o.user = next();
    else if (a === "--old") o.old = next();
    else if (a === "--new") o.new = next();
    else if (a === "--env-file") o.envFile = resolve(next());
    else if (a === "--env-key") o.envKey = next();
    else if (a === "--no-write-env") o.writeEnv = false;
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return o;
}

// Local platform issues the password grant WITHOUT a client_id (see healthcheck.mjs).
async function getToken(back, user, pw) {
  try {
    const res = await fetch(`${back}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username: user, password: pw }),
    });
    if (res.status !== 200) return null;
    const j = await res.json();
    return j.access_token || null;
  } catch { return null; }
}

async function changePassword(back, token, user, oldPw, newPw) {
  const res = await fetch(`${back}/api/platform/security/users/${encodeURIComponent(user)}/changepassword`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* may be empty */ }
  return { ok: res.ok && (body?.succeeded !== false), status: res.status, body };
}

// Upsert KEY=VALUE in a .env file without clobbering other lines.
function upsertEnv(file, key, value) {
  const line = `${key}=${value}`;
  let lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const re = new RegExp(`^\\s*${key}\\s*=`);
  const idx = lines.findIndex((l) => re.test(l));
  if (idx >= 0) {
    if (lines[idx] === line) return "unchanged";
    lines[idx] = line; writeFileSync(file, lines.join("\n"), "utf8"); return "updated";
  }
  if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  lines.push(line, "");
  writeFileSync(file, lines.join("\n"), "utf8");
  return "added";
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  console.log(`init-admin :: back=${o.back} user=${o.user}`);

  if (await getToken(o.back, o.user, o.new)) {
    console.log(`  admin password already = target (no change needed)`);
  } else {
    const t = await getToken(o.back, o.user, o.old);
    if (!t) {
      console.error(`  FAIL: neither target nor seed password authenticates — cannot init admin.`);
      console.error(`        (platform not ready, or password is something else entirely)`);
      process.exit(1);
    }
    console.log(`  seed password works → changing to target …`);
    const r = await changePassword(o.back, t, o.user, o.old, o.new);
    if (!r.ok) {
      console.error(`  FAIL: changepassword → HTTP ${r.status} ${r.body ? JSON.stringify(r.body) : ""}`);
      process.exit(1);
    }
    if (!(await getToken(o.back, o.user, o.new))) {
      console.error(`  FAIL: password changed but the new password does not authenticate.`);
      process.exit(1);
    }
    console.log(`  admin password changed: seed → target ✓`);
  }

  if (o.writeEnv) {
    const action = upsertEnv(o.envFile, o.envKey, o.new);
    console.log(`  .env.local: ${o.envKey} ${action} (${o.envFile})`);
  }
  console.log(`  ✅ admin ready`);
}

main().catch((e) => { console.error(e); process.exit(1); });
