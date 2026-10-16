// Cartographie : gabarits HTML (barre d'outils, inspecteur, info-bulle, filtres, liste). Tout texte issu du crawl
// (titres, URL) passe par esc() : il est affiché comme du texte, jamais interprété comme du HTML.
import { MODES, COLORS, SIZES, activeFilters, compilePatterns } from './map-view.js';
import { SEV_COLORS } from './viz.js';

const SEV_ICON = { error: 'error', warning: 'alert', notice: 'info' };
const pathOf = (url) => {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname + u.search) || '/';
  } catch {
    return url;
  }
};

export function headHtml(stats, X, variant = 'viz') {
  const { t, esc } = X;
  const k = variant === 'graph' ? 'graph' : 'map';
  return `<header class="map-head"><div><h1>${esc(t(k + '.title'))}</h1><p>${esc(t(k + '.subtitle'))}</p></div>
    <p class="map-stats">${stats.map(esc).join(' <span class="sep">·</span> ')}</p></header>`;
}

export function toolbarHtml(o, filterCount, X) {
  const { t, esc, icon } = X;
  const seg = (name, values, labelKey) => `<div class="seg map-seg" role="group" aria-label="${esc(t(labelKey))}">${values.map((v) => `<button data-${name}="${v}" class="${o[name] === v ? 'on' : ''}" aria-pressed="${o[name] === v}">${esc(t(`map.${name}.${v}`))}</button>`).join('')}</div>`;
  const sel = (id, label, values, cur, key) => `<label class="map-select"><span>${esc(label)}</span><select id="${id}">${values.map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(t(key + v))}</option>`).join('')}</select></label>`;
  return `<div class="map-toolbar" role="toolbar" aria-label="${esc(t('map.toolbar'))}">
    ${seg('mode', MODES, 'map.modeLabel')}
    ${o.variant === 'graph' ? seg('dim', ['2d', '3d'], 'map.dimLabel') : ''}
    <div class="map-search" role="search">
      <label class="searchbox">${icon('search')}<input id="mapSearch" type="search" autocomplete="off" placeholder="${esc(t('map.search'))}" aria-label="${esc(t('map.search'))}" aria-controls="mapResults" aria-expanded="false"></label>
      <ul id="mapResults" class="map-results" role="listbox" hidden></ul>
    </div>
    ${sel('mapColor', t('map.colorLabel'), COLORS, o.colorBy, 'map.color.')}
    ${sel('mapSize', t('map.sizeLabel'), SIZES, o.sizeBy, 'map.size.')}
    <button class="btn ghost${filterCount ? ' on' : ''}" id="mapFiltersBtn" aria-expanded="false" aria-controls="mapFilters">${icon('list')} ${esc(t('map.filters'))}${filterCount ? ` <span class="n">${filterCount}</span>` : ''}</button>
    <details class="menu" id="mapExport"><summary class="btn ghost">${icon('download')} ${esc(t('nav.export'))}</summary>
      <div class="menu-list"><button class="menu-item" data-exp="png">${icon('download')} PNG</button><button class="menu-item" data-exp="pdf">${icon('report')} PDF</button><button class="menu-item" data-exp="csv">${icon('list')} ${esc(t('map.exportCsv'))}</button></div></details>
    <button class="btn ghost icon${o.list ? ' on' : ''}" id="mapListBtn" aria-pressed="${!!o.list}" title="${esc(t('map.listView'))}" aria-label="${esc(t('map.listView'))}">${icon('report')}</button>
    <button class="btn ghost icon" id="mapFull" title="${esc(t('map.fullscreen'))}" aria-label="${esc(t('map.fullscreen'))}">${icon('expand')}</button>
  </div>`;
}

export function filtersHtml(f, mode, folders, X) {
  const { t, esc } = X;
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  return `<div class="map-filters" id="mapFilters" role="dialog" aria-label="${esc(t('map.filters'))}">
    <div class="mf-grid">
      <label>${esc(t('map.f.issues'))}<select data-f="issues">${opt('', t('map.f.all'), f.issues)}${opt('any', t('map.f.anyIssue'), f.issues)}${['error', 'warning', 'notice'].map((s) => opt(s, t('map.sev.' + s), f.issues)).join('')}</select></label>
      <label>${esc(t('map.f.depthMin'))}<select data-f="depthMin">${opt('', t('map.f.all'), f.depthMin ?? '')}${[2, 3, 4, 5, 6].map((d) => opt(d, t('map.f.depthGte', { n: d }), f.depthMin ?? '')).join('')}</select></label>
      <label>${esc(t('map.f.dir'))}<select data-f="dir">${opt('', t('map.f.all'), f.dir)}${folders.map(([d, n]) => opt(d, `${d} (${n})`, f.dir)).join('')}</select></label>
      <label>${esc(t('map.f.status'))}<select data-f="status">${opt('', t('map.f.all'), f.status)}${[['ok', '2xx'], ['redirect', '3xx'], ['client', '4xx'], ['server', '5xx'], ['none', t('map.noResponse')]].map(([v, l]) => opt(v, l, f.status)).join('')}</select></label>
      <label>${esc(t('map.f.index'))}<select data-f="index">${opt('', t('map.f.all'), f.index)}${opt('yes', t('idx.indexable'), f.index)}${opt('no', t('idx.nonIndexable'), f.index)}</select></label>
      <label class="mf-check"><input type="checkbox" data-f="lowInlinks" ${f.lowInlinks ? 'checked' : ''}> ${esc(t('map.f.lowInlinks'))}
        <select data-f="inlinksMax" aria-label="${esc(t('map.f.threshold'))}">${[0, 1, 2, 3, 5].map((n) => opt(n, t('map.f.inlinksLte', { n }), f.inlinksMax)).join('')}</select></label>
      <label>${esc(t('map.f.lsMin'))}<input type="number" min="0" max="100" data-f="lsMin" value="${f.lsMin ?? ''}" placeholder="0"></label>
      <label>${esc(t('map.f.lsMax'))}<input type="number" min="0" max="100" data-f="lsMax" value="${f.lsMax ?? ''}" placeholder="100"></label>
    </div>
    <div class="mf-urls">
      <label>${esc(t('map.f.urlInc'))}<textarea data-f="urlInc" rows="2" spellcheck="false" placeholder="/en/\n/blog/(.*)">${esc(f.urlInc || '')}</textarea></label>
      <label>${esc(t('map.f.urlExc'))}<textarea data-f="urlExc" rows="2" spellcheck="false" placeholder="/en/(.*)\n?page=">${esc(f.urlExc || '')}</textarea></label>
      <p class="muted small">${esc(t('map.f.urlHelp'))}</p>
      ${[...compilePatterns(f.urlInc).bad, ...compilePatterns(f.urlExc).bad].map((b) => `<p class="mf-bad">${esc(t('map.f.badPattern', { p: b }))}</p>`).join('')}
    </div>
    <p class="mf-note muted">${esc(t('map.f.note'))}</p>
    <div class="mf-foot">
      <div class="seg" role="group" aria-label="${esc(t('map.f.behaviour'))}"><button data-fmode="highlight" class="${f._mode !== 'isolate' ? 'on' : ''}">${esc(t('map.f.highlight'))}</button><button data-fmode="isolate" class="${f._mode === 'isolate' ? 'on' : ''}">${esc(t('map.f.isolate'))}</button></div>
      <button class="link" id="mapFiltersReset">${esc(t('iv.reset'))}</button>
    </div>
  </div>`;
}

export function chipsHtml(f, matched, X) {
  const { t, esc, icon, num } = X;
  const act = activeFilters(f).filter(([k]) => k !== '_mode');
  if (!act.length) return '';
  const label = ([k, v]) => {
    if (k === 'issues') return v === 'any' ? t('map.f.anyIssue') : t('map.sev.' + v);
    if (k === 'depthMin') return t('map.f.depthGte', { n: v });
    if (k === 'lowInlinks') return t('map.f.inlinksLte', { n: f.inlinksMax });
    if (k === 'index') return t(v === 'yes' ? 'idx.indexable' : 'idx.nonIndexable');
    if (k === 'lsMin') return `Link Score ≥ ${v}`;
    if (k === 'lsMax') return `Link Score ≤ ${v}`;
    if (k === 'dir') return t('map.f.inFolder', { d: v });
    if (k === 'urlInc') return t('map.f.chipInc', { p: v.split('\n').filter((x) => x.trim()).join(', ') });
    if (k === 'urlExc') return t('map.f.chipExc', { p: v.split('\n').filter((x) => x.trim()).join(', ') });
    return String(v);
  };
  return `<div class="map-chips">${act.map((a) => `<span class="map-chip">${esc(label(a))}<button data-unf="${a[0]}" aria-label="${esc(t('ui.close'))}">${icon('x')}</button></span>`).join('')}
    <span class="muted">${esc(t('map.matched', { n: matched }))} · ${esc(t(f._mode === 'isolate' ? 'map.f.isolate' : 'map.f.highlight'))}</span></div>`;
}

export function tipHtml(n, M, X) {
  const { t, esc, num } = X;
  if (!n) return '';
  if (!n.page) return `<b>${esc(n.label)}</b><span>${esc(t('map.pagesN', { n: n.count || 0 }))}${n.kind === 'folder' ? ' · ' + esc(t('map.virtualFolder')) : ''}</span>`;
  const p = n.page;
  const iss = M.issues.get(p.url) || [];
  return `<b>${esc(pathOf(p.url))}</b>${p.title ? `<span class="tt">${esc(p.title)}</span>` : ''}
    <span>${esc(p.status || '—')} · ${esc(t('map.depthShort', { n: p.depth ?? '?' }))} · Link Score ${p.linkScore ?? '—'}${iss.length ? ` · <i style="color:${SEV_COLORS[iss[0].severity]}">${esc(t('map.issuesN', { n: iss.length }))}</i>` : ''}</span>${n.group ? `<span>${esc(t('map.groupHidden', { n: n.group }))}</span>` : ''}`;
}

export function inspectorHtml(ctx, X) {
  const { t, esc, icon, num } = X;
  const { M, node, tab, mode, crawlPath, inferred, isolate } = ctx;
  if (!node) {
    return `<div class="mi-empty">${icon('target')}<h2>${esc(t('map.inspectTitle'))}</h2><p class="muted">${esc(t('map.inspectHint'))}</p>
      <ul class="mi-tips"><li>${esc(t('map.tip.click'))}</li><li>${esc(t('map.tip.search'))}</li><li>${esc(t('map.tip.filters'))}</li></ul>
      ${isolate ? `<button class="btn" id="mapGlobal">${icon('chevronLeft')} ${esc(t('map.backGlobal'))}</button>` : ''}</div>`;
  }
  // Groupe replié ou dossier virtuel sans page.
  if (!node.page) {
    return `<p class="eyebrow">${esc(t(node.kind === 'unreached' ? 'map.unreached' : node.group ? 'map.group' : 'map.virtualFolder'))}</p>
      <h2 class="mi-title">${esc(node.label)}</h2>
      <div class="mi-tiles"><div class="mi-tile">${icon('file')}<div><span>${esc(t('map.pagesIn'))}</span><b>${num(node.count || 0)}</b></div></div>
      <div class="mi-tile">${icon(node.sev ? SEV_ICON[node.sev] : 'check')}<div><span>${esc(t('map.worstIssue'))}</span><b class="sev-${node.sev || 'none'}">${esc(node.sev ? t('map.sev.' + node.sev) : t('map.noIssue'))}</b></div></div></div>
      ${node.kind === 'unreached' ? `<p class="mi-note">${esc(t('map.unreachedHint'))}</p>` : node.kind === 'folder' ? `<p class="mi-note">${esc(t('map.virtualHint'))}</p>` : ''}
      <div class="mi-actions">${node.group ? `<button class="btn" id="mapExpand">${icon('chevronRight')} ${esc(node.kind === 'more' ? t('map.showAll') : t('map.expand'))}</button>` : ''}${mode !== 'links' && node.kind !== 'more' ? `<button class="btn" id="mapIsoBranch">${icon('graph')} ${esc(t('map.isolateBranch'))}</button>` : ''}</div>
      <button class="link mi-global" id="mapGlobal">${icon('chevronLeft')} ${esc(t('map.backGlobal'))}</button>`;
  }
  const p = node.page;
  const issues = M.issues.get(p.url) || [];
  const inN = M.inl.get(p.url)?.size || 0;
  const outN = M.out.get(p.url)?.size || 0;
  const status = p.status ? `<span class="chip ${p.status >= 400 ? 'error' : p.status >= 300 ? 'warning' : 'ok'}">${esc(p.status)} ${esc(p.statusText || '')}</span>` : `<span class="chip muted">${esc(t('map.noResponse'))}</span>`;
  const idx = p.indexable == null ? '' : `<span class="chip ${p.indexable ? 'ok' : 'muted'}">${esc(t(p.indexable ? 'idx.indexable' : 'idx.nonIndexable'))}</span>`;
  const tabs = ['page', 'links', 'issues'].map((k) => `<button role="tab" data-mtab="${k}" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}">${esc(t('map.tab.' + k))}${k === 'issues' && issues.length ? ` <span class="n sev-${issues[0].severity}">${issues.length}</span>` : ''}</button>`).join('');
  const linkList = (set, dir) => {
    const list = [...set].map((u) => M.byUrl.get(u)).filter(Boolean).sort((a, b) => (b.linkScore || 0) - (a.linkScore || 0));
    return `<h3>${esc(t(dir === 'in' ? 'map.inlinksTitle' : 'map.outlinksTitle', { n: list.length }))}</h3>
      ${list.length ? `<ul class="mi-links">${list.slice(0, 15).map((x) => `<li><button class="link" data-goto="${esc(x.url)}">${esc(pathOf(x.url))}</button><span class="muted">LS ${x.linkScore ?? '—'}</span></li>`).join('')}</ul>${list.length > 15 ? `<p class="muted small">${esc(t('map.andMore', { n: list.length - 15 }))}</p>` : ''}` : `<p class="muted small">${esc(t(dir === 'in' ? 'map.noInlinks' : 'map.noOutlinks'))}</p>`}`;
  };
  let body = '';
  if (tab === 'links') body = `<div class="mi-linklists">${linkList(M.inl.get(p.url) || new Set(), 'in')}${linkList(M.out.get(p.url) || new Set(), 'out')}</div>`;
  else if (tab === 'issues')
    body = issues.length
      ? `<ul class="mi-issues">${issues.map((i) => `<li><span class="sev-badge ${i.severity}">${icon(SEV_ICON[i.severity])}${esc(t('iv.sum.' + i.severity, { n: 1 }))}</span><b>${esc(t('issue.' + i.id + '.label', i.params))}</b><p>${esc(t('issue.' + i.id + '.fix', i.params))}</p><button class="link accent" data-plan="${esc(i.id)}">${esc(t('map.openInPlan'))} ${icon('chevronRight')}</button></li>`).join('')}</ul>`
      : `<p class="mi-ok">${icon('check')} ${esc(t('map.noIssuePage'))}</p>`;
  else {
    const first = issues[0];
    body = `<div class="mi-tiles">
        <div class="mi-tile">${icon('file')}<div><span>${esc(t('map.depth'))}</span><b>${p.depth == null ? esc(t('map.unknown')) : esc(t('map.clicks', { n: p.depth }))}</b></div></div>
        <div class="mi-tile">${icon('graph')}<div><span>Link Score</span><b>${p.linkScore ?? '—'}</b><small>${esc(t('map.lsHint'))}</small></div></div>
        <div class="mi-tile">${icon('report')}<div><span>${esc(t('map.sources'))}</span><b>${num(inN)}</b></div></div>
        <div class="mi-tile">${icon('link')}<div><span>${esc(t('map.outlinks'))}</span><b>${num(outN)}</b></div></div>
      </div>
      <h3>${esc(t('map.discoveryPath'))}</h3>
      ${crawlPath.length ? `<ol class="mi-path">${crawlPath.map((s, i) => `<li class="${i === crawlPath.length - 1 ? 'cur' : ''}"><button class="link" data-goto="${esc(s.url || '')}" ${s.url ? '' : 'disabled'}>${esc(s.label)}</button>${s.viaRedirect ? ` <small class="muted">${esc(t('map.viaRedirect'))}</small>` : ''}</li>`).join('')}</ol>${inferred ? `<p class="muted small">${esc(t('map.pathInferred'))}</p>` : ''}` : `<p class="muted small">${esc(t('map.noPath'))}</p>`}
      ${first ? `<div class="mi-issue sev-${first.severity}">${icon(SEV_ICON[first.severity])}<div><span class="mi-k">${esc(t(first.severity === 'notice' ? 'map.toReview' : 'map.toImprove'))}</span><b>${esc(t('issue.' + first.id + '.label', first.params))}</b><p>${esc(t('issue.' + first.id + '.fix', first.params))}</p><small class="muted">${esc(t('iv.impact', { lvl: t('lvl.' + first.impact).toLocaleLowerCase(t.locale) }))} · ${esc(t('iv.effort', { lvl: t('lvl.' + first.effort).toLocaleLowerCase(t.locale) }))}</small></div></div>` : `<p class="mi-ok">${icon('check')} ${esc(t('map.noIssuePage'))}</p>`}`;
  }
  return `<p class="eyebrow">${esc(t('map.selectedPage'))}</p>
    <h2 class="mi-title">${esc(p.title || pathOf(p.url))}</h2>
    <div class="mi-url"><span title="${esc(p.url)}">${esc(pathOf(p.url))}</span><button class="btn icon ghost" id="mapCopy" aria-label="${esc(t('map.copyUrl'))}" title="${esc(t('map.copyUrl'))}">${icon('copy')}</button><a class="btn icon ghost" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="${esc(t('map.openUrl'))}" title="${esc(t('map.openUrl'))}">${icon('external')}</a></div>
    <div class="mi-chips">${status}${idx}</div>
    <div class="mi-tabs" role="tablist">${tabs}</div>
    <div class="mi-body" role="tabpanel">${body}</div>
    <div class="mi-actions">
      ${mode === 'links' ? `<button class="btn" id="mapIsoNeigh">${icon('graph')} ${esc(t('map.isolateNeighbors'))}</button><button class="btn" id="mapToTree">${icon('sitemap')} ${esc(t('map.seeInTree'))}</button>` : `<button class="btn" id="mapIsoBranch">${icon('graph')} ${esc(t('map.isolateBranch'))}</button><button class="btn" id="mapToLinks">${icon('link')} ${esc(t('map.seeLinks'))}</button>`}
    </div>
    ${issues.length ? `<button class="btn primary cta mi-plan" data-plan="${esc(issues[0].id)}">${esc(t('map.openPlan'))} ${icon('chevronRight')}</button>` : ''}
    <button class="link mi-global" id="mapGlobal">${icon('chevronLeft')} ${esc(t('map.backGlobal'))}</button>`;
}

export function listHtml(rows, page, M, X) {
  const { t, esc, icon, num } = X;
  const size = 50;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const pg = Math.min(page, pages - 1);
  return `<div class="map-list"><table class="iv-table map-table"><thead><tr><th>${esc(t('col.url'))}</th><th class="num">${esc(t('map.depth'))}</th><th class="num">Link Score</th><th class="num">${esc(t('map.sources'))}</th><th>${esc(t('map.tab.issues'))}</th></tr></thead>
    <tbody>${rows.slice(pg * size, (pg + 1) * size).map((p) => { const w = M.worst(p.url); return `<tr class="iv-row" tabindex="0" data-goto="${esc(p.url)}"><td class="iv-name"><b>${esc(pathOf(p.url))}</b><small>${esc(p.title || '')}</small></td><td class="num">${p.depth ?? '—'}</td><td class="num">${p.linkScore ?? '—'}</td><td class="num">${num(M.inl.get(p.url)?.size || 0)}</td><td>${w ? `<span class="sev-badge ${w}">${icon(SEV_ICON[w])}${esc(t('map.issuesN', { n: (M.issues.get(p.url) || []).length }))}</span>` : `<span class="muted">—</span>`}</td></tr>`; }).join('')}</tbody></table>
    <div class="iv-foot"><span class="muted">${esc(t('map.listCount', { n: rows.length }))}</span>${pages > 1 ? `<nav class="iv-pager"><button class="pg" data-lpg="${pg - 1}" ${pg === 0 ? 'disabled' : ''} aria-label="${esc(t('iv.prev'))}">${icon('chevronLeft')}</button><span class="muted">${pg + 1} / ${pages}</span><button class="pg" data-lpg="${pg + 1}" ${pg >= pages - 1 ? 'disabled' : ''} aria-label="${esc(t('iv.next'))}">${icon('chevronRight')}</button></nav>` : ''}</div></div>`;
}

export const dirsOf = (M) => {
  const c = new Map();
  for (const p of M.pages) c.set(M.dirOf(p.url), (c.get(M.dirOf(p.url)) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
};
