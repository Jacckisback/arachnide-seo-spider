// Interface « Corriger en 1 clic » : paramètres IA, revue des corrections, application, historique.
// Le navigateur ne parle qu'au serveur local ; la clé API ne revient jamais du serveur.
let C = null; // contexte fourni par app.js : { t: () => t, esc, icon, toast, getResult }
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const T = (k, p) => C.t()(k, p);
export const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { key: j.key, data: j });
  return j;
};

// ---------- Paramètres > IA ----------
let aiState = null;
function renderAiSettings() {
  const id = $('#aiProvider').value;
  const p = aiState.providers[id];
  $('#aiModelList').innerHTML = p.models.map((m) => `<option value="${C.esc(m.id)}">${C.esc(m.label)}</option>`).join('');
  $('#aiModel').value = p.model;
  $('#aiKey').value = '';
  $('#aiKey').placeholder = p.hasKey ? '••••••••••••' : id === 'anthropic' ? 'sk-ant-…' : 'sk-…';
  $('#aiKeyState').textContent = p.fromEnv ? T('ai.keyEnv') : p.hasKey ? T('ai.keySaved') : T('ai.keyMissing');
  $('#aiForget').hidden = !p.hasKey || p.fromEnv;
}

async function loadAiSettings() {
  aiState = await api('/api/ai/settings');
  $('#aiProvider').value = aiState.provider;
  renderAiSettings();
}

async function saveAi() {
  const id = $('#aiProvider').value;
  const key = $('#aiKey').value.trim();
  aiState = await api('/api/ai/settings', { provider: id, providers: { [id]: { model: $('#aiModel').value, ...(key ? { apiKey: key } : {}) } } });
  renderAiSettings();
  return aiState;
}

function initAiSettings() {
  $('#aiProvider').addEventListener('change', renderAiSettings);
  $('#aiSave').addEventListener('click', async () => {
    try {
      await saveAi();
      $('#aiStatus').textContent = T('ai.saved');
    } catch (e) {
      $('#aiStatus').textContent = e.message;
    }
  });
  $('#aiTest').addEventListener('click', async () => {
    $('#aiStatus').textContent = T('ai.testing');
    try {
      await saveAi();
      const r = await api('/api/ai/test', { provider: $('#aiProvider').value });
      if (r.ok && r.models?.length) {
        // Liste des modèles disponibles pour ce compte : proposée dans le champ Modèle.
        $('#aiModelList').innerHTML = r.models.map((m) => `<option value="${C.esc(m.id)}">${C.esc(m.label)}</option>`).join('');
      }
      $('#aiStatus').textContent = r.ok ? T('ai.ok', { n: r.models?.length || 0 }) : T('ai.err.' + (r.error === 'no_key' || r.error === 'invalid_key' ? r.error : 'other'), { error: r.error });
    } catch (e) {
      $('#aiStatus').textContent = e.message;
    }
  });
  $('#aiForget').addEventListener('click', async () => {
    const id = $('#aiProvider').value;
    aiState = await api('/api/ai/settings', { providers: { [id]: { apiKey: null } } });
    renderAiSettings();
  });
}

export async function initFix(ctx) {
  C = ctx;
  initAiSettings();
  await loadAiSettings().catch(() => {});
}
export const refreshFixTexts = () => aiState && renderAiSettings();

// ---------- Onglet « Corriger » ----------
const FS = { catalog: null, fixes: [], open: null, filter: null, selected: new Set(), busy: null, view: null };
const LIMITS = { seo_title: [50, 60], meta_description: [140, 160], h1: [20, 70], image_alt: [5, 125] };
const METHOD_CHIP = { ai: 'chip info', deterministic: 'chip ok', manual: 'chip muted' };
const issueLabel = (g) => T('issue.' + g.id + '.label', g.params || {});
const esc = (v) => C.esc(v);

async function loadFixData() {
  [FS.catalog, { fixes: FS.fixes }] = await Promise.all([api('/api/fix/catalog'), api('/api/fix/list')]);
}

let es = null;
function listen() {
  if (es) return;
  es = new EventSource('/api/events');
  es.addEventListener('fix-progress', (e) => {
    const d = JSON.parse(e.data);
    FS.busy = { ...FS.busy, done: d.done, total: d.total };
    paintProgress();
  });
  es.addEventListener('fix-done', async (e) => {
    const d = JSON.parse(e.data);
    FS.busy = null;
    if (d.error) C.toast(d.code === 'no_provider' ? T('fix.noProvider') : d.error, 'error');
    else C.toast(T('fix.generated', { n: d.count }) + (d.errors?.length ? ' · ' + T('fix.someErrors', { n: d.errors.length }) : ''), d.errors?.length ? 'info' : 'ok');
    await loadFixData();
    paint();
  });
}

function paintProgress() {
  const el = $('#fixProgress');
  if (!el) return;
  el.hidden = !FS.busy;
  if (FS.busy) el.innerHTML = `<div class="bar"><span style="width:${FS.busy.total ? Math.round((FS.busy.done / FS.busy.total) * 100) : 5}%"></span></div><div class="progress-text">${esc(T('fix.generating', { done: FS.busy.done || 0, total: FS.busy.total || '…' }))}</div>`;
}

export async function renderFixTab(view) {
  FS.view = view;
  listen();
  view.innerHTML = `<div class="empty">${esc(T('fix.loading'))}</div>`;
  try {
    await loadFixData();
  } catch (e) {
    view.innerHTML = `<div class="banner warn">${C.icon('alert')} ${esc(e.message)}</div>`;
    return;
  }
  paint();
}

function simulationBanner() {
  const sim = FS.catalog.ai.simulation;
  return `<div class="banner ${sim ? 'info' : 'warn'} fix-sim">${C.icon(sim ? 'shield' : 'alert')}
    <span>${esc(T(sim ? 'fix.simOn' : 'fix.simOff'))}</span>
    <label class="switch"><input type="checkbox" id="fixSim" ${sim ? 'checked' : ''}> ${esc(T('fix.simLabel'))}</label></div>`;
}

function headerBar() {
  const prov = FS.catalog.provider;
  const conn = FS.catalog.connection;
  return `<div class="toolbar"><div class="tb-title"><h2>${C.icon('wand')} ${esc(T('tab.fix'))}</h2><p class="help">${esc(T('fix.intro'))}</p></div>
    <div class="tb-actions">
      <span class="chip ${prov ? 'ok' : 'warn'}" title="${esc(T('cfg.ai'))}">${esc(prov ? `${prov.id === 'anthropic' ? 'Claude' : 'ChatGPT'} · ${prov.model}` : T('fix.noProviderShort'))}</span>
      <button class="btn" id="fixConn">${C.icon('link')} ${esc(T('fix.conn.' + conn.type))}</button>
      <button class="btn" id="fixAi">${C.icon('settings')} ${esc(T('cfg.ai'))}</button>
    </div></div>`;
}

const fixesOf = (id) => FS.fixes.filter((f) => f.issueType === id && f.status !== 'ignored');
const pendingOf = (id) => fixesOf(id).filter((f) => ['proposed', 'edited', 'approved', 'failed'].includes(f.status));

function groupsTable() {
  const R = C.getResult();
  const rows = FS.catalog.groups.map((g) => {
    const pend = pendingOf(g.id).length;
    const issue = R.issues.find((i) => i.id === g.id);
    const open = FS.open === g.id;
    const est = g.estimate && g.estimate.requests ? `<small class="muted">${esc(T('fix.estimate', { n: g.estimate.requests, cost: g.estimate.usd.toFixed(g.estimate.usd < 0.1 ? 3 : 2) }))}</small>` : '';
    const action = g.method === 'manual' ? `<button class="btn small" data-plan="${g.id}">${esc(T('fix.plan'))}</button>` : `<button class="btn small primary" data-all="${g.id}">${C.icon('wand')} ${esc(T('fix.fixAll'))}</button>`;
    const urls = open
      ? `<tr class="fix-urls"><td colspan="6"><ul>${[...new Set(issue.items.map((it) => it.url))].slice(0, 200).map((u) => `<li><code>${esc(u)}</code>${g.method !== 'manual' ? ` <button class="btn tiny" data-one="${g.id}" data-url="${esc(u)}">${esc(T('fix.fix'))}</button>` : ''}</li>`).join('')}</ul></td></tr>`
      : '';
    return `<tr class="${open ? 'open' : ''}"><td><button class="link" data-open="${g.id}">${C.icon(open ? 'chevronLeft' : 'chevronRight')} ${esc(issueLabel(g))}</button></td>
      <td><span class="chip ${g.severity}">${esc(T('sev.' + g.severity))}</span></td><td class="r">${g.count}</td>
      <td><span class="${METHOD_CHIP[g.method]}">${esc(T('fix.method.' + g.method))}</span></td>
      <td>${pend ? `<button class="link" data-review="${g.id}">${esc(T('fix.toReview', { n: pend }))}</button>` : ''} ${est}</td><td class="r">${action}</td></tr>${urls}`;
  });
  return `<div class="card"><table class="fix-groups"><thead><tr><th>${esc(T('col.issue'))}</th><th>${esc(T('col.severity'))}</th><th class="r">${esc(T('fix.pages'))}</th><th>${esc(T('fix.how'))}</th><th>${esc(T('fix.review'))}</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

async function generate(issueIds, urls) {
  const prov = FS.catalog.provider;
  const needsAi = FS.catalog.groups.some((g) => issueIds.includes(g.id) && g.method === 'ai');
  if (needsAi && !prov) return C.toast(T('fix.noProvider'), 'error');
  if (needsAi && !urls) {
    const g = FS.catalog.groups.find((x) => issueIds.includes(x.id));
    if (g?.estimate && !confirm(T('fix.confirmBatch', { n: g.estimate.requests, cost: g.estimate.usd.toFixed(3), model: prov.model }))) return;
  }
  FS.busy = { done: 0, total: 0 };
  paintProgress();
  try {
    await api('/api/fix/propose', { issueIds, urls, lang: C.t().lang });
    FS.filter = issueIds.length === 1 ? issueIds[0] : null;
  } catch (e) {
    FS.busy = null;
    paintProgress();
    C.toast(e.message, 'error');
  }
}

const TEXT_KINDS = new Set(['seo_title', 'meta_description', 'h1', 'image_alt', 'json_ld', 'redirect', 'canonical', 'link']);
const rationaleText = (f) => (/^(fix\.r\.|issue\.)/.test(f.rationale) ? T(f.rationale) : f.rationale);
const show = (v) => (v === true ? 'noindex' : v === false ? 'index' : v == null || v === '' ? '—' : String(v));

function counter(kind, v) {
  const lim = LIMITS[kind];
  if (!lim || typeof v !== 'string') return '';
  const n = v.length;
  return `<span class="fix-count ${n < lim[0] || n > lim[1] ? 'warn' : 'ok'}">${esc(T('fix.chars', { n, min: lim[0], max: lim[1] }))}</span>`;
}

function fixCard(f) {
  const editable = ['proposed', 'edited', 'approved', 'failed'].includes(f.status) && TEXT_KINDS.has(f.target.kind);
  const plan = f.target.kind === 'action_plan';
  const after = plan
    ? `<div class="fix-plan">${esc(f.newValue || T(f.rationale)).replace(/\n/g, '<br>')}</div>`
    : editable
      ? `<textarea data-edit="${f.id}" rows="${f.target.kind === 'json_ld' ? 8 : 2}" class="${f.target.kind === 'json_ld' ? 'mono' : ''}">${esc(f.newValue ?? '')}</textarea>${counter(f.target.kind, f.newValue)}`
      : `<div class="fix-val">${esc(show(f.newValue))}</div>`;
  return `<div class="fix-card status-${f.status}" data-id="${f.id}">
    <div class="fix-head">${plan ? '' : `<input type="checkbox" data-sel="${f.id}" ${FS.selected.has(f.id) ? 'checked' : ''}>`}
      <a href="${esc(f.url)}" target="_blank" rel="noopener" class="fix-url">${esc(f.url)}</a>
      <span class="chip muted">${esc(T('fix.kind.' + f.target.kind))}</span>${f.target.selector ? `<code class="fix-sel">${esc(f.target.selector)}</code>` : ''}
      <span class="spacer"></span><span class="chip ${f.status === 'failed' ? 'error' : f.status === 'approved' ? 'ok' : 'muted'}">${esc(T('fix.status.' + f.status))}</span></div>
    ${plan ? after : `<div class="fix-ba"><div><h5>${esc(T('fix.before'))}</h5><div class="fix-val old">${esc(f.target.kind === 'redirect' && f.oldValue == null ? T('fix.status404') : show(f.oldValue))}</div>${counter(f.target.kind, f.oldValue)}</div><div><h5>${esc(T('fix.after'))}</h5>${after}</div></div>`}
    <div class="fix-foot"><span class="muted">${f.method === 'ai' ? esc(T('fix.byAi', { p: f.provider === 'openai' ? 'ChatGPT' : 'Claude', c: Math.round(f.confidence * 100) })) : esc(T('fix.method.' + f.method))}${f.rationale ? ' · ' + esc(rationaleText(f)) : ''}${f.error ? ` · <b class="err">${esc(f.error)}</b>` : ''}</span>
      <span class="spacer"></span>${plan ? '' : `${f.method === 'ai' ? `<button class="btn tiny" data-regen="${f.id}">${esc(T('fix.regen'))}</button>` : ''}<button class="btn tiny" data-ignore="${f.id}">${esc(T('fix.ignore'))}</button>${f.status !== 'approved' ? `<button class="btn tiny primary" data-approve="${f.id}">${C.icon('check')} ${esc(T('fix.approve'))}</button>` : ''}`}</div></div>`;
}

function reviewPanel() {
  const list = FS.fixes.filter((f) => ['proposed', 'edited', 'approved', 'failed'].includes(f.status) && (!FS.filter || f.issueType === FS.filter));
  if (!list.length) return `<div class="card"><p class="muted">${esc(T('fix.nothingToReview'))}</p></div>`;
  const approved = FS.fixes.filter((f) => f.status === 'approved' && f.target.kind !== 'action_plan').length;
  const sim = FS.catalog.ai.simulation;
  return `<div class="card fix-review"><div class="fix-bulk">
      <h3>${esc(T('fix.review'))}${FS.filter ? ` — ${esc(T('issue.' + FS.filter + '.label', FS.catalog.groups.find((g) => g.id === FS.filter)?.params || {}))} <button class="link" id="fixAllFilters">${esc(T('fix.showAll'))}</button>` : ''}</h3>
      <span class="spacer"></span>
      <label><input type="checkbox" id="fixSelAll"> ${esc(T('fix.selectAll'))}</label>
      <button class="btn small" id="fixApproveSel">${esc(T('fix.approveSel'))}</button><button class="btn small" id="fixIgnoreSel">${esc(T('fix.ignoreSel'))}</button>
      <button class="btn small primary" id="fixApply" ${approved ? '' : 'disabled'}>${C.icon(sim ? 'shield' : 'play')} ${esc(T(sim ? 'fix.simulate' : 'fix.apply', { n: approved }))}</button>
      <a class="btn small" href="/api/fix/export?format=csv">${C.icon('download')} CSV</a><a class="btn small" href="/api/fix/export?format=json">${C.icon('download')} JSON</a><button class="btn small" id="fixPdf">${C.icon('printer')} PDF</button>
    </div>${list.map(fixCard).join('')}</div>`;
}

function paint() {
  const view = FS.view;
  if (!view || !view.isConnected) return;
  view.innerHTML = headerBar() + simulationBanner() + `<div class="progress inline" id="fixProgress" hidden></div>` + groupsTable() + reviewPanel();
  paintProgress();
  wire(view);
}

async function update(updates) {
  const { fixes } = await api('/api/fix/update', { updates });
  const by = new Map(fixes.map((f) => [f.id, f]));
  FS.fixes = FS.fixes.map((f) => by.get(f.id) || f);
}

async function setSimulation(on) {
  if (!on && !FS.catalog.ai.realConfirmed && !confirm(T('fix.realWarning'))) return paint();
  FS.catalog.ai = await api('/api/ai/settings', { simulation: on, ...(on ? {} : { realConfirmed: true }) });
  paint();
}

async function applyApproved() {
  const ids = FS.fixes.filter((f) => f.status === 'approved' && f.target.kind !== 'action_plan').map((f) => f.id);
  const sim = FS.catalog.ai.simulation;
  if (!sim && !confirm(T('fix.confirmApply', { n: ids.length, conn: T('fix.conn.' + FS.catalog.connection.type) }))) return;
  try {
    const r = await api('/api/fix/apply', { ids });
    if (r.simulated) C.toast(T('fix.simResult', { n: r.wouldApply.length, skipped: r.skipped.length }), 'info');
    else {
      const ok = r.results.filter((x) => x.status === 'verified').length;
      const failed = r.results.filter((x) => x.status === 'failed').length;
      C.toast(r.pr ? T('fix.prOpened', { url: r.pr }) : T('fix.applied', { ok, total: r.results.length, failed }), failed ? 'error' : 'ok');
    }
    await loadFixData();
    paint();
  } catch (e) {
    C.toast(e.message, 'error');
  }
}

function wire(view) {
  const on = (sel, ev, fn) => view.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  on('[data-open]', 'click', (el) => ((FS.open = FS.open === el.dataset.open ? null : el.dataset.open), paint()));
  on('[data-all]', 'click', (el) => generate([el.dataset.all]));
  on('[data-plan]', 'click', (el) => generate([el.dataset.plan]));
  on('[data-one]', 'click', (el) => generate([el.dataset.one], [el.dataset.url]));
  on('[data-review]', 'click', (el) => ((FS.filter = el.dataset.review), paint()));
  on('#fixAllFilters', 'click', () => ((FS.filter = null), paint()));
  on('[data-edit]', 'input', (el) => {
    const f = FS.fixes.find((x) => x.id === el.dataset.edit);
    const c = el.parentElement.querySelector('.fix-count');
    if (c) c.outerHTML = counter(f.target.kind, el.value);
  });
  on('[data-edit]', 'change', async (el) => (await update([{ id: el.dataset.edit, newValue: el.value }]), paint()));
  on('[data-approve]', 'click', async (el) => (await update([{ id: el.dataset.approve, status: 'approved' }]), paint()));
  on('[data-ignore]', 'click', async (el) => (await update([{ id: el.dataset.ignore, status: 'ignored' }]), paint()));
  on('[data-regen]', 'click', (el) => {
    const f = FS.fixes.find((x) => x.id === el.dataset.regen);
    generate([f.issueType], [f.url]);
  });
  on('[data-sel]', 'change', (el) => (el.checked ? FS.selected.add(el.dataset.sel) : FS.selected.delete(el.dataset.sel)));
  on('#fixSelAll', 'change', (el) => {
    view.querySelectorAll('[data-sel]').forEach((c) => {
      c.checked = el.checked;
      el.checked ? FS.selected.add(c.dataset.sel) : FS.selected.delete(c.dataset.sel);
    });
  });
  on('#fixApproveSel', 'click', async () => (await update([...FS.selected].map((id) => ({ id, status: 'approved' }))), FS.selected.clear(), paint()));
  on('#fixIgnoreSel', 'click', async () => (await update([...FS.selected].map((id) => ({ id, status: 'ignored' }))), FS.selected.clear(), paint()));
  on('#fixApply', 'click', applyApproved);
  on('#fixSim', 'change', (el) => setSimulation(el.checked));
  on('#fixAi', 'click', () => {
    $('#configDialog').showModal();
    $('#configDialog [data-cfg="ai"]').click();
  });
  on('#fixConn', 'click', openConnection);
  on('#fixPdf', 'click', () => exportPdf(FS.fixes.filter((f) => f.status !== 'ignored'), 'fix.pdfTitleProposed'));
}

// ---------- Onglet « Historique des corrections » ----------
const HS = { status: '', issue: '', batch: '' };
const DONE = ['applied', 'verified', 'failed', 'rolled_back'];

export async function renderFixHistory(view) {
  FS.view = null;
  view.innerHTML = `<div class="empty">${esc(T('fix.loading'))}</div>`;
  try {
    ({ fixes: FS.fixes } = await api('/api/fix/list'));
  } catch (e) {
    view.innerHTML = `<div class="banner warn">${C.icon('alert')} ${esc(e.message)}</div>`;
    return;
  }
  paintHistory(view);
}

function paintHistory(view) {
  const all = FS.fixes.filter((f) => DONE.includes(f.status)).sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  const list = all.filter((f) => (!HS.status || f.status === HS.status) && (!HS.issue || f.issueType === HS.issue) && (!HS.batch || f.batch === HS.batch));
  const opt = (vals, cur, label) => `<option value="">${esc(label)}</option>` + vals.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const batches = [...new Set(all.map((f) => f.batch).filter(Boolean))];
  const canUndo = (f) => ['applied', 'verified'].includes(f.status);
  view.innerHTML = `<div class="toolbar"><div class="tb-title"><h2>${C.icon('history')} ${esc(T('tab.fixHistory'))}</h2><p class="help">${esc(T('fix.historyIntro'))}</p></div>
    <div class="tb-actions"><button class="btn" id="histPdf" ${list.length ? '' : 'disabled'}>${C.icon('printer')} ${esc(T('fix.pdfApplied'))}</button></div></div>
    <div class="card"><div class="fix-filters">
      <select id="hStatus">${opt(DONE.map((s) => [s, T('fix.status.' + s)]), HS.status, T('fix.allStatuses'))}</select>
      <select id="hIssue">${opt([...new Set(all.map((f) => f.issueType))].map((i) => [i, T('issue.' + i + '.label')]), HS.issue, T('fix.allIssues'))}</select>
      <select id="hBatch">${opt(batches.map((b) => [b, b]), HS.batch, T('fix.allBatches'))}</select>
      ${HS.batch ? `<button class="btn small" id="hUndoBatch">${esc(T('fix.undoBatch'))}</button>` : ''}</div>
    ${list.length ? `<table class="fix-hist"><thead><tr><th>${esc(T('fix.date'))}</th><th>URL</th><th>${esc(T('col.issue'))}</th><th>${esc(T('fix.before'))}</th><th>${esc(T('fix.after'))}</th><th>${esc(T('fix.statusCol'))}</th><th></th></tr></thead><tbody>
      ${list.map((f) => `<tr><td class="nowrap">${f.appliedAt ? esc(C.t().date(f.appliedAt)) : '—'}<br><small class="muted">${esc(f.batch || '')}</small></td><td class="wrap"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.url)}</a></td>
        <td>${esc(T('issue.' + f.issueType + '.label'))}<br><small class="muted">${esc(T('fix.kind.' + f.target.kind))} · ${esc(f.provider ? (f.provider === 'openai' ? 'ChatGPT' : 'Claude') : T('fix.method.' + f.method))} · ${esc(T('fix.conn.' + (f.connector || 'export')))}</small></td>
        <td class="wrap old">${esc(show(f.oldValue))}</td><td class="wrap">${esc(show(f.newValue))}</td>
        <td><span class="chip ${f.status === 'verified' ? 'ok' : f.status === 'failed' ? 'error' : 'muted'}">${esc(T('fix.status.' + f.status))}</span>${f.error ? `<br><small class="muted">${esc(T('fix.err.' + f.error) === 'fix.err.' + f.error ? f.error : T('fix.err.' + f.error))}</small>` : ''}</td>
        <td class="nowrap">${canUndo(f) ? `<button class="btn tiny" data-verify="${f.id}">${esc(T('fix.verify'))}</button> <button class="btn tiny" data-undo="${f.id}">${esc(T('fix.undo'))}</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<p class="muted">${esc(T('fix.noHistory'))}</p>`}</div>`;
  const reload = async () => (({ fixes: FS.fixes } = await api('/api/fix/list')), paintHistory(view));
  $('#hStatus', view).onchange = (e) => ((HS.status = e.target.value), paintHistory(view));
  $('#hIssue', view).onchange = (e) => ((HS.issue = e.target.value), paintHistory(view));
  $('#hBatch', view).onchange = (e) => ((HS.batch = e.target.value), paintHistory(view));
  $('#histPdf', view).onclick = () => exportPdf(list, 'fix.pdfTitleApplied');
  const undo = async (body) => {
    if (!confirm(T('fix.confirmUndo'))) return;
    const r = await api('/api/fix/rollback', body).catch((e) => (C.toast(e.message, 'error'), null));
    if (r) C.toast(r.pr ? T('fix.prOpened', { url: r.pr }) : T('fix.undone', { n: r.results.filter((x) => x.status === 'rolled_back').length }), 'ok');
    await reload();
  };
  if ($('#hUndoBatch', view)) $('#hUndoBatch', view).onclick = () => undo({ batch: HS.batch });
  view.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => undo({ ids: [b.dataset.undo] })));
  view.querySelectorAll('[data-verify]').forEach((b) => (b.onclick = async () => (await api('/api/fix/verify', { ids: [b.dataset.verify] }), reload())));
}

// ---------- Connexion : WordPress / GitHub / export ----------
async function openConnection() {
  let dlg = $('#fixConnDialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'fixConnDialog';
    dlg.className = 'wide';
    document.body.append(dlg);
  }
  const c = await api('/api/fix/connection');
  const field = (name, label, value, type = 'text', ph = '') => `<label class="span2"><span>${esc(T(label))}</span><input data-c="${name}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></label>`;
  const forms = {
    wordpress: `<p class="cfg-help">${esc(T('fix.wp.help'))}</p><p><a class="btn small" href="/api/fix/wp-plugin.zip">${C.icon('download')} ${esc(T('fix.wp.plugin'))}</a></p>
      <div class="cfg-grid">${field('url', 'fix.wp.url', c.type === 'wordpress' ? c.url : FS.catalog.site.replace(/\/$/, ''))}${field('user', 'fix.wp.user', c.user)}${field('appPassword', 'fix.wp.appPassword', '', 'password', c.has_appPassword ? '••••••••' : 'xxxx xxxx xxxx xxxx xxxx xxxx')}</div><p class="cfg-help">${esc(T('fix.wp.appPasswordHelp'))}</p>`,
    github: `<p class="cfg-help">${esc(T('fix.gh.help'))}</p>
      <div class="cfg-grid">${field('repo', 'fix.gh.repo', c.repo, 'text', 'owner/repo')}${field('branch', 'fix.gh.branch', c.branch, 'text', 'main')}${field('basePath', 'fix.gh.basePath', c.basePath, 'text', '/')}${field('token', 'fix.gh.token', '', 'password', c.has_token ? '••••••••' : 'github_pat_…')}</div>
      <p class="cfg-help">${esc(T('fix.gh.tokenHelp'))}</p><p class="cfg-help">${esc(T('fix.gh.lovable'))}</p>`,
    export: `<p class="cfg-help">${esc(T('fix.export.help'))}</p>`,
  };
  const paintDlg = (type) => {
    dlg.innerHTML = `<form method="dialog"><div class="dialog-head"><h3>${C.icon('link')} ${esc(T('fix.connTitle'))}</h3><button class="icon-btn" value="cancel">${C.icon('x')}</button></div>
      <div class="dialog-body"><div class="seg">${['wordpress', 'github', 'export'].map((k) => `<label><input type="radio" name="ctype" value="${k}" ${k === type ? 'checked' : ''}> ${esc(T('fix.conn.' + k))}</label>`).join('')}</div>${forms[type]}<p id="connStatus" class="muted"></p></div>
      <div class="dialog-foot">${type !== 'export' ? `<button type="button" class="btn" id="connTest">${esc(T('ai.test'))}</button>` : ''}<span class="spacer"></span><button type="button" class="btn primary" id="connSave">${esc(T('ai.save'))}</button></div></form>`;
    dlg.querySelectorAll('[name="ctype"]').forEach((r) => (r.onchange = () => paintDlg(r.value)));
    const collect = () => {
      const body = { type };
      dlg.querySelectorAll('[data-c]').forEach((i) => {
        if (i.type === 'password' && !i.value) return; // secret inchangé
        body[i.dataset.c] = i.value;
      });
      return body;
    };
    $('#connSave', dlg).onclick = async () => {
      FS.catalog.connection = await api('/api/fix/connection', collect());
      $('#connStatus', dlg).textContent = T('ai.saved');
      if (FS.view) paint();
    };
    if ($('#connTest', dlg))
      $('#connTest', dlg).onclick = async () => {
        $('#connStatus', dlg).textContent = T('ai.testing');
        await api('/api/fix/connection', collect());
        const r = await api('/api/fix/connection/test', {});
        $('#connStatus', dlg).textContent = r.ok ? T('fix.connOk') + (r.details ? ' — ' + r.details : '') : `${T('fix.connFailed')} ${r.error || ''} ${r.hint || ''}`;
      };
  };
  paintDlg(c.type || 'export');
  dlg.showModal();
}

// ---------- PDF « Corrections » (impression du navigateur, comme les autres rapports) ----------
function exportPdf(list, titleKey) {
  const w = window.open('', '_blank');
  if (!w) return C.toast(T('fix.popupBlocked'), 'error');
  const conn = FS.catalog?.connection?.type || 'export';
  const rows = list
    .map((f) => `<tr><td>${esc(f.url)}<br><small>${esc(T('issue.' + f.issueType + '.label'))} · ${esc(T('fix.kind.' + f.target.kind))}${f.target.selector ? ' · ' + esc(f.target.selector) : ''}</small></td><td>${esc(show(f.oldValue))}</td><td><b>${esc(show(f.newValue ?? T(f.rationale)))}</b></td><td>${esc(f.appliedAt ? C.t().date(f.appliedAt) : '—')}</td><td>${esc(f.provider ? (f.provider === 'openai' ? 'ChatGPT' : 'Claude') : T('fix.method.' + f.method))}</td><td>${esc(T('fix.status.' + f.status))}</td></tr>`)
    .join('');
  w.document.write(`<!doctype html><html lang="${C.t().lang}"><head><meta charset="utf-8"><title>${esc(T(titleKey))}</title>
<style>body{font:12px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#1b1f27;margin:24px}h1{font-size:20px;margin:0 0 4px}p{color:#5b6578}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e3e6ec;padding:6px;text-align:left;vertical-align:top;word-break:break-word}th{font-size:11px;text-transform:uppercase;color:#5b6578}small{color:#5b6578}ol{padding-left:18px}</style></head><body>
<h1>${esc(T(titleKey))}</h1><p>${esc(FS.catalog?.site || '')} · ${esc(C.t().date(new Date().toISOString()))} · ${list.length} ${esc(T('fix.items'))}</p>
${titleKey === 'fix.pdfTitleProposed' && conn === 'export' ? `<h3>${esc(T('fix.export.stepsTitle'))}</h3><ol>${[1, 2, 3, 4].map((i) => `<li>${esc(T('fix.export.step' + i))}</li>`).join('')}</ol>` : ''}
<table><thead><tr><th>URL</th><th>${esc(T('fix.before'))}</th><th>${esc(T('fix.after'))}</th><th>${esc(T('fix.date'))}</th><th>${esc(T('fix.source'))}</th><th>${esc(T('fix.statusCol'))}</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}
