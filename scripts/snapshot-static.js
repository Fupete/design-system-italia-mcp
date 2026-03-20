#!/usr/bin/env tsx
"use strict";
/**
 * scripts/snapshot-static.ts
 *
 * Fetches all static upstream sources and saves them to data-fetched/.
 * No browser required — plain HTTP fetch only.
 *
 * Sources fetched:
 *   bsi/components-status.json       — component list + status
 *   bsi/components/{slug}.json       — HTML markup per component
 *   bsi/custom-properties.json       — CSS tokens --bsi-*
 *   bsi/root.scss                    — bridge --bsi-* → --it-*
 *   devkit/index.json                — Storybook index
 *   design-tokens/variables.scss     — global --it-* tokens
 *   designers/components/{slug}.json — guidelines YAML → JSON
 *   dsnav.json                       — DS nav + versions
 *   snapshot-meta.json               — versions + fetch stats
 *
 * Usage:
 *   npx tsx scripts/snapshot-static.ts
 *   npx tsx scripts/snapshot-static.ts --dry-run
 *
 * Note: --dry-run skips writing files but still makes all HTTP requests.
 * Use it to validate source reachability, not as a fully offline mode.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
var slugify_js_1 = require("../src/slugify.js");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var js_yaml_1 = require("js-yaml");
var devkit_parser_js_1 = require("../src/loaders/devkit-parser.js");
var constants_js_1 = require("../src/constants.js");
// ── Config ────────────────────────────────────────────────────────────────────
var PROJECT_ROOT = (0, node_path_1.resolve)(import.meta.dirname, '..');
var DEFAULT_OUT = (0, node_path_1.resolve)(PROJECT_ROOT, 'data-fetched');
/** Concurrent fetches to raw.githubusercontent.com — no browser involved */
var CONCURRENCY = 8;
var args = process.argv.slice(2);
var dryRun = args.includes('--dry-run');
var outDir = args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : DEFAULT_OUT;
// ── Security: output directory allowlist ──────────────────────────────────────
// Only data-fetched/ (local) or sibling data-fetched/ (CI dual-checkout pattern)
// are valid output targets. Prevents path traversal via --out argument.
var resolvedOut = (0, node_path_1.resolve)(outDir);
var ALLOWED_OUT_DIRS = [
    (0, node_path_1.resolve)(PROJECT_ROOT, 'data-fetched'),
    (0, node_path_1.resolve)(PROJECT_ROOT, '..', 'data-fetched'), // CI dual-checkout pattern
];
if (!ALLOWED_OUT_DIRS.some(function (d) { return resolvedOut === d || resolvedOut.startsWith(d + '/'); })) {
    console.error('❌ Output directory must be data-fetched/ or a subdirectory of it');
    process.exit(1);
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchText(url) {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url, {
                        signal: AbortSignal.timeout(15000),
                        headers: __assign({ 'User-Agent': 'design-system-italia-mcp/snapshot' }, (process.env.GITHUB_TOKEN
                            ? { Authorization: "Bearer ".concat(process.env.GITHUB_TOKEN) }
                            : {})),
                    })];
                case 1:
                    res = _a.sent();
                    if (!res.ok)
                        throw new Error("HTTP ".concat(res.status));
                    return [2 /*return*/, res.text()];
            }
        });
    });
}
function save(relativePath, content) {
    if (dryRun) {
        console.log("  [dry-run] ".concat(relativePath, " (").concat(content.length, " chars)"));
        return;
    }
    var fullPath = (0, node_path_1.resolve)(resolvedOut, relativePath);
    (0, node_fs_1.mkdirSync)((0, node_path_1.resolve)(fullPath, '..'), { recursive: true });
    (0, node_fs_1.writeFileSync)(fullPath, content, 'utf8');
}
function fetchAndSave(url, relativePath, transform) {
    return __awaiter(this, void 0, void 0, function () {
        var raw, content, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetchText(url)];
                case 1:
                    raw = _a.sent();
                    content = transform ? transform(raw) : raw;
                    save(relativePath, content);
                    return [2 /*return*/, { path: relativePath, ok: true }];
                case 2:
                    err_1 = _a.sent();
                    console.warn("  \u26A0\uFE0F  ".concat(relativePath, ": ").concat(err_1.message));
                    return [2 /*return*/, { path: relativePath, ok: false, error: err_1.message }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function batchedFetchAndSave(items) {
    return __awaiter(this, void 0, void 0, function () {
        var results, i, batch, batchResults, _i, batchResults_1, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = [];
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < items.length)) return [3 /*break*/, 4];
                    batch = items.slice(i, i + CONCURRENCY);
                    return [4 /*yield*/, Promise.allSettled(batch.map(function (item) { return fetchAndSave(item.url, item.path, item.transform); }))];
                case 2:
                    batchResults = _a.sent();
                    for (_i = 0, batchResults_1 = batchResults; _i < batchResults_1.length; _i++) {
                        r = batchResults_1[_i];
                        results.push(r.status === 'fulfilled'
                            ? r.value
                            : { path: 'unknown', ok: false, error: String(r.reason) });
                    }
                    _a.label = 3;
                case 3:
                    i += CONCURRENCY;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, results];
            }
        });
    });
}
// // ── Slug from status title ────────────────────────────────────────────────────
// // "`Accordion` - check a11y e status" → "accordion"
// // Inline — does not depend on slugify.ts export stability
// function slugFromStatusTitle(title: string): string {
//   return title.replace(/`/g, '').split('-')[0].trim().toLowerCase()
// }
// ── Main ──────────────────────────────────────────────────────────────────────
console.log("\uD83D\uDCE1 Fetching static sources".concat(dryRun ? ' (dry-run)' : '', "..."));
var results = [];
// Step 1 — components-status.json (required — provides slug list + subfolders)
console.log('  bsi/components-status.json');
var statusRaw;
try {
    statusRaw = await fetchText(constants_js_1.BSI_STATUS_URL);
}
catch (err) {
    console.error("\u274C Cannot proceed without components-status.json: ".concat(err.message));
    process.exit(1);
}
save('bsi/components-status.json', statusRaw);
results.push({ path: 'bsi/components-status.json', ok: true });
var statusJson = JSON.parse(statusRaw);
var slugsWithSubfolder = statusJson.items.map(function (i) { return ({
    slug: (0, slugify_js_1.slugFromStatusTitle)(i.title),
    subfolder: i['bootstrap Italia - url']
        ? (0, constants_js_1.subfolderFromDocUrl)(i['bootstrap Italia - url'])
        : constants_js_1.BSI_COMPONENT_DEFAULT_SUBFOLDER,
}); });
var slugs = slugsWithSubfolder.map(function (s) { return s.slug; });
// Slug sanitization
var SLUG_RE = /^[a-z0-9-]+$/;
for (var _i = 0, slugs_1 = slugs; _i < slugs_1.length; _i++) {
    var s = slugs_1[_i];
    if (!SLUG_RE.test(s)) {
        console.error("\u274C Invalid slug \"".concat(s, "\" \u2014 must match /^[a-z0-9-]+$/"));
        process.exit(1);
    }
}
console.log("  \u2192 ".concat(slugs.length, " component slugs"));
// Step 2 — BSI per-component markup
// Mirrors loadVariants() in src/loaders/bsi.ts:
// uses subfolderFromDocUrl() + slugsToTry() loop — same fallback logic.
console.log("  bsi/components/ (".concat(slugsWithSubfolder.length, " components)"));
function fetchMarkup(slug, subfolder) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, s, url, raw, wrapped, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _i = 0, _a = (0, slugify_js_1.slugsToTry)(slug);
                    _c.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    s = _a[_i];
                    url = (0, constants_js_1.BSI_COMPONENT_URL)(subfolder, s);
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, fetchText(url)
                        // Wrap with resolvedSlug metadata
                    ];
                case 3:
                    raw = _c.sent();
                    wrapped = JSON.stringify({
                        resolvedSlug: s,
                        data: JSON.parse(raw)
                    }, null, 2);
                    save("bsi/components/".concat(slug, ".json"), wrapped);
                    return [2 /*return*/, { path: "bsi/components/".concat(slug, ".json"), ok: true }];
                case 4:
                    _b = _c.sent();
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    console.warn("  \u26A0\uFE0F  bsi/components/".concat(slug, ".json: 404 for all slugsToTry"));
                    return [2 /*return*/, {
                            path: "bsi/components/".concat(slug, ".json"),
                            ok: false,
                            error: 'HTTP 404 for all slugsToTry',
                        }];
            }
        });
    });
}
var markupResults = [];
for (var i = 0; i < slugsWithSubfolder.length; i += CONCURRENCY) {
    var batch = slugsWithSubfolder.slice(i, i + CONCURRENCY);
    var batchResults = await Promise.all(batch.map(function (_a) {
        var slug = _a.slug, subfolder = _a.subfolder;
        return fetchMarkup(slug, subfolder);
    }));
    markupResults.push.apply(markupResults, batchResults);
}
results.push.apply(results, markupResults);
// Step 3 — BSI tokens + root bridge
console.log('  bsi/custom-properties.json');
results.push(await fetchAndSave(constants_js_1.BSI_CUSTOM_PROPERTIES_URL, 'bsi/custom-properties.json'));
console.log('  bsi/root.scss');
results.push(await fetchAndSave(constants_js_1.BSI_ROOT_SCSS_URL, 'bsi/root.scss'));
// Step 4 — Dev Kit index
console.log('  devkit/index.json');
results.push(await fetchAndSave(constants_js_1.DEVKIT_INDEX_URL, 'devkit/index.json'));
// Step 4b — Dev Kit props
// Reuse already-fetched index content instead of reading from disk
// (disk read fails in --dry-run mode since files are not written)
console.log('  devkit/props/ (web-component props from stories.ts)');
var devkitIndexRaw = await fetchText(constants_js_1.DEVKIT_INDEX_URL);
var devkitIndex = JSON.parse(devkitIndexRaw);
var propsItems = Object.values((_a = devkitIndex.entries) !== null && _a !== void 0 ? _a : {})
    .filter(function (e) { return e.type === 'docs' && e.id.startsWith('componenti-'); })
    .map(function (e) {
    var _a, _b;
    var slug = e.id.replace(/^componenti-/, '').replace(/--.*$/, '');
    var importPath = (_b = (_a = e.storiesImports) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : e.importPath;
    // only dedicated (web-component) — bundle has no argTypes
    var isDedicated = !importPath.includes('/dev-kit-italia/stories/components/');
    return isDedicated ? { slug: slug, importPath: importPath } : null;
})
    .filter(Boolean);
results.push.apply(results, await batchedFetchAndSave(propsItems.map(function (_a) {
    var slug = _a.slug, importPath = _a.importPath;
    return ({
        url: (0, constants_js_1.DEVKIT_STORIES_URL)(importPath),
        path: "devkit/props/".concat(slug, ".json"),
        transform: function (raw) {
            var component = (0, devkit_parser_js_1.parseStories)(raw);
            if (!component)
                return JSON.stringify({ slug: slug, tagName: null, props: [], subcomponents: [] }, null, 2);
            return JSON.stringify({
                slug: slug,
                tagName: component.tagName,
                props: component.props,
                subcomponents: component.subcomponents,
            }, null, 2);
        },
    });
})));
// Step 5 — Design Tokens Italia
console.log('  design-tokens/variables.scss');
results.push(await fetchAndSave(constants_js_1.DTI_VARIABLES_SCSS_URL, 'design-tokens/variables.scss'));
// Step 6 — Designers Italia YAML → JSON
// Non-fatal: not all slugs have a corresponding YAML file
console.log("  designers/components/ (".concat(slugs.length, " components)"));
results.push.apply(results, await batchedFetchAndSave(slugs.map(function (slug) { return ({
    url: (0, constants_js_1.DESIGNERS_COMPONENT_URL)(slug),
    path: "designers/components/".concat(slug, ".json"),
    transform: function (raw) {
        return JSON.stringify(js_yaml_1.default.load(raw, { schema: js_yaml_1.default.JSON_SCHEMA }), null, 2);
    },
}); })));
// Step 7 — dsnav YAML → JSON (also source for designSystem version)
console.log('  dsnav.json');
var dsnavParsed = null;
try {
    var dsnavRaw = await fetchText(constants_js_1.DESIGNERS_DSNAV_URL);
    dsnavParsed = js_yaml_1.default.load(dsnavRaw, { schema: js_yaml_1.default.JSON_SCHEMA });
    save('dsnav.json', JSON.stringify(dsnavParsed, null, 2));
    results.push({ path: 'dsnav.json', ok: true });
}
catch (err) {
    console.warn("  \u26A0\uFE0F  dsnav.json: ".concat(err.message));
    results.push({ path: 'dsnav.json', ok: false, error: err.message });
}
// Step 8 — versions (BSI + Dev Kit from package.json, DS from dsnav)
console.log('  versions (BSI + Dev Kit + Design Tokens + Design System)');
var bsiVersion = 'unknown';
var devkitVersion = 'unknown';
var dtiVersion = 'unknown';
var dsVersion = 'unknown';
try {
    var bsiPkg = JSON.parse(await fetchText(constants_js_1.BSI_PACKAGE_JSON_URL));
    bsiVersion = bsiPkg.version;
}
catch (err) {
    console.warn("  \u26A0\uFE0F  BSI version: ".concat(err.message));
}
try {
    var dkPkg = JSON.parse(await fetchText(constants_js_1.DEVKIT_PACKAGE_JSON_URL));
    devkitVersion = dkPkg.version;
}
catch (err) {
    console.warn("  \u26A0\uFE0F  Dev Kit version: ".concat(err.message));
}
try {
    var dtiPkg = JSON.parse(await fetchText(constants_js_1.DTI_PACKAGE_JSON_URL));
    dtiVersion = dtiPkg.version;
}
catch (err) {
    console.warn("  \u26A0\uFE0F  Design Tokens version: ".concat(err.message));
}
// reuse already-parsed dsnav — no second fetch or parse
if (dsnavParsed) {
    dsVersion = (_c = (_b = dsnavParsed.tag) === null || _b === void 0 ? void 0 : _b.label) !== null && _c !== void 0 ? _c : 'unknown';
}
// Step 9 — snapshot-meta.json
var ok = results.filter(function (r) { return r.ok; });
var failed = results.filter(function (r) { return !r.ok; });
var meta = {
    fetchedAt: new Date().toISOString(),
    versions: {
        designSystem: dsVersion,
        bootstrapItalia: bsiVersion,
        devKitItalia: devkitVersion,
        designTokensItalia: dtiVersion,
    },
    stats: {
        total: results.length,
        ok: ok.length,
        failed: failed.length,
    },
    sources: Object.fromEntries(results.map(function (r) { return [
        r.path,
        __assign({ ok: r.ok }, (r.error ? { error: r.error } : {})),
    ]; })),
};
save('snapshot-meta.json', JSON.stringify(meta, null, 2));
console.log('  snapshot-meta.json');
// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n".concat(ok.length, "/").concat(results.length, " sources fetched successfully"));
// Non-fatal: designers 404s are expected (not all components have YAML)
// Fatal: everything else — broken upstream or structural change
var fatalFailed = failed.filter(function (r) {
    return !r.path.startsWith('designers/') &&
        r.path !== 'snapshot-meta.json';
});
if (failed.length > 0) {
    var designersFailed = failed.filter(function (r) { return r.path.startsWith('designers/'); });
    if (designersFailed.length > 0) {
        console.warn("\u26A0\uFE0F  ".concat(designersFailed.length, " designers 404s (expected):"));
        designersFailed.forEach(function (r) { return console.warn("   ".concat(r.path)); });
    }
}
if (fatalFailed.length > 0) {
    console.error("\u274C ".concat(fatalFailed.length, " fatal errors:"));
    fatalFailed.forEach(function (r) { return console.error("   ".concat(r.path, ": ").concat(r.error)); });
    process.exit(1);
}
