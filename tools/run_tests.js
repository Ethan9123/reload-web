// node tools/run_tests.js (or `npm test`) — run every tests/*.js in its own process and aggregate results.
// Cross-platform (no bash loop); exits non-zero if any suite fails. Each test file sets process.exitCode on failure.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const dir = path.join(__dirname, "..", "tests");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort();
const t0 = Date.now();
let fail = 0;
for (const f of files) {
  const r = cp.spawnSync(process.execPath, [path.join(dir, f)], { encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) fail++;
  const last = ((r.stdout || "").trim().split("\n").pop() || "").slice(0, 80);
  console.log(`${ok ? "✓" : "✗"} ${f.padEnd(20)} ${last}`);
  if (!ok) { const err = (r.stderr || "").trim(); if (err) console.log(err.split("\n").slice(-4).join("\n")); }
}
console.log(`\n${files.length - fail}/${files.length} suites passed  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fail ? 1 : 0);
