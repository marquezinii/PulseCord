import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const shared = {
  bundle: true,
  logLevel: "info",
  sourcemap: true,
  legalComments: "eof",
  external: ["electron"],
  define: {
    "process.env.PULSECORD_VERSION": JSON.stringify(packageJson.version)
  }
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [path.join(root, "src/main/index.ts")],
    outfile: path.join(dist, "main.cjs"),
    platform: "node",
    format: "cjs",
    target: "node24"
  }),
  build({
    ...shared,
    entryPoints: [path.join(root, "src/preload/index.ts")],
    outfile: path.join(dist, "preload.cjs"),
    platform: "node",
    format: "cjs",
    target: "chrome140",
    loader: {
      ".png": "dataurl",
      ".svg": "dataurl"
    }
  })
]);

await cp(path.join(root, "static/offline.html"), path.join(dist, "offline.html"));
await cp(path.join(root, "assets/pulsecord-logo.png"), path.join(dist, "pulsecord-logo.png"));
console.log(`PulseCord ${packageJson.version} built from the clean-room source tree.`);
