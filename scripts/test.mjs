import { readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(root, "tests");
const outDir = path.join(root, ".test-dist");

const entryPoints = await collectTestFiles(testsDir);
if (entryPoints.length === 0) {
  console.error("No test files found under tests/.");
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });

await build({
  entryPoints,
  outdir: outDir,
  outbase: testsDir,
  bundle: true,
  platform: "node",
  // CommonJS, matching how src/main is actually built (dist/main.cjs): those
  // modules use __dirname at module scope, which is not available when
  // bundling into ESM output without extra shimming.
  format: "cjs",
  target: "node24",
  sourcemap: true,
  logLevel: "info",
  // The real "electron" package only resolves to a usable API inside an
  // actual Electron runtime (under plain Node it's just a path string, and
  // can throw if its postinstall step never ran), so tests get a tiny local
  // stand-in instead. Nothing under test calls into it; it exists only so
  // modules like src/main/security.ts, which import Electron's types and a
  // few unused-at-import-time value bindings, resolve at all.
  alias: { electron: path.join(root, "tests/helpers/electron-stub.ts") },
  // jsdom loads several of its own assets (default stylesheets, worker
  // scripts) via paths relative to its own package layout at runtime;
  // bundling it breaks those lookups, so it stays a real, unbundled
  // dependency resolved from node_modules like normal.
  external: ["jsdom", "canvas"]
});

const child = spawn(
  process.execPath,
  ["--test", "--test-reporter=spec", `${outDir.replaceAll("\\", "/")}/**/*.test.js`],
  { stdio: "inherit" }
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(full)));
    } else if (entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}
