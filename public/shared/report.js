// Rapport d'audit SEO autonome (HTML imprimable en PDF), en marque blanche et multilingue.
// Utilisé par l'interface (navigateur) et par la CLI (Node) : aucune dépendance au DOM.
import { detailText } from './i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SEV = ['error', 'warning', 'notice'];
const CAT_ORDER = ['codes', 'links', 'redirects', 'security', 'titles', 'meta', 'headings', 'content', 'images', 'directives', 'canonicals', 'sitemap', 'architecture', 'performance', 'javascript', 'url', 'markup', 'schema', 'hreflang', 'ai'];

function gaugeSvg(score, grade, color) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const col = score >= 75 ? '#138a4c' : score >= 50 ? '#c27803' : '#d92d20';
  return `<svg viewBox="0 0 130 130" width="150" height="150" aria-label="${score}/100">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="#eceff3" stroke-width="11"/>
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 65 65)"/>
    <text x="65" y="70" text-anchor="middle" font-size="34" font-weight="800" fill="#141821">${score}</text>
    <text x="65" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="${color}">${esc(grade)}</text></svg>`;
}

const bar = (pct, col) => `<div class="rb"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${col}"></i></div>`;
const scoreCol = (v) => (v >= 80 ? '#138a4c' : v >= 50 ? '#c27803' : '#d92d20');

export function buildReport(R, opts, t) {
  const color = /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color : '#5b8c1e';
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
  const cover = `<section class="cover page">
    <div class="cover-band"></div>
    <div class="cover-top">${opts.logo ? `<img class="logo" src="${esc(opts.logo)}" alt="">` : `<div class="brandname">${esc(opts.company || '')}</div>`}</div>
    <div class="cover-main">
      <p class="kicker">${esc(t('report.kicker'))}</p>
      <h1>${esc(title)}</h1>
      <p class="site">${esc(site)}</p>
      <div class="cover-score">${gaugeSvg(S.score, S.grade, color)}<div><b>${esc(t('report.healthScore'))}</b><span>${esc(t('grade.' + S.grade))}</span></div></div>
    </div>
    <dl class="cover-meta">
      ${opts.client ? `<div><dt>${esc(t('report.preparedFor'))}</dt><dd>${esc(opts.client)}</dd></div>` : ''}
      ${opts.author || opts.company ? `<div><dt>${esc(t('report.preparedBy'))}</dt><dd>${esc([opts.author, opts.company].filter(Boolean).join(' · '))}</dd></div>` : ''}
      <div><dt>${esc(t('report.date'))}</dt><dd>${esc(date)}</dd></div>
      ${opts.contact || opts.website ? `<div><dt>${esc(t('report.contact'))}</dt><dd>${esc([opts.contact, opts.website].filter(Boolean).join(' · '))}</dd></div>` : ''}
    </dl>
  </section>`;

  const findings = top.slice(0, 6).map((i) => `<li>${chip(i.severity)} <b>${esc(t('report.findingCount', { n: i.count }))}</b> — ${esc(label(i))}</li>`).join('');
  const summary = `<section class="page">
    <h2><span class="n">01</span>${esc(t('report.summary'))}</h2>
    ${opts.intro ? `<p class="intro">${esc(opts.intro).replace(/\n/g, '<br>')}</p>` : `<p class="intro">${esc(t('report.introDefault', { site: host || site, n: S.totalUrls, date }))}</p>`}
    <div class="sum-grid">
      <div class="sum-score">${gaugeSvg(S.score, S.grade, color)}<p><b>${esc(t('grade.' + S.grade))}</b><br>${esc(t('report.scoreExplain'))}</p></div>
      <div class="kpis">
        ${[['dash.urls', S.totalUrls], ['dash.html', S.htmlPages], ['dash.indexable', S.indexable], ['dash.responseTime', `${t.num(S.avgResponseTime)} ms`], ['sev.errors', S.errors], ['sev.warnings', S.warnings]]
          .map(([k, v]) => `<div class="kpi"><b>${typeof v === 'number' ? t.num(v) : esc(v)}</b><span>${esc(t(k))}</span></div>`).join('')}
      </div>
    </div>
    <div class="two">
      <div><h3>${esc(t('report.keyFindings'))}</h3><ul class="findings">${findings || `<li>${esc(t('issues.none'))}</li>`}</ul></div>
      <div><h3>${esc(t('report.strengths'))}</h3><ul class="strengths">${strengths.slice(0, 6).map((c) => `<li>✓ ${esc(t('cat.' + c))}</li>`).join('') || '<li>—</li>'}</ul></div>
    </div>
    <h3>${esc(t('dash.categories'))}</h3>
    <div class="cats">${catScores.map(([c, v]) => `<div class="cat"><span>${esc(t('cat.' + c))}</span>${bar(v, scoreCol(v))}<b>${v}%</b></div>`).join('')}</div>
  </section>`;

  const evolution = cmp ? `<section class="page">
    <h2><span class="n">02</span>${esc(t('report.evolution'))}</h2>
    <p>${esc(t('report.evolutionIntro', { date: t.date(cmp.prevDate, { dateStyle: 'long' }) }))}</p>
    <div class="evo">
      <div class="evo-score"><span>${cmp.prevScore}</span><i>→</i><b>${S.score}</b><em class="${cmp.scoreDelta >= 0 ? 'up' : 'down'}">${cmp.scoreDelta >= 0 ? '+' : ''}${cmp.scoreDelta}</em></div>
      <div class="evo-stats">
        <div><b class="up">${cmp.fixed.length}</b><span>${esc(t('report.fixed'))}</span></div>
        <div><b class="up">${cmp.improved.length}</b><span>${esc(t('report.improved'))}</span></div>
        <div><b class="down">${cmp.worsened.length}</b><span>${esc(t('report.worsened'))}</span></div>
        <div><b class="down">${cmp.appeared.length}</b><span>${esc(t('report.new'))}</span></div>
      </div>
    </div>
    <table><thead><tr><th>${esc(t('col.issue'))}</th><th>${esc(t('col.severity'))}</th><th class="r">${esc(t('report.before'))}</th><th class="r">${esc(t('report.after'))}</th><th class="r">Δ</th></tr></thead><tbody>
      ${cmp.issues.filter((i) => i.delta !== 0).slice(0, 40).map((i) => `<tr><td>${esc(t('issue.' + i.id + '.label', R.issues.find((x) => x.id === i.id)?.params || {}))}</td><td>${chip(i.severity)}</td><td class="r">${t.num(i.prev)}</td><td class="r">${t.num(i.cur)}</td><td class="r ${i.delta < 0 ? 'up' : 'down'}">${i.delta > 0 ? '+' : ''}${t.num(i.delta)}</td></tr>`).join('')}
    </tbody></table>
  </section>` : '';

  let sec = cmp ? 3 : 2;
  const planRows = (sev) => top.filter((i) => i.severity === sev);
  const plan = `<section class="page">
    <h2><span class="n">${String(sec++).padStart(2, '0')}</span>${esc(t('report.actionPlan'))}</h2>
    <p>${esc(t('report.actionPlanIntro'))}</p>
    ${SEV.map((sev, k) => {
      const rows = planRows(sev);
      if (!rows.length) return '';
      return `<h3 class="prio-h p${k + 1}">${esc(t('report.priority' + (k + 1)))}</h3>
      <table class="plan"><thead><tr><th>#</th><th>${esc(t('col.issue'))}</th><th>${esc(t('impact.label'))}</th><th>${esc(t('effort.label'))}</th><th class="r">${esc(t('col.urls'))}</th><th>${esc(t('col.fix'))}</th></tr></thead><tbody>
      ${rows.map((i, n) => `<tr><td>${n + 1}</td><td><b>${esc(label(i))}</b><br><small>${esc(t('cat.' + i.category))}</small></td><td>${lvl(i.impact)}</td><td>${lvl(i.effort)}</td><td class="r">${t.num(i.count)}</td><td>${esc(t('issue.' + i.id + '.fix', i.params))}</td></tr>`).join('')}
      </tbody></table>`;
    }).join('')}
  </section>`;

  const details = `<section class="page">
    <h2><span class="n">${String(sec++).padStart(2, '0')}</span>${esc(t('report.details'))}</h2>
    ${cats.map((c) => `<div class="catblock"><h3 class="cat-h">${esc(t('cat.' + c))} <small>${S.categoryScores?.[c] != null ? S.categoryScores[c] + '%' : ''}</small></h3>
      ${byCat.get(c).map((i) => `<article class="issue">
        <header>${chip(i.severity)}<h4>${esc(label(i))}</h4><span class="count">${esc(t('report.findingCount', { n: i.count }))}</span></header>
        <p>${esc(t('issue.' + i.id + '.desc', i.params))}</p>
        <p class="fix"><b>${esc(t('issues.howToFix'))}</b> ${esc(t('issue.' + i.id + '.fix', i.params))}</p>
        ${maxUrls ? `<table class="urls"><tbody>${i.items.slice(0, maxUrls).map((it) => `<tr><td class="u">${esc(it.url)}</td><td>${esc(detailText(it.detail, t))}</td></tr>`).join('')}</tbody></table>
        ${i.items.length > maxUrls ? `<p class="more">${esc(t('report.andMore', { n: i.items.length - maxUrls }))}</p>` : ''}` : ''}
      </article>`).join('')}</div>`).join('')}
  </section>`;

  const sb = S.statusBuckets;
  const depth = Object.entries(S.depthBuckets).sort(([a], [b]) => (a === 'n/a') - (b === 'n/a') || parseInt(a) - parseInt(b));
  const maxDepth = Math.max(1, ...depth.map(([, v]) => v));
  const tech = `<section class="page">
    <h2><span class="n">${String(sec++).padStart(2, '0')}</span>${esc(t('report.technical'))}</h2>
    <div class="two">
      <div><h3>${esc(t('dash.status'))}</h3><table class="mini"><tbody>${Object.entries(sb).filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k === 'blocked' ? t('st.blocked') : k === 'none' ? t('st.none') : k)}</td><td class="r">${t.num(v)}</td><td class="r">${S.totalUrls ? Math.round((v / S.totalUrls) * 100) : 0}%</td></tr>`).join('')}</tbody></table></div>
      <div><h3>${esc(t('dash.depth'))}</h3>${depth.map(([k, v]) => `<div class="cat"><span>${esc(k === 'n/a' ? t('dash.notLinked') : t('dash.level', { n: k }))}</span>${bar((v / maxDepth) * 100, color)}<b>${t.num(v)}</b></div>`).join('')}</div>
    </div>
    <div class="two">
      <div><h3>${esc(t('robots.bots'))}</h3><table class="mini"><tbody>${(R.meta.botAccess || []).map((b) => `<tr><td>${esc(b.bot)}</td><td>${b.allowed ? `<span class="chip ok">${esc(t('robots.allowed'))}</span>` : `<span class="chip error">${esc(t('robots.blocked'))}</span>`}</td></tr>`).join('')}</tbody></table>
        <p class="small">llms.txt : ${R.meta.llmsTxt ? '✓' : '✗'}</p></div>
      <div><h3>${esc(t('report.crawlSetup'))}</h3><table class="mini"><tbody>
        <tr><td>${esc(t('report.mode'))}</td><td>${esc(R.meta.mode === 'list' ? t('opt.modeList') : t('opt.modeSpider'))}</td></tr>
        <tr><td>${esc(t('opt.render'))}</td><td>${R.meta.rendered ? '✓' : '✗'}</td></tr>
        <tr><td>${esc(t('opt.userAgent'))}</td><td class="small">${esc(R.meta.options.userAgent)}</td></tr>
        <tr><td>${esc(t('robots.sitemaps'))}</td><td>${t.num(R.meta.sitemapFiles?.length || 0)} · ${t.num(R.meta.sitemapUrlCount)} URLs</td></tr>
        <tr><td>${esc(t('dash.indexable'))}</td><td>${t.num(S.indexable)} / ${t.num(S.htmlPages)} (${pct(S.indexable)}%)</td></tr>
        <tr><td>${esc(t('dash.words'))}</td><td>${t.num(S.avgWords)}</td></tr>
        ${R.meta.stopped ? `<tr><td colspan="2">${esc(t('dash.interrupted'))}</td></tr>` : ''}
      </tbody></table></div>
    </div>
  </section>`;

  const method = `<section class="page">
    <h2><span class="n">${String(sec++).padStart(2, '0')}</span>${esc(t('report.methodology'))}</h2>
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
:root { --brand: ${color}; }
* { box-sizing: border-box; }
body { margin: 0; background: #e9ecf0; color: #141821; font: 13.5px/1.55 Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; justify-content: center; padding: 10px; background: #141821; }
.toolbar button { font: inherit; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; background: #fff; }
.toolbar button.p { background: var(--brand); color: #fff; }
.page { background: #fff; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 18mm 16mm; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
h1 { font-size: 34px; line-height: 1.15; margin: 8px 0; letter-spacing: -.02em; }
h2 { font-size: 22px; margin: 0 0 14px; display: flex; align-items: center; gap: 12px; letter-spacing: -.01em; }
h2 .n { display: inline-grid; place-items: center; min-width: 38px; height: 38px; border-radius: 10px; background: var(--brand); color: #fff; font-size: 15px; }
h3 { font-size: 15px; margin: 20px 0 8px; }
h4 { margin: 0; font-size: 14px; flex: 1; }
.cover { position: relative; display: flex; flex-direction: column; padding-top: 30mm; overflow: hidden; }
.cover-band { position: absolute; inset: 0 0 auto 0; height: 12mm; background: var(--brand); }
.cover-top { min-height: 50px; }
.cover .logo { max-height: 60px; max-width: 220px; }
.brandname { font-size: 20px; font-weight: 800; color: var(--brand); }
.cover-main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.kicker { text-transform: uppercase; letter-spacing: .12em; font-weight: 700; color: var(--brand); margin: 0; font-size: 12px; }
.site { font-size: 18px; color: #4b5262; margin: 0 0 30px; word-break: break-all; }
.cover-score { display: flex; align-items: center; gap: 18px; }
.cover-score b, .cover-score span { display: block; }
.cover-score b { font-size: 18px; }
.cover-score span { color: #5c6374; }
.cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; border-top: 2px solid #eceff3; padding-top: 16px; margin: 0; }
.cover-meta dt { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8a91a1; font-weight: 700; }
.cover-meta dd { margin: 2px 0 0; font-weight: 600; }
.intro { font-size: 14px; color: #3b4150; background: #f6f7f9; border-left: 4px solid var(--brand); padding: 10px 14px; border-radius: 0 8px 8px 0; }
.sum-grid { display: grid; grid-template-columns: 210px 1fr; gap: 20px; align-items: center; margin: 14px 0; }
.sum-score { text-align: center; }
.sum-score p { margin: 4px 0 0; color: #5c6374; font-size: 12.5px; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.kpi { border: 1px solid #e6e9ee; border-radius: 10px; padding: 10px 12px; }
.kpi b { display: block; font-size: 22px; letter-spacing: -.02em; }
.kpi span { font-size: 12px; color: #6b7282; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
ul.findings, ul.strengths { list-style: none; padding: 0; margin: 0; }
ul.findings li, ul.strengths li { padding: 4px 0; border-bottom: 1px solid #eef0f3; }
ul.strengths li { color: #138a4c; font-weight: 600; }
.cats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
.cat { display: grid; grid-template-columns: 130px 1fr 44px; gap: 8px; align-items: center; font-size: 12px; padding: 1px 0; }
.cat b { text-align: right; }
.rb { height: 8px; background: #eef0f3; border-radius: 99px; overflow: hidden; }
.rb i { display: block; height: 100%; border-radius: 99px; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.chip.error { background: #fdecea; color: #c8261b; }
.chip.warning { background: #fdf2dc; color: #a05f00; }
.chip.notice { background: #e6eefc; color: #2563c9; }
.chip.ok { background: #e0f4e8; color: #138a4c; }
.lvl { display: inline-block; padding: 1px 7px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #f0f2f5; color: #5c6374; }
.lvl.l-high { background: #e0f4e8; color: #138a4c; }
.lvl.l-medium { background: #e6eefc; color: #2563c9; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #eceff3; vertical-align: top; }
th { background: #f5f6f8; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7282; }
td small { color: #7b8292; }
.r { text-align: right; font-variant-numeric: tabular-nums; }
.up { color: #138a4c; font-weight: 700; }
.down { color: #c8261b; font-weight: 700; }
table.plan td:nth-child(6) { width: 40%; color: #3b4150; }
.prio-h { padding: 6px 10px; border-radius: 8px; color: #fff; font-size: 13px; }
.prio-h.p1 { background: #d92d20; } .prio-h.p2 { background: #c27803; } .prio-h.p3 { background: #2563c9; }
.evo { display: flex; gap: 24px; align-items: center; margin: 14px 0 18px; flex-wrap: wrap; }
.evo-score { display: flex; gap: 10px; align-items: baseline; font-size: 34px; font-weight: 800; }
.evo-score span { color: #9aa1b0; }
.evo-score i { font-style: normal; color: #9aa1b0; font-size: 24px; }
.evo-score em { font-style: normal; font-size: 16px; padding: 2px 8px; border-radius: 99px; background: #f0f2f5; }
.evo-stats { display: flex; gap: 10px; }
.evo-stats div { border: 1px solid #e6e9ee; border-radius: 10px; padding: 8px 12px; text-align: center; }
.evo-stats b { display: block; font-size: 20px; }
.evo-stats span { font-size: 11.5px; color: #6b7282; }
.catblock { break-inside: auto; }
.cat-h { border-bottom: 2px solid var(--brand); padding-bottom: 4px; margin-top: 26px; }
.cat-h small { color: #7b8292; font-weight: 600; }
.issue { border: 1px solid #e6e9ee; border-radius: 10px; padding: 12px 14px; margin: 10px 0; break-inside: avoid; }
.issue header { display: flex; gap: 10px; align-items: center; }
.issue .count { color: #6b7282; font-size: 12px; font-weight: 600; white-space: nowrap; }
.issue p { margin: 6px 0; }
.fix { background: #f4f8ee; border-radius: 8px; padding: 7px 10px; }
.urls td { font-size: 11.5px; padding: 4px 6px; }
.urls td.u { word-break: break-all; width: 55%; color: #2563c9; }
.more { font-size: 11.5px; color: #7b8292; }
table.mini td { padding: 5px 6px; }
.small { font-size: 11.5px; color: #6b7282; }
.legend td:first-child { width: 120px; }
.contact-card { margin-top: 24px; border: 2px solid var(--brand); border-radius: 12px; padding: 14px 18px; }
.contact-card h3 { margin-top: 0; color: var(--brand); }
.gen { margin-top: 30px; color: #9aa1b0; font-size: 11px; text-align: center; }
@page { size: A4; margin: 12mm 12mm 14mm; @bottom-left { content: "${esc(footerText).replace(/"/g, '')}"; font-size: 9px; color: #9aa1b0; } @bottom-right { content: counter(page) " / " counter(pages); font-size: 9px; color: #9aa1b0; } }
@page :first { @bottom-left { content: none; } @bottom-right { content: none; } }
@media print {
  body { background: #fff; }
  .toolbar { display: none; }
  .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; break-after: page; }
  .cover { height: 262mm; min-height: 0; padding-top: 18mm; }
  .cover-band { height: 8mm; }
  .page:last-child { break-after: auto; }
  h3, h4 { break-after: avoid; }
  tr { break-inside: avoid; }
}
@media screen and (max-width: 820px) { .page { width: auto; margin: 8px; padding: 18px; } .two, .sum-grid, .cats { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="toolbar"><button class="p" onclick="window.print()">${esc(t('report.print'))}</button><button id="dl">${esc(t('report.downloadHtml'))}</button></div>
${cover}${summary}${evolution}${plan}${details}${tech}${method}
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
