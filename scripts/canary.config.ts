/**
 * scripts/canary.config.ts
 *
 * Defines which upstream sources to monitor and how to validate them.
 * Kept separate from src/constants.ts (runtime bundle) — this is devops config.
 *
 * Two check types:
 *
 *   StaticSource  — static URL, structural validation (data only, no logic)
 *   PipelineCheck — dynamic URL resolved at runtime, semantic validation
 *                   (e.g. source #7 whose URL is derived from source #6)
 *
 * URLs are always imported from src/constants.ts (single source of truth).
 */

import {
  BSI_STATUS_URL,
  BSI_CUSTOM_PROPERTIES_URL,
  BSI_ROOT_SCSS_URL,
  BSI_PACKAGE_JSON_URL,
  BSI_COMPONENT_URL,
  BSI_COMPONENT_DEFAULT_SUBFOLDER,
  DESIGNERS_COMPONENT_URL,
  DESIGNERS_DSNAV_URL,
  DTI_VARIABLES_SCSS_URL,
  DEVKIT_INDEX_URL,
  DEVKIT_PACKAGE_JSON_URL,
  DEVKIT_STORIES_URL,
} from "../src/constants.js";

// ── Shared result type ────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  ms: number;
}

// ── Static checks — pure data ─────────────────────────────────────────────────

export interface StaticSource {
  name: string;
  url: string;
  /** Assert a dot-notated JSON field is non-null (e.g. "entries", "items"). */
  jsonField?: string;
  /** Assert response body is at least this many characters. */
  minLength?: number;
}

export const STATIC_SOURCES: StaticSource[] = [
  // Source #1 — BSI component status (stable)
  // Structure: { items: RawStatusEntry[], totalCount: number }
  {
    name: "BSI components_status.json",
    url: BSI_STATUS_URL,
    jsonField: "items"
  },

  // Source #2 — BSI accordion markup (stable)
  // Structure: Array<{ name: string, content: string }>
  {
    name: "BSI accordion markup",
    url: BSI_COMPONENT_URL(BSI_COMPONENT_DEFAULT_SUBFOLDER, "accordion"),
    jsonField: "name"
  },

  // Source #3 — BSI CSS tokens ⚠️ alpha
  // Structure: Record<slug, RawTokenEntry[]> — key "accordion" must exist
  {
    name: "BSI custom_properties.json ⚠️ alpha",
    url: BSI_CUSTOM_PROPERTIES_URL,
    jsonField: "accordion"
  },

  // BSI root.scss — bridge --bsi-* → --it-* (used by source #5 for valueResolved) ⚠️ alpha
  {
    name: "BSI _root.scss bridge ⚠️ alpha",
    url: BSI_ROOT_SCSS_URL,
    minLength: 500
  },

  // Source #4 — Designers Italia guidelines
  {
    name: "Designers Italia accordion.yaml",
    url: DESIGNERS_COMPONENT_URL("accordion"),
    minLength: 200
  },

  // Source #9 — Designers Italia nav (versions + foundation URLs)
  {
    name: "Designers Italia dsnav.yaml",
    url: DESIGNERS_DSNAV_URL,
    minLength: 100
  },

  // Source #5 — Design Tokens Italia global variables
  {
    name: "Design Tokens _variables.scss",
    url: DTI_VARIABLES_SCSS_URL,
    minLength: 500
  },

  // Source #6 — Dev Kit Storybook index ⚠️ alpha
  // Structure: { v: number, entries: Record<string, IndexEntry> }
  {
    name: "Dev Kit index.json",
    url: DEVKIT_INDEX_URL,
    jsonField: "entries"
  },

  // Source #9 — version metadata
  {
    name: "BSI package.json",
    url: BSI_PACKAGE_JSON_URL,
    jsonField: "version"
  },

  {
    name: "Dev Kit package.json",
    url: DEVKIT_PACKAGE_JSON_URL,
    jsonField: "version"
  },
];

// ── Pipeline checks — logic-driven, URL resolved at runtime ──────────────────
//
// Used when a check depends on data fetched from another source.
// Each run() manages its own sequential steps internally and can therefore
// still be executed in parallel with other pipeline checks.

export interface CheckHelpers {
  /** Authenticated GET with timeout. Returns body text on success. */
  get(url: string): Promise<{ ok: boolean; status: number; body: string; ms: number }>;
}

export interface PipelineCheck {
  name: string;
  run(helpers: CheckHelpers): Promise<Omit<CheckResult, "name">>;
}

export const PIPELINE_CHECKS: PipelineCheck[] = [
  {
    // Source #7 — Dev Kit stories ⚠️ alpha (most volatile source)
    //
    // URL resolution mirrors loadDevKitIndex() in src/loaders/devkit.ts:
    //   - filter entries: type === 'docs' AND id starts with 'componenti-'
    //   - importPath = storiesImports?.[0] ?? entry.importPath
    //   - storiesImports[0] points to the .stories.ts file (not the .mdx docs entry)
    //
    // Validation mirrors parseStories() in src/loaders/devkit.ts:
    //   - extractTagName() looks for: component: 'it-*'
    //   - extractArgTypesBlock() looks for: argTypes: {
    // Keep these patterns in sync with the loader regexes.
    //
    // Catches:
    //   - component moved from dedicated package to bundle wrapper
    //   - stub file with no props or tag defined
    //   - breaking change in stories file structure
    //   - parser would silently return null (= devKit: null in tool responses)
    name: "Dev Kit accordion stories ⚠️ alpha",

    async run({ get }) {
      const t0 = Date.now();

      // Step 1 — resolve importPath from Dev Kit index
      // Mirrors loadDevKitIndex(): use storiesImports[0] if present, else importPath
      const index = await get(DEVKIT_INDEX_URL);
      if (!index.ok) {
        return {
          url: DEVKIT_INDEX_URL, ok: false, ms: Date.now() - t0,
          error: `index fetch failed: HTTP ${index.status}`
        };
      }

      const entries = (JSON.parse(index.body) as {
        entries: Record<string, {
          id: string;
          type: string;
          importPath: string;
          storiesImports?: string[];
        }>;
      }).entries;

      // Same filter as loadDevKitIndex()
      const accordionEntry = Object.values(entries).find(
        (e) => e.type === "docs" &&
          e.id.startsWith("componenti-") &&
          e.id.includes("accordion"),
      );

      if (!accordionEntry) {
        return {
          url: DEVKIT_INDEX_URL, ok: false, ms: Date.now() - t0,
          error: "accordion docs entry not found in Dev Kit index"
        };
      }

      // Mirrors: const importPath = entry.storiesImports?.[0] ?? entry.importPath
      const importPath = accordionEntry.storiesImports?.[0] ?? accordionEntry.importPath;
      const storiesUrl = DEVKIT_STORIES_URL(importPath);

      // Step 2 — fetch stories file and validate loader patterns
      const stories = await get(storiesUrl);
      if (!stories.ok) {
        return {
          url: storiesUrl, ok: false, ms: Date.now() - t0,
          error: `HTTP ${stories.status}`
        };
      }

      // Mirror extractTagName() — component: 'it-*' or "it-*" or `it-*`
      if (!/component:\s*['"`](it-[a-z0-9-]+)['"`]/m.test(stories.body)) {
        return {
          url: storiesUrl, ok: false, ms: Date.now() - t0,
          error: "no component tag (it-*) found — extractTagName() would return null"
        };
      }

      // Mirror extractArgTypesBlock() — argTypes: {
      if (!/argTypes:\s*\{/.test(stories.body)) {
        return {
          url: storiesUrl, ok: false, ms: Date.now() - t0,
          error: "no argTypes block found — loader would return empty props"
        };
      }

      return { url: storiesUrl, ok: true, ms: Date.now() - t0 };
    },
  },
];
