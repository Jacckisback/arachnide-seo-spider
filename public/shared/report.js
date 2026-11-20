// Rapport d'audit SEO autonome (HTML imprimable en PDF), en marque blanche et multilingue.
// Utilisé par l'interface (navigateur) et par la CLI (Node) : aucune dépendance au DOM.
import { detailText } from './i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SEV = ['error', 'warning', 'notice'];
const CAT_ORDER = ['codes', 'links', 'redirects', 'security', 'titles', 'meta', 'headings', 'content', 'images', 'directives', 'canonicals', 'sitemap', 'architecture', 'performance', 'javascript', 'url', 'markup', 'schema', 'hreflang', 'ai'];

// Couleurs d'état du rapport (texte ≥ 4,5:1 sur le papier) ; un seul seuil pour la jauge, les barres et les tableaux.
const C_OK = '#16794a';
const C_WARN = '#9a5b00';
const C_ERR = '#c0261b';
const scoreCol = (v) => (v >= 75 ? C_OK : v >= 50 ? C_WARN : C_ERR);

function gaugeSvg(score, grade) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return `<svg class="gauge" viewBox="0 0 130 130" width="132" height="132" role="img" aria-label="${score}/100 · ${esc(grade)}">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="#e8eaee" stroke-width="7"/>
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="${scoreCol(score)}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 65 65)"/>
    <text x="65" y="74" text-anchor="middle" class="g-num">${score}</text>
    <text x="65" y="96" text-anchor="middle" class="g-grade">${esc(grade)}</text></svg>`;
}

const bar = (pct, col) => `<div class="rb"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${col}"></i></div>`;

// URL affichée sans l'origine du site audité (/achat-or/lingot/ au lieu de https://exemple.com/achat-or/lingot/),
// coupable après chaque / ou - : plus de colonnes coupées au milieu d'un mot. Le lien garde l'adresse complète.
const urlCut = (txt) => esc(txt).replace(/([/?&=_-])/g, '$1<wbr>');
function makeUrlTools(startUrl) {
  let origins = [];
  try {
    const u = new URL(startUrl);
    const bare = u.hostname.replace(/^www\./, '');
    origins = [`https://${bare}`, `http://${bare}`, `https://www.${bare}`, `http://www.${bare}`];
  } catch {
    /* mode liste sans hôte unique */
  }
  const strip = (v) => {
    let out = String(v ?? '');
    for (const o of origins) out = out.split(o + '/').join('/').split(o + '"').join('/"');
    for (const o of origins) if (out === o) out = '/';
    return out;
  };
  const link = (u) => (/^https?:\/\//i.test(String(u || '')) ? `<a href="${esc(u)}">${urlCut(strip(u))}</a>` : urlCut(u));
  return { strip, link, relative: origins.length > 0 };
}
const SEC = (n, title) => `<h2 class="sec"><span class="n">${String(n).padStart(2, '0')}</span><span class="t">${esc(title)}</span></h2>`;

export function buildReport(R, opts, t) {
  const color = /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color : '#5b8c1e';
  const U = makeUrlTools(R.meta.mode === 'list' ? '' : R.meta.startUrl);
  const fonts = opts.fonts || {};
  const S = R.summary;
  const site = R.meta.mode === 'list' ? t('report.urlList', { n: S.totalUrls }) : R.meta.startUrl;
  const host = (() => { try { return new URL(R.meta.startUrl).hostname; } catch { return ''; } })();
  const title = opts.title || t('report.defaultTitle');
  const maxUrls = Math.max(0, Number(opts.maxUrls ?? 10));
  const date = t.date(R.meta.finishedAt, { dateStyle: 'long' });
  const issues = R.issues;
  const label = (i) => t('issue.' + i.id + '.label', i.params);
  const chip = (s) => `<span class="chip ${s}">${esc(t('sev.' + s))}</span>`;
  const lvl = (v) => `<span class="lvl l-${v}">${esc(t('lvl.' + v))}</span>`;
  const cmp = opts.compare;
  const byCat = new Map();
  for (const i of issues) {
    if (!byCat.has(i.category)) byCat.set(i.category, []);
    byCat.get(i.category).push(i);
  }
  const cats = [...byCat.keys()].sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));
  const catScores = Object.entries(S.categoryScores || {}).sort((a, b) => a[1] - b[1]);
  const strengths = CAT_ORDER.filter((c) => !byCat.has(c) || (S.categoryScores?.[c] ?? 100) >= 95);
  const top = [...issues].sort((a, b) => b.priority - a.priority);
  const pct = (n) => (S.htmlPages ? Math.round((n / S.htmlPages) * 100) : 0);

  // ---------- Sections ----------
  const blockingTypes = issues.filter((i) => i.severity === 'error').length;
  const first = top[0];
  const verdict = [
    blockingTypes ? t('report.verdictErrors', { n: blockingTypes }) : t('report.verdictClean'),
    first ? t('report.verdictTop', { label: label(first), n: t.num(first.count) }) : '',
  ].filter(Boolean).join(' ');
  const fact = (v, k) => `<div><b>${typeof v === 'number' ? t.num(v) : esc(v)}</b><span>${esc(t(k))}</span></div>`;
  const cover = `<section class="cover page">
    <header class="cover-top">
      ${opts.logo ? `<img class="logo" src="${esc(opts.logo)}" alt="${esc(opts.company || '')}">` : `<div class="brandname">${esc(opts.company || opts.author || '')}</div>`}
      <p class="kicker">${esc(t('report.kicker'))}<span>${esc(date)}</span></p>
    </header>
    <div class="cover-main">
      <h1>${esc(title)}</h1>
      <p class="site">${esc(host || site)}</p>
      ${R.meta.segment ? `<p class="seg-scope"><i style="background:${esc(R.meta.segment.color || '#94a3b8')}"></i>${esc(t('report.segmentScope', { name: R.meta.segment.name || t('seg.none'), n: R.meta.segment.pages, total: t.num(R.meta.segment.total) }))}</p>` : ''}
      <div class="verdict">
        <p class="score" style="color:${scoreCol(S.score)}"><b>${S.score}</b><span>/100</span></p>
        <div class="verdict-text">
          <p class="grade"><span class="grade-l" style="background:${scoreCol(S.score)}">${esc(S.grade)}</span>${esc(t('grade.' + S.grade))}</p>
          <p class="verdict-s">${esc(verdict)}</p>
        </div>
      </div>
      <div class="facts">${fact(S.totalUrls, 'dash.urls')}${fact(S.indexable, 'dash.indexable')}${fact(S.errors, 'sev.errors')}${fact(S.warnings, 'sev.warnings')}</div>
    </div>
    <dl class="cover-meta">
      ${opts.client ? `<div><dt>${esc(t('report.preparedFor'))}</dt><dd>${esc(opts.client)}</dd></div>` : ''}
      ${opts.author || opts.company ? `<div><dt>${esc(t('report.preparedBy'))}</dt><dd>${esc([opts.author, opts.company].filter(Boolean).join(' · '))}</dd></div>` : ''}
      <div><dt>${esc(t('report.date'))}</dt><dd>${esc(date)}</dd></div>
      ${opts.contact || opts.website ? `<div><dt>${esc(t('report.contact'))}</dt><dd>${esc([opts.contact, opts.website].filter(Boolean).join(' · '))}</dd></div>` : ''}
    </dl>
  </section>`;

  const findings = top.slice(0, 6).map((i) => `<li>${chip(i.severity)}<span class="lab">${esc(label(i))}</span><b class="r">${t.num(i.count)}</b></li>`).join('');
  const summary = `<section class="page">
    ${SEC(1, t('report.summary'))}
    ${opts.intro ? `<p class="intro">${esc(opts.intro).replace(/\n/g, '<br>')}</p>` : `<p class="intro">${esc(t('report.introDefault', { site: host || site, n: S.totalUrls, date }))}</p>`}
    <div class="sum-grid">
      <div class="sum-score">${gaugeSvg(S.score, S.grade)}<p><b>${esc(t('grade.' + S.grade))}</b><br>${esc(t('report.scoreExplain'))}</p></div>
      <div class="kpis">
        ${[['dash.urls', S.totalUrls], ['dash.html', S.htmlPages], ['dash.indexable', S.indexable], ['dash.responseTime', `${t.num(S.avgResponseTime)} ms`], ['sev.errors', S.errors], ['sev.warnings', S.warnings]]
          .map(([k, v]) => `<div class="kpi"><b>${typeof v === 'number' ? t.num(v) : esc(v)}</b><span>${esc(t(k))}</span></div>`).join('')}
      </div>
    </div>
    <div class="two">
      <div><h3>${esc(t('report.keyFindings'))} <small>${esc(t('col.urls'))}</small></h3><ul class="findings">${findings || `<li>${esc(t('issues.none'))}</li>`}</ul></div>
      <div><h3>${esc(t('report.strengths'))}</h3><ul class="strengths">${strengths.slice(0, 6).map((c) => `<li><i aria-hidden="true">✓</i>${esc(t('cat.' + c))}</li>`).join('') || '<li>—</li>'}</ul></div>
    </div>
    <h3>${esc(t('dash.categories'))}</h3>
    <div class="cats">${catScores.map(([c, v]) => `<div class="cat"><span>${esc(t('cat.' + c))}</span>${bar(v, scoreCol(v))}<b>${v} %</b></div>`).join('')}</div>
  </section>`;

  const evolution = cmp ? `<section class="page">
    ${SEC(2, t('report.evolution'))}
    <p>${esc(t('report.evolutionIntro', { date: t.date(cmp.prevDate, { dateStyle: 'long' }) }))}</p>
    ${cmp.reliable === false ? `<p style="border-left:4px solid #d97706;background:#fdf6e9;padding:8px 12px">⚠ ${esc(t('report.compareUnreliable'))}</p>` : ''}
    <div class="evo">
      <div class="evo-score"><span>${cmp.prevScore}</span><i>→</i><b>${S.score}</b><em class="${cmp.scoreDelta >= 0 ? 'up' : 'down'}">${cmp.scoreDelta >= 0 ? '+' : ''}${cmp.scoreDelta}</em></div>
      <div class="evo-stats">
        <div><b class="up">${cmp.fixed.length}</b><span>${esc(t('report.fixed'))}</span></div>
        <div><b class="up">${cmp.improved.length}</b><span>${esc(t('report.improved'))}</span></div>
        <div><b class="down">${cmp.worsened.length}</b><span>${esc(t('report.worsened'))}</span></div>
        <div><b class="down">${cmp.appeared.length}</b><span>${esc(t('report.new'))}</span></div>
      </div>
    </div>
    <table><thead><tr><th>${esc(t('col.issue'))}</th><th>${esc(t('col.severity'))}</th><th class="r">${esc(t('report.before'))}</th><th class="r">${esc(t('report.after'))}</th><th class="r">Δ</th><th class="r">${esc(t('report.fixedUrls'))}</th><th class="r">${esc(t('report.newUrls'))}</th></tr></thead><tbody>
      ${cmp.issues.filter((i) => i.delta !== 0 || i.fixedCount || i.newCount).slice(0, 40).map((i) => `<tr><td>${esc(t('issue.' + i.id + '.label', R.issues.find((x) => x.id === i.id)?.params || {}))}</td><td>${chip(i.severity)}</td><td class="r">${t.num(i.prev)}</td><td class="r">${t.num(i.cur)}</td><td class="r ${i.delta < 0 ? 'up' : 'down'}">${i.delta > 0 ? '+' : ''}${t.num(i.delta)}</td><td class="r up">${i.fixedCount ? t.num(i.fixedCount) : '—'}</td><td class="r down">${i.newCount ? t.num(i.newCount) : '—'}</td></tr>`).join('')}
    </tbody></table>
  </section>` : '';

  let sec = cmp ? 3 : 2;
  const segRows = opts.segments || [];
  const segments = segRows.length ? `<section class="page">
    ${SEC(sec++, t('report.segments'))}
    <p>${esc(t('report.segmentsIntro'))}</p>
    <table class="segs"><thead><tr><th>${esc(t('seg.col.segment'))}</th><th class="r">${esc(t('seg.col.pages'))}</th><th class="r">${esc(t('seg.col.score'))}</th><th class="r">${esc(t('seg.col.errors'))}</th><th class="r">${esc(t('seg.col.warnings'))}</th><th class="r">${esc(t('seg.col.indexable'))}</th><th class="r">${esc(t('seg.col.depth'))}</th><th>${esc(t('seg.col.top'))}</th></tr></thead><tbody>
    ${segRows.map((g) => `<tr><td><i class="dot" style="background:${esc(g.color)}"></i><b>${esc(g.id === '__none' ? t('seg.none') : g.name)}</b></td><td class="r">${t.num(g.pages)}</td><td class="r">${g.score == null ? '—' : `<b style="color:${scoreCol(g.score)}">${g.score}</b>`}</td><td class="r">${t.num(g.errors)}</td><td class="r">${t.num(g.warnings)}</td><td class="r">${g.indexableRate == null ? '—' : g.indexableRate + ' %'}</td><td class="r">${g.avgDepth == null ? '—' : t.num(g.avgDepth)}</td><td><small>${g.topIssues.map((i) => `${esc(t('issue.' + i.id + '.label', i.params))} (${t.num(i.count)})`).join(' · ') || '—'}</small></td></tr>`).join('')}
    </tbody></table>
  </section>` : '';
  const planRows = (sev) => top.filter((i) => i.severity === sev);
  const plan = `<section class="page">
    ${SEC(sec++, t('report.actionPlan'))}
    <p>${esc(t('report.actionPlanIntro'))}</p>
    ${SEV.map((sev, k) => {
      const rows = planRows(sev);
      if (!rows.length) return '';
      return `<h3 class="prio-h p${k + 1}"><i aria-hidden="true"></i>${esc(t('report.priority' + (k + 1)))}</h3>
      <table class="plan"><thead><tr><th>#</th><th>${esc(t('col.issue'))}</th><th>${esc(t('impact.label'))}</th><th>${esc(t('effort.label'))}</th><th class="r">${esc(t('col.urls'))}</th><th>${esc(t('col.fix'))}</th></tr></thead><tbody>
      ${rows.map((i, n) => `<tr><td>${n + 1}</td><td><b>${esc(label(i))}</b><br><small>${esc(t('cat.' + i.category))}</small></td><td>${lvl(i.impact)}</td><td>${lvl(i.effort)}</td><td class="r">${t.num(i.count)}</td><td>${esc(t('issue.' + i.id + '.fix', i.params))}</td></tr>`).join('')}
      </tbody></table>`;
    }).join('')}
  </section>`;

  const details = `<section class="page">
    ${SEC(sec++, t('report.details'))}
    ${U.relative ? `<p class="small rel-note">${esc(t('report.relativeUrls', { origin: R.meta.finalStart ? new URL(R.meta.finalStart).origin : host }))}</p>` : ''}
    ${cats.map((c) => `<div class="catblock"><h3 class="cat-h"><span>${esc(t('cat.' + c))}</span>${S.categoryScores?.[c] != null ? `<span class="cat-score" style="color:${scoreCol(S.categoryScores[c])}">${S.categoryScores[c]} %</span>` : ''}</h3>
      ${byCat.get(c).map((i) => `<article class="issue">
        <header>${chip(i.severity)}<h4>${esc(label(i))}</h4><span class="count">${esc(t('report.findingCount', { n: i.count }))}</span></header>
        <p>${esc(t('issue.' + i.id + '.desc', i.params))}</p>
        <p class="fix"><b>${esc(t('issues.howToFix'))}</b> ${esc(t('issue.' + i.id + '.fix', i.params))}</p>
        ${maxUrls ? `<table class="urls"><tbody>${i.items.slice(0, maxUrls).map((it) => `<tr><td class="u">${U.link(it.url)}</td><td class="d">${urlCut(U.strip(detailText(it.detail, t)))}</td></tr>`).join('')}</tbody></table>
        ${i.items.length > maxUrls ? `<p class="more">${esc(t('report.andMore', { n: i.items.length - maxUrls }))}</p>` : ''}` : ''}
      </article>`).join('')}</div>`).join('')}
  </section>`;

  const sb = S.statusBuckets;
  const depth = Object.entries(S.depthBuckets).sort(([a], [b]) => (a === 'n/a') - (b === 'n/a') || parseInt(a) - parseInt(b));
  const maxDepth = Math.max(1, ...depth.map(([, v]) => v));
  const tech = `<section class="page">
    ${SEC(sec++, t('report.technical'))}
    <div class="two">
      <div><h3>${esc(t('dash.status'))}</h3><table class="mini"><tbody>${Object.entries(sb).filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k === 'blocked' ? t('st.blocked') : k === 'none' ? t('st.none') : k)}</td><td class="r">${t.num(v)}</td><td class="r">${S.totalUrls ? Math.round((v / S.totalUrls) * 100) : 0}%</td></tr>`).join('')}</tbody></table></div>
      <div><h3>${esc(t('dash.depth'))}</h3>${depth.map(([k, v]) => `<div class="cat"><span>${esc(k === 'n/a' ? t('dash.notLinked') : t('dash.level', { n: k }))}</span>${bar((v / maxDepth) * 100, color)}<b>${t.num(v)}</b></div>`).join('')}</div>
    </div>
    <div class="two">
      <div><h3>${esc(t('robots.bots'))}</h3><table class="mini"><tbody>${(R.meta.botAccess || []).map((b) => `<tr><td>${esc(b.bot)}</td><td>${b.allowed == null ? `<span class="chip">${esc(t('robots.unknown'))}</span>` : b.allowed ? `<span class="chip ok">${esc(t('robots.allowed'))}</span>` : `<span class="chip error">${esc(t('robots.blocked'))}</span>`}</td></tr>`).join('')}</tbody></table>
        <p class="small">llms.txt : ${R.meta.llmsTxt ? '✓' : '✗'}</p></div>
      <div><h3>${esc(t('report.crawlSetup'))}</h3><table class="mini"><tbody>
        <tr><td>${esc(t('report.mode'))}</td><td>${esc(R.meta.mode === 'list' ? t('opt.modeList') : t('opt.modeSpider'))}</td></tr>
        <tr><td>${esc(t('opt.render'))}</td><td>${R.meta.rendered ? '✓' : '✗'}</td></tr>
        <tr><td>robots.txt</td><td>${esc(t({ respect: 'opt.robotsRespect', report: 'opt.robotsReport', ignore: 'opt.robotsIgnore' }[R.meta.options.robotsMode || 'respect']))}${R.meta.options.customRobots ? ' · ' + esc(t('robots.customUsed')) : ''}</td></tr>
        <tr><td>${esc(t('opt.userAgent'))}</td><td class="small">${esc(R.meta.options.userAgent)}</td></tr>
        <tr><td>${esc(t('robots.sitemaps'))}</td><td>${t.num(R.meta.sitemapFiles?.length || 0)} · ${t.num(R.meta.sitemapUrlCount)} URLs</td></tr>
        <tr><td>${esc(t('dash.indexable'))}</td><td>${t.num(S.indexable)} / ${t.num(S.htmlPages)} (${pct(S.indexable)}%)</td></tr>
        <tr><td>${esc(t('dash.words'))}</td><td>${t.num(S.avgWords)}</td></tr>
        ${R.meta.stopped ? `<tr><td colspan="2">${esc(t('dash.interrupted'))}</td></tr>` : ''}
      </tbody></table></div>
    </div>
  </section>`;

  // Logs serveur (3.22) : ce que les robots demandent vraiment, sur la période importée.
  const L = R.meta.logs;
  const logsSec = L ? (() => {
    const fam = L.families || {};
    const kpi = (v, l) => `<div class="kpi"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`;
    const logIssues = issues.filter((i) => i.id.startsWith('log-'));
    const period = L.period ? t('logs.periodLine', { start: t.date(L.period.start, { dateStyle: 'medium' }), end: t.date(L.period.end, { dateStyle: 'medium' }), days: L.period.days, files: L.files?.length || 0, format: L.format }) : '';
    const V = L.verification;
    const verif = V?.enabled ? t('logs.verified', { ok: t.num(V.verified), spoofed: t.num(V.spoofed) }) : t('logs.notVerified');
    return `<section class="page">
    ${SEC(sec++, t('report.logs'))}
    <p class="intro">${esc(t('report.logsIntro'))}</p>
    <p class="small">${esc(period)}${period ? ' · ' : ''}${esc(verif)}</p>
    <div class="kpis">
      ${kpi(t.num(L.events), t('logs.events'))}${kpi(t.num(fam.search || 0), t('logs.series.search'))}${kpi(t.num(L.googlebotHits), 'Googlebot')}
      ${kpi(t.num(fam.ai || 0), t('logs.series.ai'))}${kpi(t.num(L.outsidePages), t('logs.outsidePages'))}${kpi(t.num(L.statuses?.s5 || 0), t('logs.s5'))}
    </div>
    <div class="two">
      <div><h3>${esc(t('logs.bots'))}</h3><table class="mini"><thead><tr><th>${esc(t('logs.bot'))}</th><th class="r">${esc(t('logs.hits'))}</th>${V?.enabled ? `<th class="r">${esc(t('logs.spoofedCol'))}</th>` : ''}</tr></thead><tbody>${(L.bots || []).slice(0, 12).map((b) => `<tr><td>${esc(b.name)} <small>${esc(t('logs.fam.' + b.family))}</small></td><td class="r">${t.num(b.hits)}</td>${V?.enabled ? `<td class="r">${b.spoofed ? t.num(b.spoofed) : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      <div><h3>${esc(t('logs.dir'))}</h3><table class="mini"><thead><tr><th>${esc(t('logs.dir'))}</th><th class="r">${esc(t('logs.searchHits'))}</th><th class="r">${esc(t('logs.hits'))}</th></tr></thead><tbody>${(L.dirs || []).slice(0, 12).map((d) => `<tr><td class="u">${esc(d.dir)}</td><td class="r">${t.num(d.search)}</td><td class="r">${t.num(d.hits)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    ${logIssues.length ? `<h3>${esc(t('nav.issues'))}</h3><ul class="findings">${logIssues.map((i) => `<li>${chip(i.severity)} ${esc(label(i))} <small>· ${t.num(i.count)}</small></li>`).join('')}</ul>` : `<p class="small">${esc(t('report.logsNoIssue'))}</p>`}
  </section>`;
  })() : '';

  // Changements de sitemap (3.23) : décisions pour les URL retirées / ajoutées.
  const SD = R.meta.sitemapDiff;
  const smdSec = SD ? (() => {
    const c = SD.counts || {};
    const kpi = (v, l) => `<div class="kpi"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`;
    const rows = (R.sitemapChanges || []).filter((r) => ['redirect-suggested', 'gone-410', 'redirect-broken', 'error', 'live', 'added-bad', 'redirect-chain'].includes(r.decision));
    const lim = Math.max(maxUrls * 5, 25);
    return `<section class="page">
    ${SEC(sec++, t('report.sitemapChanges'))}
    <p class="intro">${esc(t('report.sitemapChangesIntro'))}</p>
    <p class="small">${esc(t('smd.metaLine', { previous: t.num(SD.previous), current: t.num(SD.current), removed: t.num(SD.removed), added: t.num(SD.added), kept: t.num(SD.kept) }))}</p>
    <div class="kpis">
      ${kpi(t.num(c['redirect-suggested'] || 0), t('smd.redirect-suggested'))}${kpi(t.num(c['gone-410'] || 0), t('smd.gone-410'))}${kpi(t.num((c['redirect-broken'] || 0) + (c.error || 0)), t('smd.redirect-broken'))}
      ${kpi(t.num(c.live || 0), t('smd.live'))}${kpi(t.num(c['added-bad'] || 0), t('smd.added-bad'))}${kpi(t.num((c['redirect-ok'] || 0) + (c['gone-ok'] || 0) + (c.noindex || 0) + (c['added-ok'] || 0)), t('smd.redirect-ok'))}
    </div>
    ${rows.length ? `<table class="urls"><thead><tr><th>URL</th><th>${esc(t('col.status'))}</th><th>${esc(t('col.decision'))}</th><th>${esc(t('col.suggestedTarget'))}</th></tr></thead><tbody>${rows.slice(0, lim).map((r) => `<tr><td class="u">${U.link(r.url)}</td><td class="r">${r.status || '—'}${r.finalStatus != null ? ` → ${r.finalStatus}` : ''}</td><td>${esc(t('smd.' + r.decision))}</td><td class="u">${U.link(r.suggest || r.finalUrl || '')}</td></tr>`).join('')}</tbody></table>${rows.length > lim ? `<p class="more">+ ${t.num(rows.length - lim)}</p>` : ''}` : `<p class="small">${esc(t('smd.nothingToDo'))}</p>`}
  </section>`;
  })() : '';

  const method = `<section class="page">
    ${SEC(sec++, t('report.methodology'))}
    <p>${esc(t('report.methodologyText'))}</p>
    <table class="mini legend"><tbody>
      ${SEV.map((s) => `<tr><td>${chip(s)}</td><td>${esc(t('report.sevDef.' + s))}</td></tr>`).join('')}
      <tr><td><span class="lvl l-high">${esc(t('impact.label'))}</span></td><td>${esc(t('report.impactDef'))}</td></tr>
      <tr><td><span class="lvl l-low">${esc(t('effort.label'))}</span></td><td>${esc(t('report.effortDef'))}</td></tr>
    </tbody></table>
    ${opts.author || opts.company || opts.contact ? `<div class="contact-card"><h3>${esc(t('report.nextSteps'))}</h3><p>${esc(t('report.nextStepsText'))}</p><p><b>${esc([opts.author, opts.company].filter(Boolean).join(' · '))}</b><br>${esc([opts.contact, opts.website].filter(Boolean).join(' · '))}</p></div>` : ''}
    <p class="gen">${esc(t('report.generatedWith'))} Arachnide SEO Spider · ${esc(date)}</p>
  </section>`;

  const footerText = [opts.company || opts.author, host].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="${esc(t.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(host || site)}</title>
<style>
${fonts.serif ? `@font-face { font-family: "Newsreader Report"; font-weight: 200 800; font-style: normal; font-display: swap; src: url(${fonts.serif}) format("woff2"); }` : ''}
${fonts.sans ? `@font-face { font-family: "Inter Report"; font-weight: 100 900; font-style: normal; font-display: swap; src: url(${fonts.sans}) format("woff2"); }` : ''}
/* Dossier d'expertise : papier à peine teinté, encre bleu-noir, une seule couleur de marque (celle du client),
   Newsreader pour les titres et les chiffres, Inter pour le texte et les tableaux. Échelle 1,25. */
:root {
  --brand: ${color};
  --paper: #fffefc; --surface: #f6f6f3; --rule: #e6e5e0; --rule-2: #d2d1cb;
  --ink: #161a24; --ink-2: #434a59; --ink-3: #626a7a;
  --ok: ${C_OK}; --warn: ${C_WARN}; --err: ${C_ERR}; --info: #2a5bb8;
  --serif: "Newsreader Report", "Iowan Old Style", "Charter", Georgia, "Times New Roman", serif;
  --sans: "Inter Report", Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --fs-cap: 10.5px; --fs-sm: 11.5px; --fs-base: 13px; --fs-lead: 15px; --fs-h3: 15.5px; --fs-h2: 27px; --fs-h1: 44px;
}
* { box-sizing: border-box; }
html { font-synthesis: none; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { margin: 0; background: #e8e7e2; color: var(--ink); font: 400 var(--fs-base)/1.55 var(--sans); -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: "cv11"; }
a { color: inherit; text-decoration: none; }
p, li, dd { text-wrap: pretty; }
h1, h2, h3, h4 { text-wrap: balance; }
.toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; justify-content: center; padding: 10px; background: var(--ink); }
.toolbar button { font: 600 13px/1 var(--sans); border: 1px solid #ffffff33; border-radius: 8px; padding: 10px 16px; cursor: pointer; background: transparent; color: #fff; }
.toolbar button.p { background: #fff; color: var(--ink); border-color: #fff; }
.toolbar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.page { background: var(--paper); width: 210mm; min-height: 297mm; margin: 18px auto; padding: 18mm 17mm; box-shadow: 0 1px 2px #0000000f, 0 8px 28px #00000012; }

/* Titres */
h1 { font: 500 var(--fs-h1)/1.02 var(--serif); letter-spacing: -.025em; margin: 0; }
h2.sec { display: grid; gap: 2px; margin: 0 0 18px; padding-bottom: 12px; border-bottom: 1px solid var(--ink); }
h2.sec .n { font: 600 var(--fs-sm)/1 var(--sans); letter-spacing: .04em; color: var(--brand); font-variant-numeric: tabular-nums; }
h2.sec .t { font: 500 var(--fs-h2)/1.1 var(--serif); letter-spacing: -.015em; }
h3 { font: 650 var(--fs-h3)/1.3 var(--sans); margin: 22px 0 8px; letter-spacing: -.005em; }
h3 small { float: right; font: 600 var(--fs-cap)/2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
h4 { margin: 0; font: 650 13.5px/1.35 var(--sans); flex: 1; }
.small { font-size: var(--fs-sm); color: var(--ink-3); }

/* Couverture */
.cover { display: flex; flex-direction: column; border-top: 3mm solid var(--brand); }
.cover-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.cover .logo { max-height: 56px; max-width: 220px; }
.brandname { font: 600 18px/1.2 var(--serif); letter-spacing: -.01em; }
.kicker { margin: 0; text-align: right; font: 600 var(--fs-cap)/1.5 var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
.kicker span { display: block; letter-spacing: .02em; text-transform: none; font-weight: 500; font-size: var(--fs-sm); }
.cover-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 18mm 0 10mm; }
.site { margin: 10px 0 0; font: 400 20px/1.3 var(--serif); color: var(--ink-2); overflow-wrap: anywhere; }
.verdict { display: grid; grid-template-columns: auto 1fr; gap: 26px; align-items: end; margin: 18mm 0 12mm; padding-top: 8mm; border-top: 1px solid var(--rule-2); }
.score { margin: 0; display: flex; align-items: baseline; gap: 6px; font-family: var(--serif); font-variant-numeric: lining-nums tabular-nums; }
.score b { font-size: 132px; line-height: .8; font-weight: 500; letter-spacing: -.05em; }
.score span { font-size: 22px; color: var(--ink-3); }
.verdict-text { padding-bottom: 6px; }
.grade { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font: 600 var(--fs-lead)/1.3 var(--sans); }
.grade-l { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: #fff; font: 600 15px/1 var(--sans); flex: none; }
.verdict-s { margin: 0; font-size: var(--fs-lead); line-height: 1.5; color: var(--ink-2); max-width: 46ch; }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--rule-2); border-bottom: 1px solid var(--rule-2); }
.facts div { padding: 12px 14px 12px 0; }
.facts div + div { padding-left: 14px; border-left: 1px solid var(--rule); }
.facts b { display: block; font: 500 28px/1.1 var(--serif); font-variant-numeric: lining-nums tabular-nums; letter-spacing: -.02em; }
.facts span, .kpi span { display: block; font-size: var(--fs-sm); color: var(--ink-3); }
.facts span::first-letter, .kpi span::first-letter { text-transform: uppercase; }
.cover-meta { display: flex; flex-wrap: wrap; gap: 14px 36px; margin: 0; padding-top: 12px; border-top: 1px solid var(--ink); }
.cover-meta dt { font: 600 var(--fs-cap)/1.4 var(--sans); text-transform: uppercase; letter-spacing: .12em; color: var(--ink-3); }
.cover-meta dd { margin: 3px 0 0; font-weight: 550; overflow-wrap: anywhere; }
.seg-scope { display: inline-flex; align-items: center; gap: 8px; margin: 10px 0 0; font-weight: 600; }
.seg-scope i, table.segs .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: 0; }

/* Synthèse */
.intro { font-size: var(--fs-lead); line-height: 1.6; color: var(--ink-2); margin: 0 0 6px; padding-left: 14px; border-left: 2px solid var(--brand); max-width: 72ch; }
.sum-grid { display: grid; grid-template-columns: 180px 1fr; gap: 24px; align-items: center; margin: 18px 0 6px; }
.sum-score { text-align: center; }
.sum-score p { margin: 6px 0 0; color: var(--ink-3); font-size: var(--fs-sm); line-height: 1.45; }
.sum-score p b { color: var(--ink); font-size: var(--fs-base); }
.gauge .g-num { font: 500 40px var(--serif); fill: var(--ink); letter-spacing: -.03em; }
.gauge .g-grade { font: 650 12px var(--sans); fill: var(--ink-3); letter-spacing: .08em; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--rule-2); }
.kpi { padding: 12px 14px 12px 0; border-bottom: 1px solid var(--rule); }
.kpi:not(:nth-child(3n + 1)) { padding-left: 14px; border-left: 1px solid var(--rule); }
.kpi b { display: block; font: 500 26px/1.15 var(--serif); letter-spacing: -.02em; font-variant-numeric: lining-nums tabular-nums; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
ul.findings, ul.strengths { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--rule-2); }
ul.findings li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid var(--rule); }
ul.findings li .r { font-variant-numeric: tabular-nums; }
ul.strengths li { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--rule); font-weight: 550; }
ul.strengths li i { font-style: normal; color: var(--ok); font-weight: 700; }
.cats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 28px; }
.cat { display: grid; grid-template-columns: 128px 1fr 46px; gap: 10px; align-items: center; font-size: 12px; padding: 3px 0; color: var(--ink-2); }
.cat b { text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
.rb { height: 6px; background: #ecebe6; border-radius: 99px; overflow: hidden; }
.rb i { display: block; height: 100%; border-radius: 99px; }

/* Pastilles */
.chip { display: inline-block; padding: 2px 8px; border-radius: 99px; font: 650 10.5px/1.45 var(--sans); letter-spacing: .01em; white-space: nowrap; border: 1px solid currentColor; background: transparent; }
.chip.error { color: var(--err); }
.chip.warning { color: var(--warn); }
.chip.notice { color: var(--info); }
.chip.ok { color: var(--ok); }
.lvl { display: inline-block; padding: 1px 7px; border-radius: 4px; font: 600 10.5px/1.5 var(--sans); background: var(--surface); color: var(--ink-2); }
.lvl.l-high { color: var(--ok); background: #e7f1ea; }
.lvl.l-medium { color: var(--info); background: #e8eef9; }

/* Tableaux */
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th:first-child, td:first-child { padding-left: 0; }
th { font: 650 var(--fs-cap)/1.3 var(--sans); text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); border-bottom: 1px solid var(--ink); }
td small { color: var(--ink-3); }
.r { text-align: right; font-variant-numeric: tabular-nums; }
.up { color: var(--ok); font-weight: 650; }
.down { color: var(--err); font-weight: 650; }
table.plan td:first-child { width: 22px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
table.plan td:nth-child(6) { width: 40%; color: var(--ink-2); }
.prio-h { display: flex; align-items: center; gap: 10px; margin: 26px 0 4px; font-size: var(--fs-h3); }
.prio-h i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.prio-h.p1 i { background: var(--err); } .prio-h.p2 i { background: var(--warn); } .prio-h.p3 i { background: var(--info); }
table.segs td { vertical-align: top; }
table.segs td:first-child { white-space: nowrap; }
table.mini td { padding: 6px 6px; }
table.mini td:first-child { padding-left: 0; }
.legend td:first-child { width: 120px; }

/* Évolution */
.evo { display: flex; gap: 28px; align-items: center; margin: 16px 0 20px; flex-wrap: wrap; }
.evo-score { display: flex; gap: 12px; align-items: baseline; font: 500 44px/1 var(--serif); font-variant-numeric: lining-nums tabular-nums; }
.evo-score span { color: var(--ink-3); }
.evo-score i { font-style: normal; color: var(--ink-3); font-size: 26px; }
.evo-score em { font: 650 14px/1 var(--sans); font-style: normal; padding: 4px 9px; border-radius: 99px; border: 1px solid currentColor; }
.evo-score em.up { color: var(--ok); } .evo-score em.down { color: var(--err); }
.evo-stats { display: flex; gap: 0; border-top: 1px solid var(--rule-2); border-bottom: 1px solid var(--rule-2); }
.evo-stats div { padding: 8px 16px; text-align: left; }
.evo-stats div + div { border-left: 1px solid var(--rule); }
.evo-stats b { display: block; font: 500 22px/1.2 var(--serif); }
.evo-stats span { font-size: var(--fs-sm); color: var(--ink-3); }

/* Analyse détaillée */
.rel-note { margin: -6px 0 6px; }
.cat-h { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 30px 0 4px; padding-bottom: 6px; border-bottom: 1px solid var(--ink); font: 500 21px/1.2 var(--serif); letter-spacing: -.01em; }
.cat-score { font: 650 12.5px/1 var(--sans); font-variant-numeric: tabular-nums; }
.issue { padding: 14px 0 12px; border-bottom: 1px solid var(--rule-2); break-inside: avoid; }
.issue header { display: flex; gap: 10px; align-items: baseline; }
.issue .count { color: var(--ink-3); font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.issue p { margin: 6px 0; color: var(--ink-2); max-width: 80ch; }
.issue p.fix { max-width: none; }
.fix { background: var(--surface); border-left: 2px solid var(--brand); padding: 8px 12px; color: var(--ink) !important; }
.urls { margin-top: 6px; }
.urls td { font-size: 11.5px; padding: 4px 8px; line-height: 1.45; }
.urls td.u { width: 38%; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.urls td.u a { color: var(--info); }
.urls td.d { color: var(--ink-2); overflow-wrap: anywhere; }
.more { font-size: var(--fs-sm); color: var(--ink-3); margin: 6px 0 0 !important; }

/* Méthodologie */
.contact-card { margin-top: 28px; border-top: 3px solid var(--brand); background: var(--surface); padding: 16px 18px; }
.contact-card h3 { margin-top: 0; font: 500 19px/1.2 var(--serif); }
.gen { margin-top: 30px; color: var(--ink-3); font-size: var(--fs-cap); text-align: center; }

@page { size: A4; margin: 14mm 14mm 16mm;
  @bottom-left { content: "${esc(footerText).replace(/"/g, '')}"; font: 500 8.5px/1 "Inter Report", Inter, system-ui, sans-serif; color: #626a7a; letter-spacing: .02em; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 500 8.5px/1 "Inter Report", Inter, system-ui, sans-serif; color: #626a7a; } }
@page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
@media print {
  body { background: #fff; }
  .toolbar { display: none; }
  .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; break-after: page; background: #fff; }
  .cover { height: 297mm; padding: 16mm 17mm 14mm; border-top-width: 4mm; }
  .page:last-child { break-after: auto; }
  h2, h3, h4, .cat-h, .prio-h { break-after: avoid; }
  tr, .kpi, .facts, .verdict { break-inside: avoid; }
}
@media screen and (max-width: 820px) {
  .page { width: auto; margin: 8px; padding: 22px 18px; min-height: 0; }
  .two, .sum-grid, .cats, .verdict { grid-template-columns: 1fr; }
  .facts { grid-template-columns: 1fr 1fr; }
  .score b { font-size: 96px; }
  h1 { font-size: 34px; }
}
</style>
</head>
<body>
<div class="toolbar"><button class="p" onclick="window.print()">${esc(t('report.print'))}</button><button id="dl">${esc(t('report.downloadHtml'))}</button></div>
${cover}${summary}${evolution}${segments}${plan}${details}${tech}${logsSec}${smdSec}${method}
<script>
document.getElementById('dl').onclick = function () {
  var doc = document.documentElement.cloneNode(true);
  var tb = doc.querySelector('.toolbar'); if (tb) tb.remove();
  var s = doc.querySelector('script'); if (s) s.remove();
  var blob = new Blob(['<!doctype html>\\n' + doc.outerHTML], { type: 'text/html' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ${JSON.stringify(`audit-seo_${host || 'site'}_${(R.meta.finishedAt || '').slice(0, 10)}.html`)}; a.click();
};
</script>
</body>
</html>`;
}
