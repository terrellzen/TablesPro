import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "PostgreSQL",
  "CC0-1.0",
  "Unlicense"
]);

const deniedFragments = [
  "Business Source",
  "Server Side Public",
  "Commons Clause",
  "Elastic License",
  "PolyForm",
  "NonCommercial",
  "Proprietary"
];

const activePackages = readActivePackages("pnpm-lock.yaml");
const packageFiles = collectPackageFiles("node_modules/.pnpm", activePackages);
const violations = [];

for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (pkg.private) {
    continue;
  }

  const license = normalizeLicense(pkg.license);
  if (!license || deniedFragments.some((fragment) => license.includes(fragment))) {
    violations.push(`${pkg.name ?? file}: missing or denied license (${license ?? "unknown"})`);
    continue;
  }

  const terms = license
    .replace(/[()]/g, "")
    .split(/\s+(?:OR|AND)\s+/)
    .map((term) => term.trim());

  if (!terms.some((term) => allowed.has(term))) {
    violations.push(`${pkg.name ?? file}: ${license}`);
  }
}

if (violations.length > 0) {
  console.error("Dependency license policy violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Validated ${packageFiles.length} installed package manifests against the license allowlist.`);

function readActivePackages(lockfilePath) {
  const lockfile = readFileSync(lockfilePath, "utf8");
  const packagesStart = lockfile.indexOf("\npackages:\n");
  if (packagesStart === -1) {
    return new Set();
  }

  const refs = new Set();
  const packageSection = lockfile.slice(packagesStart);
  for (const line of packageSection.split("\n")) {
    const match = line.match(/^  '?([^':]+(?:\/[^'@:]+)?@[^':]+)'?:$/);
    if (!match?.[1]) {
      continue;
    }

    const key = match[1];
    const versionEnd = key.indexOf("(") === -1 ? key.length : key.indexOf("(");
    const withoutPeers = key.slice(0, versionEnd);
    const versionSeparator = withoutPeers.startsWith("@")
      ? withoutPeers.indexOf("@", withoutPeers.indexOf("/") + 1)
      : withoutPeers.indexOf("@");

    if (versionSeparator === -1) {
      continue;
    }

    const name = withoutPeers.slice(0, versionSeparator);
    const version = withoutPeers.slice(versionSeparator + 1);
    refs.add(`${name}@${version}`);
  }
  return refs;
}

function collectPackageFiles(root, activePackages) {
  try {
    statSync(root);
  } catch {
    console.error("node_modules/.pnpm was not found. Run dependency installation before license validation.");
    process.exit(1);
  }

  const files = [];
  for (const storeEntry of readdirSync(root, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) {
      continue;
    }

    const modulesDir = join(root, storeEntry.name, "node_modules");
    try {
      statSync(modulesDir);
    } catch {
      continue;
    }

    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (entry.name.startsWith("@")) {
        const scopeDir = join(modulesDir, entry.name);
        for (const scopedEntry of readdirSync(scopeDir, { withFileTypes: true })) {
          if (scopedEntry.isDirectory()) {
            addIfActive(files, join(scopeDir, scopedEntry.name, "package.json"), activePackages);
          }
        }
      } else {
        addIfActive(files, join(modulesDir, entry.name, "package.json"), activePackages);
      }
    }
  }
  return files;
}

function addIfActive(files, packageJsonPath, activePackages) {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (activePackages.has(`${pkg.name}@${pkg.version}`)) {
      files.push(packageJsonPath);
    }
  } catch {
    // Some optional lockfile entries are not installed on every platform.
  }
}

function normalizeLicense(license) {
  if (typeof license === "string") {
    return license;
  }
  if (license && typeof license.type === "string") {
    return license.type;
  }
  return undefined;
}
