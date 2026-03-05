#!/usr/bin/env tsx
/**
 * scripts/canary.ts
 *
 * Runs all upstream source checks defined in scripts/canary.config.ts
 * and reports results.
 *
 * Two check types are supported:
 *   StaticSource   — static URL, structural validation, all run in parallel
 *   PipelineCheck  — dynamic URL + semantic validation, also run in parallel
 *                    (each manages its own internal sequencing)
 *
 * Exit 0 = all sources healthy.
 * Exit 1 = one or more sources failed.
 *
 * When run inside GitHub Actions, writes HAS_FAILURES and FAILED_SOURCES
 * to $GITHUB_OUTPUT for the upstream-canary workflow to consume.
 *
 * Usage:
 *   npx tsx scripts/canary.ts
 *   GITHUB_TOKEN=ghp_... npx tsx scripts/canary.ts
 */

import {
  STATIC_SOURCES,
  PIPELINE_CHECKS,
  type StaticSource,
  type PipelineCheck,
  type CheckResult,
  type CheckHelpers,
} from "./canary.config.js";

// ── HTTP helper ───────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const h: Record<string, string> = {
    "User-Agent": "design-system-italia-mcp/canary",
  };
  if (process.env.GITHUB_TOKEN) {
    h["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function httpGet(
  url: string,
): Promise<{ ok: boolean; status: number; body: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, ms: Date.now() - t0 };
}

// ── Static check runner ───────────────────────────────────────────────────────

function assertJsonField(body: string, path: string): void {
  const data = JSON.parse(body);
  const keys = path.split(".");
  let cur: unknown = Array.isArray(data) ? data[0] : data;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") {
      throw new Error(`field "${path}" not found`);
    }
    cur = (cur as Record<string, unknown>)[k];
  }
  if (cur == null) throw new Error(`field "${path}" is null`);
}

async function runStatic(source: StaticSource): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const { ok, status, body } = await httpGet(source.url);
    if (!ok) throw new Error(`HTTP ${status}`);

    if (source.jsonField) assertJsonField(body, source.jsonField);

    if (source.minLength && body.length < source.minLength) {
      throw new Error(
        `response too short (${body.length} chars, expected ≥${source.minLength})`,
      );
    }

    return { name: source.name, url: source.url, ok: true, ms: Date.now() - t0 };
  } catch (err) {
    return {
      name: source.name,
      url: source.url,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - t0,
    };
  }
}

// ── Pipeline check runner ─────────────────────────────────────────────────────

const helpers: CheckHelpers = { get: httpGet };

async function runPipeline(check: PipelineCheck): Promise<CheckResult> {
  try {
    const result = await check.run(helpers);
    return { name: check.name, ...result };
  } catch (err) {
    return {
      name: check.name,
      url: "unknown",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: 0,
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results: CheckResult[] = await Promise.all([
  ...STATIC_SOURCES.map(runStatic),
  ...PIPELINE_CHECKS.map(runPipeline),
]);

const failed = results.filter((r) => !r.ok);
const passed = results.length - failed.length;

for (const r of results) {
  const icon = r.ok ? "✅" : "❌";
  const ms   = `${r.ms}ms`.padStart(6);
  const err  = r.error ? `  ${r.error}` : "";
  console.log(`${icon} [${ms}] ${r.name}${err}`);
}

console.log(`\n${passed}/${results.length} sources healthy`);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  const lines = failed.map((r) => `- ${r.name}: ${r.error} (${r.url})`).join("\n");
  appendFileSync(process.env.GITHUB_OUTPUT, `HAS_FAILURES=${failed.length > 0}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `FAILED_SOURCES<<EOF\n${lines}\nEOF\n`);
}

process.exit(failed.length > 0 ? 1 : 0);
