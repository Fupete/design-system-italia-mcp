"use strict";
// src/loaders/devkit-parser.ts
// ─── Dev Kit web component props parser ──────────────────────────────────────
// Extracts tagName, props (argTypes) and subcomponents from stories.ts files.
// Used by both the loader (runtime fallback) and snapshot-static.ts (CI).
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseStories = parseStories;
var MAX_ITERATIONS = 10000;
function extractArgTypesBlock(source, exportName) {
    var _a;
    var pattern = exportName
        ? new RegExp("export const ".concat(exportName, "[\\s\\S]*?argTypes:\\s*\\{"), 's')
        : /const meta[\s\S]*?argTypes:\s*\{/s;
    var startMatch = source.match(pattern);
    if (!startMatch)
        return null;
    var startIdx = ((_a = startMatch.index) !== null && _a !== void 0 ? _a : 0) + startMatch[0].length - 1;
    var depth = 0, i = startIdx, iterations = 0;
    while (i < source.length) {
        if (++iterations > MAX_ITERATIONS) {
            console.warn("[devkit-parser] MAX_ITERATIONS hit in extractArgTypesBlock (exportName=".concat(exportName !== null && exportName !== void 0 ? exportName : 'meta', ")"));
            return null;
        }
        if (source[i] === '{')
            depth++;
        if (source[i] === '}') {
            depth--;
            if (depth === 0)
                return source.slice(startIdx, i + 1);
        }
        i++;
    }
    return null;
}
function extractExportBlock(source, exportName) {
    var start = source.indexOf("export const ".concat(exportName));
    if (start === -1)
        return null;
    var braceStart = source.indexOf('{', start);
    if (braceStart === -1)
        return null;
    var depth = 0, i = braceStart, iterations = 0;
    while (i < source.length) {
        if (++iterations > MAX_ITERATIONS) {
            console.warn("[devkit-parser] MAX_ITERATIONS hit in extractExportBlock (exportName=".concat(exportName, ")"));
            return null;
        }
        if (source[i] === '{')
            depth++;
        if (source[i] === '}') {
            depth--;
            if (depth === 0)
                return source.slice(braceStart, i + 1);
        }
        i++;
    }
    return null;
}
function findArgTypesInBlock(block) {
    var _a;
    var match = block.match(/argTypes:\s*\{/);
    if (!match)
        return null;
    var startIdx = ((_a = match.index) !== null && _a !== void 0 ? _a : 0) + match[0].length - 1;
    var depth = 0, i = startIdx, iterations = 0;
    while (i < block.length) {
        if (++iterations > MAX_ITERATIONS) {
            console.warn("[devkit-parser] MAX_ITERATIONS hit in findArgTypesInBlock");
            return null;
        }
        if (block[i] === '{')
            depth++;
        if (block[i] === '}') {
            depth--;
            if (depth === 0)
                return block.slice(startIdx, i + 1);
        }
        i++;
    }
    return null;
}
function parseProp(name, block) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    var propPattern = new RegExp("".concat(name, ":\\s*\\{"), 's');
    var startMatch = block.match(propPattern);
    if (!startMatch)
        return null;
    var startIdx = ((_a = startMatch.index) !== null && _a !== void 0 ? _a : 0) + startMatch[0].length - 1;
    var depth = 0, i = startIdx, iterations = 0;
    while (i < block.length) {
        if (++iterations > MAX_ITERATIONS) {
            console.warn("[devkit-parser] MAX_ITERATIONS hit in parseProp (name=".concat(name, ")"));
            break;
        }
        if (block[i] === '{')
            depth++;
        if (block[i] === '}') {
            depth--;
            if (depth === 0)
                break;
        }
        i++;
    }
    var propBlock = block.slice(startIdx, i + 1);
    if (propBlock.includes('disable: true'))
        return null;
    var descMatch = propBlock.match(/description:\s*("[\s\S]*?"|'[\s\S]*?'|`[\s\S]*?`)/);
    var desc = descMatch ? descMatch[1].slice(1, -1).trim() : null;
    var control = (_e = (_c = (_b = propBlock.match(/control:\s*['"`]([^'"`]+)['"`]/)) === null || _b === void 0 ? void 0 : _b[1]) !== null && _c !== void 0 ? _c : (_d = propBlock.match(/control:\s*\{[^}]*type:\s*['"`]([^'"`]+)['"`]/)) === null || _d === void 0 ? void 0 : _d[1]) !== null && _e !== void 0 ? _e : 'text';
    var defaultVal = (_g = (_f = propBlock.match(/summary:\s*['"`]([^'"`]+)['"`]/)) === null || _f === void 0 ? void 0 : _f[1]) !== null && _g !== void 0 ? _g : null;
    var optionsMatch = propBlock.match(/options:\s*\[([^\]]+)\]/);
    var options = optionsMatch
        ? (_j = (_h = optionsMatch[1].match(/['"`]([^'"`]+)['"`]/g)) === null || _h === void 0 ? void 0 : _h.map(function (s) { return s.replace(/['"`]/g, ''); })) !== null && _j !== void 0 ? _j : []
        : [];
    var htmlName = (_l = (_k = propBlock.match(/name:\s*['"`]([^'"`]+)['"`]/)) === null || _k === void 0 ? void 0 : _k[1]) !== null && _l !== void 0 ? _l : name;
    return { name: htmlName, type: control, description: desc, default: defaultVal, options: options };
}
function extractPropKeys(argTypesBlock) {
    var keys = [];
    var matches = argTypesBlock.matchAll(/^\s{2,4}(\w+):\s*\{/gm);
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var m = matches_1[_i];
        keys.push(m[1]);
    }
    return keys;
}
function extractSubcomponentExports(source) {
    var exports = [];
    var matches = source.matchAll(/^export const (\w+)\s*=/gm);
    for (var _i = 0, matches_2 = matches; _i < matches_2.length; _i++) {
        var m = matches_2[_i];
        if (m[1] !== 'default' && /^[A-Z]/.test(m[1]))
            exports.push(m[1]);
    }
    return exports;
}
function extractTagName(source) {
    var _a, _b;
    // Primary: explicit component: 'it-foo' declaration
    var direct = (_a = source.match(/^\s*component:\s*['"`](it-[a-z0-9-]+)['"`]/m)) === null || _a === void 0 ? void 0 : _a[1];
    if (direct)
        return direct;
    // Fallback: derive from title 'Componenti/Foo Bar' → 'it-foo-bar'
    // Covers components that omit component: in meta (e.g. Pagination)
    var title = (_b = source.match(/title:\s*['"`]Componenti\/([^'"`]+)['"`]/)) === null || _b === void 0 ? void 0 : _b[1];
    if (title)
        return "it-".concat(title.toLowerCase().replace(/\s+/g, '-'));
    return null;
}
function extractSubTagNames(source, exportName) {
    var _a;
    var block = (_a = extractExportBlock(source, exportName)) !== null && _a !== void 0 ? _a : '';
    var tags = new Set();
    var matches = block.matchAll(/<(it-[a-z0-9-]+)/g);
    for (var _i = 0, matches_3 = matches; _i < matches_3.length; _i++) {
        var m = matches_3[_i];
        tags.add(m[1]);
    }
    return __spreadArray([], tags, true);
}
function parseStories(source) {
    var tagName = extractTagName(source);
    if (!tagName)
        return null;
    var metaArgTypes = extractArgTypesBlock(source);
    var mainProps = [];
    if (metaArgTypes) {
        var keys = extractPropKeys(metaArgTypes);
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var key = keys_1[_i];
            var prop = parseProp(key, metaArgTypes);
            if (prop)
                mainProps.push(prop);
        }
    }
    var subExports = extractSubcomponentExports(source);
    var subcomponents = [];
    for (var _a = 0, subExports_1 = subExports; _a < subExports_1.length; _a++) {
        var exportName = subExports_1[_a];
        var exportBlock = extractExportBlock(source, exportName);
        var argTypesBlock = exportBlock ? findArgTypesInBlock(exportBlock) : null;
        if (!argTypesBlock)
            continue;
        var subTagNames = extractSubTagNames(source, exportName);
        var subTagName = subTagNames.find(function (t) { return t !== tagName; });
        if (!subTagName)
            continue;
        var subProps = [];
        var keys = extractPropKeys(argTypesBlock);
        for (var _b = 0, keys_2 = keys; _b < keys_2.length; _b++) {
            var key = keys_2[_b];
            var prop = parseProp(key, argTypesBlock);
            if (prop)
                subProps.push(prop);
        }
        if (subProps.length > 0)
            subcomponents.push({ tagName: subTagName, props: subProps });
    }
    return { tagName: tagName, props: mainProps, subcomponents: subcomponents };
}
