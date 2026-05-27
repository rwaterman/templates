/**
 * Node.js micro-benchmark suite.
 *
 * Measures CPU, memory, I/O, and async performance across common patterns.
 * Run with: node --expose-gc benchmark_simple.js
 * Optional: --json flag outputs machine-readable results.
 */

import { performance } from "node:perf_hooks";
import crypto from "node:crypto";
import { createReadStream, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Writable } from "node:stream";

const WARMUP_RUNS = 2;
const BENCH_RUNS = 5;
const jsonOutput = process.argv.includes("--json");

// --- Utilities ---

function forceGC() {
  if (global.gc) {
    global.gc();
    global.gc(); // double-collect for tenured objects
  }
}

function memoryDelta(before, after) {
  return Math.max(0, (after.heapUsed - before.heapUsed) / 1024 / 1024);
}

function statistics(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const min = sorted[0];
  const max = sorted[n - 1];
  const stddev = Math.sqrt(sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n);
  return { mean, median, min, max, stddev };
}

async function bench(name, fn, { runs = BENCH_RUNS, warmup = WARMUP_RUNS } = {}) {
  // Warmup — let V8 optimize the hot path
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const samples = [];
  let peakHeapMB = 0;

  for (let i = 0; i < runs; i++) {
    forceGC();
    const memBefore = process.memoryUsage();
    const start = performance.now();
    await fn();
    const elapsed = performance.now() - start;
    const memAfter = process.memoryUsage();

    samples.push(elapsed);
    peakHeapMB = Math.max(peakHeapMB, memoryDelta(memBefore, memAfter));
  }

  const stats = statistics(samples);
  return { name, ...stats, heapDeltaMB: +peakHeapMB.toFixed(2), runs };
}

// --- Benchmarks ---

async function cryptoSHA256() {
  for (let i = 0; i < 200_000; i++) {
    crypto.createHash("sha256").update("payload-" + i).digest("hex");
  }
}

async function cryptoHMAC() {
  const key = crypto.randomBytes(32);
  for (let i = 0; i < 150_000; i++) {
    crypto.createHmac("sha256", key).update("message-" + i).digest("hex");
  }
}

async function cryptoRandomBytes() {
  for (let i = 0; i < 50_000; i++) {
    crypto.randomBytes(256);
  }
}

async function jsonRoundtrip() {
  const obj = {
    arr: Array.from({ length: 500 }, (_, i) => ({
      id: i,
      label: "item-" + i,
      value: Math.random(),
      nested: { a: i * 2, b: "str".repeat(5) },
    })),
  };
  for (let i = 0; i < 2_000; i++) {
    JSON.parse(JSON.stringify(obj));
  }
}

async function jsonLargePayload() {
  const large = Array.from({ length: 5_000 }, (_,) => ({
    id: crypto.randomUUID(),
    ts: Date.now(),
    data: "x".repeat(100),
  }));
  const serialized = JSON.stringify(large);
  for (let i = 0; i < 50; i++) {
    JSON.parse(serialized);
  }
}

async function regexMatching() {
  const re = /([a-z]+)-(\d+)-([A-Z]{2,})/g;
  const text = "alpha-123-XY beta-4567-ABCD gamma-89-ZZ delta-1-QQ ".repeat(2_000);
  for (let i = 0; i < 200; i++) {
    re.lastIndex = 0;
    let c = 0;
    while (re.exec(text)) c++;
  }
}

async function regexURLParsing() {
  const re = /https?:\/\/([^/]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?/g;
  const urls = Array.from({ length: 1_000 }, (_, i) =>
    `https://api.example.com/v2/resource/${i}?page=${i}&limit=50#section`
  ).join(" ");
  for (let i = 0; i < 500; i++) {
    re.lastIndex = 0;
    let c = 0;
    while (re.exec(urls)) c++;
  }
}

async function mathLoop() {
  let n = 0;
  for (let i = 1; i < 5e7; i++) n += Math.sqrt(i) * Math.sin(i);
  if (!isFinite(n)) throw new Error("unexpected NaN in math loop");
}

async function mathSort() {
  const arr = Array.from({ length: 500_000 }, () => Math.random());
  arr.sort((a, b) => a - b);
}

async function bufferAlloc() {
  for (let i = 0; i < 20_000; i++) {
    const b = Buffer.alloc(4096);
    b.write("x".repeat(64), 0);
    b.toString("hex", 0, 128);
  }
}

async function bufferConcat() {
  const chunks = Array.from({ length: 200 }, () => crypto.randomBytes(1024));
  for (let i = 0; i < 5_000; i++) {
    Buffer.concat(chunks);
  }
}

async function streamZlibRoundtrip() {
  const tmpDir = mkdtempSync(join(tmpdir(), "bench-"));
  const filePath = join(tmpDir, "data.bin");

  // Write ~4MB test file
  const data = crypto.randomBytes(4 * 1024 * 1024);
  writeFileSync(filePath, data);

  // Compress (discard output — measuring CPU cost)
  await pipeline(
    createReadStream(filePath),
    createGzip({ level: 6 }),
    new Writable({ write(_chunk, _enc, cb) { cb(); } })
  );

  try { unlinkSync(filePath); } catch { /* best-effort cleanup */ }
}

async function promiseAllResolution() {
  for (let i = 0; i < 1_000; i++) {
    await Promise.all(
      Array.from({ length: 500 }, (_, j) => Promise.resolve(j))
    );
  }
}

async function asyncIteratorThroughput() {
  async function* generate(n) {
    for (let i = 0; i < n; i++) yield i;
  }

  let sum = 0;
  for await (const val of generate(500_000)) {
    sum += val;
  }
  if (sum === 0) throw new Error("unexpected zero sum");
}

async function mapSetOperations() {
  const map = new Map();
  for (let i = 0; i < 500_000; i++) {
    map.set(`key-${i}`, { value: i });
  }
  for (let i = 0; i < 500_000; i++) {
    map.get(`key-${Math.floor(Math.random() * 500_000)}`);
  }
  map.clear();
}

async function objectPropertyAccess() {
  const objects = Array.from({ length: 100_000 }, (_, i) => ({
    id: i,
    name: "item-" + i,
    value: Math.random(),
    active: i % 2 === 0,
  }));

  let sum = 0;
  for (let round = 0; round < 50; round++) {
    for (const obj of objects) {
      sum += obj.value;
    }
  }
  if (!isFinite(sum)) throw new Error("unexpected non-finite sum");
}

// --- Runner ---

async function main() {
  const suites = [
    { category: "Crypto", benches: [
      ["crypto-sha256", cryptoSHA256],
      ["crypto-hmac", cryptoHMAC],
      ["crypto-random-bytes", cryptoRandomBytes],
    ]},
    { category: "Serialization", benches: [
      ["json-roundtrip", jsonRoundtrip],
      ["json-large-payload", jsonLargePayload],
    ]},
    { category: "Regex", benches: [
      ["regex-matching", regexMatching],
      ["regex-url-parsing", regexURLParsing],
    ]},
    { category: "Compute", benches: [
      ["math-loop", mathLoop],
      ["math-sort", mathSort],
    ]},
    { category: "Memory", benches: [
      ["buffer-alloc", bufferAlloc],
      ["buffer-concat", bufferConcat],
      ["map-set-ops", mapSetOperations],
      ["object-property-access", objectPropertyAccess],
    ]},
    { category: "I/O & Streams", benches: [
      ["stream-zlib-roundtrip", streamZlibRoundtrip],
    ]},
    { category: "Async", benches: [
      ["promise-all", promiseAllResolution],
      ["async-iterator", asyncIteratorThroughput],
    ]},
  ];

  const results = [];
  const startTime = performance.now();

  for (const suite of suites) {
    for (const [name, fn] of suite.benches) {
      const result = await bench(name, fn);
      results.push({ category: suite.category, ...result });
    }
  }

  const totalTime = performance.now() - startTime;

  if (jsonOutput) {
    const os = await import("node:os");
    const output = {
      node: process.version,
      arch: process.arch,
      platform: process.platform,
      cpus: os.cpus()[0]?.model?.trim() ?? "unknown",
      cpuCount: os.cpus().length,
      timestamp: new Date().toISOString(),
      results,
      totalMs: +totalTime.toFixed(1),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Human-readable output
  const os = await import("node:os");
  const cpuModel = os.cpus()[0]?.model?.trim() ?? "unknown";
  const cpuCount = os.cpus().length;

  console.error(`\nNode ${process.version} | ${process.arch} | ${cpuModel} (${cpuCount} cores)`);
  console.error(`GC exposed: ${!!global.gc} | Runs per bench: ${BENCH_RUNS}\n`);
  console.error("\u2500".repeat(72));

  let currentCategory = "";
  for (const r of results) {
    if (r.category !== currentCategory) {
      currentCategory = r.category;
      console.error(`\n  ${currentCategory}`);
      console.error(`  ${"Name".padEnd(24)}${"Median".padStart(9)}${"Mean".padStart(9)}${"Min".padStart(9)}${"Max".padStart(9)}${"StdDev".padStart(9)}`);
      console.error("  " + "\u2500".repeat(69));
    }
    console.error(
      `  ${r.name.padEnd(24)}` +
      `${r.median.toFixed(1).padStart(8)}ms` +
      `${r.mean.toFixed(1).padStart(8)}ms` +
      `${r.min.toFixed(1).padStart(8)}ms` +
      `${r.max.toFixed(1).padStart(8)}ms` +
      `${r.stddev.toFixed(1).padStart(8)}ms`
    );
  }

  console.error("\n" + "\u2500".repeat(72));
  console.error(`  Total: ${(totalTime / 1000).toFixed(2)}s`);
  console.error("");

  if (!global.gc) {
    console.error("  Tip: run with --expose-gc for more accurate memory measurements.\n");
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exitCode = 1;
});
