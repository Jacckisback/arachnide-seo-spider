// Analyse de logs (journaux d'accès du serveur) : import en flux vers le serveur, chronologie, résumé par robot,
// tableau des URL vues par les robots. Les événements ne viennent jamais dans le navigateur : il reçoit l'agrégat.
let C = {}; // { t, esc, icon, num, toast, state, render, fetchLight, loadResult, openIssue }
const $ = (s, r = document) => r.querySelector(s);
const T = (k, p) => C.t()(k, p);
const esc = (s) => C.esc(s);
const num = (v) => C.num(v);

// Couleurs des séries (validées pour la vision des couleurs dans les deux thèmes) : moteurs, IA, autres robots, visiteurs.
const SERIES = [
  { k: 'search', light: '#3f6a12', dark: '#6aa825' },
  { k: 'ai', light: '#6d28d9', dark: '#9b7cf0' },
  { k: 'bots', light: '#b45309', dark: '#bd8120' },
  { k: 'human', light: '#1d4ed8', dark: '#4a8ee8' },
];
const isDark = () => document.documentElement.dataset.theme !== 'light';
const color = (s) => (isDark() ? s.dark : s.light);
const daySeries = (d) => ({ search: d.search, ai: d.ai, bots: d.seo + d.social + d.monitor + d.other, human: d.human });

const fmtDate = (iso) => (iso ? T.lang && C.t().date ? C.t().date(iso) : iso.slice(0, 10) : '—');
const kb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

// ---- Chronologie : barres empilées par jour (un total par jour, quatre parts), survol = détail du jour ----
export function timelineSvg(days, { width = 720, height = 180 } = {}) {
  if (!days?.length) return '';
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const max = Math.max(1, ...days.map((d) => d.total));
  const step = W / days.length;
  const bw = Math.max(2, Math.min(28, step - 2));
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const bars = days.map((d, i) => {
    const s = daySeries(d);
    let y = pad.t + H;
    const parts = SERIES.map((sr) => {
      const h = (s[sr.k] / max) * H;
      y -= h;
      return `<rect x="${(pad.l + i * step + (step - bw) / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h - (h > 2 ? 1 : 0)).toFixed(1)}" fill="${color(sr)}" rx="${h > 6 ? 1.5 : 0}"/>`;
    }).join('');
    return `<g class="lg-bar" data-day="${esc(d.day)}" data-total="${d.total}" data-search="${s.search}" data-ai="${s.ai}" data-bots="${s.bots}" data-human="${s.human}"><rect x="${(pad.l + i * step).toFixed(1)}" y="${pad.t}" width="${step.toFixed(1)}" height="${H}" fill="transparent"/>${parts}</g>`;
  });
  const labelEvery = Math.ceil(days.length / Math.max(1, Math.floor(W / 64)));
  const labels = days.map((d, i) => (i % labelEvery === 0 || i === days.length - 1 ? `<text x="${(pad.l + i * step + step / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" class="lg-axis">${esc(d.day.slice(5))}</text>` : '')).join('');
  const grid = ticks.map((v) => { const y = pad.t + H - (v / max) * H; return `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="lg-grid"/><text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="lg-axis">${num(v)}</text>`; }).join('');
  return `<svg class="lg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(T('logs.timeline'))}">${grid}${bars.join('')}${labels}</svg>`;
}

const legendHtml = () => `<div class="lg-legend">${SERIES.map((s) => `<span><i style="background:${color(s)}"></i>${esc(T('logs.series.' + s.k))}</span>`).join('')}</div>`;

// ---- En-tête de l'onglet : résumé, robots, chronologie ----
function summaryHtml(L) {
  const kpi = (v, l, cls = '') => `<div class="lg-kpi ${cls}"><b>${v}</b><span>${esc(l)}</span></div>`;
  const V = L.verification || {};
  const verif = V.enabled ? T('logs.verified', { ok: num(V.verified), spoofed: num(V.spoofed) }) : T('logs.notVerified');
  const topBots = (L.bots || []).slice(0, 8);
  return `<div class="lg-head">
    <div class="lg-kpis">
      ${kpi(num(L.events), T('logs.events'))}
      ${kpi(num(L.googlebotHits), 'Googlebot')}
      ${kpi(num(L.botHits - L.googlebotHits), T('logs.otherBots'))}
      ${kpi(num(L.human), T('logs.humans'))}
      ${kpi(num(L.outsidePages), T('logs.outsidePages'), L.outsidePages ? 'warn' : '')}
      ${kpi(num(L.statuses.s5), T('logs.s5'), L.statuses.s5 ? 'err' : '')}
    </div>
    <p class="muted small">${esc(T('logs.periodLine', { start: fmtDate(L.period?.start), end: fmtDate(L.period?.end), days: L.period?.days || 0, files: (L.files || []).length, format: L.format || '?' }))} · ${esc(verif)}${L.otherHost ? ` · ${esc(T('logs.otherHost', { n: num(L.otherHost) }))}` : ''}${L.overflow ? ` · ${esc(T('logs.overflow', { n: num(L.overflow) }))}` : ''}</p>
    <div class="lg-grid">
      <div class="card lg-card"><h3>${C.icon('trend')} ${esc(T('logs.timeline'))}</h3>${timelineSvg(L.timeline)}${legendHtml()}<div class="lg-tip" hidden></div>
        <details class="lg-table"><summary>${esc(T('logs.timelineTable'))}</summary><table class="mini"><thead><tr><th>${esc(T('logs.day'))}</th><th class="num">${esc(T('logs.events'))}</th><th class="num">${esc(T('logs.series.search'))}</th><th class="num">Googlebot</th><th class="num">${esc(T('logs.series.ai'))}</th><th class="num">${esc(T('logs.series.bots'))}</th><th class="num">${esc(T('logs.series.human'))}</th><th class="num">4xx</th><th class="num">5xx</th></tr></thead><tbody>${L.timeline.map((d) => { const s = daySeries(d); return `<tr><td>${esc(d.day)}</td><td class="num">${num(d.total)}</td><td class="num">${num(s.search)}</td><td class="num">${num(d.googlebot)}</td><td class="num">${num(s.ai)}</td><td class="num">${num(s.bots)}</td><td class="num">${num(s.human)}</td><td class="num">${num(d.s4)}</td><td class="num">${num(d.s5)}</td></tr>`; }).join('')}</tbody></table></details>
      </div>
      <div class="card lg-card"><h3>${C.icon('spider')} ${esc(T('logs.bots'))}</h3>
        <table class="mini"><thead><tr><th>${esc(T('logs.bot'))}</th><th class="num">${esc(T('logs.hits'))}</th><th class="num">IP</th><th class="num">${esc(T('logs.spoofedCol'))}</th></tr></thead><tbody>${topBots.map((b) => `<tr><td><span class="chip ${b.family === 'search' ? 'ok' : b.family === 'ai' ? 'info' : 'muted'}">${esc(T('logs.fam.' + b.family))}</span> ${esc(b.name)}</td><td class="num">${num(b.hits)}</td><td class="num">${num(b.ips)}</td><td class="num">${b.spoofed ? `<span class="chip warning">${num(b.spoofed)}</span>` : '—'}</td></tr>`).join('')}</tbody></table>
        <table class="mini lg-dirs"><thead><tr><th>${esc(T('logs.dir'))}</th><th class="num">${esc(T('logs.searchHits'))}</th><th class="num">${esc(T('logs.hits'))}</th></tr></thead><tbody>${(L.dirs || []).slice(0, 8).map((d) => `<tr><td class="mono">${esc(d.dir)}</td><td class="num">${num(d.search)}</td><td class="num">${num(d.hits)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>
    <div class="lg-actions"><button class="btn small" id="lgMore">${C.icon('upload')} ${esc(T('logs.addMore'))}</button><button class="btn small ghost" id="lgRemove">${C.icon('x')} ${esc(T('logs.remove'))}</button></div>
  </div>`;
}

// ---- Import : zone de dépôt, format, vérification, progression ----
function importHtml(pending) {
  return `<div class="lg-import card">
    <h3>${C.icon('upload')} ${esc(T('logs.importTitle'))}</h3>
    <p class="muted">${esc(T('logs.importHelp'))}</p>
    <div class="lg-drop" id="lgDrop" tabindex="0">${C.icon('upload')} <span>${esc(T('logs.dropHint'))}</span><input type="file" id="lgFiles" multiple accept=".log,.txt,.gz,.json,.jsonl,.ndjson,.csv,text/plain,application/gzip" hidden></div>
    <div class="lg-opts">
      <label>${esc(T('logs.format'))} <select id="lgFormat"><option value="auto">${esc(T('logs.formatAuto'))}</option><option value="combined">Apache / Nginx combined</option><option value="common">Apache common</option><option value="w3c">W3C / IIS / CloudFront</option><option value="json">JSON lines</option><option value="custom">${esc(T('logs.formatCustom'))}</option></select></label>
      <label id="lgCustomWrap" hidden class="span2">${esc(T('logs.customFormat'))} <input id="lgCustom" type="text" class="mono" placeholder='$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"' spellcheck="false"></label>
      <label class="check"><input type="checkbox" id="lgVerify" checked> ${esc(T('logs.verify'))}</label>
    </div>
    <div class="lg-progress" id="lgProgress" hidden></div>
    <div class="lg-pending" id="lgPending">${pending ? pendingHtml(pending) : ''}</div>
    <div class="lg-actions"><button class="btn primary" id="lgApply" ${pending?.events ? '' : 'disabled'}>${C.icon('check')} ${esc(T('logs.apply'))}</button><button class="btn small ghost" id="lgReset" ${pending ? '' : 'hidden'}>${esc(T('logs.reset'))}</button></div>
  </div>`;
}
const pendingHtml = (p) => `<p class="small">${esc(T('logs.pendingLine', { files: (p.files || []).length, events: num(p.events), bots: num(p.bots), urls: num(p.urls), format: p.format || '?' }))}${p.period ? ` · ${esc(fmtDate(p.period.start))} → ${esc(fmtDate(p.period.end))}` : ''}</p><ul class="lg-files">${(p.files || []).map((f) => `<li><code>${esc(f.name)}</code> · ${esc(f.format)} · ${num(f.parsed)} ${esc(T('logs.lines'))}${f.skipped ? ` · ${num(f.skipped)} ${esc(T('logs.skipped'))}` : ''}</li>`).join('')}</ul>`;

async function api(u, o) {
  const r = await fetch(u, o);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.key ? T(j.key) : j.error || r.statusText), { key: j.key, sample: j.sample });
  return j;
}

let pendingState = null;
export async function refreshPending() {
  try {
    const s = await api('/api/logs');
    pendingState = s.pending;
  } catch {
    pendingState = null;
  }
  return pendingState;
}

// Téléversement d'un fichier : le corps de la requête est le fichier (gzip reconnu côté serveur), lu en flux.
async function upload(file, { format, custom }) {
  const q = new URLSearchParams({ name: file.name, format, custom });
  return api('/api/logs/import?' + q, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file });
}

function wireImport(view) {
  const files = $('#lgFiles', view);
  const drop = $('#lgDrop', view);
  const fmt = $('#lgFormat', view);
  const custom = $('#lgCustom', view);
  fmt.addEventListener('change', () => ($('#lgCustomWrap', view).hidden = fmt.value !== 'custom'));
  const run = async (list) => {
    if (!list.length) return;
    const prog = $('#lgProgress', view);
    prog.hidden = false;
    for (const f of list) {
      prog.innerHTML = `<span class="spin">${C.icon('spider')}</span> ${esc(T('logs.parsing', { name: f.name }))} <span id="lgLines"></span>`;
      try {
        const r = await upload(f, { format: fmt.value, custom: custom.value });
        pendingState = r.pending;
        $('#lgPending', view).innerHTML = pendingHtml(r.pending);
        $('#lgApply', view).disabled = !r.pending.events;
        $('#lgReset', view).hidden = false;
        C.toast(T('logs.fileDone', { name: f.name, n: num(r.file.parsed), format: r.file.format }), 'ok');
      } catch (e) {
        C.toast(`${f.name}: ${e.message}${e.sample ? ' — ' + e.sample[0]?.slice(0, 80) : ''}`, 'error');
      }
    }
    prog.hidden = true;
  };
  drop.addEventListener('click', () => files.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); files.click(); } });
  files.addEventListener('change', () => run([...files.files]).then(() => (files.value = '')));
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => run([...e.dataTransfer.files]));
  $('#lgApply', view).addEventListener('click', async () => {
    const btn = $('#lgApply', view);
    btn.disabled = true;
    const prog = $('#lgProgress', view);
    prog.hidden = false;
    prog.innerHTML = `<span class="spin">${C.icon('spider')}</span> ${esc($('#lgVerify', view).checked ? T('logs.verifying') : T('logs.applying'))} <span id="lgLines"></span>`;
    try {
      await api('/api/logs/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verify: $('#lgVerify', view).checked }) });
      pendingState = null;
      await C.loadResult(await C.fetchLight(), { file: C.state().file });
      C.toast(T('logs.applied'), 'ok');
    } catch (e) {
      C.toast(e.message, 'error');
      btn.disabled = false;
      prog.hidden = true;
    }
  });
  $('#lgReset', view).addEventListener('click', async () => {
    await api('/api/logs/reset', { method: 'POST' }).catch(() => {});
    pendingState = null;
    C.render();
  });
}

function wireSummary(view) {
  $('#lgRemove', view)?.addEventListener('click', async () => {
    if (!confirm(T('logs.removeConfirm'))) return;
    await api('/api/logs', { method: 'DELETE' });
    await C.loadResult(await C.fetchLight(), { file: C.state().file });
    C.toast(T('logs.removed'), 'ok');
  });
  $('#lgMore', view)?.addEventListener('click', () => { C.state().logsImport = true; C.render(); });
  // Survol de la chronologie : le détail du jour.
  const tip = $('.lg-tip', view);
  view.querySelectorAll('.lg-bar').forEach((g) => {
    g.addEventListener('mouseenter', () => {
      const d = g.dataset;
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(d.day)}</b> · ${num(d.total)} ${esc(T('logs.events').toLowerCase())}<br>${SERIES.map((s) => `<i style="background:${color(s)}"></i>${esc(T('logs.series.' + s.k))} ${num(d[s.k])}`).join(' · ')}`;
    });
    g.addEventListener('mouseleave', () => (tip.hidden = true));
  });
}

// Rend l'en-tête de l'onglet (import ou résumé) dans `view` et renvoie le conteneur du tableau (ou null sans logs).
export function renderLogsHead(view, R) {
  const L = R?.meta?.logs;
  const st = C.state();
  if (!L || st.logsImport) {
    view.innerHTML = `<div class="toolbar"><div class="tb-title"><h2>${esc(T('tab.logs'))}</h2><p class="help">${esc(T('help.logs'))}</p></div>${L ? `<div class="tb-actions"><button class="btn small" id="lgBack">${esc(T('logs.back'))}</button></div>` : ''}</div>${importHtml(pendingState)}`;
    wireImport(view);
    $('#lgBack', view)?.addEventListener('click', () => { st.logsImport = false; C.render(); });
    if (pendingState === null) refreshPending().then((p) => { if (p && $('#lgPending', view)) { $('#lgPending', view).innerHTML = pendingHtml(p); $('#lgApply', view).disabled = !p.events; $('#lgReset', view).hidden = false; } });
    return null;
  }
  view.innerHTML = summaryHtml(L) + '<div id="lgTable"></div>';
  wireSummary(view);
  return $('#lgTable', view);
}

// Carte du tableau de bord.
export function logsCardHtml(R) {
  const L = R?.meta?.logs;
  if (!L) return `<section class="card seg-card lg-dash"><h2>${C.icon('upload')} ${esc(T('logs.title'))}</h2><p class="muted">${esc(T('logs.dashInvite'))}</p><button class="btn small" data-go-logs>${esc(T('logs.importTitle'))}</button></section>`;
  const issues = (R.issues || []).filter((i) => i.id.startsWith('log-'));
  return `<section class="card seg-card lg-dash"><h2>${C.icon('upload')} ${esc(T('logs.title'))} <span class="muted small">${esc(T('logs.periodShort', { days: L.period?.days || 0 }))}</span></h2>
    <div class="lg-kpis compact">
      <div class="lg-kpi"><b>${num(L.googlebotHits)}</b><span>Googlebot</span></div>
      <div class="lg-kpi"><b>${num(L.botHits)}</b><span>${esc(T('logs.botHits'))}</span></div>
      <div class="lg-kpi ${L.outsidePages ? 'warn' : ''}"><b>${num(L.outsidePages)}</b><span>${esc(T('logs.outsidePages'))}</span></div>
      <div class="lg-kpi ${L.verification?.spoofed ? 'warn' : ''}"><b>${num(L.verification?.spoofed || 0)}</b><span>${esc(T('logs.spoofedCol'))}</span></div>
    </div>
    ${timelineSvg(L.timeline, { width: 720, height: 120 })}${legendHtml()}
    ${issues.length ? `<ul class="lg-issues">${issues.map((i) => `<li><button class="link" data-go-issue="${esc(i.id)}"><span class="chip ${i.severity}">${num(i.count)}</span> ${esc(T('issue.' + i.id + '.label', i.params))}</button></li>`).join('')}</ul>` : ''}
  </section>`;
}
export function wireLogsCard(root) {
  root.querySelector('[data-go-logs]')?.addEventListener('click', () => C.goTab('logs'));
  root.querySelectorAll('[data-go-issue]').forEach((b) => b.addEventListener('click', () => C.openIssue(b.dataset.goIssue)));
}

export function initLogs(ctx) {
  C = ctx;
  // Progression envoyée par le serveur pendant l'import / la vérification.
  ctx.onLogsEvent((d) => {
    const el = document.getElementById('lgLines');
    if (!el) return;
    if (d.phase === 'parsing') el.textContent = T('logs.progressLines', { n: num(d.lines) });
    else if (d.phase === 'verifying') el.textContent = T('logs.progressIps', { done: num(d.done), total: num(d.total) });
  });
}
