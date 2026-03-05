#!/usr/bin/env tsx
/**
 * scripts/check-version.ts
 *
 * Verifies that package.json and publiccode.yml are in sync
 * with the given semver string.
 *
 * Exit 0 = in sync.
 * Exit 1 = mismatch — prints which files need updating.
 *
 * Usage:
 *   npx tsx scripts/check-version.ts 0.1.10
 *
 * Called automatically by the release workflow before publishing.
 * Run locally before tagging to catch mismatches early.
 */

import { readFileSync } from "node:fs";
import { resolve }      from "node:path";

// ── Args ──────────────────────────────────────────────────────────────────────

const expected = process.argv[2];

if (!expected) {
  console.error("Usage: check-version.ts <semver>  e.g. 0.1.10");
  process.exit(1);
}

// ── Read versions ─────────────────────────────────────────────────────────────

const root = resolve(import.meta.dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const pkgVersion: string = pkg.version;

const publiccode = readFileSync(resolve(root, "publiccode.yml"), "utf8");
const pcMatch    = publiccode.match(/^softwareVersion:\s*"?([^"\n]+)"?/m);
const pcVersion  = pcMatch?.[1]?.trim() ?? null;

// ── Compare ───────────────────────────────────────────────────────────────────

const errors: string[] = [];

if (pkgVersion !== expected) {
  errors.push(`  package.json:   "${pkgVersion}" → expected "${expected}"`);
}
if (pcVersion !== expected) {
  errors.push(`  publiccode.yml: "${pcVersion ?? "not found"}" → expected "${expected}"`);
}

if (errors.length > 0) {
  console.error(`❌ Version mismatch with v${expected}:\n${errors.join("\n")}\n`);
  console.error("Fix, commit, push — then re-tag:");
  console.error(`  git push origin :refs/tags/v${expected}`);
  console.error(`  git commit -am "chore: release v${expected}" && git push`);
  console.error(`  git tag -f v${expected} && git push origin v${expected}`);
  process.exit(1);
}

console.log(`✅ package.json and publiccode.yml in sync with v${expected}`);
