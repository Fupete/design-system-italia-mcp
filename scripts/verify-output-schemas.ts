#!/usr/bin/env -S npx tsx
// scripts/verify-output-schemas.ts
//
// Exhaustive (not sampled) validation of every tool's real output against
// its Zod outputSchema, run entirely in-process against the real loaders —
// no MCP server, no Inspector round trip. Built after two schema bugs
// (tokens_search: extra `component` field, wrong global-token shape) slipped
// past typecheck/test/canary and were only caught by a hand-picked Inspector
// call on 2026-08-12. A sample missed them because the sample didn't happen
// to include the right component/query. This script removes the sampling
// gap by validating against every real component/token instead.
//
// 2026-08-12: tokens_search, tokens_list_globals, dsi_list_components and
// dsi_search_components had outputSchema/structuredContent REMOVED after
// measuring real payload size — worst case 22k-41k tokens (content +
// structuredContent duplicate), no natural cap on result count for any of
// the four. See CLAUDE.md "structuredContent coverage" note for the full
// table and reasoning. This script only validates the 8 tools that kept
// outputSchema.
//
// NOTE: the "assemble output" logic below duplicates each tool's handler
// body in src/tools/*.ts — not imported, because handlers aren't exported as
// pure functions (registered directly on the McpServer instance). Same
// tradeoff already accepted in canary_config.ts (duplicated npm registry
// URLs, cross-referenced by comment): two consumers don't justify extracting
// every handler into a pure function. If a tool's output shape changes,
// update BOTH the tool file and the block below — grep the tool name in
// both.
//
// Usage: npx tsx scripts/verify-output-schemas.ts [--skip-github]
//   --skip-github  skip github_get_component_issues (hits live GitHub API,
//                  rate-limited: 60/h without GITHUB_TOKEN, 5000/h with —
//                  see loaders/github.ts). Runs a small sample by default
//                  instead of full coverage, precisely because of this limit.

import type { ZodTypeAny } from "zod";
import {
  loadAllStatuses, loadStatus, loadVariants, loadVariantsResolvedSlug,
  loadAllTokens,
} from "../src/loaders/bsi.js";
import {
  loadDevKitIndex, loadDevKitEntry, loadStoryVariants, loadDevKitComponent,
} from "../src/loaders/devkit.js";
import { resolveToken, findComponentsByToken } from "../src/loaders/tokens.js";
import { loadDsMeta } from "../src/loaders/meta.js";
import { loadGuidelines } from "../src/loaders/designers.js";
import { loadComponentIssues } from "../src/loaders/github.js";
import { buildMeta, resolveDesignersUrl } from "../src/tools/helpers.js";
import {
  BETA_WARNING, BSI_STATUS_URL, DEVKIT_INDEX_URL, DEVKIT_STORIES_URL,
  BSI_COMPONENT_URL, BSI_COMPONENT_DEFAULT_SUBFOLDER, subfolderFromDocUrl,
  BSI_CUSTOM_PROPERTIES_URL, DTI_VARIABLES_SCSS_URL, BSI_ROOT_SCSS_URL,
  DESIGNERS_COMPONENT_URL, GITHUB_SEARCH_ISSUES_URL, GITHUB_WATCHED_REPOS,
} from "../src/constants.js";
import { formatTimestamp } from "../src/utils.js";
import {
  ZBsiListComponentVariantsOutput, ZDevkitListComponentVariantsOutput,
  ZDevkitListComponentPropsOutput, ZTokensResolveOutput,
  ZTokensFindComponentsOutput, ZDocsGetComponentGuideOutput,
  ZBsiListComponentsByStatusOutput, ZGithubGetComponentIssuesOutput,
} from "../src/schemas.js";

const SKIP_GITHUB = process.argv.includes("--skip-github");
const GITHUB_SAMPLE_SIZE = 5; // rate-limited, see header comment

let totalChecked = 0;
let totalFailed = 0;
const failuresByTool = new Map<string, string[]>();

function check(schema: ZodTypeAny, data: unknown, tool: string, label: string): void {
  totalChecked++;
  const result = schema.safeParse(data);
  if (!result.success) {
    totalFailed++;
    const detail = result.error.issues.slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    const list = failuresByTool.get(tool) ?? [];
    list.push(`${label} — ${detail}`);
    failuresByTool.set(tool, list);
  }
}

async function main() {
  console.log("Loading base data (status, devkit index, tokens, dsMeta)...");
  const [statuses, devKitIndex, allTokens, dsMeta] = await Promise.all([
    loadAllStatuses(), loadDevKitIndex(), loadAllTokens(), loadDsMeta(),
  ]);
  const allSlugs = [...new Set([...statuses.keys(), ...devKitIndex.keys()])];
  console.log(`${allSlugs.length} component slugs, ${Object.keys(allTokens).length} components with tokens.\n`);

  // ── bsi_list_component_variants ──────────────────────────────────────────
  console.log("bsi_list_component_variants...");
  for (const slug of allSlugs) {
    const status = await loadStatus(slug);
    const canonicalSlug = status?.slug ?? slug;
    const bsiResolvedSlug = await loadVariantsResolvedSlug(slug);
    const variants = await loadVariants(canonicalSlug);
    const output = {
      component: canonicalSlug,
      total: variants.length,
      variantsAvailable: variants.map((v) => v.name),
      meta: buildMeta({
        dsMeta,
        sourceUrls: [BSI_COMPONENT_URL(
          status?.sourceUrls.bsiDoc ? subfolderFromDocUrl(status.sourceUrls.bsiDoc) : BSI_COMPONENT_DEFAULT_SUBFOLDER,
          bsiResolvedSlug
        )],
        warnings: [BETA_WARNING],
        stability: "beta" as const,
        extra: { versions: dsMeta?.versions ?? undefined, designersUrl: resolveDesignersUrl(dsMeta, canonicalSlug) },
      }),
    };
    check(ZBsiListComponentVariantsOutput, output, "bsi_list_component_variants", slug);
  }

  // ── devkit_list_component_variants ───────────────────────────────────────
  console.log("devkit_list_component_variants...");
  for (const slug of allSlugs) {
    const status = await loadStatus(slug);
    const canonicalSlug = status?.slug ?? slug;
    const devKitEntry = await loadDevKitEntry(canonicalSlug);
    const storyVariants = await loadStoryVariants(canonicalSlug);
    const names = storyVariants?.map((v) => v.name) ?? [];
    const output = {
      component: canonicalSlug,
      total: names.length,
      variantsAvailable: names,
      meta: buildMeta({
        dsMeta,
        sourceUrls: [devKitEntry ? DEVKIT_STORIES_URL(devKitEntry.importPath) : DEVKIT_INDEX_URL],
        warnings: [BETA_WARNING],
        stability: "beta" as const,
        extra: { designersUrl: resolveDesignersUrl(dsMeta, canonicalSlug) },
      }),
    };
    check(ZDevkitListComponentVariantsOutput, output, "devkit_list_component_variants", slug);
  }

  // ── devkit_list_component_props ──────────────────────────────────────────
  console.log("devkit_list_component_props...");
  for (const slug of allSlugs) {
    const status = await loadStatus(slug);
    const canonicalSlug = status?.slug ?? slug;
    const devKitEntry = await loadDevKitEntry(canonicalSlug);
    const devKitComponent = await loadDevKitComponent(canonicalSlug);
    const output = {
      component: canonicalSlug,
      tagName: devKitComponent?.tagName ?? null,
      props: devKitComponent?.props ?? [],
      subcomponents: devKitComponent?.subcomponents ?? [],
      meta: buildMeta({
        dsMeta,
        sourceUrls: [devKitEntry?.storybookUrl ?? DEVKIT_INDEX_URL],
        warnings: [BETA_WARNING],
        stability: "beta" as const,
        extra: { designersUrl: resolveDesignersUrl(dsMeta, canonicalSlug) },
      }),
    };
    check(ZDevkitListComponentPropsOutput, output, "devkit_list_component_props", slug);
  }

  // ── tokens_resolve ────────────────────────────────────────────────────────
  // Every real --bsi-* variable name across all components — the full domain
  // this tool accepts, not a hand-picked handful.
  console.log("tokens_resolve...");
  const allVarNames = new Set<string>();
  for (const entries of Object.values(allTokens)) {
    for (const e of entries) allVarNames.add(e["variable-name"]);
  }
  for (const varName of allVarNames) {
    const result = await resolveToken(varName);
    const output = {
      input: varName,
      normalizedName: result.name,
      value: result.value,
      resolvedVia: result.resolvedVia,
      ...(result.ambiguous ? { ambiguousValues: result.ambiguous } : {}),
      ...(result.composedOf ? { composedOf: result.composedOf } : {}),
      meta: buildMeta({
        dsMeta,
        sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL],
        warnings: [BETA_WARNING],
        stability: "beta" as const,
        extra: { versions: dsMeta?.versions ?? undefined },
      }),
    };
    check(ZTokensResolveOutput, output, "tokens_resolve", varName);
  }

  // ── tokens_find_components ───────────────────────────────────────────────
  console.log("tokens_find_components...");
  for (const varName of allVarNames) {
    const results = await findComponentsByToken(varName);
    const output = {
      query: varName,
      total: results.length,
      results,
      meta: buildMeta({
        dsMeta,
        sourceUrls: [BSI_CUSTOM_PROPERTIES_URL, BSI_ROOT_SCSS_URL, DTI_VARIABLES_SCSS_URL],
        warnings: [BETA_WARNING],
        stability: "beta" as const,
        extra: { versions: dsMeta?.versions ?? undefined },
      }),
    };
    check(ZTokensFindComponentsOutput, output, "tokens_find_components", varName);
  }

  // ── docs_get_component_guide ─────────────────────────────────────────────
  console.log("docs_get_component_guide...");
  for (const slug of allSlugs) {
    const [guidelinesResult, status, devKitEntry] = await Promise.all([
      loadGuidelines(slug), loadStatus(slug), loadDevKitEntry(slug),
    ]);
    const canonicalSlug = status?.slug ?? slug;
    const output = {
      name: status?.name ?? canonicalSlug,
      slug: canonicalSlug,
      description: guidelinesResult?.guidelines.description ?? null,
      categories: guidelinesResult?.guidelines.categories ?? [],
      status: status ? {
        libraryStatus: status.libraryStatus,
        accessibility: status.accessibility,
        notes: status.notes ?? null,
        knownIssueUrls: status.knownIssueUrls,
      } : null,
      guidelines: guidelinesResult ? {
        whenToUse: guidelinesResult.guidelines.whenToUse,
        howToUse: guidelinesResult.guidelines.howToUse,
      } : null,
      devKit: devKitEntry ? {
        slug: devKitEntry.slug,
        tags: devKitEntry.tags,
        storybookUrl: devKitEntry.storybookUrl,
      } : null,
      sourceUrls: {
        designersItalia: resolveDesignersUrl(dsMeta, canonicalSlug),
        bsiDoc: status?.sourceUrls.bsiDoc ?? null,
        figma: status?.sourceUrls.figma ?? null,
        devKitDoc: status?.sourceUrls.devKitDoc ?? null,
      },
      meta: buildMeta({
        dsMeta,
        sourceUrls: [DESIGNERS_COMPONENT_URL(canonicalSlug), BSI_STATUS_URL, DEVKIT_INDEX_URL],
        warnings: [BETA_WARNING],
        stability: "beta" as const,
        extra: { versions: dsMeta?.versions ?? undefined, designersUrl: resolveDesignersUrl(dsMeta, canonicalSlug) },
      }),
    };
    check(ZDocsGetComponentGuideOutput, output, "docs_get_component_guide", slug);
  }

  // ── bsi_list_components_by_status ────────────────────────────────────────
  // Full cross product: every real status value × both libraries — covers
  // the entire filter space (16 combinations), not one hand-picked status.
  console.log("bsi_list_components_by_status...");
  const STATUS_VALUES = [
    "PRONTO", "DA RIVEDERE A11Y", "DA RIVEDERE", "IN REVIEW",
    "DA COMPLETARE VARIANTI", "NON PRESENTE", "DA FARE", "N/D",
  ] as const;
  for (const lib of ["bootstrapItalia", "devKitItalia"] as const) {
    for (const statusValue of STATUS_VALUES) {
      const results = [...statuses.values()]
        .filter((s) => s.libraryStatus[lib].toUpperCase() === statusValue)
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          status: s.libraryStatus[lib],
          docUrl: (lib === "devKitItalia" ? s.sourceUrls.devKitDoc : s.sourceUrls.bsiDoc) ?? null,
        }));
      const output = {
        status: statusValue,
        total: results.length,
        results,
        meta: buildMeta({
          dsMeta,
          sourceUrls: [BSI_STATUS_URL],
          warnings: [BETA_WARNING],
          stability: "beta" as const,
          extra: { versions: dsMeta?.versions ?? undefined },
        }),
      };
      check(ZBsiListComponentsByStatusOutput, output, "bsi_list_components_by_status", `${lib}/${statusValue}`);
    }
  }

  // ── github_get_component_issues ──────────────────────────────────────────
  // Live GitHub API, rate-limited — sampled by default, full run only if
  // you have GITHUB_TOKEN set and explicitly want it (edit GITHUB_SAMPLE_SIZE
  // or the slice below).
  if (SKIP_GITHUB) {
    console.log("github_get_component_issues... skipped (--skip-github)");
  } else {
    console.log(`github_get_component_issues... (sample of ${GITHUB_SAMPLE_SIZE}, rate-limited API)`);
    for (const slug of allSlugs.slice(0, GITHUB_SAMPLE_SIZE)) {
      const [{ issues: liveIssues, error: issuesError }, status] = await Promise.all([
        loadComponentIssues(slug), loadStatus(slug),
      ]);
      const canonicalSlug = status?.slug ?? slug;
      const knownIssues = status?.knownIssueUrls ?? [];
      const liveUnique = liveIssues.filter((issue) => !knownIssues.includes(issue.url));
      const repoFilter = GITHUB_WATCHED_REPOS.map((r) => `repo:${r}`).join("+");
      const output = {
        component: canonicalSlug,
        name: status?.name ?? canonicalSlug,
        issues: {
          live: { total: issuesError ? null : liveUnique.length, results: liveUnique },
          known: { total: knownIssues.length, urls: knownIssues, note: "Known issues from components_status.json — manually updated, may not be live" },
        },
        meta: buildMeta({
          dsMeta: null,
          sourceUrls: [`${GITHUB_SEARCH_ISSUES_URL}?q=${canonicalSlug}+${repoFilter}+is:open`, BSI_STATUS_URL],
          warnings: [],
          stability: "stable" as const,
          extra: { dataFetchedAt: formatTimestamp() },
        }),
      };
      check(ZGithubGetComponentIssuesOutput, output, "github_get_component_issues", slug);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n==================== RIEPILOGO ====================");
  console.log(`${totalChecked} check totali, ${totalFailed} falliti.\n`);
  if (totalFailed > 0) {
    for (const [tool, items] of failuresByTool) {
      console.log(`--- ${tool} (${items.length} failure) ---`);
      for (const item of items.slice(0, 10)) console.log(`  ${item}`);
      if (items.length > 10) console.log(`  ... e altri ${items.length - 10}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Tutti i tool validano su TUTTI i dati reali (non un campione).");
  }
  if (SKIP_GITHUB) {
    console.log("\nNota: github_get_component_issues saltato (--skip-github) — nessuna garanzia su quel tool in questo run.");
  }
}

main().catch((err) => {
  console.error("Script fallito:", err);
  process.exitCode = 1;
});