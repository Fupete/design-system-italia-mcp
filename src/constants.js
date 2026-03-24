"use strict";
// ─── Shared constants ────────────────────────────────────────────────────────
// Single place to update branch, base URLs and warnings
// when upstream sources change.
//
// RULE: do not duplicate these constants in loaders.
// If a source changes structure, update only the corresponding loader.
// If a branch or base URL changes, update here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GITHUB_WATCHED_REPOS = exports.GITHUB_CONTENTS_DEVKIT_STORIES_URL = exports.GITHUB_SEARCH_ISSUES_URL = exports.SNAPSHOT_META_URL = exports.SNAPSHOT_DSNAV_URL = exports.SNAPSHOT_DESIGNERS_COMPONENT_URL = exports.SNAPSHOT_DEVKIT_STORY_URL = exports.SNAPSHOT_DEVKIT_PROPS_URL = exports.SNAPSHOT_DEVKIT_INDEX_URL = exports.DTI_PACKAGE_JSON_URL = exports.SNAPSHOT_DTI_VARIABLES_SCSS_URL = exports.SNAPSHOT_BSI_ROOT_SCSS_URL = exports.SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL = exports.SNAPSHOT_BSI_COMPONENT_URL = exports.SNAPSHOT_BSI_STATUS_URL = exports.DEVKIT_PACKAGE_JSON_URL = exports.DEVKIT_STORIES_URL = exports.DEVKIT_STORYBOOK_BASE = exports.DEVKIT_INDEX_URL = exports.DTI_VARIABLES_SCSS_URL = exports.DESIGNERS_SITE_BASE = exports.DESIGNERS_DSNAV_URL = exports.DESIGNERS_COMPONENT_URL = exports.BSI_DOC_BASE = exports.BSI_PACKAGE_JSON_URL = exports.BSI_ROOT_SCSS_URL = exports.BSI_COMPONENT_DEFAULT_SUBFOLDER = exports.BSI_COMPONENT_URL = exports.BSI_CUSTOM_PROPERTIES_URL = exports.BSI_STATUS_URL = exports.BSI_API_MARKUP_BRANCH = exports.BSI_BRANCH = exports.ALPHA_WARNING = void 0;
exports.subfolderFromDocUrl = subfolderFromDocUrl;
// ─── Alpha warning ────────────────────────────────────────────────────────────
// Used in ping (index.ts) and in meta.warnings for tools exposing data from
// alpha sources (CSS tokens, Dev Kit Italia).
//
// Alpha sources:  #3 BSI custom_properties.json, #6 Dev Kit index, #7 Dev Kit stories
// Stable sources: #1 #2 BSI markup/status, #4 Designers YAML, #5 DTI, #8 GitHub Issues
exports.ALPHA_WARNING = 'Bootstrap Italia 3.x and Dev Kit Italia are in alpha. ' +
    'CSS tokens (--bsi-*), and web components may have breaking changes before stable release. ' +
    'HTML markup and component status are a little more reliable.';
// ─── Bootstrap Italia — sources #1 #2 #3 ────────────────────────────────────
/** Active branch with structured token APIs — not present in 2.x */
exports.BSI_BRANCH = '3.x';
/**
 * Branch containing updated API markup and custom properties for BSI 3.x.
 * Using feature/update-examples-api-v3 until it merges into 3.x.
 * TODO: switch back to BSI_BRANCH when feature/update-examples-api-v3 is merged into 3.x
 */
exports.BSI_API_MARKUP_BRANCH = 'feature/update-examples-api-v3';
var BSI_RAW_BASE = "https://raw.githubusercontent.com/italia/bootstrap-italia/".concat(exports.BSI_BRANCH);
var BSI_API_MARKUP_BASE = "https://raw.githubusercontent.com/italia/bootstrap-italia/".concat(exports.BSI_API_MARKUP_BRANCH);
/** List of ~55 components with status, accessibility, known issues */
exports.BSI_STATUS_URL = "".concat(BSI_RAW_BASE, "/api/components_status.json");
/** Per-component CSS tokens --bsi-* with semantic descriptions ⚠️ alpha */
export const BSI_CUSTOM_PROPERTIES_URL = `${BSI_API_MARKUP_BASE}/api/custom_properties.json`;
/** HTML markup variants per component — subfolder varies by category */
var BSI_COMPONENT_URL = function (subfolder, slug) {
    return "".concat(BSI_API_MARKUP_BASE, "/api/").concat(subfolder, "/").concat(slug, ".json");
};
exports.BSI_COMPONENT_URL = BSI_COMPONENT_URL;
/** Default subfolder for components without a bsiDocUrl */
exports.BSI_COMPONENT_DEFAULT_SUBFOLDER = 'componenti';
// Extracts API subfolder from BSI doc URL
// "https://italia.github.io/bootstrap-italia/docs/menu-di-navigazione/footer/"
// → "menu-di-navigazione"
function subfolderFromDocUrl(bsiDocUrl) {
    var _a;
    var match = bsiDocUrl.match(/\/docs\/([^/]+)\/[^/]+\/?$/);
    return (_a = match === null || match === void 0 ? void 0 : match[1]) !== null && _a !== void 0 ? _a : exports.BSI_COMPONENT_DEFAULT_SUBFOLDER;
}
/** Bridge --bsi-* → --it-* (required for valueResolved) */
exports.BSI_ROOT_SCSS_URL = "".concat(BSI_RAW_BASE, "/src/scss/base/_root.scss");
/** BSI version for meta.versions.bootstrapItalia */
exports.BSI_PACKAGE_JSON_URL = "".concat(BSI_RAW_BASE, "/package.json");
/**
 * Bootstrap Italia component docs base URL
 * TODO: update to stable v3 docs URL when available
 * (currently preview only, redirects to v2 — URL may change)
 */
exports.BSI_DOC_BASE = 'https://italia.github.io/bootstrap-italia/docs/componenti';
// ─── Designers Italia — sources #4 + part of #9 ─────────────────────────────
var DESIGNERS_RAW_BASE = 'https://raw.githubusercontent.com/italia/designers.italia.it/main';
/** Usage guidelines, accessibility, editorial status, when/how to use */
var DESIGNERS_COMPONENT_URL = function (slug) {
    return "".concat(DESIGNERS_RAW_BASE, "/src/data/content/design-system/componenti/").concat(slug, ".yaml");
};
exports.DESIGNERS_COMPONENT_URL = DESIGNERS_COMPONENT_URL;
/** Nav YAML — DS versions + verified component URLs + foundations[] */
exports.DESIGNERS_DSNAV_URL = "".concat(DESIGNERS_RAW_BASE, "/src/data/dsnav.yaml");
/** Site base URL — to build absolute URLs from relative nav entries */
exports.DESIGNERS_SITE_BASE = 'https://designers.italia.it';
// ─── Design Tokens Italia — source #5 ───────────────────────────────────────
/** Global --it-* tokens with concrete values (for valueResolved) */
exports.DTI_VARIABLES_SCSS_URL = 'https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss';
// ─── Dev Kit Italia — sources #6 #7 + part of #9 ────────────────────────────
var DEVKIT_RAW_BASE = 'https://raw.githubusercontent.com/italia/dev-kit-italia/main';
/**
 * Storybook index: status tags, Italian variants, importPath → exact stories.ts path ⚠️ alpha
 * GitHub Pages URL — not raw GitHub
 */
exports.DEVKIT_INDEX_URL = 'https://italia.github.io/dev-kit-italia/index.json';
/** Storybook base URL — to build /docs/{id} links */
exports.DEVKIT_STORYBOOK_BASE = 'https://italia.github.io/dev-kit-italia';
/**
 * Component stories — path from importPath in index.json ⚠️ alpha
 * Always use importPath from loader, do not assume pattern from name.
 * importPath has "./" prefix — removed here.
 */
var DEVKIT_STORIES_URL = function (importPath) {
    return "".concat(DEVKIT_RAW_BASE, "/").concat(importPath.replace(/^\.\//, ''));
};
exports.DEVKIT_STORIES_URL = DEVKIT_STORIES_URL;
/**
 * Dev Kit version for meta.versions.devKitItalia
 * NOTE: root package.json has "version": "0.0.0" (monorepo workspace) — do not use it.
 */
exports.DEVKIT_PACKAGE_JSON_URL = "".concat(DEVKIT_RAW_BASE, "/packages/dev-kit-italia/package.json");
// ─── Snapshot branch — data-fetched ──────────────────────────────────────────
// Loaders read from here instead of upstream live sources.
// Populated nightly by upstream-snapshot workflow.
// Only GitHub Issues remain live at runtime.
var DATA_FETCHED_RAW_BASE = 'https://raw.githubusercontent.com/fupete/design-system-italia-mcp/data-fetched';
exports.SNAPSHOT_BSI_STATUS_URL = "".concat(DATA_FETCHED_RAW_BASE, "/bsi/components-status.json");
var SNAPSHOT_BSI_COMPONENT_URL = function (slug) {
    return "".concat(DATA_FETCHED_RAW_BASE, "/bsi/components/").concat(slug, ".json");
};
exports.SNAPSHOT_BSI_COMPONENT_URL = SNAPSHOT_BSI_COMPONENT_URL;
exports.SNAPSHOT_BSI_CUSTOM_PROPERTIES_URL = "".concat(DATA_FETCHED_RAW_BASE, "/bsi/custom-properties.json");
exports.SNAPSHOT_BSI_ROOT_SCSS_URL = "".concat(DATA_FETCHED_RAW_BASE, "/bsi/root.scss");
exports.SNAPSHOT_DTI_VARIABLES_SCSS_URL = "".concat(DATA_FETCHED_RAW_BASE, "/design-tokens/variables.scss");
exports.DTI_PACKAGE_JSON_URL = 'https://raw.githubusercontent.com/italia/design-tokens-italia/main/package.json';
exports.SNAPSHOT_DEVKIT_INDEX_URL = "".concat(DATA_FETCHED_RAW_BASE, "/devkit/index.json");
var SNAPSHOT_DEVKIT_PROPS_URL = function (slug) {
    return "".concat(DATA_FETCHED_RAW_BASE, "/devkit/props/").concat(slug, ".json");
};
exports.SNAPSHOT_DEVKIT_PROPS_URL = SNAPSHOT_DEVKIT_PROPS_URL;
var SNAPSHOT_DEVKIT_STORY_URL = function (slug) {
    return "".concat(DATA_FETCHED_RAW_BASE, "/devkit/stories/").concat(slug, ".json");
};
exports.SNAPSHOT_DEVKIT_STORY_URL = SNAPSHOT_DEVKIT_STORY_URL;
var SNAPSHOT_DESIGNERS_COMPONENT_URL = function (slug) {
    return "".concat(DATA_FETCHED_RAW_BASE, "/designers/components/").concat(slug, ".json");
};
exports.SNAPSHOT_DESIGNERS_COMPONENT_URL = SNAPSHOT_DESIGNERS_COMPONENT_URL;
exports.SNAPSHOT_DSNAV_URL = "".concat(DATA_FETCHED_RAW_BASE, "/dsnav.json");
exports.SNAPSHOT_META_URL = "".concat(DATA_FETCHED_RAW_BASE, "/snapshot-meta.json");
// ─── GitHub REST API — source #8 ─────────────────────────────────────────────
/** Issues search endpoint */
exports.GITHUB_SEARCH_ISSUES_URL = 'https://api.github.com/search/issues';
/** Canary: Dev Kit stories file count in data-fetched branch
*  Note: requires GITHUB_TOKEN for reliable rate limits (60/h without, 5000/h with) */
exports.GITHUB_CONTENTS_DEVKIT_STORIES_URL = 'https://api.github.com/repos/fupete/design-system-italia-mcp/contents/devkit/stories?ref=data-fetched';
/**
 * Monitored repos for issues
 * Order: main → kit → dependencies
 */
exports.GITHUB_WATCHED_REPOS = [
    'italia/bootstrap-italia',
    'italia/design-ui-kit',
    'italia/dev-kit-italia',
    'italia/design-tokens-italia',
];
