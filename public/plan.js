// Page « Plan d'action » : synthèse, feuille de route priorisée et fiche d'exécution, avec un suivi par action.
// Le classement est celui du moteur (src/analyze.mjs : gravité, puis impact × portée ÷ effort), le même que la page
// Problèmes SEO. Le suivi (statut, note) est enregistré localement, par site, avec l'identifiant stable du problème.
import { filterSort, uniqueUrls, issueLabel, sevLabel, sevIcon, fixSteps, SORTS, SORT_COL } from './issues.js';

// Statuts exclusifs d'une action. « Résolu » n'est jamais choisi à la main : seul un nouveau crawl qui ne détecte
// plus le problème le confirme (voir reconcile).
export const STATUSES = ['todo', 'review', 'doing', 'validate'];
export const PAGE_SIZE = 12;
const LVL_CLS = { low: 'lo', medium: 'mid', high: 'hi' };
const EFFORTS = ['low', 'medium', 'high'];

// Gain rapide : correction peu coûteuse qui compte vraiment (effort faible, impact moyen ou élevé, pas une simple
// information). C'est une caractéristique de l'action, indépendante de son statut.
export const isQuickWin = (is) => is.effort === 'low' && is.impact !== 'low' && is.severity !== 'notice';

// Statut par défaut : une information est à vérifier (elle peut être volontaire), le reste est à faire.
export const defaultStatus = (is) => (is.severity === 'notice' ? 'review' : 'todo');

export const storeKey = (R) => 'plan.' + (R.meta.origin || R.meta.startUrl || 'site');

// Applique le suivi enregistré au crawl courant :
// - une action marquée terminée (ou en cours) qui n'apparaît plus dans un crawl plus récent devient « résolue » ;
// - une action résolue qui réapparaît repart de zéro ;
// - une action « à valider » encore détectée par un crawl postérieur est signalée.
export function reconcile(saved, R) {
  const items = { ...(saved?.items || {}) };
  const present = new Set(R.issues.map((i) => i.id));
  const crawlAt = R.meta.finishedAt || '';
  const status = {};
  let resolved = 0;
  for (const [id, it] of Object.entries(items)) {
    if (present.has(id)) continue;
    if ((it.status === 'validate' || it.status === 'doing') && it.at && it.at < crawlAt) items[id] = { ...it, status: 'resolved', resolvedAt: crawlAt };
    if (items[id].status === 'resolved') resolved++;
  }
  for (const is of R.issues) {
    const it = items[is.id];
    const st = it && STATUSES.includes(it.status) ? it.status : defaultStatus(is);
    status[is.id] = { status: st, note: it?.note || '', stillDetected: st === 'validate' && !!it?.at && it.at < crawlAt };
  }
  return { items, status, resolved };
}

// Titre d'action (verbe) et sous-titre : le problème, ou sa catégorie quand le titre est déjà le problème.
export function actionTitles(is, t) {
  const k = 'act.' + is.id;
  const act = t(k, is.params);
  return act !== k ? { title: act, sub: issueLabel(is, t) } : { title: issueLabel(is, t), sub: t('cat.' + is.category) };
}

// Classement recommandé complet (le rang affiché ne dépend ni du filtre ni du tri choisi).
export const ranked = (R, t) => filterSort(R.issues, { sort: 'priority' }, t);

export function summary(R, track, t) {
  const order = ranked(R, t);
  const rank = new Map(order.map((is, i) => [is.id, i + 1]));
  const remaining = order.filter((is) => track.status[is.id].status !== 'validate');
  const bySev = { error: 0, warning: 0, notice: 0 };
  const byEffort = { low: 0, medium: 0, high: 0 };
  for (const is of remaining) {
    bySev[is.severity]++;
    byEffort[is.effort]++;
  }
  const quick = order.filter(isQuickWin);
  const st = (is) => track.status[is.id].status;
  // « Commencez ici » : la première action à faire ou en cours ; à défaut, la première à vérifier.
  const start = remaining.find((is) => st(is) === 'todo' || st(is) === 'doing') || remaining.find((is) => st(is) === 'review') || null;
  const counts = { all: order.length, quick: quick.length };
  for (const s of STATUSES) counts[s] = order.filter((is) => st(is) === s).length;
  return { order, rank, remaining, bySev, byEffort, quick, start, counts };
}

// Liste affichée : recherche et tri communs à la page Problèmes, puis filtre de statut ou de gain rapide.
export function visible(R, track, { filter = 'all', q = '', sort = 'priority' }, t) {
  return filterSort(R.issues, { q, sort }, t).filter((is) => {
    if (filter === 'all') return true;
    if (filter === 'quick') return isQuickWin(is);
    return track.status[is.id].status === filter;
  });
}

// « Pourquoi commencer ici ? » : uniquement des faits du crawl (rang, gravité, portée, impact, effort).
export function whyText(is, rank, total, t) {
  const lvl = (v) => t('lvl.' + v).toLocaleLowerCase(t.locale);
  const n = uniqueUrls(is);
  const parts = [t('pl.why.rank', { n: rank, total }), t('pl.why.sev.' + is.severity)];
  parts.push(n == null ? t('pl.why.site', { impact: lvl(is.impact), effort: lvl(is.effort) }) : t('pl.why.scope', { n, impact: lvl(is.impact), effort: lvl(is.effort) }));
  if (isQuickWin(is)) parts.push(t('pl.why.quick'));
  return parts.join(' ');
}

// Critère de fin : vérifiable par le crawler pour une correction, une décision documentée pour une information.
export const doneText = (is, t) => t(is.severity === 'notice' ? 'pl.done.review' : 'pl.done.fix');

// ---------- Gabarits ----------
const effortBadge = (v, t, esc) => `<span class="eff-badge ${LVL_CLS[v]}">${esc(t('lvl.' + v))}</span>`;
const impactCell = (v, t, esc) => `<span class="imp-cell ${LVL_CLS[v]}"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>${esc(t('lvl.' + v))}</span>`;
const sevBadge = (s, t, esc, icon) => `<span class="sev-badge ${s}">${icon(sevIcon(s))}${esc(sevLabel(s, t))}</span>`;
const statusSelect = (id, st, t, esc, extra = '') =>
  `<select class="st-select st-${st}" data-status="${esc(id)}" ${extra}>${STATUSES.map((s) => `<option value="${s}" ${s === st ? 'selected' : ''}>${esc(t('pl.status.' + s))}</option>`).join('')}</select>`;

export function cardsHtml(S, X) {
  const { t, esc, icon, num } = X;
  const rem = S.remaining.length;
  const sevs = ['error', 'warning', 'notice'].filter((s) => S.bySev[s]);
  const maxEff = Math.max(1, ...EFFORTS.map((e) => S.byEffort[e]));
  const st = S.start;
  return `<div class="pl-cards">
    <div class="pl-card">
      <div class="pl-card-top"><span class="pl-ic">${icon('list')}</span><div><h3>${esc(t('pl.toTreat'))}</h3><b class="pl-big">${num(rem)}</b></div></div>
      <p class="pl-sub">${esc(sevs.map((s) => t('dash.sev.' + s, { n: S.bySev[s] })).join(' · ') || t('pl.nothingLeft'))}</p>
      ${rem ? `<span class="iv-bar" aria-hidden="true">${sevs.map((s) => `<i class="sv-${s}" style="flex:${S.bySev[s]}"></i>`).join('')}</span>` : ''}
    </div>
    <div class="pl-card">
      <div class="pl-card-top"><span class="pl-ic quick">${icon('bolt')}</span><div><h3>${esc(t('pl.quickWins'))}</h3><b class="pl-big">${num(S.quick.length)}</b><small class="muted">${esc(t('pl.quickRule'))}</small></div></div>
      ${S.quick.length ? `<ul class="pl-quick">${S.quick.slice(0, 2).map((is) => { const n = uniqueUrls(is); return `<li><button data-select="${esc(is.id)}">${icon('wand')}<span>${esc(actionTitles(is, t).title)}</span><b>${n == null ? esc(t('dash.siteWide')) : esc(t('pl.urls', { n }))}</b>${icon('chevronRight')}</button></li>`; }).join('')}</ul>` : `<p class="pl-sub">${esc(t('pl.noQuick'))}</p>`}
    </div>
    <div class="pl-card">
      <div class="pl-card-top"><span class="pl-ic">${icon('graph')}</span><h3>${esc(t('pl.effortTitle'))}</h3></div>
      <div class="pl-effort">${EFFORTS.map((e) => `<div class="pl-eff-row ${LVL_CLS[e]}"><span>${esc(t('lvl.' + e))}</span><span class="pl-eff-track"><i style="width:${(S.byEffort[e] / maxEff) * 100}%"></i></span><b>${num(S.byEffort[e])}</b></div>`).join('')}</div>
    </div>
    <div class="pl-card start">
      <div class="pl-card-top"><span class="pl-ic start">${icon('target')}</span><h3>${esc(t('pl.startHere'))}</h3></div>
      ${
        st
          ? `<div class="pl-start"><span class="pl-rank">${String(S.rank.get(st.id)).padStart(2, '0')}</span><div><b>${esc(actionTitles(st, t).title)}</b><small>${esc(uniqueUrls(st) == null ? t('dash.siteWide') : t('pl.urls', { n: uniqueUrls(st) }))} · ${esc(t('iv.effort', { lvl: t('lvl.' + st.effort).toLocaleLowerCase(t.locale) }))}</small></div></div>
             <button class="btn pl-method" data-select="${esc(st.id)}" data-focus-detail>${esc(t('pl.seeMethod'))} ${icon('chevronRight')}</button>`
          : `<p class="pl-sub">${esc(t('pl.allDone'))}</p>`
      }
    </div>
  </div>`;
}

export function tableHtml(R, S, track, rows, st, X) {
  const { t, esc, icon, num } = X;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(st.page, pages - 1);
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sel = st.selected;
  const allOn = slice.length > 0 && slice.every((is) => sel.has(is.id));
  const th = (col, label, cls = '') => {
    const on = SORT_COL[st.sort] === col;
    return `<th class="${cls}" ${on ? `aria-sort="${st.sort === 'urls' ? 'descending' : 'ascending'}"` : ''}>${esc(label)}${on ? ` <span class="sort-ar" aria-hidden="true">${st.sort === 'urls' ? '↓' : '↑'}</span>` : ''}</th>`;
  };
  const chip = (key, label, n, ic) => `<button class="iv-tab${st.filter === key ? ' on' : ''}" data-plf="${key}" aria-pressed="${st.filter === key}">${icon(ic)}<span>${esc(label)}</span><span class="n">${num(n)}</span></button>`;
  const other = ['doing', 'validate'];
  const body = slice
    .map((is) => {
      const { title, sub } = actionTitles(is, t);
      const n = uniqueUrls(is);
      const s = track.status[is.id];
      return `<tr class="iv-row pl-row${st.issue === is.id ? ' sel' : ''}" data-row="${esc(is.id)}" tabindex="0" aria-selected="${st.issue === is.id}">
        <td class="pl-chk"><input type="checkbox" data-chk="${esc(is.id)}" ${sel.has(is.id) ? 'checked' : ''} aria-label="${esc(t('pl.selectRow', { action: title }))}"></td>
        <td class="pl-rk">${String(S.rank.get(is.id)).padStart(2, '0')}</td>
        <td class="iv-name"><b>${esc(title)}${isQuickWin(is) ? ` <span class="qw-mark" title="${esc(t('pl.quickWin'))}">${icon('bolt')}<span class="sr-only">${esc(t('pl.quickWin'))}</span></span>` : ''}</b><small>${esc(sub)}</small><span class="pl-mobile-meta">${esc(sevLabel(is.severity, t))} · ${n == null ? esc(t('dash.siteWide')) : esc(t('pl.urls', { n }))}</span></td>
        <td class="pl-sev">${sevBadge(is.severity, t, esc, icon)}</td>
        <td class="pl-imp">${impactCell(is.impact, t, esc)}</td>
        <td class="num pl-urls">${n == null ? `<span class="muted">${esc(t('dash.siteWide'))}</span>` : `<b>${num(n)}</b>`}</td>
        <td class="pl-eff">${effortBadge(is.effort, t, esc)}</td>
        <td class="pl-st">${statusSelect(is.id, s.status, t, esc, `aria-label="${esc(t('pl.statusOf', { action: title }))}"`)}</td>
        <td class="chev">${icon('chevronRight')}</td>
      </tr>`;
    })
    .join('');
  const pager =
    pages > 1
      ? `<nav class="iv-pager" aria-label="${esc(t('iv.pagination'))}"><button class="pg" data-plpg="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="${esc(t('iv.prev'))}">${icon('chevronLeft')}</button>${Array.from({ length: pages }, (_, i) => `<button class="pg${i === page ? ' on' : ''}" data-plpg="${i}" ${i === page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}<button class="pg" data-plpg="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="${esc(t('iv.next'))}">${icon('chevronRight')}</button></nav>`
      : '';
  const filtered = st.filter !== 'all' || st.q;
  return `<section class="iv-panel pl-list" aria-labelledby="plListTitle">
    <div class="pl-list-head">
      <h2 id="plListTitle">${esc(t('pl.roadmap'))} <span class="count-pill">${num(S.counts.all)}</span></h2>
      <div class="pl-sort"><label class="iv-sort">${icon('list')}<span class="sr-only">${esc(t('iv.sortLabel'))}</span><select id="plSort">${SORTS.map((s) => `<option value="${s}" ${st.sort === s ? 'selected' : ''}>${esc(t(s === 'priority' ? 'pl.sortPriority' : 'iv.sort.' + s))}</option>`).join('')}</select></label>
        <p class="iv-sort-hint">${icon('info')}<span>${esc(st.sort === 'priority' ? t('pl.sortHint') : t('pl.sortManual'))}</span>${st.sort === 'priority' ? '' : ` <button class="link accent" id="plSortReset">${esc(t('pl.sortBack'))}</button>`}</p></div>
    </div>
    <div class="iv-tabs pl-tabs" role="group" aria-label="${esc(t('pl.filterLabel'))}">
      ${chip('all', t('f.all'), S.counts.all, 'list')}${chip('quick', t('pl.quickWins'), S.counts.quick, 'bolt')}${chip('todo', t('pl.status.todo'), S.counts.todo, 'target')}${chip('review', t('pl.status.review'), S.counts.review, 'search')}
      <label class="pl-more${other.includes(st.filter) ? ' on' : ''}"><span class="sr-only">${esc(t('pl.otherStates'))}</span><select id="plOther">
        <option value="">${esc(t('pl.otherStates'))}</option>${other.map((s) => `<option value="${s}" ${st.filter === s ? 'selected' : ''}>${esc(t('pl.status.' + s))} (${num(S.counts[s])})</option>`).join('')}</select></label>
    </div>
    <label class="searchbox iv-search">${icon('search')}<input id="plSearch" type="search" placeholder="${esc(t('pl.search'))}" aria-label="${esc(t('pl.search'))}" value="${esc(st.q)}"></label>
    ${
      sel.size
        ? `<div class="pl-bulk" role="region" aria-label="${esc(t('pl.bulkLabel'))}"><b>${esc(t('pl.selected', { n: sel.size }))}</b>
        <button class="btn small" id="plBulkExport">${icon('download')} ${esc(t('pl.exportSelected'))}</button>
        <label class="pl-bulk-st"><span>${esc(t('pl.setStatus'))}</span><select id="plBulkStatus"><option value="">—</option>${STATUSES.map((s) => `<option value="${s}">${esc(t('pl.status.' + s))}</option>`).join('')}</select></label>
        <button class="link" id="plBulkClear">${esc(t('pl.clearSelection'))}</button></div>`
        : ''
    }
    ${
      rows.length
        ? `<div class="iv-table-wrap"><table class="iv-table pl-table"><thead><tr>
            <th class="pl-chk"><input type="checkbox" id="plAll" ${allOn ? 'checked' : ''} aria-label="${esc(t('pl.selectPage'))}"></th>
            <th class="pl-rk">#</th>${th('issue', t('pl.col.action'))}${th('level', t('pl.col.severity'), 'pl-sev')}<th class="pl-imp">${esc(t('pl.col.impact'))}</th>${th('urls', t('iv.col.urls'), 'num pl-urls')}${th('effort', t('iv.col.effort'), 'pl-eff')}<th class="pl-st">${esc(t('pl.col.status'))}</th><th class="chev"><span class="sr-only">${esc(t('iv.open'))}</span></th>
          </tr></thead><tbody>${body}</tbody></table></div>`
        : `<div class="empty small iv-empty">${icon('search')}<p>${esc(t('pl.noResults'))}</p><button class="btn small" id="plReset">${esc(t('iv.reset'))}</button></div>`
    }
    <div class="iv-foot"><span class="muted">${esc(filtered ? t('pl.shownFiltered', { n: rows.length, total: S.counts.all }) : t('pl.shown', { n: rows.length }))}${track.resolved ? ' · ' + esc(t('pl.resolved', { n: track.resolved })) : ''}</span>${pager}<span class="muted pl-overlap">${icon('info')} ${esc(t('pl.overlap'))}</span></div>
  </section>`;
}

export function detailHtml(R, S, track, is, X) {
  const { t, esc, icon, num } = X;
  if (!is) return `<section class="iv-panel pl-detail"><div class="empty small">${icon('check')}<p>${esc(t('pl.noSelection'))}</p></div></section>`;
  const { title } = actionTitles(is, t);
  const rank = S.rank.get(is.id);
  const n = uniqueUrls(is);
  const s = track.status[is.id];
  const note = 'inote.' + is.id;
  const primary = {
    todo: ['plStart', 'pl.start', 'play'],
    review: ['plStart', 'pl.startReview', 'play'],
    doing: ['plDone', 'pl.markDone', 'check'],
    validate: ['plRecrawl', 'pl.recrawl', 'history'],
  }[s.status];
  return `<section class="iv-panel pl-detail" aria-labelledby="plDetTitle" tabindex="-1">
    <button class="link pl-close" id="plClose" aria-label="${esc(t('pl.closeDetail'))}">${icon('chevronLeft')} ${esc(t('pl.backToList'))}</button>
    <p class="eyebrow">${esc(t('pl.actionN', { n: String(rank).padStart(2, '0') }))}</p>
    <h2 id="plDetTitle">${esc(title)}</h2>
    <div class="iv-chips">${sevBadge(is.severity, t, esc, icon)}${isQuickWin(is) ? `<span class="meta-chip qw">${icon('bolt')}${esc(t('pl.quickWin'))}</span>` : ''}</div>
    <div class="pl-stats">
      <div class="iv-stat">${icon('file')}<div><b${n == null ? ' class="site"' : ''}>${n == null ? esc(t('dash.siteWide')) : num(n)}</b><span>${esc(n == null ? t('iv.scopeSite') : t('iv.urlsUnit', { n }))}</span></div></div>
      <div class="pl-levels"><span>${impactCell(is.impact, t, esc)} <small class="muted">${esc(t('pl.col.impact'))}</small></span><span>${effortBadge(is.effort, t, esc)} <small class="muted">${esc(t('iv.col.effort'))}</small></span></div>
    </div>
    <div class="pl-status-row"><label for="plDetStatus">${esc(t('pl.col.status'))}</label>${statusSelect(is.id, s.status, t, esc, 'id="plDetStatus"')}</div>
    ${s.stillDetected ? `<p class="pl-warn">${icon('alert')} ${esc(t('pl.stillDetected'))}</p>` : ''}
    <div class="iv-why">${icon('info')}<div><h3>${esc(t('pl.whyHere'))}</h3><p>${esc(whyText(is, rank, S.order.length, t))}</p>${t(note) !== note ? `<p class="iv-note">${esc(t(note))}</p>` : ''}</div></div>
    <div class="iv-how"><h3>${icon('wand')} ${esc(t('pl.method'))}</h3><ol>${fixSteps(is, t).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    <div class="pl-done">${icon('check')}<div><h3>${esc(t('pl.doneWhen'))}</h3><p>${esc(doneText(is, t))}</p></div></div>
    <div class="iv-actions">
      <button class="btn" id="plSeeUrls">${icon('external')} ${esc(t('iv.seeUrls', { n: is.items.length }))}</button>
      <button class="btn" id="plExport">${icon('download')} ${esc(t('pl.exportUrls'))}</button>
    </div>
    <button class="btn primary cta pl-primary" id="${primary[0]}">${icon(primary[2])} ${esc(t(primary[1]))}</button>
    ${s.status === 'validate' || s.status === 'doing' ? `<button class="link pl-reopen" id="plReopen">${esc(t('pl.reopen'))}</button>` : ''}
    <div class="pl-note"><label for="plNote">${icon('report')} ${esc(t('pl.note'))}</label><textarea id="plNote" rows="3" placeholder="${esc(t('pl.notePlaceholder'))}">${esc(s.note)}</textarea>
      <div class="pl-note-foot"><small class="muted">${esc(t('pl.localOnly'))}</small><button class="btn small" id="plSaveNote">${esc(t('pl.saveNote'))}</button></div></div>
  </section>`;
}
