// The lane watchdog (bridge/lane-watchdog.mjs) and the process table it reads (bridge/proc-table.mjs).
// What matters: a lane that is serving requests is never stopped, a lane whose owner is gone or that nobody has used
// for the limit is, and watching never changes how stdin flows (a 'data' listener would eat the client's first message).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { DEFAULT_IDLE_HOURS, idleLimitMs, startLaneWatchdog, verdict } from "./lane-watchdog.mjs";
import { ancestorsOf, descendantsLeafFirst, etimeSeconds, parsePs, parseWindows } from "./proc-table.mjs";

const H = 3_600_000;

test("the idle limit: default 4 h, a number of hours, 0 turns it off, junk falls back to the default", () => {
  assert.equal(DEFAULT_IDLE_HOURS, 4);
  assert.equal(idleLimitMs(undefined), 4 * H);
  assert.equal(idleLimitMs(""), 4 * H);
  assert.equal(idleLimitMs("2"), 2 * H);
  assert.equal(idleLimitMs("0.5"), H / 2);
  assert.equal(idleLimitMs("0"), null);
  assert.equal(idleLimitMs("soon"), 4 * H);
  assert.equal(idleLimitMs("-1"), 4 * H);
});

test("verdict: orphaned beats idle, idle needs the full limit, a disabled limit never expires", () => {
  const alive = (set) => (pid) => set.includes(pid);
  const watched = [{ pid: 10, name: "cmd.exe" }, { pid: 20, name: "claude.exe" }];
  const base = { now: 5 * H, lastActivity: 5 * H - 1000, idleMs: 4 * H, watched, alive: alive([10, 20]) };
  assert.equal(verdict(base), null);
  assert.equal(verdict({ ...base, alive: alive([10]) }).reason, "orphaned");
  assert.match(verdict({ ...base, alive: alive([10]) }).detail, /claude\.exe 20/);
  assert.equal(verdict({ ...base, lastActivity: 5 * H - 4 * H + 1 }), null);
  assert.equal(verdict({ ...base, lastActivity: 5 * H - 4 * H }).reason, "idle");
  assert.equal(verdict({ ...base, idleMs: null, lastActivity: 0 }), null);
  assert.equal(verdict({ ...base, alive: alive([]), lastActivity: 0 }).reason, "orphaned");
});

function fakeStreams() {
  const stdin = new EventEmitter();
  const wrote = [];
  const stdout = { write: (c) => { wrote.push(c); return true; } };
  return { stdin, stdout, wrote };
}

test("traffic on stdin or stdout keeps a lane alive; silence ends it; stdin's flow is untouched", async () => {
  let t = 0;
  const { stdin, stdout, wrote } = fakeStreams();
  const seen = [];
  stdin.on("data", (d) => seen.push(d)); // the MCP transport's own listener must still receive everything
  const expired = [];
  const w = startLaneWatchdog({
    env: { VC_LANE_IDLE_HOURS: "1" }, stdin, stdout, ppid: 0, now: () => t, pollMs: 5, chainDelayMs: 1e9,
    list: async () => [], onExpire: (reason) => expired.push(reason), tell: () => {},
  });
  const tick = () => new Promise((r) => setTimeout(r, 15));
  t = 50 * 60_000; stdin.emit("data", "request"); await tick();       // 50 min in, a request arrives
  t = 100 * 60_000; await tick();                                      // 50 min of silence: still under the limit
  assert.deepEqual(expired, []);
  t = 110 * 60_000; stdout.write("response"); await tick();            // a response at 110 min is activity too
  t = 160 * 60_000; await tick();                                      // 50 min after it
  assert.deepEqual(expired, []);
  t = 171 * 60_000; await tick();                                      // 61 min after it
  assert.deepEqual(expired, ["idle"]);
  assert.deepEqual(seen, ["request"]);
  assert.deepEqual(wrote, ["response"]);
  w.stop();
});

test("an owner that disappears ends the lane at once, however recent the last request", async () => {
  const { stdin, stdout } = fakeStreams();
  let parentUp = true;
  const expired = [];
  const w = startLaneWatchdog({
    env: { VC_LANE_IDLE_HOURS: "0" }, stdin, stdout, ppid: 4242, now: () => 0, pollMs: 5, chainDelayMs: 1e9,
    alive: () => parentUp, list: async () => [], onExpire: (r, d) => expired.push([r, d]), tell: () => {},
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(expired, []);
  parentUp = false;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(expired.length, 1);
  assert.equal(expired[0][0], "orphaned");
  w.stop();
});

test("stop() puts the streams back as they were", () => {
  const { stdin, stdout } = fakeStreams();
  const emit = stdin.emit, write = stdout.write;
  const w = startLaneWatchdog({ stdin, stdout, ppid: 0, pollMs: 1e6, chainDelayMs: 1e9, list: async () => [], tell: () => {} });
  assert.notEqual(stdin.emit, emit);
  w.stop();
  assert.equal(stdin.emit, emit);
  assert.equal(stdout.write, write);
});

test("process table: ps and Windows listings parse, ancestors climb, a subtree comes leaf first", () => {
  assert.equal(etimeSeconds("1-02:03:04"), 93784);
  assert.equal(etimeSeconds("12:34"), 754);
  assert.equal(etimeSeconds("01:00:00"), 3600);
  const ps = parsePs(" 10     1 2-00:00:00 bash /bin/bash -l\n 11    10    00:05 node node /x/playwright-lane.mjs playwright-chrome\n", 1_000_000_000);
  assert.equal(ps.length, 2);
  assert.deepEqual([ps[1].pid, ps[1].ppid, ps[1].name], [11, 10, "node"]);
  assert.equal(ps[1].startMs, 1_000_000_000 - 5_000);
  const win = parseWindows(JSON.stringify([{ ProcessId: 5, ParentProcessId: 4, Name: "cmd.exe", CommandLine: "cmd /c npx", Start: "2026-01-02T03:04:05.0000000Z" }]));
  assert.deepEqual([win[0].pid, win[0].ppid, win[0].name], [5, 4, "cmd.exe"]);
  assert.equal(win[0].startMs, Date.parse("2026-01-02T03:04:05Z"));
  assert.equal(parseWindows(JSON.stringify({ ProcessId: 9, ParentProcessId: 1, Name: "x", CommandLine: null })).length, 1, "ConvertTo-Json gives an object, not an array, for one process");
  assert.deepEqual(parseWindows("not json"), []);

  const rows = [
    { pid: 1, ppid: 0 }, { pid: 2, ppid: 1 }, { pid: 3, ppid: 2 }, { pid: 4, ppid: 3 }, { pid: 5, ppid: 3 }, { pid: 6, ppid: 5 }, { pid: 9, ppid: 99 },
  ];
  assert.deepEqual(ancestorsOf(rows, 6).map((r) => r.pid), [5, 3, 2]); // stops before pid 1
  assert.deepEqual(ancestorsOf(rows, 9), []);                            // its parent is not in the table
  assert.deepEqual(descendantsLeafFirst(rows, 3), [4, 6, 5, 3]);
});
