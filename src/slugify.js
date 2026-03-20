"use strict";
// ─── Slug matching across heterogeneous sources ───────────────────────────────
//
// Sources use different names for the same component:
//   components_status.json → `Accordion`  (backtick, Title Case)
//   BSI API                → accordion    (lowercase)
//   Designers Italia YAML  → accordion    (lowercase)
//   Dev Kit index.json     → title "Componenti/Form/Checkbox" (last segment → slug)
//
// Canonical normalization: lowercase + trim + strip backtick + hyphenated
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
exports.slugify = slugify;
exports.slugFromStatusTitle = slugFromStatusTitle;
exports.slugsMatch = slugsMatch;
exports.slugFromStorybookTitle = slugFromStorybookTitle;
exports.getSlugAliases = getSlugAliases;
exports.slugsToTry = slugsToTry;
function slugify(name) {
    return name
        .replace(/`/g, '') // strip backtick: `Accordion` → Accordion
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-') // spaces → dashes
        .replace(/[^a-z0-9-]/g, ''); // remove invalid chars
}
// components_status.json: title can be `Accordion` or `Accordion Group`
function slugFromStatusTitle(title) {
    return slugify(title
        .replace(/`/g, '')
        .replace(/\s*-\s*check\s+a11y\s+e\s+status\s*/i, '')
        .trim());
}
// Fuzzy comparison: "accordion group" ≈ "accordion-group"
function slugsMatch(a, b) {
    return slugify(a) === slugify(b);
}
// Dev Kit index.json: title is "Componenti/Form/Checkbox" or "Componenti/Accordion"
// → extracts last segment as slug: "checkbox", "accordion"
function slugFromStorybookTitle(title) {
    var parts = title.split('/');
    return parts[parts.length - 1].toLowerCase().replace(/\s+/g, '-');
}
// ─── Cross-source aliases + user-facing synonyms ──────────────────────────────
//
// Centralizes all slug variations in one place.
// slugsToTry() resolves bidirectionally and transitively —
// any alias can be used as input, regardless of which is the key.
//
// Three layers:
//   1. Cross-source — BSI ↔ Dev Kit ↔ BSI JSON filenames (e.g. tables↔tabelle)
//   2. EN plurals/synonyms — user writes "dialog", system finds "modal"
//   3. IT synonyms — user writes "fisarmonica", system finds "accordion"
var SLUG_ALIASES = {
    'accordion': ['accordions', 'fisarmonica'],
    'alert': ['avviso'],
    'autocomplete': ['autocompletamento', 'form-autocomplete'],
    'back': ['torna-indietro'],
    'back-to-top': ['torna-su', 'scroll-to-top'],
    'badge': ['etichetta'],
    'breadcrumbs': ['breadcrumb', 'briciole', 'briciole-di-pane', 'percorso', 'path'],
    'buttons': ['button', 'btn', 'bottone', 'pulsante', 'bottoni', 'pulsanti'],
    'card': ['cards', 'scheda'],
    'carousel': ['carousels', 'carosello'],
    'checkbox': ['form-checkbox'],
    'chips': ['chip', 'tag'],
    'collapse': ['collapses', 'espandibile'],
    'datepicker': ['input-calendario', 'date-picker', 'calendar', 'input-data', 'form-datepicker'],
    'dropdown': ['dropdowns', 'menu-a-tendina'],
    'footer': ['pie-di-pagina', 'piede'],
    'form': ['introduzione', 'modulo'],
    'input': ['form-input'],
    'header': ['headers', 'intestazione', 'testata'],
    'hero': ['heroes', 'banner'],
    'list': ['liste', 'lista'],
    'megamenu': ['megamenus'],
    'modal': ['modale', 'dialog', 'finestra-modale'],
    'notifications': ['notifiche', 'notifica', 'toast', 'toasts'],
    'number-input': ['input-numerico', 'numeric-input', 'form-numeric-input'],
    'overlay': ['sovrapposizione'],
    'pagination': ['paginazione', 'pages'],
    'popover': ['popovers'],
    'progress-indicators': ['progress', 'spinner', 'loader'],
    'radio-button': ['form-radio-button'],
    'rating': ['valutazione', 'stelle'],
    'sections': ['section', 'sezione'],
    'select': ['form-select'],
    'sidebar': ['barra-laterale'],
    'skiplinks': ['skip-links'],
    'steppers': ['stepper', 'steps'],
    'tables': ['table', 'tabelle', 'tabella'],
    'tabs': ['tab'],
    'timeline': ['timelines'],
    'timepicker': ['input-ora', 'time-picker', 'form-timepicker'],
    'toggles': ['toggle', 'switch', 'switches'],
    'tooltip': ['tooltips', 'suggerimento'],
    'video-player': ['video', 'player'],
};
// Given a canonical slug, returns all known aliases
function getSlugAliases(slug) {
    var _a;
    return (_a = SLUG_ALIASES[slug]) !== null && _a !== void 0 ? _a : [];
}
// Returns slug + all aliases: useful for fallback loops in loaders
function slugsToTry(slug) {
    var _a;
    var result = new Set([slug]);
    // Direct aliases
    for (var _i = 0, _b = (_a = SLUG_ALIASES[slug]) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
        var alias = _b[_i];
        result.add(alias);
    }
    // Reverse: slug appears as a value
    for (var _c = 0, _d = Object.entries(SLUG_ALIASES); _c < _d.length; _c++) {
        var _e = _d[_c], key = _e[0], aliases = _e[1];
        if (aliases.includes(slug)) {
            result.add(key);
            // Transitive: also add all aliases of the matched key
            for (var _f = 0, aliases_1 = aliases; _f < aliases_1.length; _f++) {
                var alias = aliases_1[_f];
                result.add(alias);
            }
        }
    }
    return __spreadArray([], result, true);
}
