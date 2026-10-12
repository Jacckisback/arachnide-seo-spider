/* Arachnide SEO Spider — interface */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('fr-FR'));
const fmtKb = (b) => (b ? (b / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Ko' : '');
const PAGE_SIZE = 100;

const state = {
  R: null, // résultat complet
  live: [], // lignes reçues pendant le crawl
  running: false,
  tab: 'dashboard',
  filter: {},
  search: '',
  sort: {},
  page: 0,
  issue: null,
  selected: null,
  detailTab: 'details',
  graph: null,
};

/* ---------- Helpers données ---------- */
const html200 = (R) => R.pages.filter((p) => p.isHtml && p.status === 200);
const statusCls = (s) => 'st s' + String(s || 0)[0];
const yn = (b) => (b ? '<span class="yes">Oui</span>' : '<span class="no">Non</span>');
const T = () => state.R?.meta?.thresholds || { titleMax: 60, titleMin: 30, descMax: 155, descMin: 70, thinWords: 200, slowMs: 1000 };

function linkGraph() {
  if (state.graph) return state.graph;
  const { urls, edges } = state.R.links;
  const inl = new Map();
  const out = new Map();
  for (const [f, t, a, flags] of edges) {
    const e = { from: urls[f], to: urls[t], anchor: a, nofollow: !!(flags & 1), internal: !!(flags & 2) };
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
    if (!inl.has(e.to)) inl.set(e.to, []);
    inl.get(e.to).push(e);
  }
  state.graph = { inl, out, byUrl: new Map(state.R.pages.map((p) => [p.url, p])) };
  return state.graph;
}

/* ---------- Colonnes réutilisables ---------- */
const C = {
  url: { k: 'url', l: 'Adresse', cls: 'trunc', html: (r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>` },
  status: { k: 'status', l: 'Code', num: true, html: (r) => (r.blockedByRobots ? '<span class="chip muted">robots</span>' : `<span class="${statusCls(r.status)}">${r.status || '—'}</span>`) },
  statusText: { k: 'statusText', l: 'Statut', v: (r) => r.statusText || r.error || '' },
  indexability: { k: 'indexabilityReason', l: 'Indexabilité', html: (r) => (r.indexable ? '<span class="chip ok">Indexable</span>' : `<span class="chip muted">${esc(r.indexabilityReason || 'Non indexable')}</span>`), v: (r) => (r.indexable ? 'Indexable' : r.indexabilityReason) },
  title: { k: 'title', l: 'Titre', cls: 'trunc' },
  titleLength: { k: 'titleLength', l: 'Long.', num: true },
  depth: { k: 'depth', l: 'Profondeur', num: true },
  inlinks: { k: 'uniqueInlinks', l: 'Liens entrants', num: true },
  outlinks: { k: 'internalOutlinks', l: 'Liens sortants int.', num: true },
  extOut: { k: 'externalOutlinks', l: 'Liens sortants ext.', num: true },
  words: { k: 'wordCount', l: 'Mots', num: true },
  rt: { k: 'responseTime', l: 'Temps (ms)', num: true },
  size: { k: 'size', l: 'Poids', num: true, v: (r) => r.size, html: (r) => fmtKb(r.size) },
  type: { k: 'contentType', l: 'Type', cls: 'trunc', v: (r) => (r.contentType || '').split(';')[0] },
  inSitemap: { k: 'inSitemap', l: 'Sitemap', html: (r) => yn(r.inSitemap), v: (r) => (r.inSitemap ? 'Oui' : 'Non') },
};

/* ---------- Définition des onglets ---------- */
const TABS = [
  { group: 'Vue d’ensemble' },
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'issues', label: 'Problèmes', count: (R) => R.issues.length },
  { group: 'Exploration' },
  {
    id: 'internal', label: 'Interne', rows: (R) => R.pages,
    cols: [C.url, C.type, C.status, C.indexability, C.title, C.words, C.depth, C.inlinks, C.rt, C.size],
    filters: { 'Tout': () => true, 'HTML': (p) => p.isHtml, 'Indexables': (p) => p.indexable && p.isHtml, 'Non indexables': (p) => !p.indexable, 'Autres (PDF, images…)': (p) => !p.isHtml && p.status >= 200 && p.status < 300 },
  },
  {
    id: 'external', label: 'Externe', rows: (R) => R.externals,
    cols: [C.url, { k: 'status', l: 'Code', num: true, html: (r) => (r.status == null ? '<span class="chip muted">non vérifié</span>' : `<span class="${statusCls(r.status)}">${r.status || '—'}</span>`) }, { k: 'statusText', l: 'Statut' }, { k: 'inlinks', l: 'Liens', num: true }, { k: 'pages', l: 'Pages', num: true }, { k: 'firstPage', l: 'Trouvé sur', cls: 'trunc' }],
    filters: { 'Tout': () => true, 'En erreur': (e) => e.status === 0 || e.status >= 400, 'Redirigés': (e) => e.status >= 300 && e.status < 400 },
  },
  {
    id: 'codes', label: 'Codes réponse', rows: (R) => R.pages,
    cols: [C.url, C.status, C.statusText, { k: 'redirectUrl', l: 'Redirige vers', cls: 'trunc' }, C.inlinks, C.rt],
    filters: { 'Tout': () => true, '2xx Succès': (p) => p.status >= 200 && p.status < 300, '3xx Redirection': (p) => p.status >= 300 && p.status < 400, '4xx Erreur client': (p) => p.status >= 400 && p.status < 500, '5xx Erreur serveur': (p) => p.status >= 500, 'Bloqué par robots.txt': (p) => p.blockedByRobots, 'Sans réponse': (p) => !p.status && !p.blockedByRobots },
  },
  { group: 'Contenu' },
  {
    id: 'titles', label: 'Titres', rows: html200,
    cols: [C.url, C.title, C.titleLength, { k: 'titleCount', l: 'Nb', num: true }, { k: 'duplicateTitle', l: 'Dupliqué', html: (r) => (r.duplicateTitle ? '<span class="chip error">Oui</span>' : ''), v: (r) => (r.duplicateTitle ? 'Oui' : '') }, C.indexability],
    filters: { 'Tout': () => true, 'Manquant': (p) => !p.title, 'Dupliqué': (p) => p.duplicateTitle, 'Trop long': (p) => p.titleLength > T().titleMax, 'Trop court': (p) => p.title && p.titleLength < T().titleMin, 'Multiple': (p) => p.titleCount > 1, 'Identique au H1': (p) => p.title && p.h1?.[0] && p.title.toLowerCase() === p.h1[0].toLowerCase() },
  },
  {
    id: 'desc', label: 'Meta description', rows: html200,
    cols: [C.url, { k: 'metaDescription', l: 'Meta description', cls: 'wrap' }, { k: 'metaDescriptionLength', l: 'Long.', num: true }, { k: 'duplicateDescription', l: 'Dupliquée', html: (r) => (r.duplicateDescription ? '<span class="chip warning">Oui</span>' : ''), v: (r) => (r.duplicateDescription ? 'Oui' : '') }, C.indexability],
    filters: { 'Tout': () => true, 'Manquante': (p) => !p.metaDescription, 'Dupliquée': (p) => p.duplicateDescription, 'Trop longue': (p) => p.metaDescriptionLength > T().descMax, 'Trop courte': (p) => p.metaDescription && p.metaDescriptionLength < T().descMin, 'Multiple': (p) => p.metaDescriptionCount > 1 },
  },
  {
    id: 'h1', label: 'H1', rows: html200,
    cols: [C.url, { k: 'h1first', l: 'H1', cls: 'wrap', v: (r) => r.h1?.[0] || '' }, { k: 'h1len', l: 'Long.', num: true, v: (r) => r.h1?.[0]?.length || 0 }, { k: 'h1Count', l: 'Nb H1', num: true }, { k: 'h1all', l: 'Autres H1', cls: 'wrap', v: (r) => (r.h1 || []).slice(1).join(' | ') }],
    filters: { 'Tout': () => true, 'Manquant': (p) => !p.h1Count, 'Multiple': (p) => p.h1Count > 1, 'Dupliqué': (p) => p.duplicateH1 },
  },
  {
    id: 'h2', label: 'H2', rows: html200,
    cols: [C.url, { k: 'h2Count', l: 'Nb H2', num: true }, { k: 'h2list', l: 'H2', cls: 'wrap', v: (r) => (r.h2 || []).join(' | ') }],
    filters: { 'Tout': () => true, 'Aucun H2': (p) => !p.h2Count },
  },
  {
    id: 'content', label: 'Contenu', rows: html200,
    cols: [C.url, C.words, { k: 'textRatio', l: 'Ratio texte %', num: true }, { k: 'duplicateContent', l: 'Dupliqué', html: (r) => (r.duplicateContent ? '<span class="chip error">Oui</span>' : ''), v: (r) => (r.duplicateContent ? 'Oui' : '') }, { k: 'lang', l: 'Lang' }, C.size, C.indexability],
    filters: { 'Tout': () => true, 'Contenu faible': (p) => p.wordCount < T().thinWords, 'Dupliqué': (p) => p.duplicateContent, 'Sans attribut lang': (p) => !p.lang },
  },
  {
    id: 'images', label: 'Images', rows: (R) => R.images,
    cols: [{ k: 'src', l: 'Image', cls: 'trunc', html: (r) => `<a href="${esc(r.src)}" target="_blank" rel="noopener">${esc(r.src)}</a>` }, { k: 'alt', l: 'Texte alt', cls: 'wrap' }, { k: 'missingAlt', l: 'Alt manquant', html: (r) => (r.missingAlt ? '<span class="chip warning">Oui</span>' : ''), v: (r) => (r.missingAlt ? 'Oui' : '') }, { k: 'size', l: 'Poids', num: true, html: (r) => (r.size == null ? '' : fmtKb(r.size)) }, { k: 'status', l: 'Code', num: true }, { k: 'pages', l: 'Pages', num: true }, { k: 'firstPage', l: 'Trouvée sur', cls: 'trunc' }],
    filters: { 'Tout': () => true, 'Alt manquant': (i) => i.missingAlt, 'Lourdes (> 150 Ko)': (i) => i.size > 150 * 1024, 'Cassées': (i) => i.status !== null && (i.status === 0 || i.status >= 400) },
  },
  { group: 'Technique' },
  {
    id: 'canonicals', label: 'Canonicals', rows: html200,
    cols: [C.url, { k: 'canonical', l: 'Canonical', cls: 'trunc' }, { k: 'canonicalCount', l: 'Nb', num: true }, C.indexability],
    filters: { 'Tout': () => true, 'Auto-référente': (p) => p.canonical === p.url, 'Canonicalisée': (p) => p.canonical && p.canonical !== p.url, 'Absente': (p) => !p.canonical, 'Multiple': (p) => p.canonicalCount > 1 },
  },
  {
    id: 'directives', label: 'Directives', rows: (R) => R.pages,
    cols: [C.url, { k: 'metaRobots', l: 'Meta robots' }, { k: 'xRobotsTag', l: 'X-Robots-Tag' }, C.indexability],
    filters: { 'Tout': () => true, 'Noindex': (p) => /noindex|none/i.test(`${p.metaRobots} ${p.xRobotsTag}`), 'Nofollow': (p) => /nofollow|none/i.test(`${p.metaRobots} ${p.xRobotsTag}`), 'Bloqué robots.txt': (p) => p.blockedByRobots, 'Non indexables': (p) => !p.indexable },
  },
  {
    id: 'redirects', label: 'Redirections', rows: (R) => R.redirects,
    cols: [C.url, { k: 'status', l: 'Code', num: true }, { k: 'hops', l: 'Sauts', num: true }, { k: 'finalUrl', l: 'URL finale', cls: 'trunc' }, { k: 'finalStatus', l: 'Code final', num: true }, { k: 'chain', l: 'Chaîne', cls: 'wrap', v: (r) => r.chain.join(' → ') }, { k: 'inlinks', l: 'Liens entrants', num: true }],
    filters: { 'Tout': () => true, 'Chaînes (2+ sauts)': (r) => r.hops > 1, 'Boucles': (r) => r.loop, 'Temporaires (302/307)': (r) => r.status === 302 || r.status === 307 },
  },
  {
    id: 'broken', label: 'Liens cassés', rows: (R) => R.brokenLinks,
    cols: [{ k: 'from', l: 'Page source', cls: 'trunc', html: (r) => `<a href="${esc(r.from)}" target="_blank" rel="noopener">${esc(r.from)}</a>` }, { k: 'to', l: 'Lien cassé', cls: 'trunc' }, { k: 'anchor', l: 'Ancre', cls: 'trunc' }, { k: 'status', l: 'Code', num: true, html: (r) => `<span class="${statusCls(r.status)}">${r.status || esc(r.statusText) || '—'}</span>` }, { k: 'external', l: 'Type', v: (r) => (r.external ? 'Externe' : 'Interne') }],
    filters: { 'Tout': () => true, 'Internes': (l) => !l.external, 'Externes': (l) => l.external },
  },
  {
    id: 'hreflang', label: 'Hreflang', rows: (R) => html200(R).filter((p) => p.hreflang?.length),
    cols: [C.url, { k: 'lang', l: 'Lang' }, { k: 'hrefCount', l: 'Nb', num: true, v: (r) => r.hreflang.length }, { k: 'hreflangs', l: 'Alternates', cls: 'wrap', v: (r) => r.hreflang.map((h) => `${h.lang}: ${h.href}`).join(' | ') }],
    filters: { 'Tout': () => true, 'Sans x-default': (p) => !p.hreflang.some((h) => h.lang === 'x-default') },
  },
  {
    id: 'schema', label: 'Données structurées', rows: html200,
    cols: [C.url, { k: 'schemaTypes', l: 'Types', cls: 'wrap', v: (r) => (r.schemaTypes || []).join(', ') }, { k: 'schemaErrors', l: 'JSON-LD invalides', num: true }, C.indexability],
    filters: { 'Tout': () => true, 'Avec données': (p) => p.schemaTypes?.length, 'Sans données': (p) => !p.schemaTypes?.length, 'JSON invalide': (p) => p.schemaErrors > 0 },
  },
  {
    id: 'sitemap', label: 'Sitemap', rows: (R) => R.pages,
    cols: [C.url, C.status, C.inSitemap, C.indexability, C.inlinks, C.depth],
    filters: { 'Dans le sitemap': (p) => p.inSitemap, 'Orphelines': (p) => p.inSitemap && !p.uniqueInlinks && p.depth !== 0, 'Non indexables dans le sitemap': (p) => p.inSitemap && !p.indexable, 'Indexables hors sitemap': (p) => !p.inSitemap && p.indexable && p.isHtml },
  },
  {
    id: 'linking', label: 'Maillage interne', rows: html200,
    cols: [C.url, C.depth, C.inlinks, { k: 'inlinks', l: 'Liens entrants (total)', num: true }, C.outlinks, C.extOut, C.indexability],
    filters: { 'Tout': () => true, '0–1 lien entrant': (p) => (p.uniqueInlinks || 0) <= 1, 'Profondeur ≥ 4': (p) => p.depth >= 4, 'Non atteignables': (p) => p.depth === null },
  },
  {
    id: 'perf', label: 'Performance', rows: html200,
    cols: [C.url, C.rt, { k: 'downloadTime', l: 'Téléchargement (ms)', num: true }, C.size, C.words],
    filters: { 'Tout': () => true, 'Lentes (> 1 s)': (p) => p.responseTime > T().slowMs, 'HTML lourd (> 500 Ko)': (p) => p.size > 500 * 1024 },
  },
  {
    id: 'urls', label: 'URL', rows: (R) => R.pages,
    cols: [C.url, { k: 'urlLength', l: 'Longueur', num: true }, C.status, C.indexability],
    filters: { 'Tout': () => true, 'Majuscules': (p) => /[A-Z]/.test(new URL(p.url).pathname), 'Underscores': (p) => new URL(p.url).pathname.includes('_'), 'Paramètres': (p) => !!new URL(p.url).search, 'Trop longues': (p) => p.urlLength > 115, 'Caractères encodés': (p) => /%[0-9A-F]{2}/i.test(new URL(p.url).pathname) },
  },
  { id: 'robots', label: 'Robots & sitemaps' },
];
const TAB_BY_ID = Object.fromEntries(TABS.filter((t) => t.id).map((t) => [t.id, t]));

/* ---------- Rendu des onglets latéraux ---------- */
function renderTabs() {
  const R = state.R;
  $('#tabs').innerHTML = TABS.map((t) => {
    if (t.group) return `<div class="group">${esc(t.group)}</div>`;
    let count = '';
    if (R && t.count) count = t.count(R);
    else if (R && t.rows) count = t.rows(R).length;
    else if (!R && t.id === 'internal' && state.live.length) count = state.live.length;
    return `<button data-tab="${t.id}" class="${state.tab === t.id ? 'active' : ''}"><span>${esc(t.label)}</span><span class="count">${fmtN(count)}</span></button>`;
  }).join('');
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  state.search = '';
  state.page = 0;
  renderTabs();
  render();
});

/* ---------- Rendu principal ---------- */
function render() {
  const view = $('#view');
  if (!state.R) {
    if (state.tab === 'internal' && state.live.length) return renderTable(view, liveTab(), state.live);
    view.innerHTML = state.running
      ? `<div class="empty"><h2>Crawl en cours…</h2><p>Les URLs apparaissent en direct dans l’onglet <b>Interne</b>. L’analyse complète s’affichera à la fin.</p></div>`
      : `<div class="empty"><h2>Bienvenue dans Arachnide 🕷️</h2><p>Saisissez l’URL d’un site et cliquez sur <b>Crawler</b>.<br>Vous pouvez aussi rouvrir un crawl depuis l’<b>Historique</b> ou un fichier <b>.json</b>.</p></div>`;
    return;
  }
  if (state.tab === 'dashboard') return renderDashboard(view);
  if (state.tab === 'issues') return renderIssues(view);
  if (state.tab === 'robots') return renderRobots(view);
  const tab = TAB_BY_ID[state.tab];
  renderTable(view, tab, tab.rows(state.R));
}

function liveTab() {
  return { id: 'internal', label: 'Interne (en direct)', cols: [C.url, C.type, C.status, C.title, C.words, C.rt, C.size] };
}

function cellValue(col, r) {
  return col.v ? col.v(r) : r[col.k];
}

function renderTable(view, tab, allRows) {
  const filters = tab.filters || {};
  const filterNames = Object.keys(filters);
  const fname = filterNames.includes(state.filter[tab.id]) ? state.filter[tab.id] : filterNames[0];
  let rows = fname ? allRows.filter(filters[fname]) : allRows.slice();
  const q = state.search.trim().toLowerCase();
  if (q) rows = rows.filter((r) => tab.cols.some((c) => String(cellValue(c, r) ?? '').toLowerCase().includes(q)));
  const s = state.sort[tab.id];
  if (s) {
    const col = tab.cols.find((c) => c.k === s.k) || tab.cols[0];
    rows.sort((a, b) => {
      const x = cellValue(col, a);
      const y = cellValue(col, b);
      const nx = x == null || x === '';
      const ny = y == null || y === '';
      if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { numeric: true });
      return s.desc ? -r : r;
    });
  }
  state.currentRows = rows;
  state.currentTab = tab;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);

  view.innerHTML = `
    <div class="toolbar">
      <h2>${esc(tab.label)}</h2>
      ${filterNames.length ? `<select id="filterSel">${filterNames.map((n) => `<option ${n === fname ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
      <input id="searchInput" type="text" placeholder="Rechercher…" value="${esc(state.search)}">
      <span class="muted">${fmtN(rows.length)} ligne(s)</span>
      <span class="spacer"></span>
      <button class="btn" id="csvBtn">⬇ Export CSV</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${tab.cols.map((c) => `<th data-k="${esc(c.k)}" class="${c.num ? 'num' : ''} ${s && s.k === c.k ? 'sorted' + (s.desc ? ' desc' : '') : ''}">${esc(c.l)}</th>`).join('')}</tr></thead>
      <tbody>${slice.map((r, i) => `<tr data-i="${state.page * PAGE_SIZE + i}" class="${state.selected && (r.url || r.from || r.src) === state.selected ? 'sel' : ''}">${tab.cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}" title="${esc(cellValue(c, r))}">${c.html ? c.html(r) : esc(c.num ? fmtN(cellValue(c, r)) : cellValue(c, r))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>${rows.length ? '' : '<div class="empty">Aucune ligne pour ce filtre 🎉</div>'}</div>
    ${pages > 1 ? `<div class="pager"><button class="btn small" id="prevPg" ${state.page === 0 ? 'disabled' : ''}>‹ Préc.</button> Page ${state.page + 1} / ${pages} <button class="btn small" id="nextPg" ${state.page >= pages - 1 ? 'disabled' : ''}>Suiv. ›</button></div>` : ''}`;

  $('#filterSel')?.addEventListener('change', (e) => {
    state.filter[tab.id] = e.target.value;
    state.page = 0;
    render();
  });
  const si = $('#searchInput');
  si.addEventListener('input', debounce(() => {
    state.search = si.value;
    state.page = 0;
    render();
    const el = $('#searchInput');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, 250));
  view.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    const cur = state.sort[tab.id];
    state.sort[tab.id] = cur && cur.k === k ? { k, desc: !cur.desc } : { k, desc: !!tab.cols.find((c) => c.k === k)?.num };
    render();
  }));
  $('#prevPg')?.addEventListener('click', () => { state.page--; render(); });
  $('#nextPg')?.addEventListener('click', () => { state.page++; render(); });
  $('#csvBtn').addEventListener('click', () => exportCsv(tab, rows, fname));
  view.querySelector('tbody').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const r = rows[Number(tr.dataset.i)];
    selectUrl(r.url || r.from || r.firstPage);
    view.querySelectorAll('tr.sel').forEach((x) => x.classList.remove('sel'));
    tr.classList.add('sel');
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* ---------- Tableau de bord ---------- */
function gauge(score) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--err)';
  return `<svg viewBox="0 0 150 150" role="img" aria-label="Score ${score} sur 100">
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--panel-2)" stroke-width="14"/>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 75 75)"/>
    <text x="75" y="84" text-anchor="middle" font-size="34" font-weight="700" fill="var(--text)">${score}</text></svg>`;
}

function bars(obj, colorFn = () => 'var(--accent)') {
  const entries = Object.entries(obj).filter(([, v]) => v > 0);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return entries.map(([k, v]) => `<div class="b"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%;background:${colorFn(k)}"></div></div><span class="n">${fmtN(v)}</span></div>`).join('') || '<p class="muted">—</p>';
}

function issueListHtml(issues, limit = Infinity) {
  const sevLabel = { error: 'Erreur', warning: 'Avertissement', notice: 'Remarque' };
  return `<ul class="issue-list">${issues.slice(0, limit).map((i) => `<li data-issue="${i.id}" class="${state.issue === i.id ? 'active' : ''}">
    <span class="chip ${i.severity}">${sevLabel[i.severity]}</span>
    <span>${esc(i.label)}<br><span class="cat">${esc(i.category)}</span></span>
    <span class="num">${fmtN(i.count)}</span></li>`).join('')}</ul>`;
}

function renderDashboard(view) {
  const R = state.R;
  const S = R.summary;
  const statusColor = (k) => ({ '2xx': 'var(--ok)', '3xx': 'var(--warn)', '4xx': 'var(--err)', '5xx': 'var(--err)' })[k] || 'var(--muted)';
  const depthSorted = Object.fromEntries(Object.entries(S.depthBuckets).sort(([a], [b]) => (a === 'n/a') - (b === 'n/a') || parseInt(a) - parseInt(b)));
  view.innerHTML = `
    <div class="toolbar"><h2>${esc(R.meta.startUrl)}</h2><span class="muted">Crawlé le ${new Date(R.meta.finishedAt).toLocaleString('fr-FR')}${R.meta.stopped ? ' · crawl interrompu' : ''}</span></div>
    <div class="dash-row">
      <div class="card score"><h3>Score de santé SEO</h3>${gauge(S.score)}<div class="label">${S.score >= 80 ? 'Bon état' : S.score >= 50 ? 'À améliorer' : 'Critique'}</div></div>
      <div class="card"><h3>Codes réponse</h3><div class="bars">${bars(S.statusBuckets, statusColor)}</div></div>
      <div class="card"><h3>Profondeur de clic</h3><div class="bars">${bars(Object.fromEntries(Object.entries(depthSorted).map(([k, v]) => [k === 'n/a' ? 'Non lié' : 'Niveau ' + k, v])))}</div></div>
    </div>
    <div class="dash-grid">
      ${[['URLs crawlées', S.totalUrls], ['Pages HTML (200)', S.htmlPages], ['Indexables', S.indexable], ['Non indexables', S.nonIndexable], ['Temps de réponse moyen', S.avgResponseTime + ' ms'], ['Mots / page (moy.)', S.avgWords], ['Liens internes', S.internalLinks], ['Domaines externes liés', S.uniqueExternal], ['URLs dans le sitemap', R.meta.sitemapUrlCount], ['Images', S.images]]
        .map(([l, v]) => `<div class="card kpi"><div class="v">${typeof v === 'number' ? fmtN(v) : esc(v)}</div><div class="l">${esc(l)}</div></div>`).join('')}
    </div>
    <div class="card">
      <h3>Problèmes détectés</h3>
      <div class="sev-tot"><span class="chip error">${fmtN(S.errors)} erreurs</span><span class="chip warning">${fmtN(S.warnings)} avertissements</span><span class="chip notice">${fmtN(S.notices)} remarques</span></div>
      ${issueListHtml(R.issues, 15)}
      ${R.issues.length > 15 ? `<p><a href="#" id="allIssues">Voir les ${R.issues.length} types de problèmes →</a></p>` : ''}
    </div>`;
  view.querySelectorAll('[data-issue]').forEach((li) => li.addEventListener('click', () => openIssue(li.dataset.issue)));
  $('#allIssues')?.addEventListener('click', (e) => { e.preventDefault(); openIssue(null); });
}

function openIssue(id) {
  state.tab = 'issues';
  state.issue = id || state.R.issues[0]?.id || null;
  state.search = '';
  state.page = 0;
  renderTabs();
  render();
}

/* ---------- Problèmes ---------- */
function renderIssues(view) {
  const R = state.R;
  if (!R.issues.length) {
    view.innerHTML = '<div class="empty"><h2>Aucun problème détecté 🎉</h2></div>';
    return;
  }
  if (!R.issues.find((i) => i.id === state.issue)) state.issue = R.issues[0].id;
  const issue = R.issues.find((i) => i.id === state.issue);
  view.innerHTML = `<div class="issues-layout">
    <div class="card">${issueListHtml(R.issues)}</div>
    <div>
      <div class="issue-info card">
        <span class="chip ${issue.severity}">${esc(issue.category)}</span>
        <h2>${esc(issue.label)} — ${fmtN(issue.count)}</h2>
        <p>${esc(issue.description)}</p>
        <p class="fix"><b>Comment corriger :</b> ${esc(issue.fix)}</p>
      </div>
      <div id="issueTable"></div>
    </div></div>`;
  view.querySelectorAll('[data-issue]').forEach((li) => li.addEventListener('click', () => {
    state.issue = li.dataset.issue;
    state.search = '';
    state.page = 0;
    render();
  }));
  const tab = { id: 'issue-' + issue.id, label: 'URLs concernées', cols: [C.url, { k: 'detail', l: 'Détail', cls: 'wrap' }] };
  renderTable($('#issueTable'), tab, issue.items);
}

/* ---------- Robots & sitemaps ---------- */
function renderRobots(view) {
  const m = state.R.meta;
  view.innerHTML = `
    <div class="toolbar"><h2>robots.txt</h2><a href="${esc(m.origin)}/robots.txt" target="_blank" rel="noopener">${esc(m.origin)}/robots.txt</a></div>
    ${m.robotsTxt ? `<pre class="robots">${esc(m.robotsTxt)}</pre>` : '<p class="muted">Aucun robots.txt trouvé (ou non accessible).</p>'}
    <div class="toolbar" style="margin-top:16px"><h2>Sitemaps XML</h2><span class="muted">${fmtN(m.sitemapUrlCount)} URL(s) au total</span></div>
    ${m.sitemapFiles.length ? `<div class="table-wrap"><table><thead><tr><th>Fichier</th><th>Type</th><th class="num">Entrées</th></tr></thead><tbody>${m.sitemapFiles.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></td><td>${s.type === 'index' ? 'Index de sitemaps' : 'Sitemap'}</td><td class="num">${fmtN(s.count)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun sitemap trouvé.</p>'}
    <div class="toolbar" style="margin-top:16px"><h2>Configuration du crawl</h2></div>
    <div class="kv card">${Object.entries(m.options).map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div>`;
}

/* ---------- Panneau de détails ---------- */
function selectUrl(url) {
  if (!url) return;
  state.selected = url;
  renderDetail();
}

function renderDetail() {
  const box = $('#detail');
  const url = state.selected;
  if (!url) { box.hidden = true; return; }
  const p = state.R ? linkGraph().byUrl.get(url) : state.live.find((x) => x.url === url);
  box.hidden = false;
  const tabs = state.R ? [['details', 'Détails'], ['serp', 'Aperçu SERP'], ['in', 'Liens entrants'], ['out', 'Liens sortants']] : [['details', 'Détails']];
  if (!tabs.find(([k]) => k === state.detailTab)) state.detailTab = 'details';
  let body = '';
  if (!p) body = '<p class="muted">URL non crawlée (hors périmètre ou limite atteinte).</p>';
  else if (state.detailTab === 'details') body = detailKv(p);
  else if (state.detailTab === 'serp') body = serpPreview(p);
  else {
    const g = linkGraph();
    const list = (state.detailTab === 'in' ? g.inl.get(url) : g.out.get(url)) || [];
    const other = state.detailTab === 'in' ? 'from' : 'to';
    body = list.length ? `<div class="table-wrap"><table><thead><tr><th>${state.detailTab === 'in' ? 'Depuis' : 'Vers'}</th><th>Ancre</th><th>Type</th><th>Code</th></tr></thead><tbody>${list.slice(0, 1000).map((e) => {
      const t = g.byUrl.get(e[other]);
      return `<tr data-url="${esc(e[other])}"><td class="trunc">${esc(e[other])}</td><td class="trunc">${esc(e.anchor)}</td><td>${e.internal ? 'Interne' : 'Externe'}${e.nofollow ? ' · <span class="chip warning">nofollow</span>' : ''}</td><td>${t ? `<span class="${statusCls(t.status)}">${t.status || '—'}</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>${list.length > 1000 ? '<p class="muted">1 000 premiers liens affichés.</p>' : ''}` : '<p class="muted">Aucun lien.</p>';
  }
  box.innerHTML = `<div class="detail-head">
      <span class="url" title="${esc(url)}">${esc(url)}</span>
      <div class="detail-tabs">${tabs.map(([k, l]) => `<button data-dt="${k}" class="${state.detailTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir ↗</a>
      <button class="btn small" id="closeDetail" aria-label="Fermer">✕</button>
    </div><div class="detail-body">${body}</div>`;
  box.querySelectorAll('[data-dt]').forEach((b) => b.addEventListener('click', () => { state.detailTab = b.dataset.dt; renderDetail(); }));
  $('#closeDetail').addEventListener('click', () => { state.selected = null; renderDetail(); });
  box.querySelectorAll('tr[data-url]').forEach((tr) => tr.addEventListener('click', () => selectUrl(tr.dataset.url)));
}

function detailKv(p) {
  const rows = [
    ['Code réponse', `${p.status || '—'} ${p.statusText || ''}`],
    ['Indexabilité', p.indexable ? 'Indexable' : p.indexabilityReason],
    ['Type de contenu', p.contentType],
    ['Redirige vers', p.redirectUrl],
    ['Titre', p.title], ['Longueur du titre', p.titleLength],
    ['Meta description', p.metaDescription], ['Longueur meta description', p.metaDescriptionLength],
    ['H1', (p.h1 || []).join(' | ')], ['H2', (p.h2 || []).slice(0, 15).join(' | ')],
    ['Canonical', p.canonical], ['Meta robots', p.metaRobots], ['X-Robots-Tag', p.xRobotsTag],
    ['Lang', p.lang], ['Viewport', p.viewport],
    ['Mots', p.wordCount], ['Ratio texte/HTML', p.textRatio != null ? p.textRatio + ' %' : ''],
    ['Profondeur', p.depth], ['Liens entrants (pages uniques)', p.uniqueInlinks], ['Liens sortants internes', p.internalOutlinks], ['Liens sortants externes', p.externalOutlinks],
    ['Images / sans alt', p.imagesCount != null ? `${p.imagesCount} / ${p.imagesMissingAlt}` : ''],
    ['Hreflang', (p.hreflang || []).map((h) => `${h.lang}: ${h.href}`).join(' | ')],
    ['Données structurées', (p.schemaTypes || []).join(', ')],
    ['Open Graph', p.og ? [p.og.title && 'og:title', p.og.description && 'og:description', p.og.image && 'og:image', p.og.twitterCard && 'twitter:card'].filter(Boolean).join(', ') : ''],
    ['Dans le sitemap', p.inSitemap ? 'Oui' : 'Non'],
    ['Temps de réponse', p.responseTime != null ? p.responseTime + ' ms' : ''], ['Poids', fmtKb(p.size)],
    ['Last-Modified', p.lastModified], ['Découverte via', p.via], ['Erreur', p.error],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return `<div class="kv">${rows.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div>`;
}

function serpPreview(p) {
  const t = T();
  const title = p.title || '(titre manquant — Google en générera un)';
  const desc = p.metaDescription || '(meta description manquante — Google extraira un passage de la page)';
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const u = new URL(p.url);
  return `<div class="serp">
    <div class="s-url">${esc(u.hostname)} ${esc(u.pathname.split('/').filter(Boolean).join(' › ') ? '› ' + u.pathname.split('/').filter(Boolean).join(' › ') : '')}</div>
    <div class="s-title">${esc(cut(title, t.titleMax + 2))}</div>
    <div class="s-desc">${esc(cut(desc, t.descMax + 3))}</div></div>
    <p class="muted">Titre : ${p.titleLength || 0} car. (idéal ${t.titleMin}–${t.titleMax}) · Description : ${p.metaDescriptionLength || 0} car. (idéal ${t.descMin}–${t.descMax}). Approximation : Google tronque en pixels, pas en caractères.</p>`;
}

/* ---------- Export ---------- */
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportCsv(tab, rows, fname) {
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join(' | ') : v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [tab.cols.map((c) => cell(c.l)).join(';'), ...rows.map((r) => tab.cols.map((c) => cell(cellValue(c, r))).join(';'))].join('\r\n');
  const host = state.R ? new URL(state.R.meta.startUrl).hostname : 'crawl';
  const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  download(`${host}_${slug(tab.label)}${fname ? '_' + slug(fname) : ''}.csv`, csv, 'text/csv;charset=utf-8');
}

$('#exportJsonBtn').addEventListener('click', () => {
  if (!state.R) return;
  download(`${new URL(state.R.meta.startUrl).hostname}_${state.R.meta.finishedAt.slice(0, 10)}.json`, JSON.stringify(state.R), 'application/json');
});

/* ---------- Chargement d'un résultat ---------- */
function loadResult(R) {
  if (!R || !R.pages || !R.summary) throw new Error('Fichier de crawl invalide');
  state.R = R;
  state.graph = null;
  state.selected = null;
  state.issue = null;
  state.tab = 'dashboard';
  state.page = 0;
  $('#exportJsonBtn').disabled = false;
  $('#urlInput').value = R.meta.startUrl;
  renderTabs();
  render();
  renderDetail();
}

$('#importInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    loadResult(JSON.parse(await f.text()));
  } catch (err) {
    alert('Impossible de lire ce fichier : ' + err.message);
  }
  e.target.value = '';
});

/* ---------- Historique ---------- */
$('#historyBtn').addEventListener('click', async () => {
  const dlg = $('#historyDialog');
  const list = $('#historyList');
  list.innerHTML = '<p class="muted">Chargement…</p>';
  dlg.showModal();
  const items = await fetch('/api/crawls').then((r) => r.json()).catch(() => []);
  list.innerHTML = items.length ? items.map((i) => `<div class="hist"><span class="name" title="${esc(i.file)}">${esc(i.file)}</span><span class="muted">${fmtKb(i.size)}</span><button class="btn small" data-open="${esc(i.file)}">Ouvrir</button><button class="btn small" data-del="${esc(i.file)}">Supprimer</button></div>`).join('') : '<p class="muted">Aucun crawl enregistré pour l’instant.</p>';
  list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
    b.textContent = '…';
    const R = await fetch('/api/crawls/' + encodeURIComponent(b.dataset.open)).then((r) => r.json());
    dlg.close();
    loadResult(R);
  }));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ' + b.dataset.del + ' ?')) return;
    await fetch('/api/crawls/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
    b.closest('.hist').remove();
  }));
});

/* ---------- Options & lancement ---------- */
const OPT_KEY = 'arachnide-options';
const optionsPanel = $('#optionsPanel');
function readOptions() {
  const o = {};
  optionsPanel.querySelectorAll('input, select').forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}
try {
  const saved = JSON.parse(localStorage.getItem(OPT_KEY) || 'null');
  if (saved) optionsPanel.querySelectorAll('input, select').forEach((el) => {
    if (!(el.name in saved)) return;
    if (el.type === 'checkbox') el.checked = !!saved[el.name];
    else el.value = saved[el.name];
  });
} catch { /* stockage indisponible */ }

$('#optionsBtn').addEventListener('click', () => {
  optionsPanel.hidden = !optionsPanel.hidden;
  $('#optionsBtn').setAttribute('aria-expanded', String(!optionsPanel.hidden));
});

$('#crawlForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#urlInput').value.trim();
  if (!url) return;
  const options = readOptions();
  try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch { /* ignore */ }
  const res = await fetch('/api/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, options }) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Erreur au lancement du crawl');
  optionsPanel.hidden = true;
});

$('#stopBtn').addEventListener('click', () => fetch('/api/stop', { method: 'POST' }));

function setRunning(running) {
  state.running = running;
  $('#startBtn').hidden = running;
  $('#stopBtn').hidden = !running;
  $('#urlInput').disabled = running;
  $('#progress').hidden = !running;
}

const PHASES = { start: 'Démarrage', robots: 'Lecture du robots.txt', sitemaps: 'Lecture des sitemaps', crawl: 'Crawl', externes: 'Vérification des liens externes', images: 'Vérification des images', analyse: 'Analyse', done: 'Terminé' };
function showProgress(p) {
  if (!p) return;
  const pct = Math.min(100, (p.crawled / Math.max(1, Math.min(p.maxPages, p.discovered || 1))) * 100);
  $('#progressBar').style.width = (p.phase === 'crawl' ? pct : p.phase === 'done' ? 100 : pct) + '%';
  $('#progressText').textContent = `${PHASES[p.phase] || p.phase} · ${fmtN(p.crawled)} URLs crawlées · ${fmtN(p.queued)} en attente · ${fmtN(p.discovered)} découvertes (max ${fmtN(p.maxPages)}) · ${Math.round(p.elapsed / 1000)} s${p.stopped ? ' · arrêt en cours…' : ''}`;
}

/* ---------- Flux temps réel ---------- */
const throttledRender = debounce(() => {
  renderTabs();
  if (!state.R && state.tab === 'internal') render();
}, 300);

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('hello', (e) => {
    const d = JSON.parse(e.data);
    setRunning(d.running);
    showProgress(d.progress);
  });
  es.addEventListener('reset', () => {
    state.R = null;
    state.graph = null;
    state.live = [];
    state.selected = null;
    state.tab = 'internal';
    $('#exportJsonBtn').disabled = true;
    setRunning(true);
    renderTabs();
    render();
    renderDetail();
  });
  es.addEventListener('status', (e) => { $('#progressText').textContent = JSON.parse(e.data).message + '…'; });
  es.addEventListener('progress', (e) => showProgress(JSON.parse(e.data)));
  es.addEventListener('pages', (e) => {
    state.live.push(...JSON.parse(e.data));
    throttledRender();
  });
  es.addEventListener('done', async () => {
    setRunning(false);
    const R = await fetch('/api/result').then((r) => r.json());
    loadResult(R);
  });
  es.addEventListener('failed', (e) => {
    setRunning(false);
    alert('Le crawl a échoué : ' + JSON.parse(e.data).message);
  });
  es.onerror = () => { /* EventSource se reconnecte automatiquement */ };
}

/* ---------- Thème ---------- */
const THEME_KEY = 'arachnide-theme';
try {
  const t = localStorage.getItem(THEME_KEY);
  if (t) document.documentElement.dataset.theme = t;
} catch { /* ignore */ }
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
});

/* ---------- Démarrage ---------- */
(async function init() {
  renderTabs();
  render();
  connect();
  try {
    const s = await fetch('/api/state').then((r) => r.json());
    if (s.hasResult && !s.running) loadResult(await fetch('/api/result').then((r) => r.json()));
  } catch { /* serveur indisponible */ }
})();
