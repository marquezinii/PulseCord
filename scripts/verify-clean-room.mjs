import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenFragments = [
  ["v", "e", "s", "k", "t", "o", "p"].join(""),
  ["v", "e", "n", "c", "o", "r", "d"].join(""),
  ["e", "q", "u", "i", "b", "o", "p"].join(""),
  ["e", "q", "u", "i", "c", "o", "r", "d"].join("")
];
const targets = ["src", "package.json", "package-lock.json", "scripts/build.mjs"];
const violations = [];

for (const target of targets) {
  await scan(path.join(root, target));
}

if (violations.length > 0) {
  console.error("Clean-room boundary check failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Clean-room boundary check passed.");

async function scan(filePath) {
  const stat = await import("node:fs/promises").then(({ stat }) => stat(filePath));
  if (stat.isDirectory()) {
    for (const entry of await readdir(filePath)) await scan(path.join(filePath, entry));
    return;
  }

  const contents = (await readFile(filePath, "utf8")).toLowerCase();
  for (const fragment of forbiddenFragments) {
    if (contents.includes(fragment)) violations.push(`${path.relative(root, filePath)} contains ${fragment}`);
  }
}
