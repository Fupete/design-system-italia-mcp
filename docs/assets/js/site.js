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
const FILO_TOOLS = 13;
const FILO_SOURCES = 9;
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
    <td>${c.dk ? badge('PRESENTE', 'green') : badge('NON PRESENTE', 'gray')}</td>
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
  document.querySelectorAll('.comp-filter .btn').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-outline-secondary'); });
  btn.classList.remove('btn-outline-secondary');
  btn.classList.add('btn-primary');
  renderComps(f === 'all' ? allComps : allComps.filter(c => c.dk));
}

/* CSS tokens */
let tokByComp = {};

function populateTokenSel(raw) {
  tokByComp = {};
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  arr.forEach(t => {
    const c = (t.component || 'altro').toLowerCase();
    if (!tokByComp[c]) tokByComp[c] = [];
    tokByComp[c].push({ name: t.name || t.property || '', value: t.value || '', description: t.description || '' });
  });
  const sel = document.getElementById('tok-sel');
  Object.keys(tokByComp).sort().forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = `${c} (${tokByComp[c].length})`;
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
  el.innerHTML = `<table class="tok-table"><thead><tr><th>Variabile</th><th>Valore</th><th>Descrizione</th></tr></thead><tbody>${toks.map((t, i) => `<tr class="${i % 2 === 1 ? 'tok-alt' : ''}"><td class="token-name">${esc(t.name)}</td><td class="token-desc">${esc(t.value)}</td><td class="token-desc">${esc(t.description)}</td></tr>`).join('')}</tbody></table>`;
  cta.hidden = false;
  ex.hidden = true;
}

/* Dev Kit props */
const PROPS_SLUGS = ['accordion', 'avatar', 'back-to-top', 'breadcrumbs', 'button', 'callout', 'card', 'carousel', 'chip', 'collapse', 'dropdown', 'form-autocomplete', 'form-checkbox', 'form-datepicker', 'form-input', 'form-number-input', 'form-radio-button', 'form-select', 'form-timepicker', 'hero', 'icon', 'megamenu', 'modal', 'navscroll', 'pagination', 'popover', 'rating', 'section', 'skiplinks', 'sticky', 'video-player'];

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
  if (!slug) { el.innerHTML = ''; cta.hidden = true; }
  if (!slug) { el.innerHTML = ''; return; }
  el.innerHTML = '<p class="data-empty">caricamento…</p>';
  try {
    const s = await j(`${RAW}/devkit/props/${slug}.json`);
    if (!s?.props?.length) { el.innerHTML = '<p class="data-empty">Nessuna prop configurabile.</p>'; return; }
    el.innerHTML = `<table class="tok-table"><thead><tr><th>Prop <code>${esc(s.tagName)}</code></th><th>Tipo</th><th>Descrizione</th><th>Default</th></tr></thead><tbody>${s.props.map((p, i) => `<tr class="${i % 2 === 1 ? 'tok-alt' : ''}"><td class="token-name">${esc(p.name)}</td><td class="token-desc">${esc(p.type || '')}</td><td class="token-desc">${p.description ? p.description.replace(/`([^`]+)`/g, (_, code) => `<code>${esc(code)}</code>`) : ''}</td><td class="token-desc">${p.default != null ? esc(String(p.default)) : ''}</td></tr>`).join('')}</tbody></table>`;
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
  return text.split(/\n\n+/).map(b => {
    b = b.trim();
    if (!b) return '';
    if (/^### /.test(b)) {
      const lines = b.split('\n');
      const heading = `<h3>${esc(lines[0].replace(/^### /, ''))}</h3>`;
      const rest = lines.slice(1).join('\n').trim();
      return heading + (rest ? mm(rest) : '');
    }
    if (/^- /m.test(b)) return `<ul>${b.split('\n').filter(l => l.trim()).map(l => `<li>${mi(l.replace(/^- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${mi(b)}</p>`;
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
    let out = `<h3 class="mb-2">${esc(title)}</h3>${tags ? `<div class="chip"><span class="chip-label">${tags}</chip></div>` : ''}${sub ? `<p class="lead mt-2">${esc(sub)}</p>` : ''}`;
    if (when) out += `<div class="mb-3"><h4>Quando usarlo</h4><div class="gl-text">${mm(when)}</div></div>`;
    if (how) out += `<div class="mb-3"><h4>Come usarlo</h4><div class="gl-text">${mm(how)}</div></div>`;
    if (!when && !how) out += '<p class="data-empty">Linee guida non disponibili.</p>';
    out += `<a href="${url}" target="_blank" rel="noopener" class="fw-semibold">Scheda completa su Designers Italia →</a>`;
    el.innerHTML = out;
  } catch { el.innerHTML = '<p class="data-empty">Linee guida non disponibili.</p>'; }
}

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

    if (meta.sources) {
      const n = Object.keys(meta.sources).filter(k => k.startsWith('bsi/components/') && k.endsWith('.json')).length;
      const el = document.getElementById('stat-comp');
      if (el && n > 0) el.textContent = n + '+';
    }

    const dkSlugs = new Set();
    if (dki?.entries) {
      Object.values(dki.entries)
        .filter(e => e.type === 'docs' && e.id.startsWith('componenti-'))
        .forEach(e => {
          const p = (e.title || '').split('/');
          const s = (p[p.length - 1] || '').toLowerCase().trim().replace(/\s+/g, '-');
          if (s) dkSlugs.add(s);
        });
    }

    allComps = (status.items || []).map(c => {
      const name = (c.title || '').replace(/`/g, '').replace(/\s*-\s*check\s+a11y.*$/i, '').trim();
      return { name, bsi: c['bootstrap Italia'] || '', uik: c['uI Kit Italia'] || '', dk: dkSlugs.has(name.toLowerCase().replace(/\s+/g, '-')) };
    }).filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name));

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

/* Sticky nav brand — desktop only (matches CSS breakpoint) */
const siteNav = document.querySelector('.site-nav');
if (siteNav) {
  const hero = document.querySelector('.it-header-wrapper');
  let observer = null;

  function initObserver() {
    if (!observer) {
      observer = new IntersectionObserver(
        ([e]) => siteNav.classList.toggle('is-sticky', !e.isIntersecting),
        { threshold: 1, rootMargin: '-1px 0px 0px 0px' }
      );
      observer.observe(hero);
    } else if (observer) {
      observer.disconnect();
      observer = null;
      siteNav.classList.remove('is-sticky');
    }
  }

  initObserver();
  mq.addEventListener('change', initObserver);
}

/* Init */
const st = document.getElementById('stat-tools');
const ss = document.getElementById('stat-sources');
if (st) st.textContent = FILO_TOOLS;
if (ss) ss.textContent = FILO_SOURCES;

loadDashboard();