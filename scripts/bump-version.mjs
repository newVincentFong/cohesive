#!/usr/bin/env node
/**
 * Bump Mac app version across package / Tauri / Cargo files and commit.
 *
 * Does not touch website files, and does not tag or push.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor
 *   node scripts/bump-version.mjs major
 *   node scripts/bump-version.mjs 0.2.0
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const VERSION_FILES = [
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

function writeJson(relPath, value) {
  fs.writeFileSync(
    path.join(root, relPath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function readText(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function writeText(relPath, value) {
  fs.writeFileSync(path.join(root, relPath), value, "utf8");
}

function parseSemver(version) {
  const match = SEMVER_RE.exec(version);
  if (!match) fail(`invalid semver "${version}" (expected X.Y.Z)`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(current, kind) {
  if (SEMVER_RE.test(kind)) return kind;

  const { major, minor, patch } = parseSemver(current);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  fail(`unknown bump kind "${kind}" (use patch|minor|major|X.Y.Z)`);
}

function git(args, { stdio = "pipe" } = {}) {
  const result = execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio,
  });
  return typeof result === "string" ? result.trim() : "";
}

function stagedPaths() {
  const out = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  return out ? out.split("\n").filter(Boolean) : [];
}

function assertCleanIndexForBump() {
  const staged = stagedPaths();
  const unexpected = staged.filter((p) => !VERSION_FILES.includes(p));
  if (unexpected.length > 0) {
    fail(
      `index has staged files unrelated to version bump:\n  ${unexpected.join("\n  ")}\nUnstage them first, or commit them separately.`,
    );
  }
}

function updatePackageJson(next) {
  const pkg = readJson("package.json");
  pkg.version = next;
  writeJson("package.json", pkg);
}

function updatePackageLock(next) {
  const rel = "package-lock.json";
  let text = readText(rel);

  // Root lock metadata
  const rootVersion = text.replace(
    /^(\{\s*"name": "cohesive",\s*"version": )"([^"]*)"/,
    `$1"${next}"`,
  );
  if (rootVersion === text) {
    fail(`could not find root version in ${rel}`);
  }
  text = rootVersion;

  // packages[""] entry
  const packagesVersion = text.replace(
    /("packages": \{\s*"": \{\s*"name": "cohesive",\s*"version": )"([^"]*)"/,
    `$1"${next}"`,
  );
  if (packagesVersion === text) {
    fail(`could not find packages[""] version in ${rel}`);
  }
  writeText(rel, packagesVersion);
}

function updateTauriConf(next) {
  const conf = readJson("src-tauri/tauri.conf.json");
  conf.version = next;
  writeJson("src-tauri/tauri.conf.json", conf);
}

function updateCargoToml(next) {
  const rel = "src-tauri/Cargo.toml";
  const text = readText(rel);
  const updated = text.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]*"/m,
    `$1"${next}"`,
  );
  if (updated === text) {
    fail(`could not find [package] version in ${rel}`);
  }
  writeText(rel, updated);
}

function updateCargoLock(next) {
  const rel = "src-tauri/Cargo.lock";
  const text = readText(rel);
  const updated = text.replace(
    /(\[\[package\]\]\nname = "cohesive"\nversion = )"([^"]*)"/,
    `$1"${next}"`,
  );
  if (updated === text) {
    fail(`could not find cohesive package version in ${rel}`);
  }
  writeText(rel, updated);
}

function main() {
  const kind = process.argv[2];
  if (!kind) {
    fail("usage: node scripts/bump-version.mjs <patch|minor|major|X.Y.Z>");
  }

  assertCleanIndexForBump();

  const current = readJson("package.json").version;
  parseSemver(current);
  const next = bumpVersion(current, kind);
  if (next === current) {
    fail(`version is already ${current}`);
  }

  updatePackageJson(next);
  updatePackageLock(next);
  updateTauriConf(next);
  updateCargoToml(next);
  updateCargoLock(next);

  git(["add", "--", ...VERSION_FILES]);
  git(["commit", "-m", `Bump version to ${next}`], { stdio: "inherit" });

  console.log(`\nBumped ${current} → ${next} and committed.`);
  console.log("Next (manual):");
  console.log(`  git tag v${next}`);
  console.log("  git push origin HEAD");
  console.log(`  git push origin v${next}`);
}

main();
