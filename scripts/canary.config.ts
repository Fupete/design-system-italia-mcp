/**
 * scripts/canary.config.ts
 *
 * Two check categories:
 *
 *   UPSTREAM_HEALTH   — upstream sources used by snapshot workflow are reachable
 *                       and structurally valid. Failures mean next snapshot may break.
 *
 *   SNAPSHOT_FRESHNESS — data-fetched branch is recent and structurally complete.
 *                        Failures mean server is serving stale or incomplete data.
 *
 * URLs imported from src/constants.ts (single source of truth).
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
  SNAPSHOT_META_URL,
  SNAPSHOT_DEVKIT_STORY_URL,
  SNAPSHOT_BSI_STATUS_URL,
  SNAPSHOT_DEVKIT_INDEX_URL,
  GITHUB_CONTENTS_DEVKIT_STORIES_URL,
} from "../src/constants.js";

// ── Shared result type ────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface StaticSource {
  name: string;
  url: string;
  jsonField?: string;
  minLength?: number;
}

export interface CheckHelpers {
  get(url: string): Promise<{ ok: boolean; status: number; body: string; ms: number }>;
}

export interface PipelineCheck {
  name: string;
  run(helpers: CheckHelpers): Promise<Omit<CheckResult, "name">>;
}

// ── Upstream health — sources used by snapshot workflow ───────────────────────
// If these fail, the next snapshot run will produce incomplete/stale data.

export const UPSTREAM_HEALTH: StaticSource[] = [
  {
    name: "[upstream] BSI components_status.json",
    url: BSI_STATUS_URL,
    jsonField: "items",
  },
  {
    name: "[upstream] BSI accordion markup",
    url: BSI_COMPONENT_URL(BSI_COMPONENT_DEFAULT_SUBFOLDER, "accordion"),
    jsonField: "name",
  },
  {
    name: "[upstream] BSI custom_properties.json ⚠️ alpha",
    url: BSI_CUSTOM_PROPERTIES_URL,
    jsonField: "accordion",
  },
  {
    name: "[upstream] BSI _root.scss bridge ⚠️ alpha",
    url: BSI_ROOT_SCSS_URL,
    minLength: 500,
  },
  {
    name: "[upstream] Designers Italia accordion.yaml",
    url: DESIGNERS_COMPONENT_URL("accordion"),
    minLength: 200,
  },
  {
    name: "[upstream] Designers Italia dsnav.yaml",
    url: DESIGNERS_DSNAV_URL,
    minLength: 100,
  },
  {
    name: "[upstream] Design Tokens _variables.scss",
    url: DTI_VARIABLES_SCSS_URL,
    minLength: 500,
  },
  {
    name: "[upstream] Dev Kit index.json ⚠️ alpha",
    url: DEVKIT_INDEX_URL,
    jsonField: "entries",
  },
  {
    name: "[upstream] BSI package.json",
    url: BSI_PACKAGE_JSON_URL,
    jsonField: "version",
  },
  {
    name: "[upstream] Dev Kit package.json",
    url: DEVKIT_PACKAGE_JSON_URL,
    jsonField: "version",
  },
];

// ── Snapshot freshness — data-fetched branch is recent and complete ────────────
// If these fail, the server is serving stale or incomplete snapshot data.

export const SNAPSHOT_FRESHNESS: PipelineCheck[] = [
  {
    name: "[snapshot] snapshot-meta.json freshness (< 48h)",
    async run({ get }) {
      const t0 = Date.now();
      const res = await get(SNAPSHOT_META_URL);
      if (!res.ok) {
        return { url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const meta = JSON.parse(res.body) as { fetchedAt?: string };
      if (!meta.fetchedAt) {
        return { url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0, error: "fetchedAt missing" };
      }
      const ageMs = Date.now() - new Date(meta.fetchedAt).getTime();
      const ageH = Math.round(ageMs / 3_600_000);
      if (ageMs > 48 * 3_600_000) {
        return {
          url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0,
          error: `snapshot is ${ageH}h old (threshold: 48h)`,
        };
      }
      return { url: SNAPSHOT_META_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] BSI components-status.json present",
    async run({ get }) {
      const t0 = Date.now();

      // Get expected count from upstream
      // Intentional fail-fast: if upstream is unreachable, we can't verify snapshot completeness.
      // A stale upstream = potential snapshot issue on next run anyway.
      const upstreamRes = await get(BSI_STATUS_URL);
      if (!upstreamRes.ok) {
        return { url: BSI_STATUS_URL, ok: false, ms: Date.now() - t0, error: `upstream HTTP ${upstreamRes.status}` };
      }
      const expected = (JSON.parse(upstreamRes.body) as { items?: unknown[] }).items?.length ?? 0;

      // Check snapshot
      const res = await get(SNAPSHOT_BSI_STATUS_URL);
      if (!res.ok) {
        return { url: SNAPSHOT_BSI_STATUS_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const count = (JSON.parse(res.body) as { items?: unknown[] }).items?.length ?? 0;
      if (count < expected) {
        return {
          url: SNAPSHOT_BSI_STATUS_URL, ok: false, ms: Date.now() - t0,
          error: `snapshot has ${count} components, upstream has ${expected}`,
        };
      }
      return { url: SNAPSHOT_BSI_STATUS_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] Dev Kit accordion story present",
    async run({ get }) {
      const t0 = Date.now();
      const url = SNAPSHOT_DEVKIT_STORY_URL("accordion");
      const res = await get(url);
      if (!res.ok) {
        return { url, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const data = JSON.parse(res.body) as { variants?: unknown[] };
      const count = data.variants?.length ?? 0;
      if (count === 0) {
        return { url, ok: false, ms: Date.now() - t0, error: "accordion snapshot has 0 variants" };
      }
      return { url, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] Dev Kit stories count (≥ components in index)",
    async run({ get }) {
      const t0 = Date.now();

      // Get expected count from snapshot index
      const indexUrl = SNAPSHOT_DEVKIT_INDEX_URL;
      const indexRes = await get(indexUrl);
      if (!indexRes.ok) {
        return { url: indexUrl, ok: false, ms: Date.now() - t0, error: `index HTTP ${indexRes.status}` };
      }
      const index = JSON.parse(indexRes.body) as { entries?: Record<string, { type: string; id: string }> };
      const expected = new Set(
        Object.values(index.entries ?? {})
          .filter(e => e.type === 'docs' && e.id.startsWith('componenti-'))
          .map(e => e.id.replace(/^componenti-/, '').replace(/--.*$/, ''))
      ).size;

      // Get actual stories count
      // Note: requires GITHUB_TOKEN for reliable rate limits (60/h without, 5000/h with)
      const storiesUrl = GITHUB_CONTENTS_DEVKIT_STORIES_URL;
      const storiesRes = await get(storiesUrl);
      if (!storiesRes.ok) {
        return { url: storiesUrl, ok: false, ms: Date.now() - t0, error: `HTTP ${storiesRes.status}` };
      }
      const count = (JSON.parse(storiesRes.body) as unknown[]).length;

      if (count < expected) {
        return {
          url: storiesUrl, ok: false, ms: Date.now() - t0,
          error: `${count} story snapshots vs ${expected} components in index`,
        };
      }
      return { url: storiesUrl, ok: true, ms: Date.now() - t0 };
    },
  },
];

// ── Legacy exports for canary.ts compatibility ────────────────────────────────
// canary.ts uses STATIC_SOURCES and PIPELINE_CHECKS — map to new names.

export const STATIC_SOURCES = UPSTREAM_HEALTH;
export const PIPELINE_CHECKS = SNAPSHOT_FRESHNESS;