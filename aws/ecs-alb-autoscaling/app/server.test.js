"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

async function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"]
  });
  const [output] = await once(child.stdout, "data");
  const port = /Listening on port (\d+)/.exec(String(output))?.[1];
  assert.ok(port, `unexpected server output: ${output}`);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test("health check answers while CPU work is in flight", async () => {
  const { child, baseUrl } = await startServer();

  try {
    const work = fetch(`${baseUrl}/work?ms=1500`);
    await delay(100);

    const started = Date.now();
    const health = await fetch(`${baseUrl}/health`);
    const elapsed = Date.now() - started;

    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.ok(elapsed < 500, `health check took ${elapsed}ms while work was running`);

    const workResponse = await work;
    assert.equal(workResponse.status, 200);
    assert.equal((await workResponse.json()).path, "/work");
  } finally {
    child.kill();
    await once(child, "exit");
  }
});
