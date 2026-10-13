// Tableau de bord « Vue d'ensemble » : santé SEO (anneaux), priorités, indicateurs, points solides.
// Toutes les valeurs viennent du résultat du crawl ; rien n'est inscrit en dur.
import { computePillars, PILLARS } from './shared/pillars.js';

// Contrôles qui demandent un jugement éditorial : présentés comme « à examiner », pas comme une erreur à corriger.
const EDITORIAL = new Set(['thin-content', 'near-duplicate', 'duplicate-content', 'cannibalization', 'low-text-ratio', 'h2-missing', 'heading-skip', 'title-eq-h1', 'one-inlink', 'deep', 'gsc-low-ctr', 'gsc-no-impressions', 'og-missing', 'schema-missing']);
const uniqueUrls = (is) => new Set(is.items.map((it) => it.url)).size;

export function pillarsOf(R) {
  // Les crawls récents embarquent les piliers ; pour les anciens, calcul à la volée avec la même méthode.
  const computed = computePillars(R);
  if (!R.summary.pillars) return computed;
  return R.summary.pillars.map((p) => ({ ...p, issues: computed.find((c) => c.id === p.id)?.issues || [] }));
}
export const pillarCategories = (id) => PILLARS.find((p) => p.id === id).categories;

// Trois actions les plus utiles : priorité existante (gravité × impact × portée ÷ effort, erreurs d'abord).
export function topActions(R, n = 3) {
  return [...R.issues]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, n)
    .map((is) => ({
      id: is.id,
      params: is.params,
      severity: is.severity,
      category: is.category,
      pages: is.scope === 'site' ? null : uniqueUrls(is),
      kind: EDITORIAL.has(is.id) ? 'review' : is.severity === 'error' ? 'priority' : is.severity === 'warning' ? 'todo' : 'review',
    }));
}

// Points solides : contrôles réellement validés sur le périmètre analysé (jamais affirmés sans données).
export function strengths(R) {
  const has = (id) => R.issues.some((i) => i.id === id);
  const html = R.pages.filter((p) => p.isHtml && p.status === 200);
  const idx = html.filter((p) => p.indexable);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const out = [];
  const add = (cond, key, value, tab, params) => cond && out.push({ key, value, tab, params });
  add(R.summary.internalLinks > 0 && !has('broken-internal'), 'brokenLinks', { k: 'dash.s.zeroFound' }, 'linking');
  add(idx.length > 0 && !has('canonical-missing') && !has('canonical-non200') && !has('canonical-multiple'), 'canonicals', { pct: pct(idx.filter((p) => p.canonical).length, idx.length) }, 'canonicals');
  if (R.meta.mode !== 'list' && idx.length) {
    const near = idx.filter((p) => p.depth != null && p.depth <= 3).length;
    add(pct(near, idx.length) >= 90 && !has('deep') && !has('unreachable'), 'architecture', { pct: pct(near, idx.length) }, 'linking');
  }
  add(html.length > 0 && !has('4xx') && !has('5xx') && !has('no-response'), 'noErrors', { k: 'dash.s.zeroFound' }, 'codes');
  add(idx.length > 0 && !has('title-missing') && !has('title-duplicate'), 'titles', { pct: pct(idx.filter((p) => p.title).length, idx.length) }, 'titles');
  add(String(R.meta.origin || '').startsWith('https') && !has('no-https') && !has('mixed-content'), 'https', { pct: 100 }, 'security');
  add(idx.length > 0 && !has('h1-missing') && !has('h1-duplicate'), 'h1', { pct: pct(idx.filter((p) => p.h1Count).length, idx.length) }, 'h1');
  add(R.meta.sitemapUrlCount > 0 && !has('no-sitemap') && !has('sitemap-non-indexable'), 'sitemap', { n: R.meta.sitemapUrlCount }, 'sitemap');
  return out.slice(0, 3);
}

// ---------- Anneaux concentriques (SVG) ----------
const RINGS = { size: 240, stroke: 12, gap: 4, outer: 112 };
export const ringRadius = (i) => RINGS.outer - i * (RINGS.stroke + RINGS.gap);
export const circumference = (r) => 2 * Math.PI * r;
// Longueur non tracée pour un score : 0 → cercle vide, 100 → cercle complet.
export const dashOffset = (r, score) => circumference(r) * (1 - Math.max(0, Math.min(100, score ?? 0)) / 100);

export function ringsSvg(pillars, from, label) {
  const c = RINGS.size / 2;
  const rings = pillars
    .map((p, i) => {
      const r = ringRadius(i);
      const C = circumference(r).toFixed(2);
      const unmeasured = p.score == null;
      const start = unmeasured ? C : dashOffset(r, from?.[p.id] ?? p.score).toFixed(2);
      return `<g class="ring c-${p.color}${unmeasured ? ' unmeasured' : ''}" data-pillar="${p.id}">
        <circle class="track" cx="${c}" cy="${c}" r="${r}" />
        <circle class="arc" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${C}" stroke-dashoffset="${start}" data-final="${unmeasured ? C : dashOffset(r, p.score).toFixed(2)}" style="--i:${i}" ${!unmeasured && p.score === 0 ? 'opacity="0"' : ''} />
      </g>`;
    })
    .join('');
  return `<svg class="rings" viewBox="0 0 ${RINGS.size} ${RINGS.size}" role="img" aria-label="${label}"><g transform="rotate(-90 ${c} ${c})">${rings}</g></svg>`;
}

// ---------- Gabarit ----------
const SEV_PILL = { error: 'err', warning: 'warn', notice: 'info' };
const domainOf = (R) => {
  try {
    return R.meta.mode === 'list' ? null : new URL(R.meta.finalStart || R.meta.startUrl).hostname;
  } catch {
    return R.meta.startUrl;
  }
};

export function overviewHtml(R, X, { pillars, actions, good, partial, from }) {
  const { t, esc, icon, num } = X;
  const S = R.summary;
  const measured = pillars.filter((p) => p.score != null);
  const weakest = [...measured].sort((a, b) => a.score - b.score)[0];
  const allSolid = measured.length && measured.every((p) => p.score >= 85);
  const skippedTotal = Object.values(R.meta.skipped || {}).reduce((a, n) => a + n, 0);
  const statusKey = R.meta.stopped ? 'stopped' : skippedTotal ? 'partial' : 'complete';
  // Compteur animé : part de la valeur affichée précédemment (from.kpis) ou de 0 au premier affichage.
  const count = (n, key) => `<span class="num" data-count="${n}">${num(from ? from.kpis?.[key] ?? 0 : n)}</span>`;
  const rows = pillars
    .map((p) => {
      const scopeNote = p.id === 'performance' && p.scope ? `<small class="scope">${esc(t('dash.perfScope.' + p.scope))}</small>` : '';
      return `<button class="legend-row" data-pillar="${p.id}" aria-label="${esc(t('pillar.' + p.id))} : ${p.score == null ? esc(t('dash.unmeasured')) : p.score + ' / 100, ' + esc(t('dash.status.' + p.status))}">
        <span class="dot c-${p.color}"></span><span class="lg-name">${esc(t('pillar.' + p.id))}${scopeNote}</span>
        <span class="lg-score">${p.score == null ? `<span class="na">—</span>` : `<b data-count="${p.score}">${from?.pillars?.[p.id] ?? p.score}</b><small>/ 100</small>`}</span>
        <span class="status-pill st-${p.status}">${esc(t('dash.status.' + p.status))}</span></button>`;
    })
    .join('');
  const sevPills = ['error', 'warning', 'notice']
    .map((sev) => {
      const n = S[sev + 's'] || 0;
      return `<button class="sev-pill ${SEV_PILL[sev]}${n ? '' : ' zero'}" data-sev="${sev}" title="${esc(t('dash.occurrences'))}">${icon(n || sev !== 'error' ? (sev === 'notice' ? 'info' : sev === 'error' ? 'error' : 'alert') : 'check')}<span>${esc(t('dash.sev.' + sev, { n }))}</span></button>`;
    })
    .join('');
  const actionRows = actions.length
    ? actions
        .map((a, i) => {
          const actKey = 'act.' + a.id;
          // Sans libellé d'action dédié : le nom du problème en titre et sa catégorie en dessous (pas de doublon).
          const hasAct = t(actKey, a.params) !== actKey;
          const title = hasAct ? t(actKey, a.params) : t('issue.' + a.id + '.label', a.params);
          const sub = hasAct ? t('issue.' + a.id + '.label', a.params) : t('cat.' + a.category);
          return `<button class="action-row" data-issue="${a.id}"><span class="idx">${String(i + 1).padStart(2, '0')}</span>
            <span class="act-text"><b>${esc(title)}</b><small>${esc(sub)}</small></span>
            <span class="act-pages">${a.pages == null ? esc(t('dash.siteWide')) : `<b>${num(a.pages)}</b> ${esc(t('dash.pagesUnit', { n: a.pages }))}`}</span>
            <span class="act-badge k-${a.kind}">${esc(t('dash.kind.' + a.kind))}</span>${icon('chevronRight')}</button>`;
        })
        .join('')
    : `<p class="all-clear">${icon('check')} ${esc(t('dash.noActions'))}</p>`;
  // La valeur finale est donnée tout de suite aux technologies d'assistance (aria-label), le chiffre animé est masqué.
  const kpi = (key, ic, n, label, tone, unit = '') => `<div class="kpi" role="group" aria-label="${esc(label)} : ${n == null ? '—' : num(n)}${unit ? ' ms' : ''}"><span class="kpi-ic t-${tone}">${icon(ic)}</span><div aria-hidden="true"><div class="kpi-val">${n == null ? '—' : count(n, key)}${unit}</div><div class="kpi-lbl">${esc(label)}</div></div></div>`;
  const next = actions[0];
  return `<div class="ov ${from ? 'enter' : ''}">
    <header class="ov-head">
      <div><p class="eyebrow">${esc(t('dash.eyebrow'))}</p><h1>${esc(t('dash.headline'))}</h1>
        <p class="ov-meta">${domainOf(R) ? `<b>${esc(domainOf(R))}</b><span class="sep">·</span>` : `<b>${esc(t('opt.modeList'))}</b><span class="sep">·</span>`}${esc(t('dash.lastCrawl', { date: t.date(R.meta.finishedAt, { dateStyle: 'medium' }) }))}<span class="sep">·</span><span class="run-state s-${statusKey}">${esc(t('dash.run.' + statusKey))}</span>${R.meta.rendered ? `<span class="sep">·</span>${esc(t('dash.jsRendered'))}` : ''}</p></div>
    </header>
    ${partial ? `<div class="ov-banner">${icon('info')}<span><b>${esc(t('dash.partial', { n: S.totalUrls }))}</b> · ${esc(t(R.meta.stopped ? 'dash.partialStopped' : 'dash.partialLimit'))}</span><button class="link" id="ovLimits">${esc(t('dash.adjustLimit'))} ${icon('chevronRight')}</button></div>` : ''}
    ${(R.meta.warnings || []).map((w) => `<div class="ov-banner warn">${icon('alert')}<span>${esc(t(w.key, w.params))}</span></div>`).join('')}
    <div class="ov-grid">
      <section class="card ov-health" aria-labelledby="hHealth">
        <div class="card-head"><h2 id="hHealth">${esc(t('dash.health'))}</h2><span class="grade-pill st-${/^[AB]/.test(S.grade) ? 'solid' : /^C/.test(S.grade) ? 'fair' : 'weak'}">${icon('wand')} ${esc(t('grade.' + S.grade))}</span>${X.prevDelta ? `<span class="delta ${X.prevDelta >= 0 ? 'up' : 'down'}">${X.prevDelta >= 0 ? '▲' : '▼'} ${Math.abs(X.prevDelta)}</span>` : ''}<button class="btn small ghost" id="ovDetail">${esc(t('dash.seeDetail'))} ${icon('chevronRight')}</button></div>
        <div class="health-body">
          <div class="rings-wrap">${ringsSvg(pillars, from?.pillars, esc(t('dash.ringsLabel', { score: S.score })))}
            <div class="rings-center"><span class="big" data-count="${S.score}">${from ? from.score ?? 0 : S.score}</span><span class="of">/ 100</span><span class="cap">${esc(t('dash.globalScore'))}</span></div></div>
          <div class="legend">${rows}</div>
        </div>
        <p class="health-note">${icon(allSolid ? 'check' : 'target')} ${esc(weakest ? t(allSolid ? 'dash.noteSolid' : 'dash.noteFocus', { pillar: t('pillar.' + weakest.id).toLowerCase() }) : t('dash.noteNone'))}</p>
      </section>
      <section class="card ov-prio" aria-labelledby="hPrio">
        <div class="card-head"><div><h2 id="hPrio">${esc(t('dash.priorities'))}</h2><p class="sub">${esc(t('dash.prioritiesSub'))}</p></div><button class="link" id="ovAllIssues">${esc(t('dash.seeAll'))} ${icon('chevronRight')}</button></div>
        <div class="sev-pills">${sevPills}</div>
        <div class="actions">${actionRows}</div>
        <button class="btn plan-btn" id="ovPlan">${icon('list')} ${esc(t('dash.openPlan'))} ${icon('chevronRight')}</button>
      </section>
    </div>
    <div class="kpis">
      ${kpi('crawled', 'file', S.totalUrls, t('dash.kpi.crawled'), 'lime')}
      ${kpi('indexable', 'shield', S.indexable, t('dash.kpi.indexable'), 'violet')}
      ${kpi('response', 'bolt', S.medianResponseTime || null, t('dash.kpi.response'), 'cyan', S.medianResponseTime ? ' <small>ms</small>' : '')}
      ${kpi('links', 'link', S.internalLinks, t('dash.kpi.links'), 'violet')}
    </div>
    <div class="ov-bottom">
      <section class="card ov-good"><h2>${esc(t('dash.goodTitle'))}</h2>
        ${good.length ? `<div class="good-list">${good.map((g) => `<button class="good" data-tab="${g.tab}">${icon('check')}<span><b>${esc(t('dash.s.' + g.key))}</b><small>${esc(g.value.k ? t(g.value.k) : g.value.pct != null ? g.value.pct + ' %' : t('dash.s.urls', { n: g.value.n }))}</small></span>${icon('chevronRight')}</button>`).join('')}</div>` : `<p class="muted">${esc(t('dash.goodNone'))}</p>`}
      </section>
      <section class="card ov-next"><h2>${icon('target')} ${esc(t('dash.nextTitle'))}</h2>
        ${next ? `<div class="next-body"><span class="next-ic">${icon('target')}</span><div><b>${esc(t('act.' + next.id, next.params) !== 'act.' + next.id ? t('act.' + next.id, next.params) : t('issue.' + next.id + '.label', next.params))}</b><p>${esc(t('dash.nextHint'))}</p><button class="link accent" data-issue="${next.id}">${esc(next.pages == null ? t('dash.seeIssue') : t('dash.seePages', { n: next.pages }))} ${icon('chevronRight')}</button></div></div>` : `<p class="muted">${esc(t('dash.noActions'))}</p>`}
      </section>
    </div>
  </div>`;
}

// ---------- Animations ----------
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (x) => 1 - Math.pow(1 - x, 3);

// Remplissage des anneaux (transition CSS décalée) et compteurs (de la valeur affichée vers la valeur finale).
export function playOverview(root, fmt, { animate }) {
  const arcs = [...root.querySelectorAll('.arc')];
  const counters = [...root.querySelectorAll('[data-count]')];
  if (!animate || reduced()) {
    arcs.forEach((a) => (a.style.transition = 'none', a.setAttribute('stroke-dashoffset', a.dataset.final)));
    counters.forEach((el) => (el.textContent = fmt(+el.dataset.count)));
    root.querySelector('.ov')?.classList.remove('enter');
    return;
  }
  const starts = counters.map((el) => Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0);
  // Deux images : le navigateur peint d'abord l'état de départ, puis la transition démarre.
  requestAnimationFrame(() => requestAnimationFrame(() => arcs.forEach((a) => a.setAttribute('stroke-dashoffset', a.dataset.final))));
  const t0 = performance.now();
  const D = 1100;
  const step = (now) => {
    const k = ease(Math.min(1, (now - t0) / D));
    counters.forEach((el, i) => (el.textContent = fmt(Math.round(starts[i] + (+el.dataset.count - starts[i]) * k))));
    if (k < 1 && root.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Survol / focus d'un pilier : l'anneau et sa ligne de légende sont mis en avant, les autres s'estompent.
export function wireHighlight(root) {
  const set = (id) => root.querySelectorAll('[data-pillar]').forEach((el) => el.classList.toggle('dim', !!id && el.dataset.pillar !== id));
  root.querySelectorAll('[data-pillar]').forEach((el) => {
    el.addEventListener('mouseenter', () => set(el.dataset.pillar));
    el.addEventListener('mouseleave', () => set(null));
    el.addEventListener('focus', () => set(el.dataset.pillar));
    el.addEventListener('blur', () => set(null));
  });
}
