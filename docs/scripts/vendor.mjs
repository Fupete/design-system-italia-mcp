/**
 * docs/scripts/vendor.mjs
 *
 * Copies Bootstrap Italia and Dev Kit Italia built assets from
 * node_modules into docs/assets/vendor/.
 * Run from repo root: node docs/scripts/vendor.mjs
 *
 * Output:
 *   docs/assets/vendor/bsi/css/bootstrap-italia.min.css
 *   docs/assets/vendor/bsi/js/bootstrap-italia.bundle.min.js
 *   docs/assets/vendor/bsi/svg/sprites.svg
 *   docs/assets/vendor/devkit/  (JS bundle + CSS + fonts + assets)
 */

import { cpSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root    = resolve(__dirname, "../..");  // repo root
const docsDir = resolve(__dirname, "..");     // docs/

// ── Versions (from devDependencies in package.json) ───────────────────────────

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const bsiVersion    = (pkg.devDependencies?.["bootstrap-italia"]       ?? "unknown").replace(/^\^|~/, "");
const devkitVersion = (pkg.devDependencies?.["@italia/dev-kit-italia"] ?? "unknown").replace(/^\^|~/, "");

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyFile(src, dest, label) {
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label} — not found: ${src}`);
    process.exit(1);
  }
}

function copyDir(src, dest, label, filter) {
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true, filter });
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label} — not found: ${src}`);
    process.exit(1);
  }
}

// ── Bootstrap Italia ──────────────────────────────────────────────────────────

const bsi = resolve(root, "node_modules/bootstrap-italia/dist");

console.log(`\n── Bootstrap Italia ${bsiVersion} ──`);
copyFile(
  resolve(bsi, "css/bootstrap-italia.min.css"),
  resolve(docsDir, "assets/vendor/bsi/css/bootstrap-italia.min.css"),
  "bootstrap-italia.min.css"
);
copyFile(
  resolve(bsi, "js/bootstrap-italia.bundle.min.js"),
  resolve(docsDir, "assets/vendor/bsi/js/bootstrap-italia.bundle.min.js"),
  "bootstrap-italia.bundle.min.js"
);
copyFile(
  resolve(bsi, "svg/sprites.svg"),
  resolve(docsDir, "assets/vendor/bsi/svg/sprites.svg"),
  "sprites.svg"
);

// ── Dev Kit Italia ────────────────────────────────────────────────────────────

const devkit = resolve(root, "node_modules/@italia/dev-kit-italia/dist");

console.log(`\n── Dev Kit Italia ${devkitVersion} ──`);
copyDir(
  devkit,
  resolve(docsDir, "assets/vendor/devkit"),
  "Dev Kit dist/ (JS bundle + CSS + fonts + assets)",
  (src) => !src.endsWith(".map")
);

// ── Done ──────────────────────────────────────────────────────────────────────

console.log(`\n🎉 Assets vendored into docs/assets/vendor/{bsi,devkit}/`);
console.log(`   Bootstrap Italia ${bsiVersion} · Dev Kit Italia ${devkitVersion}\n`);