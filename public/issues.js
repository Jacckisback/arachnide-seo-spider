// Page « Problèmes SEO » : synthèse, liste priorisée et panneau de correction.
// Logique pure (tri, filtres, étapes, exemple) puis gabarits HTML ; le câblage des événements est dans app.js.
import { titlePixels, descPixels } from './shared/pixel.js';
import { fixMethod } from './shared/fix-catalog.js';

export const SEVS = ['error', 'warning', 'notice'];
const SEV_RANK = { error: 0, warning: 1, notice: 2 };
const LVL_RANK = { low: 0, medium: 1, high: 2 };
export const SORTS = ['priority', 'urls', 'severity', 'effort', 'name'];
// Colonne du tableau qui porte l'indicateur de chaque tri (la priorité recommandée n'en a pas : elle combine plusieurs critères).
export const SORT_COL = { name: 'issue', severity: 'level', urls: 'urls', effort: 'effort' };
export const PAGE_SIZE = 10;
const SEV_ICON = { error: 'error', warning: 'alert', notice: 'info' };
export const sevIcon = (s) => SEV_ICON[s];
// Libellé au singulier, cohérent avec les cartes de synthèse (Erreur / Avertissement / Information).
export const sevLabel = (s, t) => t('iv.sum.' + s, { n: 1 });

// URL uniques concernées par un problème ; null pour un problème de site (robots.txt, HTTPS, sitemap…).
export function uniqueUrls(is) {
  if (is.scope === 'site') return null;
  return new Set(is.items.map((it) => it.url)).size;
}

// Nombre de types de problèmes par gravité (jamais une somme d'URL).
export function summarize(issues) {
  const out = { total: issues.length, error: 0, warning: 0, notice: 0 };
  for (const is of issues) out[is.severity]++;
  return out;
}

export const issueLabel = (is, t) => t('issue.' + is.id + '.label', is.params);

// Action recommandée affichée sous le titre : libellé d'action court s'il existe, sinon la recommandation du problème.
export function actionLabel(is, t) {
  const k = 'act.' + is.id;
  const a = t(k, is.params);
  return a !== k ? a : t('issue.' + is.id + '.fix', is.params);
}

// Filtre (gravité, recherche sur le nom, la catégorie et l'action, catégories d'un pilier) puis tri.
export function filterSort(issues, { sev = 'all', q = '', sort = 'priority', categories = null }, t) {
  const needle = q.trim().toLowerCase();
  const rows = issues.filter((is) => {
    if (sev !== 'all' && is.severity !== sev) return false;
    if (categories && !categories.includes(is.category)) return false;
    if (!needle) return true;
    return [issueLabel(is, t), t('cat.' + is.category), actionLabel(is, t)].some((s) => s.toLowerCase().includes(needle));
  });
  const urls = (is) => uniqueUrls(is) ?? Infinity; // un problème de site touche tout le site
  const by = {
    // Règle du moteur (src/analyze.mjs) : gravité d'abord, puis impact × portée (log des URL) ÷ effort.
    // Gravité d'abord aussi pour les crawls enregistrés avant la 3.7 (anciens paliers de priorité).
    priority: (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.priority - a.priority,
    urls: (a, b) => urls(b) - urls(a) || b.priority - a.priority,
    severity: (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.priority - a.priority,
    effort: (a, b) => LVL_RANK[a.effort] - LVL_RANK[b.effort] || b.priority - a.priority,
    name: (a, b) => issueLabel(a, t).localeCompare(issueLabel(b, t), t.locale),
  };
  return rows.sort(by[sort] || by.priority);
}

// Étapes « Comment corriger » : la recommandation propre au problème (une étape par phrase), une vérification
// propre à sa catégorie, puis le contrôle par un nouveau crawl, seul à confirmer la résolution.
export function fixSteps(is, t) {
  const fix = t('issue.' + is.id + '.fix', is.params);
  const steps = fix.split(/(?<=[.!?])\s+(?=\p{Lu})/u).map((s) => s.trim()).filter(Boolean);
  const cat = 'istep.' + is.category;
  if (t(cat) !== cat) steps.push(t(cat));
  steps.push(t('istep.recrawl'));
  return steps;
}

// Raccourcit un texte au dernier mot entier qui tient dans la limite en pixels, sans séparateur orphelin en fin.
export function shorten(text, maxPx, measure) {
  const words = String(text).split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) {
    const next = out ? out + ' ' + w : w;
    if (measure(next) > maxPx) break;
    out = next;
  }
  out = out.replace(/[\s|·•:;,–—-]+$/u, '');
  return out && out !== text ? out : null;
}

const EXAMPLES = {
  'title-long': { field: 'title', px: 'titlePx', measure: titlePixels, shorten: true },
  'title-short': { field: 'title' },
  'title-duplicate': { field: 'title' },
  'desc-long': { field: 'metaDescription', px: 'metaDescriptionPx', measure: descPixels, shorten: true },
  'desc-short': { field: 'metaDescription' },
  'desc-duplicate': { field: 'metaDescription' },
  'h1-duplicate': { field: 'h1' },
  'h1-multiple': { field: 'h1' },
};

// Exemple avant / après tiré d'une vraie page concernée ; la proposition n'existe que lorsqu'elle se calcule
// sans deviner (coupe d'un texte trop long). Sinon, seule la valeur relevée est montrée.
export function example(is, R) {
  const ex = EXAMPLES[is.id];
  if (!ex) return null;
  const byUrl = new Map(R.pages.map((p) => [p.url, p]));
  const page = is.items.map((it) => byUrl.get(it.url)).find((p) => p && p[ex.field]);
  if (!page) return null;
  const value = Array.isArray(page[ex.field]) ? page[ex.field][0] : page[ex.field];
  const max = is.params?.max;
  const suggestion = ex.shorten && max ? shorten(value, max, ex.measure) : null;
  return { url: page.url, value, px: ex.px ? page[ex.px] : null, max, suggestion, suggestionPx: suggestion ? ex.measure(suggestion) : null };
}

export const canPrepareFix = (is) => fixMethod(is.id) !== 'manual';

// « Impact élevé » mais « Medium impact » : le niveau prend une minuscule sauf s'il ouvre le libellé.
const lvlText = (key, v, t) => {
  const raw = t('lvl.' + v);
  return t(key, { lvl: t(key, { lvl: '\u0000' }).startsWith('\u0000') ? raw : raw.toLocaleLowerCase(t.locale) });
};

// ---------- Gabarits ----------
const LVL_CLS = { low: 'lo', medium: 'mid', high: 'hi' };

export function summaryHtml(sum, sev, X) {
  const { t, esc, icon, num } = X;
  const seg = SEVS.filter((s) => sum[s]).map((s) => `<i class="sv-${s}" style="flex:${sum[s]}"></i>`).join('');
  const card = (key, n, label, hint, ic, cls) => `<button class="iv-sum ${cls}${sev === key ? ' on' : ''}" data-sevf="${key}" aria-pressed="${sev === key}">
      <span class="iv-sum-ic">${icon(ic)}</span>
      <span class="iv-sum-body"><b class="iv-sum-n">${num(n)}</b><span class="iv-sum-l">${esc(label)}</span><small>${esc(hint)}</small></span>
    </button>`;
  return `<div class="iv-sums" role="group" aria-label="${esc(t('iv.sumLabel'))}">
    <button class="iv-sum total${sev === 'all' ? ' on' : ''}" data-sevf="all" aria-pressed="${sev === 'all'}">
      <span class="iv-sum-ic">${icon('file')}</span>
      <span class="iv-sum-body"><b class="iv-sum-n">${num(sum.total)}</b><span class="iv-sum-l">${esc(t('iv.types', { n: sum.total }))}</span>
        <span class="iv-bar" aria-hidden="true">${seg}</span>
        <small>${esc(SEVS.filter((s) => sum[s]).map((s) => t('dash.sev.' + s, { n: sum[s] })).join(' · ') || t('iv.hint.total'))}</small></span>
    </button>
    ${card('error', sum.error, t('iv.sum.error', { n: sum.error }), t(sum.error ? 'iv.hint.error' : 'iv.hint.errorNone'), sum.error ? 'error' : 'check', sum.error ? 'err' : 'ok')}
    ${card('warning', sum.warning, t('iv.sum.warning', { n: sum.warning }), t('iv.hint.warning'), 'alert', 'warn')}
    ${card('notice', sum.notice, t('iv.sum.notice', { n: sum.notice }), t('iv.hint.notice'), 'info', 'info')}
  </div>`;
}

export function listHtml(R, rows, st, X) {
  const { t, esc, icon, num } = X;
  const sum = summarize(R.issues);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(st.page, pages - 1);
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const th = (col, label, sortKey, cls = '') => {
    const on = SORT_COL[st.sort] === col;
    return `<th class="${cls}" ${on ? `aria-sort="${st.sort === 'name' || st.sort === 'effort' || st.sort === 'severity' ? 'ascending' : 'descending'}"` : ''}><button class="th-sort${on ? ' on' : ''}" data-sort="${sortKey}">${esc(label)}${on ? ` <span class="sort-ar" aria-hidden="true">${st.sort === 'urls' ? '↓' : '↑'}</span>` : ''}</button></th>`;
  };
  const tab = (key, label, n) => `<button class="iv-tab ${key}${st.sev === key ? ' on' : ''}" data-sevf="${key}" aria-pressed="${st.sev === key}">${key === 'all' ? icon('list') : icon(SEV_ICON[key])}<span>${esc(label)}</span><span class="n">${num(n)}</span></button>`;
  const body = slice
    .map((is) => {
      const n = uniqueUrls(is);
      return `<tr class="iv-row${st.issue === is.id ? ' sel' : ''}" data-issue="${is.id}" tabindex="0" aria-selected="${st.issue === is.id}">
        <td class="iv-name"><b>${esc(issueLabel(is, t))}</b><small>${esc(actionLabel(is, t))}</small></td>
        <td><span class="sev-badge ${is.severity}">${icon(SEV_ICON[is.severity])}${esc(sevLabel(is.severity, t))}</span></td>
        <td class="num">${n == null ? `<span class="muted" title="${esc(t('iv.scopeSite'))}">${esc(t('dash.siteWide'))}</span>` : `<b>${num(n)}</b>`}</td>
        <td><span class="eff-badge ${LVL_CLS[is.effort]}" title="${esc(t('effort.label'))}">${esc(t('lvl.' + is.effort))}</span></td>
        <td class="chev">${icon('chevronRight')}</td>
      </tr>`;
    })
    .join('');
  const pager =
    pages > 1
      ? `<nav class="iv-pager" aria-label="${esc(t('iv.pagination'))}"><button class="pg" data-pg="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="${esc(t('iv.prev'))}">${icon('chevronLeft')}</button>${Array.from({ length: pages }, (_, i) => `<button class="pg${i === page ? ' on' : ''}" data-pg="${i}" ${i === page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}<button class="pg" data-pg="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="${esc(t('iv.next'))}">${icon('chevronRight')}</button></nav>`
      : '';
  return `<section class="iv-panel iv-list" aria-labelledby="ivAllTitle">
    <div class="iv-list-head"><h2 id="ivAllTitle">${esc(t('iv.all'))} <span class="count-pill">${num(sum.total)}</span></h2></div>
    <div class="iv-tabs" role="group" aria-label="${esc(t('iv.filterLabel'))}">
      ${tab('all', t('f.all'), sum.total)}${tab('error', t('iv.f.error'), sum.error)}${tab('warning', t('iv.f.warning'), sum.warning)}${tab('notice', t('iv.f.notice'), sum.notice)}
    </div>
    <div class="iv-tools">
      <label class="searchbox iv-search">${icon('search')}<input id="ivSearch" type="search" placeholder="${esc(t('iv.search'))}" aria-label="${esc(t('iv.search'))}" value="${esc(st.q)}"></label>
      <label class="iv-sort">${icon('list')}<span class="sr-only">${esc(t('iv.sortLabel'))}</span><select id="ivSort">${SORTS.map((s) => `<option value="${s}" ${st.sort === s ? 'selected' : ''}>${esc(t('iv.sort.' + s))}</option>`).join('')}</select></label>
    </div>
    ${st.sort === 'priority' ? `<p class="iv-sort-hint">${icon('info')}<span>${esc(t('iv.sortHint'))}</span></p>` : ''}
    ${
      rows.length
        ? `<div class="iv-table-wrap"><table class="iv-table"><thead><tr>${th('issue', t('iv.col.issue'), 'name')}${th('level', t('iv.col.level'), 'severity')}${th('urls', t('iv.col.urls'), 'urls', 'num')}${th('effort', t('iv.col.effort'), 'effort')}<th><span class="sr-only">${esc(t('iv.open'))}</span></th></tr></thead><tbody>${body}</tbody></table></div>`
        : `<div class="empty small iv-empty">${icon('search')}<p>${esc(t('iv.noResults'))}</p><button class="btn small" id="ivReset">${esc(t('iv.reset'))}</button></div>`
    }
    <div class="iv-foot"><span class="muted">${esc(t('iv.shown', { n: rows.length, total: sum.total }))}</span>${pager}</div>
  </section>`;
}

export function detailHtml(R, is, X) {
  const { t, esc, icon, num, detailText } = X;
  const n = uniqueUrls(is);
  const ex = example(is, R);
  const preview = is.items.slice(0, 5);
  const value = (it) => detailText(it.detail, t);
  const path = (u) => {
    try {
      const x = new URL(u);
      return x.origin === R.meta.origin ? x.pathname + x.search : u;
    } catch {
      return u;
    }
  };
  const note = 'inote.' + is.id;
  return `<section class="iv-panel iv-detail" aria-labelledby="ivDetTitle" aria-live="polite">
    <button class="link iv-back" id="ivBack">${icon('chevronLeft')} ${esc(t('iv.back'))}</button>
    <p class="eyebrow">${esc(t('iv.selected'))}</p>
    <h2 id="ivDetTitle">${esc(issueLabel(is, t))}</h2>
    <div class="iv-chips">
      <span class="sev-badge ${is.severity}">${icon(SEV_ICON[is.severity])}${esc(sevLabel(is.severity, t))}</span>
      <span class="meta-chip imp">${icon('graph')}${esc(lvlText('iv.impact', is.impact, t))}</span>
      <span class="meta-chip eff ${LVL_CLS[is.effort]}">${icon('wand')}${esc(lvlText('iv.effort', is.effort, t))}</span>
      <span class="meta-chip">${esc(t('cat.' + is.category))}</span>
    </div>
    <div class="iv-stat">${icon('file')}<div><b>${n == null ? esc(t('dash.siteWide')) : num(n)}</b><span>${esc(n == null ? t('iv.scopeSite') : t('iv.urlsUnit', { n }))}</span></div></div>
    <div class="iv-why">${icon('info')}<div><h3>${esc(t('iv.why'))}</h3><p>${esc(t('issue.' + is.id + '.desc', is.params))}</p>${t(note) !== note ? `<p class="iv-note">${esc(t(note))}</p>` : ''}</div></div>
    <div class="iv-how"><h3>${icon('wand')} ${esc(t('iv.how'))}</h3><ol>${fixSteps(is, t).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    ${
      ex
        ? `<div class="iv-ex"><p class="eyebrow">${esc(t('iv.example'))}</p>
        <div class="iv-ex-row cur"><span class="iv-ex-k">${esc(t('iv.current'))}</span><span class="iv-ex-v">${esc(ex.value)}<small class="muted">${esc(path(ex.url))}</small></span>${ex.px ? `<span class="px-badge ${ex.max && ex.px > ex.max ? 'over' : ''}">${num(ex.px)} px</span>` : ''}</div>
        ${ex.suggestion ? `<div class="iv-ex-arrow" aria-hidden="true">↓</div><div class="iv-ex-row sug"><span class="iv-ex-k">${esc(t('iv.suggestion'))}</span><span class="iv-ex-v">${esc(ex.suggestion)}</span><span class="px-badge ok">${num(ex.suggestionPx)} px</span></div><p class="iv-ex-note">${esc(t('iv.suggestionNote', { max: ex.max }))}</p>` : ''}
      </div>`
        : ''
    }
    <div class="iv-urls-head"><h3>${esc(t('iv.affected'))} <span class="count-pill">${num(is.items.length)}</span></h3></div>
    <ul class="iv-urls">${preview.map((it) => `<li>${icon('link')}<a href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.url)}">${esc(path(it.url))}</a><span class="v" title="${esc(value(it))}">${esc(value(it))}</span></li>`).join('')}</ul>
    <div class="iv-actions">
      <button class="btn primary cta" id="ivSeeUrls">${esc(t('iv.seeUrls', { n: is.items.length }))} ${icon('chevronRight')}</button>
      <button class="btn" id="ivExport">${icon('download')} ${esc(t('iv.exportList'))}</button>
    </div>
    ${canPrepareFix(is) ? `<button class="link accent iv-fix" id="ivFix">${icon('wand')} ${esc(t('iv.prepareFix'))}</button>` : ''}
    <p class="iv-recheck">${icon('history')} ${esc(t('iv.recheck'))}</p>
  </section>`;
}
