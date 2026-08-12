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
  DTI_PACKAGE_JSON_URL,
  DEVKIT_INDEX_URL,
  DEVKIT_PACKAGE_JSON_URL,
  SNAPSHOT_META_URL,
  SNAPSHOT_DEVKIT_STORY_URL,
  SNAPSHOT_BSI_STATUS_URL,
  SNAPSHOT_DEVKIT_INDEX_URL,
  SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL,
  SNAPSHOT_BSI_ROOT_SCSS_URL,
  SNAPSHOT_DTI_VARIABLES_SCSS_URL,
  GITHUB_CONTENTS_DEVKIT_STORIES_URL,
} from "../src/constants.js";
import { parseBridge, parseDesignTokens, parseBsiMap } from "../src/loaders/tokens.js";
import { slugFromStorybookTitle, slugify, slugsToTry } from "../src/slugify.js";
import { classifyValue } from "../src/loaders/bsi.js"

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
    name: "[upstream] BSI custom_properties.json ⚠️ beta",
    url: BSI_CUSTOM_PROPERTIES_URL,
    jsonField: "accordion",
  },
  {
    name: "[upstream] BSI _root.scss bridge ⚠️ beta",
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
    name: "[upstream] Dev Kit index.json ⚠️ beta",
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
  {
    name: "[upstream] Design Tokens package.json",
    url: DTI_PACKAGE_JSON_URL,
    jsonField: "version",
  },
];

// ── Snapshot freshness — data-fetched branch is recent and complete ────────────
// If these fail, the server is serving stale or incomplete snapshot data.

export const SNAPSHOT_FRESHNESS: PipelineCheck[] = [
  {
    name: "[snapshot] snapshot-meta.json freshness (stale + version drift)",
    async run({ get }) {
      const t0 = Date.now();
      const metaRes = await get(SNAPSHOT_META_URL);
      if (!metaRes.ok) {
        return { url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${metaRes.status}` };
      }
      const meta = JSON.parse(metaRes.body) as {
        fetchedAt?: string;
        versions?: { bootstrapItalia?: string; devKitItalia?: string; designSystem?: string };
      };
      if (!meta.fetchedAt) {
        return { url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0, error: "fetchedAt missing" };
      }
      const ageMs = Date.now() - new Date(meta.fetchedAt).getTime();
      if (ageMs <= 48 * 3_600_000) {
        return { url: SNAPSHOT_META_URL, ok: true, ms: Date.now() - t0 };
      }

      // Stale (> 48h) isn't necessarily a problem — version-check.yml only
      // re-triggers upstream-snapshot.yml when an upstream version actually
      // changed, otherwise up to 7 days pass by design (weekly safety-net
      // cron). Compare live upstream versions against what the snapshot
      // recorded: same sources version-check.yml itself uses. A mismatch here
      // means version-check.yml should have triggered a refresh and didn't.
      const ageH = Math.round(ageMs / 3_600_000);
      // Same npm registry URLs as version-check.yml's curl calls (bash, can't
      // import from here). When BSI/Dev Kit Italia go stable, update the
      // dist-tag in BOTH places. 
      const [bsiRes, dkRes, dsnavRes] = await Promise.all([
        get('https://registry.npmjs.org/bootstrap-italia/beta'),
        get('https://registry.npmjs.org/@italia%2Fdev-kit-italia/beta'),
        get(DESIGNERS_DSNAV_URL),
      ]);

      if (!bsiRes.ok || !dkRes.ok || !dsnavRes.ok) {
        return {
          url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0,
          error: `snapshot is ${ageH}h old and upstream version check itself failed (registry unreachable)`,
        };
      }

      const liveBsi = (JSON.parse(bsiRes.body) as { version?: string }).version;
      const liveDk = (JSON.parse(dkRes.body) as { version?: string }).version;
      const liveDs = dsnavRes.body.match(/^\s*label:\s*"?([^"\n]+)"?/m)?.[1]?.trim();

      const drifted: string[] = [];
      if (liveBsi && liveBsi !== meta.versions?.bootstrapItalia) {
        drifted.push(`bootstrapItalia: snapshot ${meta.versions?.bootstrapItalia}, upstream ${liveBsi}`);
      }
      if (liveDk && liveDk !== meta.versions?.devKitItalia) {
        drifted.push(`devKitItalia: snapshot ${meta.versions?.devKitItalia}, upstream ${liveDk}`);
      }
      if (liveDs && liveDs !== meta.versions?.designSystem) {
        drifted.push(`designSystem: snapshot ${meta.versions?.designSystem}, upstream ${liveDs}`);
      }

      if (drifted.length > 0) {
        return {
          url: SNAPSHOT_META_URL, ok: false, ms: Date.now() - t0,
          error: `snapshot is ${ageH}h old AND upstream has moved on — version-check.yml should have triggered a refresh: ${drifted.join('; ')}`,
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
  {
    name: "[snapshot] BSI custom_properties — no malformed variable names",
    async run({ get }) {
      const t0 = Date.now();
      const res = await get(SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL);
      if (!res.ok) {
        return { url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const raw = JSON.parse(res.body) as Record<string, Array<{ 'variable-name': string }>>;
      const malformed = Object.values(raw).flat()
        .filter(e => !/^--bsi-[a-z0-9-]+$/.test(e['variable-name']?.trim() ?? ''));
      if (malformed.length > 0) {
        return {
          url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: false, ms: Date.now() - t0,
          error: `${malformed.length} malformed variable names: ${malformed.map(e => e['variable-name']).slice(0, 3).join(', ')}`,
        };
      }
      return { url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] \$it- bridge chain resolves (spacing-m)",
    async run({ get }) {
      const t0 = Date.now();
      const [rootRes, varsRes] = await Promise.all([
        get(SNAPSHOT_BSI_ROOT_SCSS_URL),
        get(SNAPSHOT_DTI_VARIABLES_SCSS_URL),
      ]);
      if (!rootRes.ok) return { url: SNAPSHOT_BSI_ROOT_SCSS_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${rootRes.status}` };
      if (!varsRes.ok) return { url: SNAPSHOT_DTI_VARIABLES_SCSS_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${varsRes.status}` };

      const bridge = parseBridge(rootRes.body);
      const dti = parseDesignTokens(varsRes.body);

      const itName = bridge.get("--bsi-spacing-m");
      if (!itName) {
        return {
          url: SNAPSHOT_BSI_ROOT_SCSS_URL, ok: false, ms: Date.now() - t0,
          error: "bridge entry for --bsi-spacing-m not found in snapshot — parseBridge() may be out of sync with root.scss format",
        };
      }
      if (!dti.has(itName)) {
        return {
          url: SNAPSHOT_DTI_VARIABLES_SCSS_URL, ok: false, ms: Date.now() - t0,
          error: `${itName} not found in snapshot _variables.scss — chain breaks after bridge`,
        };
      }
      return { url: SNAPSHOT_DTI_VARIABLES_SCSS_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] bsiMap/bridge key overlap (no --bsi-* name in both)",
    async run({ get }) {
      const t0 = Date.now();
      const [propsRes, rootRes] = await Promise.all([
        get(SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL),
        get(SNAPSHOT_BSI_ROOT_SCSS_URL),
      ]);
      if (!propsRes.ok) return { url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${propsRes.status}` };
      if (!rootRes.ok) return { url: SNAPSHOT_BSI_ROOT_SCSS_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${rootRes.status}` };

      const bsiMap = parseBsiMap(JSON.parse(propsRes.body));
      const bridge = parseBridge(rootRes.body);

      const overlap = [...bsiMap.keys()].filter((name) => bridge.has(name));
      if (overlap.length > 0) {
        return {
          url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: false, ms: Date.now() - t0,
          error: `${overlap.length} name(s) declared in both component tokens and global bridge — resolveChain() would silently prefer the component one: ${overlap.slice(0, 3).join(', ')}`,
        };
      }
      return { url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] Dev Kit index — no slug collisions among docs entries",
    async run({ get }) {
      const t0 = Date.now();
      const res = await get(SNAPSHOT_DEVKIT_INDEX_URL);
      if (!res.ok) {
        return { url: SNAPSHOT_DEVKIT_INDEX_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const raw = JSON.parse(res.body) as { entries?: Record<string, { id: string; title: string; type: string }> };
      const bySlug = new Map<string, string[]>();
      for (const entry of Object.values(raw.entries ?? {})) {
        if (entry.type !== 'docs') continue;
        if (!entry.id.startsWith('componenti-')) continue;
        const slug = slugFromStorybookTitle(entry.title);
        if (!slug) continue;
        const existing = bySlug.get(slug) ?? [];
        existing.push(entry.id);
        bySlug.set(slug, existing);
      }
      const collisions = [...bySlug.entries()].filter(([, ids]) => ids.length > 1);
      if (collisions.length > 0) {
        const detail = collisions.map(([slug, ids]) => `${slug} (${ids.join(', ')})`).join('; ');
        return {
          url: SNAPSHOT_DEVKIT_INDEX_URL, ok: false, ms: Date.now() - t0,
          error: `${collisions.length} slug collision(s) — loadDevKitIndex() would silently drop entries: ${detail}`,
        };
      }
      return { url: SNAPSHOT_DEVKIT_INDEX_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] BSI status a11y check wording ('Done' literal in bsi.ts)",
    async run({ get }) {
      const t0 = Date.now();
      const res = await get(SNAPSHOT_BSI_STATUS_URL);
      if (!res.ok) {
        return { url: SNAPSHOT_BSI_STATUS_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const items = (JSON.parse(res.body) as { items?: Array<{ 'status a11y check'?: string }> }).items ?? [];
      const distinctValues = new Set(items.map(e => e['status a11y check'] ?? '(missing)'));
      const unexpected = [...distinctValues].filter(v => v !== 'Done');
      if (unexpected.length > 0) {
        return {
          url: SNAPSHOT_BSI_STATUS_URL, ok: false, ms: Date.now() - t0,
          error: `unexpected "status a11y check" value(s): ${unexpected.join(', ')} — bsi.ts's checkCompleted === 'Done' literal may be stale`,
        };
      }
      return { url: SNAPSHOT_BSI_STATUS_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] Dashboard DK_SLUG_ALIASES — no BSI/Dev Kit duplicate rows",
    async run({ get }) {
      const t0 = Date.now();
      const [statusRes, indexRes] = await Promise.all([
        get(SNAPSHOT_BSI_STATUS_URL),
        get(SNAPSHOT_DEVKIT_INDEX_URL),
      ]);
      if (!statusRes.ok) return { url: SNAPSHOT_BSI_STATUS_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${statusRes.status}` };
      if (!indexRes.ok) return { url: SNAPSHOT_DEVKIT_INDEX_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${indexRes.status}` };

      const status = JSON.parse(statusRes.body) as { items?: Array<{ title: string }> };
      const bsiSlugs = (status.items ?? []).map((e) =>
        slugify(e.title.replace(/`/g, '').replace(/\s*-\s*check\s+a11y\s+e\s+status\s*/i, '').trim())
      );

      const index = JSON.parse(indexRes.body) as { entries?: Record<string, { id: string; title: string; type: string }> };
      const dkSlugs = new Set(
        Object.values(index.entries ?? {})
          .filter((e) => e.type === 'docs' && e.id.startsWith('componenti-'))
          .map((e) => slugFromStorybookTitle(e.title))
          .filter((s): s is string => !!s)
      );

      // Mirrors site.js's DK_SLUG_ALIASES — keep in sync when site.js changes.
      const DASHBOARD_DK_ALIASES: Record<string, string> = {
        'buttons': 'button', 'chips': 'chip', 'notifications': 'notification',
        'progress-indicators': 'progress', 'sections': 'section',
        'steppers': 'stepper', 'toggles': 'toggle',
      };

      const missed = bsiSlugs.filter((bsiSlug) => {
        const narrowMatch = dkSlugs.has(DASHBOARD_DK_ALIASES[bsiSlug] ?? bsiSlug);
        if (narrowMatch) return false;
        return slugsToTry(bsiSlug).some((s) => dkSlugs.has(s));
      });

      if (missed.length > 0) {
        return {
          url: SNAPSHOT_BSI_STATUS_URL, ok: false, ms: Date.now() - t0,
          error: `${missed.length} component(s) would show as duplicated rows in the dashboard — DK_SLUG_ALIASES in site.js is missing an alias for: ${missed.join(', ')}`,
        };
      }
      return { url: SNAPSHOT_BSI_STATUS_URL, ok: true, ms: Date.now() - t0 };
    },
  },
  {
    name: "[snapshot] custom_properties — token-reference values have exactly one var()",
    async run({ get }) {
      const t0 = Date.now();
      const res = await get(SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL);
      if (!res.ok) {
        return { url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
      }
      const raw = JSON.parse(res.body) as Record<string, Array<{ 'variable-name': string; value: string }>>;
      const offenders: string[] = [];
      for (const entries of Object.values(raw)) {
        for (const e of entries) {
          if (classifyValue(e.value) !== 'token-reference') continue;
          const varCount = (e.value.match(/var\(/g) ?? []).length;
          if (varCount !== 1) offenders.push(`${e['variable-name']}: "${e.value}"`);
        }
      }
      if (offenders.length > 0) {
        return {
          url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: false, ms: Date.now() - t0,
          error: `${offenders.length} value(s) classified token-reference but don't contain exactly one var() — classifyValue()/matchSingleVarRef() may be out of sync: ${offenders.slice(0, 3).join('; ')}`,
        };
      }
      return { url: SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL, ok: true, ms: Date.now() - t0 };
    },
  },
];

// ── Legacy exports for canary.ts compatibility ────────────────────────────────
// canary.ts uses STATIC_SOURCES and PIPELINE_CHECKS — map to new names.

export const STATIC_SOURCES = UPSTREAM_HEALTH;
export const PIPELINE_CHECKS = SNAPSHOT_FRESHNESS;