/* site.js — Filo */

function copyCode(btn) {
  const pre = btn.closest('.pre-wrap').querySelector('pre');
  navigator.clipboard.writeText(pre.textContent.trim()).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copiato ✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  });
}

/* Dashboard */
const RAW = 'https://raw.githubusercontent.com/Fupete/design-system-italia-mcp/data-fetched';
const REPOS = [
  { label: 'Bootstrap Italia', slug: 'italia/bootstrap-italia' },
  { label: 'UI Kit Italia', slug: 'italia/design-ui-kit' },
  { label: 'Dev Kit Italia', slug: 'italia/dev-kit-italia' },
  { label: 'Design Tokens Italia', slug: 'italia/design-tokens-italia' },
];

let allComps = [];

async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function badge(text, type) {
  const cls = { green: 'badge-success', blue: 'badge-primary', orange: 'badge-warning', red: 'badge-danger', gray: 'badge-secondary' }[type] || 'badge-secondary';
  return `<span class="badge rounded-pill ${cls}">${esc(text)}</span>`;
}

function statusBadge(s) {
  if (!s) return badge('—', 'gray');
  const sl = s.toLowerCase();
  if (sl.includes('pronto') || sl.includes('disponibile') || sl === 'uso') return badge(s, 'green');
  if (sl.includes('da completare') || sl.includes('in lavorazione') || sl.includes('beta')) return badge(s, 'blue');
  if (sl.includes('da rivedere') || sl.includes('alpha') || sl.includes('wip')) return badge(s, 'orange');
  if (sl.includes('deprecat') || sl.includes('rimoss')) return badge(s, 'red');
  return badge(s || 'N/D', 'gray');
}

function dkBadge(dk) {
  if (dk === true) return badge('PRESENTE', 'green'); // Dev Kit-only, no status.json row to read a real value from
  if (!dk) return badge('NON PRESENTE', 'gray');
  return statusBadge(dk); // real value from components-status.json, same treatment as bsi/uik
}

/* Components table */
const N = 8;
let curList = [], exp = false;

function renderComps(l) { curList = l; exp = false; drawRows(); }

function drawRows() {
  const body = document.getElementById('dash-comp-body');
  const vis = exp ? curList : curList.slice(0, N);
  body.innerHTML = vis.map(c => `<tr>
    <td><strong>${esc(c.name)}</strong></td>
    <td>${statusBadge(c.bsi)}</td>
    <td>${statusBadge(c.uik)}</td>
    <td>${dkBadge(c.dk)}</td>
  </tr>`).join('');
  const tog = document.getElementById('dash-tog');
  const cnt = document.getElementById('dash-tog-n');
  if (curList.length <= N) { tog.style.display = 'none'; return; }
  tog.style.display = '';
  tog.firstChild.textContent = exp ? 'Mostra meno ' : 'Mostra tutti ';
  cnt.textContent = exp ? '' : `(${curList.length})`;
}

function toggleComps() { exp = !exp; drawRows(); }

function filterComp(btn, f) {
  document.querySelectorAll('.comp-filter .btn').forEach(b => { b.classList.remove('btn-secondary'); b.classList.add('btn-outline-secondary'); });
  btn.classList.remove('btn-outline-secondary');
  btn.classList.add('btn-secondary');
  renderComps(f === 'all' ? allComps : allComps.filter(c => c.dk));
}

/* CSS tokens */
let tokByComp = {};

function populateTokenSel(raw) {
  tokByComp = {};
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  // Group by component + variable-name first, then consolidate — mirrors
  // consolidateAmbiguous in bsi.ts. A name declared once (or repeated with
  // the identical value — no real ambiguity) becomes a normal token; a name
  // declared more than once with DIFFERENT values (real case: header,
  // navbar, form, autocomplete, notification, section) becomes one row
  // flagged with declaredTimes/ambiguousValues, instead of N confusing
  // identical-name rows with no signal they're related.
  const grouped = {};
  arr.forEach(t => {
    const c = (t.component || 'altro').toLowerCase();
    const name = t.name || t.property || '';
    if (!name) return;
    if (!grouped[c]) grouped[c] = new Map();
    const occurrences = grouped[c].get(name) || [];
    occurrences.push({ value: t.value || '', description: t.description || '' });
    grouped[c].set(name, occurrences);
  });
  Object.keys(grouped).forEach(c => {
    tokByComp[c] = [];
    grouped[c].forEach((occurrences, name) => {
      const first = occurrences[0];
      const distinctValues = new Set(occurrences.map(o => o.value));
      if (distinctValues.size <= 1) {
        tokByComp[c].push({ name, value: first.value, description: first.description });
        return;
      }
      tokByComp[c].push({
        name, value: first.value, description: first.description,
        declaredTimes: occurrences.length, ambiguousValues: occurrences,
      });
    });
  });
  const sel = document.getElementById('tok-sel');
  Object.keys(tokByComp).sort().forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = `${c}`;
    sel.appendChild(o);
  });
}

function showTokens(comp) {
  const el = document.getElementById('tok-list');
  const cta = document.getElementById('tok-cta');
  const ex = document.getElementById('tok-ex');
  if (!comp) { el.innerHTML = ''; cta.hidden = true; ex.hidden = false; return; }
  const toks = tokByComp[comp] || [];
  if (!toks.length) { el.innerHTML = '<p class="data-empty">Nessuna custom property.</p>'; cta.hidden = true; return; }

  const ambiguousToks = toks.filter(t => t.declaredTimes);
  // The badge's tooltip is a hover-only affordance — invisible on touch and
  // not visually signaled as interactive (no "?", no underline). The values
  // it explains have to be reachable without hovering, so they're also
  // spelled out here, always visible, once per component instead of once
  // per row.
  const legend = ambiguousToks.length
    ? `<div class="tok-legend"><p class="tok-legend-title">⚠ Dichiarate più volte con valori diversi — probabile variante responsive/tema/stato, non distinguibile da questi dati soli:</p>${
        ambiguousToks.map(t => `<p class="tok-legend-item"><code>${esc(t.name)}</code>: ${esc(t.ambiguousValues.map(a => a.value).join(' · '))}</p>`).join('')
      }</div>`
    : '';

  el.innerHTML = `<div style="width:100%; overflow-x: auto; display: block;"><table class="tok-table"><thead><tr><th>Variabile</th><th>Valore risolto</th><th>Descrizione</th></tr></thead><tbody>${toks.map((t, i) => {
    const raw = t.value || '';
    const type = classifyValueClient(raw);
    let cell;
    if ((type === 'token-reference' || type === 'composite') && bsiResolveMaps) {
      const resolved = resolveBsiChain(t.name, bsiResolveMaps.bsiMap, bsiResolveMaps.bridge, bsiResolveMaps.dtiRaw);
      cell = resolved
        ? esc(resolved)
        : `<span class="token-unresolved">${esc(raw)} <span class="tok-flag">non risolvibile</span></span>`;
    } else if (type === 'scss-expression') {
      cell = `<span class="token-unresolved">${esc(raw)} <span class="tok-flag">SCSS, richiede compilazione</span></span>`;
    } else {
      cell = esc(raw); // already a concrete literal (e.g. 1.25rem, rotate(-180deg))
    }
    // Declared multiple times with different values — flag instead of
    // silently showing only the first-seen value. Mirrors the
    // declaredTimes/ambiguousValues note server-side (bootstrap-italia#1805
    // tracks the responsive-breakpoint case, not the others: theme classes,
    // element-state selectors like [readonly]). 
    const badge = t.declaredTimes ? ` <span class="token-ambiguous">⚠ ${t.declaredTimes}×</span>` : '';
    return `<tr class="${i % 2 === 1 ? 'tok-alt' : ''}"><td class="token-name">${esc(t.name)}${badge}</td><td class="token-desc">${cell}</td><td class="token-desc">${esc(t.description)}</td></tr>`;
  }).join('')}</tbody></table></div>${legend}`;
  cta.hidden = false;
  ex.hidden = true;
}

/* Dev Kit props — XXX update slug list when new components added to data-fetched/devkit/props/ */
const PROPS_SLUGS = [
  'accordion', 'alert', 'avatar', 'back', 'back-to-top', 'bottomnav',
  'breadcrumbs', 'button', 'callout', 'card', 'carousel', 'chip', 'collapse',
  'dimmer', 'dropdown', 'form-autocomplete', 'form-checkbox',
  'form-datepicker', 'form-input', 'form-number-input', 'form-radio-button',
  'form-select', 'form-timepicker', 'form-toggle', 'form-transfer',
  'form-upload', 'forward', 'header', 'hero', 'icon', 'megamenu', 'modal',
  'navscroll', 'notification', 'pagination', 'popover', 'progress',
  'rating', 'section', 'skiplinks', 'stepper', 'sticky', 'tabs',
  'thumbnav', 'timeline', 'toolbar', 'tooltip', 'video-player'
];
function populatePropsSel() {
  const sel = document.getElementById('props-sel');
  PROPS_SLUGS.forEach(s => {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    sel.appendChild(o);
  });
}

async function showProps(slug) {
  const el = document.getElementById('props-list');
  const cta = document.getElementById('props-cta');
  if (!slug) { el.innerHTML = ''; cta.hidden = true; return; }
  el.innerHTML = '<p class="data-empty">caricamento…</p>';
  try {
    const s = await j(`${RAW}/devkit/props/${slug}.json`);
    if (!s?.props?.length) { el.innerHTML = '<p class="data-empty">Nessuna prop configurabile.</p>'; return; }
    el.innerHTML = `<div style="width:100%; overflow-x: auto; display: block;"><table class="tok-table"><thead><tr><th>Prop <code>${esc(s.tagName)}</code></th><th>Tipo</th><th>Descrizione</th><th>Default</th></tr></thead><tbody>${s.props.map((p, i) => `<tr class="${i % 2 === 1 ? 'tok-alt' : ''}"><td class="token-name">${esc(p.name)}</td><td class="token-desc">${esc(p.type || '')}</td><td class="token-desc">${p.description ? p.description.replace(/`([^`]+)`/g, (_, code) => `<code>${esc(code)}</code>`) : ''}</td><td class="token-desc">${p.default != null ? esc(String(p.default)) : ''}</td></tr>`).join('')}</tbody></table></div>`;
    cta.hidden = false;
  } catch { el.innerHTML = '<p class="data-empty">Props non disponibili.</p>'; }
}

/* Component guidelines */
function populateGlSel() {
  const sel = document.getElementById('gl-sel');
  allComps.forEach(c => {
    const o = document.createElement('option');
    o.value = c.name.toLowerCase().replace(/\s+/g, '-');
    o.textContent = c.name;
    sel.appendChild(o);
  });
}

const mm = text => {
  if (!text) return '';
  // Split by blank lines (paragraph/block boundaries)
  const blocks = text.split(/\n\n+/).map(b => b.trim()).filter(b => b);
  return blocks.map(b => {
    const lines = b.split('\n');
    let out = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) { i++; continue; }
      // Heading h2
      if (/^## /.test(line)) {
        out += `<h2>${esc(line.replace(/^## /, ''))}</h2>`;
        i++;
        continue;
      }
      // Heading h3
      if (/^### /.test(line)) {
        out += `<h3>${esc(line.replace(/^### /, ''))}</h3>`;
        i++;
        continue;
      }
      // Bullet list (consume consecutive bullet lines)
      if (/^[*-] /.test(line)) {
        const listLines = [];
        while (i < lines.length) {
          const l = lines[i].trim();
          if (!l) { i++; continue; }
          if (!/^[*-] /.test(l)) break;
          listLines.push(l);
          i++;
        }
        out += `<ul>${listLines.map(l => `<li>${mi(l.replace(/^[*-] /, ''))}</li>`).join('')}</ul>`;
        continue;
      }
      // Paragraph (regular text, not a heading/list)
      out += `<p>${mi(line)}</p>`;
      i++;
    }
    return out;
  }).join('');
};

const mi = t => t
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, la, ur) =>
    `<a href="${ur.startsWith('/') ? 'https://designers.italia.it' + ur : ur}" target="_blank" rel="noopener">${la}</a>`)
  .replace(/`([^`]+)`/g, (_, code) => `<code>${esc(code)}</code>`);

async function showGl(slug) {
  const el = document.getElementById('gl-content');
  if (!slug) { el.innerHTML = ''; return; }
  el.innerHTML = '<p class="data-empty">caricamento…</p>';
  try {
    const d = await j(`${RAW}/designers/components/${slug}.json`);
    const hero = d?.components?.hero;
    const title = hero?.title || slug;
    const sub = hero?.subtitle || null;
    const url = `https://designers.italia.it${d?.seo?.pathname || '/design-system/componenti/' + slug + '/'}`;
    const tab = d?.tabs?.find(t => t.title?.toLowerCase().includes('uso') || t.title?.toLowerCase().includes('accessibilit'));
    const comps = tab?.sectionsEditorial?.flatMap(s => s.components || []) || [];
    const ft = k => comps.find(c => c.name === 'TextImageCta' && c.title?.toLowerCase().includes(k))?.text || null;
    const when = ft('quando usarlo') || ft('quando usare');
    const how = ft('come usarlo') || ft('come usare');
    const tags = (hero?.kangaroo?.tagsDesignSystem || []).map(t => `<span class="gl-tag">${esc(t)}</span>`).join('');
    let out = `<h3 class="mb-2">${esc(title)}</h3>${tags ? `<div class="chip"><span class="chip-label">${tags}</span></div>` : ''}${sub ? `<p class="lead mt-2">${esc(sub)}</p>` : ''}`;
    if (when) out += `<div class="mb-3"><h4>Quando usarlo</h4><div class="gl-text">${mm(when)}</div></div>`;
    if (how) out += `<div class="mb-3"><h4>Come usarlo</h4><div class="gl-text">${mm(how)}</div></div>`;
    if (!when && !how) out += '<p class="data-empty">Linee guida non disponibili.</p>';
    out += `<a href="${url}" target="_blank" rel="noopener" class="fw-semibold">Scheda completa su Designers Italia →</a>`;
    el.innerHTML = out;
  } catch { el.innerHTML = '<p class="data-empty">Linee guida non disponibili.</p>'; }
}

/* Design Tokens Italia — SCSS parser + table */
let dtiAll = [];
let dtiExp = false;
const DTI_DEFAULT_N = 10;

function resolveDtiValue(rawVal, valueMap, visited = new Set()) {
  // Substitute every $token-name occurrence found anywhere in the string,
  // recursively — composite values (e.g. a box-shadow shorthand mixing
  // literals and multiple $refs) need in-place substitution, not just a
  // whole-value match.
  return rawVal.replace(/\$([a-z0-9-]+)/g, (whole, refName) => {
    if (visited.has(refName)) return whole; // cycle guard — leave as-is
    const next = valueMap[refName];
    if (next === undefined) return whole; // unknown ref — leave visible, don't silently blank it
    return resolveDtiValue(next, valueMap, new Set(visited).add(refName));
  });
}

function parseDTI(scss) {
  const valueMap = {};
  for (const line of scss.split('\n')) {
    const m = line.match(/^\$([a-z0-9-]+):\s*([^;]+);/);
    if (m) valueMap[m[1]] = m[2].trim();
  }

  const tokens = [];
  for (const line of scss.split('\n')) {
    const m = line.match(/^\$([a-z0-9-]+):\s*([^;]+);\s*(?:\/\/\s*(.*))?$/);
    if (!m) continue;
    const name = `--${m[1].replace(/_/g, '-')}`;
    const rawVal = m[2].trim();
    const desc = (m[3] || '').trim();
    const refMatch = rawVal.match(/^\$([a-z0-9-]+)$/);
    const ref = refMatch ? `--${refMatch[1]}` : null;
    const resolvedVal = /\$[a-z0-9-]+/.test(rawVal) ? resolveDtiValue(rawVal, valueMap) : rawVal;
    tokens.push({ name, rawVal, ref, resolvedVal, desc });
  }
  return tokens;
}

/* BSI custom properties — chain resolution, mirrors tokens.ts (server-side) */
let bsiResolveMaps = null; // { bsiMap, bridge, dtiRaw } — lazy-loaded once, same pattern as DTI

// Format: --#{$prefix}spacing-m: #{tokens.$it-spacing-m};
function parseBridgeClient(scss) {
  const map = new Map();
  for (const line of scss.split('\n')) {
    const m = line.match(/--#\{\$prefix\}([a-z0-9-]+):\s*#\{tokens\.\$it-([a-z0-9-]+)\}/);
    if (!m) continue;
    map.set(`--bsi-${m[1]}`, `--it-${m[2]}`);
  }
  return map;
}

// Mirrors matchSingleVarRef/containsVarRef in bsi.ts — the entire value must
// be a single var(--x) call (optionally with a fallback, var(--x, fallback))
// to count as a pure reference; containsVarRef is the broader "has at least
// one embedded reference somewhere" check used for composite detection.
function matchSingleVarRefClient(value) {
  return value.match(/^var\((--[a-z0-9-]+)(?:,\s*[^)]+)?\)$/)?.[1] ?? null;
}
function containsVarRefClient(value) {
  return /var\(--[a-z0-9-]+(?:,\s*[^)]+)?\)/.test(value);
}

// Mirrors classifyValue in bsi.ts.
function classifyValueClient(value) {
  if (value.startsWith('#{') || value.startsWith('escape-svg(')) return 'scss-expression';
  if (matchSingleVarRefClient(value)) return 'token-reference';
  if (containsVarRefClient(value)) return 'composite';
  return 'literal';
}

// Format: $it-spacing-m: 1.5rem; // 24px
function parseDtiRawClient(scss) {
  const map = new Map();
  for (const line of scss.split('\n')) {
    const m = line.match(/^\$([a-z0-9-]+):\s*([^;]+);(?:\s*\/\/\s*(.+))?/);
    if (!m) continue;
    const [, varName, rawValue, comment] = m;
    const value = rawValue.trim();
    // Anchored: the ENTIRE value must be a single $var reference, not just
    // start with $ — mirrors the isRef fix in parseDesignTokens (tokens.ts,
    // composedOf step 1). Before this fix, a composite value that happens to
    // start with $ (e.g. several $it-* refs) was sliced as if it were one
    // variable name, corrupting it.
    const isRef = /^\$[a-z0-9-]+$/.test(value);
    map.set(`--${varName}`, isRef ? `--${value.slice(1)}` : (comment ? `${value} (${comment.trim()})` : value));
  }
  return map;
}

// --bsi-* -> next-hop, mirrors parseBsiMap in tokens.ts. Two shapes stored:
// a pure single reference (var(--x), optionally with a fallback) stores the
// bare next-hop name; a composite (contains var(...) somewhere but isn't
// itself a single pure reference, e.g. "var(--bsi-spacing-xs) var(--bsi-spacing-s)"
// or a calc() expression) stores the RAW value string as-is, resolved later
// via resolveCompositeClient instead of being discarded.
function parseBsiMapClient(raw) {
  const map = new Map();
  for (const entries of Object.values(raw || {})) {
    for (const e of (entries || [])) {
      const v = e.value || '';
      const singleRef = matchSingleVarRefClient(v);
      if (singleRef) { map.set(e['variable-name'], singleRef); continue; }
      if (containsVarRefClient(v)) map.set(e['variable-name'], v);
    }
  }
  return map;
}

function isBareTokenNameClient(value) {
  return /^--(bsi|it)-[a-z0-9-]+$/.test(value);
}

// Mirrors findEmbeddedRefs in tokens.ts — every $it-* or var(--x[, fallback])
// reference found ANYWHERE in the string (not just at the start), e.g. a
// spacing shorthand or a reference embedded inside calc().
const EMBEDDED_REF_PATTERN_CLIENT = /\$it-[a-z0-9-]+|var\(--[a-z0-9-]+(?:,\s*[^)]+)?\)/g;

function findEmbeddedRefsClient(value) {
  const refs = [];
  for (const m of value.matchAll(EMBEDDED_REF_PATTERN_CLIENT)) {
    const ref = m[0];
    const name = ref.startsWith('$') ? `--${ref.slice(1)}` : ref.match(/^var\((--[a-z0-9-]+)/)[1];
    refs.push({ ref, name });
  }
  return refs;
}

// Mirrors resolveComposite in tokens.ts — resolves every reference embedded
// in a raw composite value and substitutes each one that resolves back into
// the string in a single pass over the original (via the regex engine's own
// match positions, not sequential string replacement — a ref that's a
// literal prefix of another ref in the same composite, e.g. $it-shadow-blur-s
// vs $it-shadow-blur-sm, would otherwise get corrupted by replacing the
// shorter one first).
function resolveCompositeClient(rawValue, bsiMap, bridge, dtiRaw, visited = new Set()) {
  const refs = findEmbeddedRefsClient(rawValue);
  const uniqueRefs = [...new Map(refs.map(r => [r.ref, r])).values()];
  const resolvedByRef = new Map();
  for (const { ref, name } of uniqueRefs) {
    resolvedByRef.set(ref, resolveBsiChain(name, bsiMap, bridge, dtiRaw, new Set(visited)));
  }
  return rawValue.replace(EMBEDDED_REF_PATTERN_CLIENT, match => resolvedByRef.get(match) ?? match);
}

// Mirrors resolveChain in tokens.ts — null exactly where the server would
// also return null (dead end mid-chain, or nothing to follow at all). A
// composite value (raw string stored by parseBsiMapClient/parseDtiRawClient,
// distinguished from a bare next-hop name via isBareTokenNameClient) is
// resolved via resolveCompositeClient instead of being treated as a name to
// recurse into.
function resolveBsiChain(name, bsiMap, bridge, dtiRaw, visited = new Set()) {
  if (visited.has(name)) return null;
  visited.add(name);

  if (name.startsWith('--bsi-')) {
    const next = bsiMap.get(name) ?? bridge.get(name);
    if (!next) return null;
    if (isBareTokenNameClient(next)) return resolveBsiChain(next, bsiMap, bridge, dtiRaw, visited) ?? next;
    return resolveCompositeClient(next, bsiMap, bridge, dtiRaw, visited);
  }
  if (name.startsWith('--it-')) {
    const val = dtiRaw.get(name);
    if (!val) return null;
    if (isBareTokenNameClient(val)) return resolveBsiChain(val, bsiMap, bridge, dtiRaw, visited) ?? val;
    if (findEmbeddedRefsClient(val).length === 0) return val; // true literal, nothing embedded
    return resolveCompositeClient(val, bsiMap, bridge, dtiRaw, visited);
  }
  return null;
}

async function loadBsiResolveMaps() {
  try {
    const [rootScss, variablesScss, customPropsRaw] = await Promise.all([
      fetch(`${RAW}/bsi/root.scss`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }),
      fetch(`${RAW}/design-tokens/variables.scss`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }),
      j(`${RAW}/bsi/custom-properties.json`),
    ]);
    bsiResolveMaps = {
      bridge: parseBridgeClient(rootScss),
      dtiRaw: parseDtiRawClient(variablesScss),
      bsiMap: parseBsiMapClient(customPropsRaw),
    };
  } catch {
    bsiResolveMaps = null; // resolution unavailable — table falls back to raw values, not blank
  }
  const sel = document.getElementById('tok-sel');
  if (sel && sel.value) showTokens(sel.value); // re-render if the user already picked a component
}

document.addEventListener('DOMContentLoaded', () => {
  const tokTab = document.querySelector('[data-bs-target="#dt-tok"]');
  if (tokTab) tokTab.addEventListener('shown.bs.tab', () => { if (!bsiResolveMaps) loadBsiResolveMaps(); }, { once: true });
});

function colorSwatch(val) {
  if (!val) return '';
  const v = val.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v))
    return `<span class="dti-swatch" style="background:${v}" title="${v}"></span>`;
  return '';
}

function spacingVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const m = v.match(/^([\d.]+)(px|rem|em|%)?$/);
  if (!m) return '';
  const num = parseFloat(m[1]);
  const unit = m[2] || 'px';
  let pxVal = num;
  if (unit === 'rem' || unit === 'em') pxVal = num * 16;
  if (unit === '%') return '';
  const visual = Math.min(pxVal, 80);
  const title = `${num}${unit} (${Math.round(pxVal)}px)`;
  return `<span class="dti-spacing-visual" style="width:${visual}px;height:${visual}px" title="${title}"></span>`;
}

function fontSizeVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const m = v.match(/^([\d.]+)(px|rem|em)?$/);
  if (!m) return '';
  const num = parseFloat(m[1]);
  const unit = m[2] || 'px';
  let pxVal = num;
  if (unit === 'rem' || unit === 'em') pxVal = num * 16;
  const title = `${num}${unit} (${Math.round(pxVal)}px)`;
  return `<span class="dti-fontsize-visual" style="font-size:${pxVal}px" title="${title}">Aa</span>`;
}

function fontWeightVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const m = v.match(/^(normal|bold|lighter|bolder|\d{3})$/i);
  if (!m) return '';
  let weightVal = 400;
  if (v.toLowerCase() === 'bold') weightVal = 700;
  else if (v.toLowerCase() === 'normal') weightVal = 400;
  else if (v.toLowerCase() === 'lighter') weightVal = 300;
  else if (v.toLowerCase() === 'bolder') weightVal = 900;
  else if (/^\d{3}$/.test(v)) weightVal = parseInt(v);
  const title = `${v}`;
  return `<span class="dti-fontweight-visual" style="font-weight:${weightVal}" title="${title}">Aa</span>`;
}

function fontFamilyVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const title = v;
  return `<span class="dti-fontfamily-visual" style="font-family:${v}" title="${title}">Aa</span>`;
}

function borderRadiusVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const m = v.match(/^([\d.]+)(px|rem|em)?$/);
  if (!m) return '';
  const num = parseFloat(m[1]);
  const unit = m[2] || 'px';
  let pxVal = num;
  if (unit === 'rem' || unit === 'em') pxVal = num * 16;
  const size = Math.max(12, pxVal);
  const br = pxVal;
  const title = `${num}${unit}`;
  return `<span class="dti-radius-visual" style="width:${size}px;height:${size}px;border-radius:${br}px" title="${title}"></span>`;
}

function borderWidthVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const m = v.match(/^([\d.]+)(px|rem|em)?$/);
  if (!m) return '';
  const num = parseFloat(m[1]);
  const unit = m[2] || 'px';
  let pxVal = num;
  if (unit === 'rem' || unit === 'em') pxVal = num * 16;
  const width = Math.min(pxVal, 8);
  const title = `${num}${unit} (${Math.round(pxVal)}px)`;
  return `<span class="dti-border-visual" style="border-top:${width}px solid var(--bsi-secondary);width:96px;height:0" title="${title}"></span>`;
}

function shadowVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const title = v;
  return `<span class="dti-shadow-visual" style="box-shadow:${v}" title="${title}"></span>`;
}

function elevationVisual(val) {
  if (!val) return '';
  const v = val.trim();
  const title = v;
  return `<span class="dti-elevation-visual" style="box-shadow:${v}" title="${title}"></span>`;
}

function getVisual(rawVal, resolvedVal, tokenLower) {
  const valueLower = (rawVal || '').toLowerCase();
  const rValueLower = (resolvedVal || '').toLowerCase();
  const useVal = resolvedVal || rawVal;

  if (tokenLower.includes('shadow')) {
    return shadowVisual(useVal);
  } else if (tokenLower.includes('elevation')) {
    return elevationVisual(useVal);
  } else if ((tokenLower.includes('spacing') || tokenLower.includes('icon-size')) && (valueLower.match(/^\d+(\.\d+)?(px|rem|em)$/) || rValueLower.match(/^\d+(\.\d+)?(px|rem|em)$/))) {
    return spacingVisual(useVal);
  } else if (tokenLower.includes('font-family') || tokenLower.includes('fontfamily') || tokenLower.includes('font-serif') || tokenLower.includes('font-sans') || tokenLower.includes('font-mono') || tokenLower.includes('code-font') || tokenLower.includes('data-font')) {
    return fontFamilyVisual(useVal);
  } else if (tokenLower.includes('font-weight') || tokenLower.includes('fontweight')) {
    return fontWeightVisual(useVal);
  } else if (tokenLower.includes('font-size') || tokenLower.includes('fontsize')) {
    return fontSizeVisual(useVal);
  } else if ((tokenLower.includes('border') || tokenLower.includes('radius')) && (tokenLower.includes('radius') || tokenLower.includes('border-radius'))) {
    return borderRadiusVisual(useVal);
  } else if (tokenLower.includes('border') && ((tokenLower.includes('width') || (valueLower.match(/^\d+(\.\d+)?(px|rem|em)$/) || rValueLower.match(/^\d+(\.\d+)?(px|rem|em)$/))) || tokenLower.includes('border-width'))) {
    return borderWidthVisual(useVal);
  } else if (tokenLower.includes('color') || rValueLower.match(/^#|rgba?\(/) || valueLower.match(/^#|rgba?\(/)) {
    return colorSwatch(useVal);
  }
  return '';
}

function filterTokens(q) {
  const s = q.toLowerCase();
  const isFiltering = s.length > 0;
  const visible = dtiAll.filter(t =>
    !s || t.name.includes(s) || t.desc.toLowerCase().includes(s) || (t.rawVal + '').toLowerCase().includes(s)
  );
  const body = document.getElementById('dti-body');
  const empty = document.getElementById('dti-empty');
  const tog = document.getElementById('dti-tog');
  const togN = document.getElementById('dti-tog-n');

  if (!visible.length) { body.innerHTML = ''; empty.style.display = ''; tog.style.display = 'none'; return; }
  empty.style.display = 'none';

  // Se sta filtrando, mostra tutto senza truncation; altrimenti rispetta dtiExp
  const toRender = (isFiltering || dtiExp) ? visible : visible.slice(0, DTI_DEFAULT_N);

  body.innerHTML = toRender.map((t, i) => {
    const refToken = t.ref ? `<span class="token-name">${t.ref}</span>` : '—';
    const tokenLower = (t.name || '').toLowerCase();
    const visual = getVisual(t.rawVal, t.resolvedVal, tokenLower);
    const resolved = esc(t.resolvedVal || '');
    return `<tr class="${i % 2 === 1 ? 'tok-alt' : ''}">
      <td class="token-name">${esc(t.name)}</td>
      <td class="token-name">${refToken}</td>
      <td class="token-desc dti-visual">${visual}</td>
      <td class="token-desc dti-resolved">${resolved}</td>
      <td class="token-desc">${esc(t.desc)}</td>
    </tr>`;
  }).join('');

  if (isFiltering || visible.length <= DTI_DEFAULT_N) {
    tog.style.display = 'none';
  } else {
    tog.style.display = '';
    tog.firstChild.textContent = dtiExp ? 'Mostra meno ' : 'Mostra tutti ';
    togN.textContent = dtiExp ? '' : `(${visible.length})`;
  }
}

function toggleDTI() {
  dtiExp = !dtiExp;
  filterTokens(document.getElementById('dti-search').value);
}

async function loadDTI() {
  try {
    const scss = await fetch(`${RAW}/design-tokens/variables.scss`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
    dtiAll = parseDTI(scss);
    filterTokens('');
    document.getElementById('dti-loading').style.display = 'none';
    document.getElementById('dti-table-wrap').style.display = '';
  } catch {
    document.getElementById('dti-loading').textContent = 'Impossibile caricare i token.';
  }
}

// Lazy-load DTI only when the tab is first activated
document.addEventListener('DOMContentLoaded', () => {
  const dtiTab = document.querySelector('[data-bs-target="#dt-dti"]');
  if (dtiTab) dtiTab.addEventListener('shown.bs.tab', () => { if (!dtiAll.length) loadDTI(); }, { once: true });
});

// Alias BSI slug → Dev Kit slug (estratti da slugify.ts)
const DK_SLUG_ALIASES = {
  'buttons': 'button',
  'chips': 'chip',
  'notifications': 'notification',
  'progress-indicators': 'progress',
  'sections': 'section',
  'steppers': 'stepper',
  'toggles': 'toggle',
};

/* Load dashboard data */
async function loadDashboard() {
  try {
    const [meta, status, dki, tokens] = await Promise.all([
      j(`${RAW}/snapshot-meta.json`),
      j(`${RAW}/bsi/components-status.json`),
      j(`${RAW}/devkit/index.json`).catch(() => null),
      j(`${RAW}/bsi/custom-properties.json`).catch(() => null),
    ]);

    const v = meta.versions || {};
    const fa = meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleDateString('it-IT') : '—';
    const ha = meta.fetchedAt ? Math.round((Date.now() - new Date(meta.fetchedAt)) / 3600000) : null;
    const fr = ha !== null ? (ha < 48 ? '🟢 Nelle ultime 48 ore' : ha < 96 ? '🟡 Negli ultimi 4 giorni' : '🔴 Più di 4 giorni fa') : '';

    document.getElementById('dash-meta').innerHTML = [
      [v.designSystem || '—', 'Design system .italia'],
      [v.bootstrapItalia || '—', 'Bootstrap Italia'],
      [v.devKitItalia || '—', 'Dev Kit Italia'],
      [v.designTokensItalia || '—', 'Design Tokens Italia'],
      [fa, 'Snapshot CI', fr],
    ].map(([val, lab, sub]) => `<div class="dash-meta-item"><span class="dash-meta-label">${lab}</span><span class="dash-meta-val">${val}</span>${sub ? `<span class="dash-meta-sub">${sub}</span>` : ''}</div>`).join('');

    // Map slug -> {id, displayName}, not just a Set of slugs — need the
    // full entry to add Dev Kit-only components below.
    const dkEntries = new Map();
    if (dki?.entries) {
      Object.values(dki.entries)
        .filter(e => e.type === 'docs' && e.id.startsWith('componenti-'))
        .forEach(e => {
          const p = (e.title || '').split('/');
          const displayName = (p[p.length - 1] || '').trim() || e.id;
          const s = displayName.toLowerCase().replace(/\s+/g, '-');
          if (s) dkEntries.set(s, { id: e.id, displayName });
        });
    }

    const claimedDkIds = new Set();
    allComps = (status.items || []).map(c => {
      const name = (c.title || '').replace(/`/g, '').replace(/\s*-\s*check\s+a11y.*$/i, '').trim();
      const bsiSlug = name.toLowerCase().replace(/\s+/g, '-');
      const dkEntry = dkEntries.get(DK_SLUG_ALIASES[bsiSlug] ?? bsiSlug);
      if (dkEntry) claimedDkIds.add(dkEntry.id);
      return { name, bsi: c['bootstrap Italia'] || '', uik: c['uI Kit Italia'] || '', dk: c['dev Kit Italia'] || false };
    }).filter(c => c.name);

    // Dev Kit-only components (e.g. Icon) have no BSI status entry, so the
    // .map() above never sees them. Same principle as the server-side union
    // (dsi_list_components): never silently drop them.
    for (const entry of dkEntries.values()) {
      if (claimedDkIds.has(entry.id)) continue;
      allComps.push({ name: entry.displayName, bsi: '', uik: '', dk: true });
    }

    allComps.sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById('f-all').textContent = allComps.length;
    document.getElementById('f-dk').textContent = allComps.filter(c => c.dk).length;
    renderComps(allComps);
    populatePropsSel();
    populateGlSel();

    if (tokens && typeof tokens === 'object') {
      populateTokenSel(
        Object.entries(tokens)
          .flatMap(([slug, entries]) => (entries || []).map(e => ({ component: slug, name: e['variable-name'] || '', value: e.value || '', description: e.description || '' })))
          .filter(t => t.name)
      );
    }

    document.getElementById('dash-issues').innerHTML = REPOS.map(r =>
      `<div class="issue-card"><p class="issue-repo">${r.label}</p><a href="https://github.com/${r.slug}/issues" target="_blank" rel="noopener" class="fw-semibold small">Issue aperte →</a></div>`
    ).join('');

    document.getElementById('dash-loading').style.display = 'none';
    document.getElementById('dash-content').style.display = 'block';

  } catch {
    document.getElementById('dash-loading').style.display = 'none';
    document.getElementById('dash-error').style.display = 'block';
  }
}

/* Sticky nav — show brand label when header scrolls out of view */
const siteNav = document.querySelector('.site-nav');
if (siteNav) {
  const hero = document.querySelector('.it-header-wrapper');
  const observer = new IntersectionObserver(
    ([e]) => siteNav.classList.toggle('is-sticky', !e.isIntersecting),
    { threshold: 1, rootMargin: '-1px 0px 0px 0px' }
  );
  observer.observe(hero);
}

loadDashboard();