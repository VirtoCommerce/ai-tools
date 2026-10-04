import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { VcSecretsError } from "../vc-secrets-error.mjs";

import { isAbsentPathError, pathPresent } from "./util.mjs";
import { COMMAND_ON_STDIN, VALUE_ON_STDIN, runTool } from "./spawn.mjs";
import { USER_SCOPE } from "./config.mjs";

const KEY_PREFIX = "vc-secrets";

const LEGACY_KEY_PREFIX = "mcpw";

const keystoreFilePresent = (p) => pathPresent(p, `the keystore file "${p}"`);

// The scope half of a keystore key. Project and local declarations share one namespace on purpose —
// they are the same project, so a locally declared server may use the project's secrets.
//
// Everything that has to agree with keyFor about which entries are the same project's calls this:
// the token lock and the renewal channel both serialise on it, and a second spelling that drifts
// serialises against nothing while each copy still reads as correct.
function scopeKeyFor(decl, cfg) {
    return decl.scope === USER_SCOPE ? USER_SCOPE : cfg.projectId;
}

// The keystore key.
function keyFor(name, decl, cfg) {
    return `${KEY_PREFIX}:${scopeKeyFor(decl, cfg)}:${name}`;
}

// The two variable segments back out again. One parse rather than one per reader: the same key is
// taken apart for a secret's path, for its oversize-marker path and for the messages a developer
// reads, and separate spellings of one grammar can disagree about a key neither of them validated
// while each still looks right where it stands.
function keyParts(key) {
    const [, scope, name] = key.split(":");

    return { scope, name };
}

// The bare name, for messages only: mapResolveError and the "treating as absent" notice read as
// advice about a keystore entry, not about a three-segment internal key. Not called entryName --
// oauthLaunchDeps already binds that to the oauth entry ("ado-dev"), where this yields the key's
// last segment ("oauth-ado-dev-refresh"); two values a message must not confuse.
function nameFromKey(key) {
    return keyParts(key).name;
}

const TIMEOUT_LOCAL_MS = 10_000;

const TIMEOUT_AZ_MS = 20_000;

const LOCAL_BACKENDS = ["wcm", "keychain", "gpg"];

// security(1) reads that command line into a fixed buffer and, past the limit, SPLITS rather than
// refusing: the first half stores a TRUNCATED value and the tail runs as a second command whose name
// is escaped fragments of the value, echoed in stderr where runTool's whole-value redaction cannot
// match them. On a refresh Entra has already invalidated the previous token by that point, so the
// truncated entry is a signed-out state. The wcm path needs no twin of this -- its own script refuses
// at WCM_BLOB_LIMIT bytes (exit 4) -- and gpg has no command line to overflow.
const SECURITY_LINE_LIMIT = 4095;

// CRED_MAX_CREDENTIAL_BLOB_SIZE, 5 * 512, measured by bisection and matching the documented value.
// This is the BLOB -- the stored value -- not the value plus its name. The PowerShell write script
// below reads this constant: the script is a JS template literal, so it interpolates like any
// other, and the number is stated here once rather than in both places.
const WCM_BLOB_LIMIT = 2560;

// Quoting for `security -i`'s own tokenizer: double quotes with backslash escapes. A newline cannot be
// quoted into it at all — it ends the command — so the caller must not offer one.
function quoteForSecurityInteractive(value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function detectLocalBackend(platform = process.platform, env = process.env) {
    const override = env.VC_SECRETS_LOCAL_BACKEND;
    if (override !== undefined) {
        if (!LOCAL_BACKENDS.includes(override)) {
            throw new VcSecretsError(`VC_SECRETS_LOCAL_BACKEND="${override}" -- expected ${LOCAL_BACKENDS.join("|")}`);
        }
        return override;
    }
    if (platform === "win32") {
        return "wcm";
    }
    if (platform === "darwin") {
        return "keychain";
    }

    return "gpg";
}

// Where both storage layouts live, current and legacy. cmdUnlock walks the two in one loop, so a
// second spelling that drifts surfaces as "nothing to unlock" rather than as an error.
function configBase(env) {
    return env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), ".config");
}

function secretsDir(env = process.env) {
    return path.join(configBase(env), KEY_PREFIX, "secrets");
}

// Keys are "vc-secrets:<scope>:<name>" (see keyFor) — a directory per scope is clearer than
// colons in filenames, even though the latter would be legal on Linux; the gpg backend is
// Linux/WSL-only, so there is no Windows-path angle to weigh here.
function keyToPath(key, env = process.env) {
    const { scope, name } = keyParts(key);

    return path.join(secretsDir(env), scope, `${name}.gpg`);
}

// Only an absent path means "no entry", and existsSync could not say so: its false for a file that
// cannot be stat'd was read by every caller as "nothing is stored". The bill is the same one
// PS_CRED_READ's ERROR_NOT_FOUND rule prevents on Windows: an interactive sign-in that spends an
// authorization code and rotates a live refresh token, or a developer retyping a secret that never
// left the disk. newKeyPresent's own comment demands this distinction outright; gpg was the backend
// where it did not hold.
function gpgEntryPresent(key, env = process.env) {
    return pathPresent(keyToPath(key, env), `the keystore entry "${key}"`);
}

// Pre-rename storage layout, read-only: cmdMigrate copies a value forward from here into the
// new namespaced key, but nothing ever writes to this path again.
function legacyKeyToPath(name, env = process.env) {
    return path.join(configBase(env), LEGACY_KEY_PREFIX, "secrets", `${name}.gpg`);
}

// Where a keystore write that CANNOT come right on its own is recorded.
//
// On Credential Manager an oversize value fails deterministically: the value is larger than the
// backend's ceiling, so the identical write fails identically at every launch and every renewal,
// forever. Without this, that failure prints one line to fd 2 and is gone; the next tick repeats it
// and nothing accumulates. The system still works -- each launch pays a token exchange instead of
// reading a stored token -- but Entra rotates the refresh token on every exchange, so it pays a
// rotation too, and nothing says so.
//
// A FILE, not a keystore entry, because the keystore is the thing that failed. A sibling of the
// secrets directory rather than a child, so nothing that walks the keystore mistakes it for an
// entry; split per scope the same way keyToPath splits the keys -- the scheme, not the directory --
// so two projects on one machine cannot collide on one entry name.
//
// And it is CURRENT STATE, not an event log: a successful write for the same key deletes it. Without
// that half, doctor would keep reporting a condition the next successful write had already fixed --
// a diagnostic that is wrong in the reassuring direction, which is worse than none.
function oversizeMarkerPath(key, env = process.env) {
    const { scope, name } = keyParts(key);

    return path.join(path.dirname(secretsDir(env)), "state", scope, `${name}.oversize.json`);
}

// Not one byte of the value. `bytes` is measured from what the caller tried to write rather than
// scraped out of the backend's stderr the way mapResolveError does it: the number is already in hand
// at both call sites, and parsing a message for it would be a second, independent way to be wrong
// about the same quantity.
function recordOversizeMarker(key, { backend, bytes, limit, env = process.env, at = Date.now() }) {
    const file = oversizeMarkerPath(key, env);
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, JSON.stringify({ key, backend, bytes, limit, at }), { mode: 0o600 });
    } catch (e) {
        // Both call sites stand inside a catch that has already decided this failure will not fail
        // the operation -- cmdLogin says so in as many words, because failing there costs an
        // interactive sign-in. A throw from here escapes that catch and rejects a login whose
        // refresh token is already stored, sending the developer to sign in again and rotate away
        // the token they just obtained. The state directory is exactly where that happens: a
        // read-only profile, a file where the directory should be, or a full disk.
        //
        // clearOversizeMarker draws this line on the success path for the same reason.
        fs.writeSync(2, `vc-secrets: the oversize marker for "${key}" could not be written`
            + ` (${e.code ?? e.message}) -- "vc-secrets doctor" will not report the ceiling\n`);
    }
}

function clearOversizeMarker(key, env = process.env) {
    try {
        fs.rmSync(oversizeMarkerPath(key, env));
    } catch (e) {
        // Absent is the ordinary case: every successful write on a machine that never overflowed
        // clears nothing. Anything else is reported but not thrown -- this runs on the SUCCESS path
        // of a login or a renewal, and failing either over a leftover diagnostic file would trade a
        // working sign-in for a tidy report.
        if (e.code !== "ENOENT") {
            fs.writeSync(2, `vc-secrets: a stale oversize marker for "${key}" could not be removed`
                + ` (${e.code ?? e.message}) -- "vc-secrets doctor" may report a problem that is fixed\n`);
        }
    }
}

function readOversizeMarker(key, env = process.env) {
    try {
        return JSON.parse(fs.readFileSync(oversizeMarkerPath(key, env), "utf8"));
    } catch {
        // Absent and unreadable collapse deliberately, unlike the keystore reads where that collapse
        // is a defect: this decides whether doctor prints one advisory line, not whether a token
        // exists. A marker that cannot be read is not a finding of its own -- inventing one would
        // send a developer to diagnose the diagnostic.
        return null;
    }
}

// PowerShell 5.1 P/Invoke for Credential Manager (no built-in cmdlets exist).
// Passed via -EncodedCommand: immune to Windows argv re-quoting; -ExecutionPolicy Bypass
// covers restricted policies; if Constrained Language Mode blocks Add-Type, set
// VC_SECRETS_POWERSHELL=pwsh — record it in README.md when hit.
// The keystore key arrives via env var VC_SECRETS_NAME; the value (write path) arrives on stdin.
//
// 1168 is ERROR_NOT_FOUND, and on this path too it is the ONLY code that may read as "no such
// entry" — the rule PS_CRED_DELETE states below, applied to the read. Four call sites consume exit
// 3 as authoritative absence, newKeyPresent's comment among them ("everything else is an unreadable
// store"). A Credential Manager that cannot be read — a logon session left locked after an RDP
// reconnect, a policy-restricted context — is then indistinguishable from an empty one, so the
// developer is sent through an interactive sign-in nothing had invalidated: it spends a single-use
// authorization code and rotates a live refresh token away.
const PS_CRED_READ = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredMan {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
}
'@
$ptr=[IntPtr]::Zero
if(-not [CredMan]::CredRead("$env:VC_SECRETS_NAME",1,0,[ref]$ptr)){
  $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($e -eq 1168){ exit 3 }
  [Console]::Error.Write("CredRead failed win32err=$e"); exit 1
}
$c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr,[type][CredMan+CREDENTIAL])
$n=$c.CredentialBlobSize
$b=New-Object byte[] $n
[System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob,$b,0,$n)
[Console]::Out.Write((($b | ForEach-Object { $_.ToString("x2") }) -join ''))
`;

// Everything a Windows launch needs from PowerShell, in ONE process: every Credential Manager name the
// launch reads, and the job object that binds the launch's process tree to the launcher.
//
// One process because each one costs a powershell.exe start and an Add-Type compile -- the bulk of a wcm
// read -- and the launch used to pay that once per name, sequentially. The read half is PS_CRED_READ's,
// per name: the same CredRead declaration, the same blob copied out as hex, which decodeCredBlobHex
// turns back into the value. What changes is the reporting: a failed CredRead is reported as its raw
// win32 code instead of an exit status, and readWcmBatch applies PS_CRED_READ's rule to it -- 1168
// (ERROR_NOT_FOUND) alone is "absent", every other code an unreadable store. Names arrive as a JSON
// array of keystore keys in VC_SECRETS_NAMES; an empty array is the bind alone. The output is one JSON
// object, {"creds":{"<key>":{"ok":"<hex>"}|{"err":<win32 code>}},"job":"ok"|<win32 code>}, built by hand
// rather than with ConvertTo-Json: every key has passed assertKeyShape ([a-z0-9:-]) and every value is
// hex or an integer, so nothing in it needs escaping.
//
// The bind, and why it exists. An MCP client stops a server with child.kill(), which on Windows is
// TerminateProcess: no handler in the launcher runs. libuv puts the launcher's DIRECT children in a
// kill-on-close job of its own, but one that lets their descendants slip out of it silently (libuv
// src/win/process.c, uv__init_global_job_handle), so the processes that hold the secrets -- `npx.cmd`
// -> cmd.exe -> node, the server -- outlive a launcher killed that way. A job created WITHOUT any
// breakaway permission, holding the launcher, catches every process created after the assignment: with
// nested jobs a process escapes only up to the first job that forbids it, and libuv never asks to
// escape at all (it does not pass CREATE_BREAKAWAY_FROM_JOB). KILL_ON_JOB_CLOSE then ends that whole
// tree when the job's last handle closes -- and the only handle left is the one duplicated into the
// launcher, so any end of the launcher, a TerminateProcess included, ends its tree. The duplicate is not
// inheritable: a child holding one would keep the job open after the launcher died.
//
// THE ORDER IS LOAD-BEARING: the handle is duplicated into the launcher BEFORE the launcher is assigned.
// Assigned first, a failed duplicate would leave this PowerShell process the job's only holder, and its
// exit -- moments later -- would close the job and KILL_ON_JOB_CLOSE would kill the launcher. Duplicated
// first, a failed duplicate leaves an empty job that dies harmlessly with this process, and a failed
// assignment after a good duplicate leaves the launcher holding a handle to a job it is not in, which
// costs nothing. Either failure is reported as its win32 code and the launch goes on unbound.
//
// The reads run before the bind, so a read that throws ends the script before any bind was attempted
// and the caller's "could not bind" is true. The pid comes from VC_SECRETS_LAUNCHER_PID. The names are
// parsed into a variable and enumerated with foreach, not wrapped in @(...): Windows PowerShell 5.1
// emits a parsed array as ONE pipeline object, which @() would wrap into an array holding the array.
const PS_CRED_READ_MANY = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredManLaunch {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit;
    public int LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public int ActiveProcessLimit;
    public UIntPtr Affinity; public int PriorityClass; public int SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS { public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;
    public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
  [DllImport("kernel32", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int size);
  [DllImport("kernel32", SetLastError=true)]
  static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32")]
  static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32", SetLastError=true)]
  static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target,
    int access, bool inherit, int options);
  [DllImport("kernel32", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32", SetLastError=true)]
  static extern bool CloseHandle(IntPtr handle);
  const int JobObjectExtendedLimitInformation = 9;
  const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  const int PROCESS_TERMINATE = 0x0001, PROCESS_DUP_HANDLE = 0x0040, PROCESS_SET_QUOTA = 0x0100;
  const int DUPLICATE_SAME_ACCESS = 0x2;
  static int LastError() { int e = Marshal.GetLastWin32Error(); return e == 0 ? -1 : e; }
  public static int Bind(int pid) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) { return LastError(); }
    try {
      JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
      info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref info, Marshal.SizeOf(info))) { return LastError(); }
      IntPtr launcher = OpenProcess(PROCESS_DUP_HANDLE | PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
      if (launcher == IntPtr.Zero) { return LastError(); }
      try {
        IntPtr held;
        if (!DuplicateHandle(GetCurrentProcess(), job, launcher, out held, 0, false, DUPLICATE_SAME_ACCESS)) { return LastError(); }
        if (!AssignProcessToJobObject(job, launcher)) { return LastError(); }
        return 0;
      } finally { CloseHandle(launcher); }
    } finally { CloseHandle(job); }
  }
}
'@
$out=New-Object System.Text.StringBuilder
[void]$out.Append('{"creds":{')
$sep=''
$names=ConvertFrom-Json $env:VC_SECRETS_NAMES
foreach($k in $names){
  [void]$out.Append($sep+'"'+$k+'":'); $sep=','
  $ptr=[IntPtr]::Zero
  if(-not [CredManLaunch]::CredRead($k,1,0,[ref]$ptr)){
    $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [void]$out.Append('{"err":'+$e+'}'); continue
  }
  $c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr,[type][CredManLaunch+CREDENTIAL])
  $n=$c.CredentialBlobSize
  $b=New-Object byte[] $n
  [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob,$b,0,$n)
  [void]$out.Append('{"ok":"'+(($b | ForEach-Object { $_.ToString("x2") }) -join '')+'"}')
}
$j=[CredManLaunch]::Bind([int]$env:VC_SECRETS_LAUNCHER_PID)
[void]$out.Append('},"job":'+$(if($j -eq 0){'"ok"'}else{$j})+'}')
[Console]::Out.Write($out.ToString())
`;

// 1168 is ERROR_NOT_FOUND, and ONLY that may read as "already absent". Exiting 3 for every
// failure would let logout report success while the refresh token is still in the store —
// the single outcome logout exists to prevent.
const PS_CRED_DELETE = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredManDel {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredDelete(string target, int type, int flags);
}
'@
if(-not [CredManDel]::CredDelete("$env:VC_SECRETS_NAME",1,0)){
  $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($e -eq 1168){ exit 3 }
  [Console]::Error.Write("CredDelete failed win32err=$e"); exit 1
}
`;

// No TrimEnd on the value, and that is the opposite of what runTool does when it READS. The two are
// not inconsistent: `security -w` and the PowerShell reader append a line ending of their own, so
// stripping one on the way out removes the tool's artifact. Nothing appends anything on the way in
// -- runTool writes `child.stdin.write(stdinValue)` and ReadToEnd returns exactly those bytes -- so
// a TrimEnd here deleted the CALLER's, and every one of them rather than a single line ending.
//
// Reachable through cmdMigrate, the one caller whose value can legitimately end in a newline: the
// other two write paths are a token's JSON and a secret typed at a prompt, where Enter is the
// terminator. Migrate exists to move a value the user CANNOT retype, which is why its gpg read opts
// out of the same strip with keepTrailingNewline -- Windows was quietly doing what that opt-out was
// added to prevent.
const PS_CRED_WRITE = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.Encoding]::UTF8
$value=[Console]::In.ReadToEnd()
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredManW {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredWrite(ref CREDENTIAL cred, int flags);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
}
'@
$bytes=[System.Text.Encoding]::UTF8.GetBytes($value)
$blob=[System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes,0,$blob,$bytes.Length)
$c=New-Object CredManW+CREDENTIAL
$c.Type=1; $c.TargetName="$env:VC_SECRETS_NAME"; $c.UserName=$env:USERNAME; $c.Persist=2
$c.CredentialBlob=$blob; $c.CredentialBlobSize=$bytes.Length
if(-not [CredManW]::CredWrite([ref]$c,0)){
  $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($e -eq 1783){ [Console]::Error.Write("value too large for Credential Manager ($($bytes.Length) bytes; limit ${WCM_BLOB_LIMIT})"); exit 4 }
  [Console]::Error.Write("CredWrite failed win32err=$e"); exit 3
}
`;

function psEncode(script) {
    return Buffer.from(script, "utf16le").toString("base64");
}

function psCommand(env = process.env) {
    return env.VC_SECRETS_POWERSHELL || "powershell.exe";
}

function psArgs(script) {
    return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", psEncode(script)];
}

// A value written by the pre-UTF-8 launcher is UTF-16LE, and tokens are ASCII — checked against the
// real credentials in use, not inferred from the format — so every second byte is zero. The premise
// is load-bearing and its limit is pinned by a test: above U+00FF the odd byte stops being zero and
// the value decodes as UTF-8, mojibake, with no error. Detecting rather than versioning keeps `run`
// read-only: a developer whose secret exists only in the keystore cannot re-enter it, so we must
// read what is there.
function decodeCredBlobHex(hex) {
    const bytes = Buffer.from(hex.replace(/\s+/g, ""), "hex");
    const utf16 = bytes.length >= 2 && bytes.length % 2 === 0
        && bytes.every((b, i) => (i % 2 === 1 ? b === 0 : b !== 0));

    return utf16
        ? { encoding: "utf16le", value: bytes.toString("utf16le") }
        : { encoding: "utf8", value: bytes.toString("utf8") };
}

// grammar: "vc-secrets:" scope ":" name; scope and name both [a-z0-9-]+ (scope is "user" or a
// projectId — see keyFor).
// Built from KEY_PREFIX so the constant stays the single source of the key shape — a literal here
// would keep validating the old prefix after a rename, and every read would look correct.
const KEY_RE = new RegExp(`^${KEY_PREFIX}:[a-z0-9-]+:[a-z0-9-]+$`);

// Every builder below puts the key into a command line, so each checks the shape first. The check
// lives here rather than once per builder: nothing in a builder's signature says it is mandatory,
// and a new builder that omits it is the failure this guards against.
function assertKeyShape(key) {
    if (!KEY_RE.test(key)) {
        throw new VcSecretsError(`invalid secret key "${key}" -- expected vc-secrets:<scope>:<name>`);
    }
}

// The account `security` is addressed with. Read, write and delete have to agree on it, or an entry
// is written where it cannot be read back.
function keychainAccount(env) {
    return env.USER || os.userInfo().username;
}

// What a backend says when the entry is simply not there: the PowerShell branch exits 3 by
// construction, security(1) answers 44. gpg is absent from this list on purpose — its entries are
// files, so gpgEntryPresent settles that case before a read is attempted at all.
//
// One home for the rule because both ways of getting it wrong are silent. A store that merely could
// not be read, taken for absent, costs an interactive sign-in that spends an authorization code and
// rotates a live refresh token; a genuinely empty store, taken for broken, refuses to sign in.
// deleteEntryIo states the same rule for the delete path, in the terms that path needs.
function isAbsentEntry(backend, e) {
    return (backend === "wcm" && e.toolExitCode === 3) || (backend === "keychain" && e.toolExitCode === 44);
}

function buildLocalRead(backend, key, env = process.env) {
    assertKeyShape(key);
    if (backend === "wcm") {
        return { cmd: psCommand(env), args: psArgs(PS_CRED_READ),
            extraEnv: { VC_SECRETS_NAME: key }, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
    }
    if (backend === "keychain") {
        return { cmd: "security", args: ["find-generic-password", "-a", keychainAccount(env), "-s", key, "-w"],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
    }

    // --pinentry-mode cancel (GnuPG >= 2.1): a cold agent fails fast instead of popping pinentry,
    // which the 10s kill timer would otherwise interrupt mid-typing. Interactive unlock (cmdUnlock)
    // builds its own args without this flag — that is the only place pinentry may appear.
    return { cmd: "gpg", args: ["--quiet", "--batch", "--pinentry-mode", "cancel", "--decrypt", keyToPath(key, env)],
        timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true, keepTrailingNewline: true };
}

// The launch's one PowerShell call (PS_CRED_READ_MANY): the keys to read, possibly none, and the pid to
// bind. Every key is shape-checked like any other builder's, and here it also keeps the hand-built
// JSON the script prints free of anything that would need escaping.
function buildCredReadMany(keys, pid, env = process.env) {
    for (const key of keys) {
        assertKeyShape(key);
    }

    return { cmd: psCommand(env), args: psArgs(PS_CRED_READ_MANY),
        extraEnv: { VC_SECRETS_NAMES: JSON.stringify(keys), VC_SECRETS_LAUNCHER_PID: String(pid) },
        timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
}

// Runs it and returns the parsed object. A call that fails as a whole -- PowerShell missing, Add-Type
// refused, a timeout, output that is not the object -- throws a VcSecretsError, and the message never
// carries the output: on success that holds every value read, hex-encoded.
async function credReadManyIo({ keys, pid, env = process.env, redactValues = [] }) {
    const stdout = await runTool(buildCredReadMany(keys, pid, env), { redactValues });
    let result = null;
    try {
        result = JSON.parse(stdout);
    } catch { /* reported below, without the text */ }
    if (result === null || typeof result !== "object" || result.creds === null || typeof result.creds !== "object") {
        throw new VcSecretsError(`${psCommand(env)} did not print the batched read's result`);
    }

    return result;
}

// What a single PS_CRED_READ would have thrown for a key the batched call reported as `{ err: code }`: 1168
// (ERROR_NOT_FOUND) is its exit 3 with nothing on stderr, any other code its exit 1 naming it -- and runTool's
// message for a non-zero exit, which mapResolveError rewrites for exit 3 and passes through for exit 1. One
// copy because the secret reads and the oauth reads must both stay exactly what the single read says.
function batchedReadError(cmd, code) {
    const exit = code === 1168 ? 3 : 1;
    const stderr = exit === 3 ? "" : `CredRead failed win32err=${code}`;

    return Object.assign(new VcSecretsError(`${cmd} exited ${exit}: ${stderr}`), { toolExitCode: exit });
}

function buildLocalWrite(backend, key, env = process.env, { tmp = false, value = undefined } = {}) {
    assertKeyShape(key);
    if (backend === "wcm") {
        return { cmd: psCommand(env), args: psArgs(PS_CRED_WRITE),
            extraEnv: { VC_SECRETS_NAME: key }, stdinData: VALUE_ON_STDIN, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    if (backend === "keychain") {
        const account = keychainAccount(env);
        // Three shapes, and the differences are load-bearing. `set`: `-w` with no value makes security
        // prompt on the TTY, so the plaintext never passes through this process at all.
        if (value === undefined) {
            return { cmd: "security", args: ["add-generic-password", "-U", "-a", account, "-s", key, "-w"],
                interactive: true, timeoutMs: null, captureStdout: false };
        }
        // `migrate`: there IS no value to type — the point is to copy one the user cannot read — and
        // `security` takes no password on stdin. Its interactive mode takes the whole COMMAND there, which
        // is what keeps the value out of argv and out of this machine's process list.
        if (!/[\r\n]/.test(value)) {
            return { cmd: "security", args: ["-i"], stdinData: COMMAND_ON_STDIN,
                stdinCommand: (v) => {
                    const line = `add-generic-password -U -a ${quoteForSecurityInteractive(account)} `
                        + `-s ${quoteForSecurityInteractive(key)} -w ${quoteForSecurityInteractive(v)}\n`;
                    if (Buffer.byteLength(line) > SECURITY_LINE_LIMIT) {
                        throw new VcSecretsError(`value too large for the keychain: entry "${key}" needs `
                            + `${Buffer.byteLength(line)} bytes on one command line; limit ${SECURITY_LINE_LIMIT}`);
                    }

                    return line;
                },
                timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
        }

        // A line ending cannot be quoted into that command — it ends it — so this one value takes the
        // older route and its exposure is reported rather than hidden. Refusing instead would strand the
        // secret: migrate exists for values the user cannot retype.
        return { cmd: "security", args: ["add-generic-password", "-U", "-a", account, "-s", key, "-w", value],
            argvExposesValue: true, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    const recipientArgs = env.VC_SECRETS_GPG_RECIPIENT
        ? ["--recipient", env.VC_SECRETS_GPG_RECIPIENT, "--trust-model", "always"]
        : ["--default-recipient-self"];
    // Write to a `.tmp` sibling first so a mid-write crash/kill can never leave
    // a half-encrypted `<name>.gpg` in place of a previously-valid secret — cmdSet renames it in
    // after gpg exits 0.
    const target = `${keyToPath(key, env)}${tmp ? ".tmp" : ""}`;

    return { cmd: "gpg", args: ["--quiet", "--batch", "--yes", ...recipientArgs, "--encrypt", "-o", target],
        stdinData: VALUE_ON_STDIN, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
}

function buildLocalDelete(backend, key, env = process.env) {
    assertKeyShape(key);
    if (backend === "wcm") {
        return { cmd: psCommand(env), args: psArgs(PS_CRED_DELETE),
            extraEnv: { VC_SECRETS_NAME: key }, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    if (backend === "keychain") {
        return { cmd: "security", args: ["delete-generic-password", "-a", keychainAccount(env), "-s", key],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    // gpg entries are files, removed by deleteEntryIo directly. Falling through to the keychain
    // command would answer a Linux caller with "security: not found on PATH" instead of the
    // truth, which reads as a broken machine rather than a builder used on the wrong backend.
    throw new VcSecretsError(`no delete command for backend "${backend}"`);
}

// One meaning of "already absent" for logout to check, assembled here because each backend
// signals it differently: the PowerShell branch exits 3 by construction, security(1) answers 44,
// and gpg entries are files whose absence is a path error (isAbsentPathError) rather than any exit
// code at all -- the same test gpgEntryPresent applies, so logout and a presence check agree.
function deleteEntryIo(backend = detectLocalBackend(), env = process.env, { run = runTool, rm = fs.rmSync } = {}) {
    return async (key) => {
        if (backend === "gpg") {
            assertKeyShape(key);
            try {
                rm(keyToPath(key, env));
            } catch (e) {
                if (isAbsentPathError(e)) {
                    throw Object.assign(new VcSecretsError(`no stored entry "${key}"`), { toolExitCode: 3 });
                }
                throw new VcSecretsError(`could not remove "${key}": ${e.code ?? e.message}`);
            }

            return;
        }
        try {
            await run(buildLocalDelete(backend, key, env));
        } catch (e) {
            if (backend === "keychain" && e.toolExitCode === 44) {
                throw Object.assign(e, { toolExitCode: 3 });
            }
            throw e;
        }
    };
}

// Shared by cmdSet's non-interactive branch and cmdMigrate: runs a write `spec` built with a
// value already in hand. gpg gets an atomic tmp-then-rename so a reader never observes a
// partially-written or empty file; the other backends write in one shot.
async function writeLocalValue(backend, key, spec, value, env = process.env, run = runTool) {
    if (backend !== "gpg") {
        try {
            await run(spec, { stdinValue: value, redactValues: [value] });
        } catch (e) {
            // Only the size error. mapResolveError reads wcm exit 3 as "not found — run set", a
            // READ-path diagnosis: on a write it names a failure that did not happen and
            // prescribes the command that just failed. Name segment, not the whole key: the
            // message it builds says `secret "X"`, and X is what the declaration calls it.
            if (e.toolExitCode !== 4) {
                throw e;
            }
            throw mapResolveError(backend, nameFromKey(key), e);
        }

        return;
    }
    fs.mkdirSync(path.dirname(keyToPath(key, env)), { recursive: true, mode: 0o700 });
    const finalPath = keyToPath(key, env);
    const tmpPath = `${finalPath}.tmp`;
    try {
        await run(spec, { stdinValue: value, redactValues: [value] });
        fs.chmodSync(tmpPath, 0o600);
        fs.renameSync(tmpPath, finalPath);
    } catch (e) {
        try {
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }
        } catch { /* best-effort cleanup — the original error is what matters */ }
        throw e;
    }
}

// Callers must not build their own write spec for a value already in hand: for the keychain
// backend, buildLocalWrite's `value === undefined` branch is the INTERACTIVE `security -w` one
// cmdSet's own TTY prompt uses -- routing a renewal or a login through it does not fail, it hangs,
// waiting for a typist that is never there. Passing `value` here is what selects buildLocalWrite's
// non-interactive `security -i` branch instead, the same choice cmdMigrate makes at its own call
// site for the same reason: the value is already in hand and there is nothing to prompt
// for. This is the source's buildKeychainWrite/buildLocalWrite split, expressed here as the `value`
// option rather than as two separate builders. The split only: the source's composeStdin also carried
// a line-length refusal, restored in buildLocalWrite above, because this package's three-segment key
// is longer than the source's two-segment one and eats most of the margin the source measured.
async function writeSecretValue(key, value, { backend = detectLocalBackend(), env = process.env,
    run = runTool } = {}) {
    if (!value) {
        // The invariant belongs here rather than only in cmdSet: a renewal and a login can both be
        // handed an empty string by a response that parsed, and an empty entry is worse than a
        // missing one — it reads back as "backend returned empty value", which sends a developer to
        // retype a secret this tool just erased.
        throw new VcSecretsError(`refusing to store an empty value for "${key}"`);
    }
    const spec = buildLocalWrite(backend, key, env, { tmp: backend === "gpg", value });
    // Composed once here purely to validate. The runner composes it only AFTER spawning, so without
    // this call an oversize value leaves an orphaned `security -i` waiting on a stdin that never
    // arrives, until the runner's own timeout kills it -- and the refusal would hold only for
    // whichever runner is wired in. The result is discarded: the builder is pure and the runner
    // composes it again for real.
    if (spec.stdinCommand) {
        spec.stdinCommand(value);
    }

    return writeLocalValue(backend, key, spec, value, env, run);
}

function buildKeyvaultRead(decl) {
    return { cmd: "az", args: ["keyvault", "secret", "show", "--vault-name", decl.vault, "--name", decl.secret, "--query", "value", "-o", "tsv"],
        timeoutMs: TIMEOUT_AZ_MS, captureStdout: true };
}

// Pure mapping so the advice contract can be unit-tested without spawning real
// backends: wcm "not found" (exit 3) / keychain "not found" (exit 44) both point at "vc-secrets set";
// wcm exit 4 is the oversize write, and carries the measured size out of the script's stderr;
// any other gpg failure gets the "vc-secrets unlock" hint (file exists but decrypt failed, e.g. cold agent);
// everything else passes through unchanged.
// Read AND write reach this: writeLocalValue routes exit 4 here and nothing else, because the two
// "not found" rewrites above are advice for a read.
function mapResolveError(backend, name, e) {
    // Every branch that rewrites the message returns a NEW error, and a new error carries no
    // toolExitCode -- so improving a message for a human silently stripped the classification the
    // code downstream needs. The two are not alternatives, and the loss is invisible: the caller
    // still gets an error, just one that no longer answers "which failure was this". The oversize
    // marker reads exit 4 off an error that has already passed through here. The fall-through at
    // the end returns the original untouched, so it needs no keep().
    const keep = (mapped) => Object.assign(mapped, { toolExitCode: e.toolExitCode });
    if (backend === "wcm" && e.toolExitCode === 3) {
        return keep(new VcSecretsError(`secret "${name}" not found in Credential Manager -- run "vc-secrets set ${name}"`));
    }
    if (backend === "wcm" && e.toolExitCode === 4) {
        // Keep the measured size, drop win32err=1783: the number a developer can act on is
        // how far over the limit the value is, not the API's code for "too big".
        const size = /(\d+) bytes/.exec(e.message)?.[1];
        const measured = size ? ` (${size} bytes)` : "";

        return keep(new VcSecretsError(`secret "${name}" is too large for Credential Manager${measured} -- the blob limit is ${WCM_BLOB_LIMIT} bytes`));
    }
    if (backend === "keychain" && e.toolExitCode === 44) {
        return keep(new VcSecretsError(`secret "${name}" not found in Keychain -- run "vc-secrets set ${name}"`));
    }
    if (backend === "gpg") {
        return keep(new VcSecretsError(`${e.message} -- if the gpg agent is locked, run "vc-secrets unlock" in a terminal`));
    }

    return e;
}

function makeSecretResolver(cfg, env = process.env) {
    const resolvedValues = [];
    // One copy: readWcmBatch below has to produce exactly what a single read throws.
    const emptyValueError = (name) => new VcSecretsError(`secret "${name}": backend returned empty value -- run "vc-secrets set ${name}" (or check az login)`);
    const resolver = async (name, decl) => {
        const key = keyFor(name, decl, cfg);
        const backend = decl.backend === "keyvault" ? "keyvault" : detectLocalBackend(process.platform, env);
        if (backend === "gpg" && !gpgEntryPresent(key, env)) {
            throw new VcSecretsError(`secret "${name}" not set -- run "vc-secrets set ${name}"`);
        }
        const spec = backend === "keyvault" ? buildKeyvaultRead(decl) : buildLocalRead(backend, key, env);
        let value;
        try {
            value = await runTool(spec, { redactValues: resolvedValues });
        } catch (e) {
            throw mapResolveError(backend, name, e);
        }
        if (backend === "wcm") {
            // Decode before the empty check and before resolvedValues: that list is what
            // redacts secrets out of later tool output, so holding the hex there would make
            // redaction search for a string the output never contains.
            value = decodeCredBlobHex(value).value;
        }
        if (value === "") {
            throw emptyValueError(name);
        }
        resolvedValues.push(value);
        return value;
    };
    resolver.resolvedValues = resolvedValues;
    // Windows launches only (cmdLaunch's prefetch): every Credential Manager name in `refs` read in the
    // one PowerShell call that also binds the launch's tree to `pid`. Returns `seeded`, a Map from secret
    // name to what the resolver above would have returned for it -- the value -- or thrown -- the very
    // error, built the way runTool and mapResolveError build it from PS_CRED_READ's exit status -- and
    // `job`: "ok", the bind's win32 code, or, when the call failed as a whole, the reason as a string.
    // Nothing is seeded then, and every name takes the resolver above, which meets the same failure and
    // reports it as it always has.
    //
    // Each value joins resolvedValues here, before this returns: the later reads in the same launch --
    // a Key Vault secret, an oauth exchange -- print their tool's stderr through that list.
    //
    // `extraKeys`: further full keystore keys for the same call -- the launch's oauth entries. Their
    // outcomes come back apart, in `outcomes`, a Map from the full key to the raw `{ ok }` / `{ err }` the
    // script reported, and are neither decoded, nor turned into an error, nor added to resolvedValues, nor
    // keyed by a secret's name: what an oauth entry's outcome means is decided where it is consumed
    // (oauthLaunchDeps), and a secret that happens to share a name with an entry must not receive it. A key
    // the script did not report is simply absent from the Map.
    resolver.readWcmBatch = async (refs, { pid, run = credReadManyIo, extraKeys = [] }) => {
        const wanted = new Map();
        const localRefs = refs.filter(({ decl }) => decl.backend !== "keyvault");
        // The local backend is consulted only when a reference needs it, as the resolver above does: a
        // bad VC_SECRETS_LOCAL_BACKEND must not refuse a launch whose env holds only literals and Key
        // Vault entries, which ran before the batch existed. When it does throw, nothing is seeded and
        // the bind still runs with an empty key list; the resolver then raises the error at the first
        // entry that needs the backend, the same entry and message as without a prefetch.
        let localBackend = null;
        if (localRefs.length > 0) {
            try {
                localBackend = detectLocalBackend(process.platform, env);
            } catch (e) {
                if (!(e instanceof VcSecretsError)) {
                    throw e;
                }
            }
        }
        if (localBackend === "wcm") {
            for (const { name, decl } of localRefs) {
                wanted.set(name, keyFor(name, decl, cfg));
            }
        }
        let result;
        try {
            result = await run({ keys: [...new Set([...wanted.values(), ...extraKeys])], pid, env,
                redactValues: resolvedValues });
        } catch (e) {
            if (!(e instanceof VcSecretsError)) {
                throw e;
            }

            return { seeded: new Map(), job: e.message, outcomes: new Map() };
        }
        const cmd = psCommand(env);
        const seeded = new Map();
        for (const [name, key] of wanted) {
            const outcome = Object.hasOwn(result.creds, key) ? result.creds[key] : null;
            if (typeof outcome?.ok === "string") {
                const value = decodeCredBlobHex(outcome.ok).value;
                if (value === "") {
                    seeded.set(name, emptyValueError(name));
                    continue;
                }
                resolvedValues.push(value);
                seeded.set(name, value);
            } else if (Number.isInteger(outcome?.err)) {
                seeded.set(name, mapResolveError("wcm", name, batchedReadError(cmd, outcome.err)));
            }
            // Anything else -- a key the script did not report -- is left unseeded, and its read goes
            // through the resolver above.
        }
        const outcomes = new Map();
        for (const key of extraKeys) {
            const outcome = Object.hasOwn(result.creds, key) ? result.creds[key] : null;
            if (typeof outcome?.ok === "string" || Number.isInteger(outcome?.err)) {
                outcomes.set(key, outcome);
            }
        }
        const job = result.job === "ok" || Number.isInteger(result.job) ? result.job : "the bind reported no result";

        return { seeded, job, outcomes };
    };

    return resolver;
}

// Pre-rename storage: wcm/keychain credential name was `mcpw:<name>` (no scope, no projectId —
// see legacyKeyToPath for the gpg equivalent). Returns null for "not found", never throws for it,
// so cmdMigrate can tell "nothing to migrate" from "backend actually failed".
async function readLegacyLocalValue(backend, name, env = process.env) {
    if (backend === "gpg") {
        const legacyPath = legacyKeyToPath(name, env);
        if (!keystoreFilePresent(legacyPath)) {
            return null;
        }

        return await runTool({ cmd: "gpg", args: ["--quiet", "--batch", "--pinentry-mode", "cancel", "--decrypt", legacyPath],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true, keepTrailingNewline: true });
    }
    const legacyName = `${LEGACY_KEY_PREFIX}:${name}`;
    const spec = backend === "wcm"
        ? { cmd: psCommand(env), args: psArgs(PS_CRED_READ), extraEnv: { VC_SECRETS_NAME: legacyName }, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true }
        : { cmd: "security", args: ["find-generic-password", "-a", keychainAccount(env), "-s", legacyName, "-w"],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
    try {
        const value = await runTool(spec);

        return backend === "wcm" ? decodeCredBlobHex(value).value : value;
    } catch (e) {
        if (isAbsentEntry(backend, e)) {
            return null;
        }
        throw e;
    }
}

// "Is the new key already populated?" has to distinguish ABSENT from UNREADABLE. Treating every read
// failure as absence is what turns migrate into "write the pre-rotation value over the current one":
// a cold gpg agent, a timeout, or a decrypt to the wrong recipient all fail here, and the legacy read
// that follows succeeds — so the overwrite is committed and reported as a successful migration.
async function newKeyPresent(backend, key, env = process.env) {
    if (backend === "gpg") {
        return gpgEntryPresent(key, env);
    }
    try {
        await runTool(buildLocalRead(backend, key, env));

        return true;
    } catch (e) {
        if (isAbsentEntry(backend, e)) {
            return false;
        }
        throw e;
    }
}

async function cmdMigrate(cfg) {
    const backend = detectLocalBackend();
    const lines = [];
    let migrated = 0;
    let failed = 0;
    for (const [name, decl] of Object.entries(cfg.secrets)) {
        if (decl.backend !== "local") {
            continue;
        }
        // The legacy entry carried no scope, so what it holds is the person's own value. Copying it under
        // a repository's namespace would hand it to every server that repository declares and has had
        // trusted, which is the grant the README says trusting a server does not make. Only a user-scope
        // declaration is a place the person's own value belongs; a repository's secret is set for that
        // repository, deliberately.
        if (decl.scope !== USER_SCOPE) {
            lines.push(`${name}: declared by this repository -- a legacy entry is personal, so it is not moved into a repository's namespace; run "vc-secrets set ${name}" if the repository should have its own`);
            continue;
        }
        const key = keyFor(name, decl, cfg);
        let present;
        try {
            present = await newKeyPresent(backend, key, process.env);
        } catch (e) {
            failed += 1;
            lines.push(`${name}: cannot tell whether it is already migrated, refusing to touch it -- ${e.message}`);
            continue;
        }
        if (present) {
            lines.push(`${name}: already present`);
            continue;
        }

        let legacyValue;
        try {
            legacyValue = await readLegacyLocalValue(backend, name, process.env);
        } catch (e) {
            failed += 1;
            lines.push(`${name}: migration failed -- ${e.message}`);
            continue;
        }
        if (legacyValue === null) {
            lines.push(`${name}: no legacy entry -- run "vc-secrets set ${name}"`);
            continue;
        }

        try {
            const spec = buildLocalWrite(backend, key, process.env, { tmp: backend === "gpg", value: legacyValue });
            if (spec.argvExposesValue) {
                lines.push(`${name}: the value contains a line ending, so it passed through the command line of a `
                    + `short-lived process -- visible to anything reading this machine's process list during the write`);
            }
            await writeLocalValue(backend, key, spec, legacyValue, process.env);
            if (backend === "keychain") {
                // Read back and compare. `security -i` reports a failed sub-command through an exit code
                // this loop cannot check on a machine without macOS, and a store that accepted something
                // other than what was handed to it must not be reported as a migration. gpg is left out:
                // its read needs a warm agent, so a cold one would fail a write that in fact succeeded.
                const stored = await runTool(buildLocalRead(backend, key, process.env), { redactValues: [legacyValue] });
                if (stored !== legacyValue) {
                    // The wrong value is now sitting under the new key, and newKeyPresent asks only whether
                    // the key EXISTS: left there, the next migrate reports "already present", doctor says OK
                    // and a launch hands the server a value nobody wrote. This branch is reached only
                    // after newKeyPresent answered false, so the delete cannot remove an entry that was
                    // there before this run.
                    const removeSpec = buildLocalDelete(backend, key, process.env);
                    try {
                        await runTool(removeSpec);
                    } catch {
                        const command = [removeSpec.cmd, ...removeSpec.args]
                            .map((x) => (/^[\w.:@/=+-]+$/.test(x) ? x : `'${x.replaceAll("'", "'\\''")}'`)).join(" ");
                        throw new VcSecretsError(`the store returned a different value than was written, and the new entry could not be removed -- it now holds a wrong value; remove it with \`${command}\`. The legacy entry is untouched`);
                    }
                    throw new VcSecretsError("the store returned a different value than was written; the new entry was removed -- the legacy entry is untouched, migrate it by hand");
                }
            }
            migrated += 1;
            lines.push(`${name}: migrated`);
        } catch (e) {
            failed += 1;
            lines.push(`${name}: migration failed -- ${e.message}`);
        }
    }
    // Deliberately no per-collision advice. project↔local collisions share one namespace, so there is no
    // second key to mention. A user↔project collision leaves the user-scope key unwritten: the
    // repository's entry is the one that wins, it is skipped above with a line of its own, and doctor's
    // legacyOnly probe is user-scope only, so it does not name it either. Nothing is lost -- the legacy
    // entry stays in place, and migrate run from a directory where no repository declares the name moves it.
    lines.push(`vc-secrets: migrate -- ${migrated} migrated, ${failed} failed`);
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    fs.writeSync(2, lines.join("\n") + "\n");
    if (failed > 0) {
        process.exit(1);
    }
}

export {
    KEY_PREFIX, keystoreFilePresent, scopeKeyFor, keyFor, nameFromKey, TIMEOUT_LOCAL_MS, TIMEOUT_AZ_MS,
    LOCAL_BACKENDS, SECURITY_LINE_LIMIT, WCM_BLOB_LIMIT, quoteForSecurityInteractive, detectLocalBackend,
    secretsDir, keyToPath, gpgEntryPresent, legacyKeyToPath, oversizeMarkerPath, recordOversizeMarker,
    clearOversizeMarker, readOversizeMarker, PS_CRED_READ, PS_CRED_READ_MANY, PS_CRED_DELETE, PS_CRED_WRITE,
    psEncode, psCommand, decodeCredBlobHex, isAbsentEntry, buildLocalRead, buildCredReadMany, credReadManyIo,
    batchedReadError, buildLocalWrite, buildLocalDelete, deleteEntryIo, writeLocalValue, writeSecretValue,
    buildKeyvaultRead, mapResolveError, makeSecretResolver, readLegacyLocalValue, newKeyPresent, cmdMigrate,
};
