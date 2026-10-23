// Changements de sitemap (3.23) : options du mode liste (sitemap, référence, quoi crawler), carte du tableau de bord.
// Le tableau des décisions est un onglet ordinaire (TABS « sitemapChanges » dans app.js) ; les décisions viennent
// du serveur (src/sitemap-diff.mjs).
let C = null; // { t, esc, num, icon, store, toast, goTab, openIssue }
const T = (k, p) => C.t(k, p);
const esc = (s) => C.esc(s);
const num = (n) => C.num(n);
const $ = (s, r = document) => r.querySelector(s);

export const DECISIONS = ['redirect-suggested', 'gone-410', 'redirect-broken', 'error', 'live', 'added-bad', 'redirect-chain', 'redirect-ok', 'gone-ok', 'noindex', 'added-ok'];
export const ACTION_DECISIONS = new Set(['redirect-suggested', 'gone-410', 'redirect-broken', 'error', 'live', 'added-bad', 'redirect-chain']);
// Couleur de la puce par décision : erreur (agir), avertissement (vérifier), ok.
export const DECISION_CLS = { 'redirect-suggested': 'error', 'gone-410': 'error', 'redirect-broken': 'error', error: 'error', 'added-bad': 'error', live: 'warning', 'redirect-chain': 'notice', 'redirect-ok': 'ok', 'gone-ok': 'ok', noindex: 'ok', 'added-ok': 'ok' };
export const decisionChip = (d) => `<span class="chip ${DECISION_CLS[d] || ''}">${esc(T('smd.' + d))}</span>`;

// ---- Options du mode liste (persistées) ----
const DEFAULT = { sitemapUrl: '', previousCrawl: '', changes: 'removed', followRedirects: true };
export let listOpts = { ...DEFAULT };

export function initListOptions(ctx) {
  C = ctx;
  listOpts = { ...DEFAULT, ...(C.store.get('listOpts') || {}) };
  $('#listOptsBtn').addEventListener('click', openListDialog);
  paintListChip();
}

export function paintListChip() {
  const chip = $('#listChip');
  if (!chip) return;
  const parts = [];
  if (listOpts.sitemapUrl) parts.push('sitemap');
  if (listOpts.sitemapUrl && listOpts.previousCrawl) parts.push(T('smd.chip.' + listOpts.changes));
  chip.textContent = parts.join(' · ');
  chip.hidden = !parts.length;
}

// Options envoyées au serveur avec le crawl en mode liste. urls : contenu du champ texte (prioritaire sur le sitemap).
export function listCrawlOptions(urls) {
  const o = {};
  if (!urls.length && listOpts.sitemapUrl) o.sitemapUrl = listOpts.sitemapUrl;
  if ((urls.length || listOpts.sitemapUrl) && listOpts.previousCrawl) {
    o.sitemapPreviousCrawl = listOpts.previousCrawl;
    o.sitemapChanges = listOpts.changes;
    o.followRedirects = listOpts.followRedirects;
  }
  return o;
}

async function openListDialog() {
  const dlg = $('#listDialog');
  const body = $('#listBody');
  body.innerHTML = `<p class="muted">${esc(T('ui.loading'))}</p>`;
  dlg.showModal();
  const crawls = await fetch('/api/crawls').then((r) => r.json()).catch(() => []);
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const render = () => {
    const host = hostOf(listOpts.sitemapUrl);
    const same = crawls.filter((c) => !c.unreadable && (!host || hostOf(c.startUrl || '') === host));
    const opts = same.map((c) => `<option value="${esc(c.file)}" ${c.file === listOpts.previousCrawl ? 'selected' : ''}>${esc(c.host || c.file)} · ${c.finishedAt ? esc(C.t.date(c.finishedAt)) : esc(c.file)}${c.totalUrls ? ` · ${num(c.totalUrls)} URL` : ''}${c.mode === 'list' ? ` · ${esc(T('opt.modeList'))}` : ''}</option>`).join('');
    body.innerHTML = `
      <p class="help">${esc(T('smd.dialogHelp'))}</p>
      <label class="field"><span>${esc(T('smd.sitemapUrl'))}</span><input id="loSitemap" type="url" placeholder="https://www.example.com/sitemap.xml" value="${esc(listOpts.sitemapUrl)}"></label>
      <label class="field"><span>${esc(T('smd.compareWith'))}</span><select id="loPrev"><option value="">${esc(T('smd.noCompare'))}</option>${opts}</select></label>
      ${same.length ? '' : `<p class="small muted">${esc(T('smd.noPrevious'))}</p>`}
      <div class="field" id="loChangesRow" ${listOpts.previousCrawl ? '' : 'hidden'}><span>${esc(T('smd.crawlWhat'))}</span>
        <div class="seg" id="loChanges">${['removed', 'added', 'both'].map((k) => `<button type="button" data-k="${k}" class="${listOpts.changes === k ? 'on' : ''}">${esc(T('smd.which.' + k))}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="loFollow" ${listOpts.followRedirects ? 'checked' : ''}> ${esc(T('smd.followRedirects'))}</label>
      </div>
      <p class="small muted">${esc(T('smd.dialogNote'))}</p>
      <div class="dialog-actions"><button class="btn ghost" id="loClear">${esc(T('smd.clear'))}</button><button class="btn primary" id="loSave">${esc(T('ui.save'))}</button></div>`;
    $('#loSitemap', body).addEventListener('change', () => { listOpts.sitemapUrl = $('#loSitemap', body).value.trim(); render(); });
    $('#loPrev', body).addEventListener('change', () => { listOpts.previousCrawl = $('#loPrev', body).value; $('#loChangesRow', body).hidden = !listOpts.previousCrawl; });
    body.querySelectorAll('#loChanges button').forEach((b) => b.addEventListener('click', () => { listOpts.changes = b.dataset.k; body.querySelectorAll('#loChanges button').forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#loClear', body).addEventListener('click', () => { listOpts = { ...DEFAULT }; C.store.set('listOpts', listOpts); paintListChip(); dlg.close(); });
    $('#loSave', body).addEventListener('click', () => {
      listOpts.sitemapUrl = $('#loSitemap', body).value.trim();
      listOpts.previousCrawl = $('#loPrev', body).value;
      listOpts.followRedirects = $('#loFollow', body)?.checked ?? true;
      if (listOpts.sitemapUrl && !/^https?:\/\//i.test(listOpts.sitemapUrl)) listOpts.sitemapUrl = 'https://' + listOpts.sitemapUrl;
      C.store.set('listOpts', listOpts);
      paintListChip();
      dlg.close();
      C.toast(T('smd.saved'), 'ok');
    });
  };
  render();
}

// ---- Carte du tableau de bord ----
export function sitemapChangesCardHtml(R) {
  const D = R?.meta?.sitemapDiff;
  if (!D) return '';
  const c = D.counts || {};
  const kpi = (k, v, cls = '') => `<div class="lg-kpi ${cls}"><b>${num(v || 0)}</b><span>${esc(k)}</span></div>`;
  const issues = (R.issues || []).filter((i) => i.id.startsWith('sitemap-removed') || i.id === 'sitemap-added-not-indexable');
  return `<section class="card seg-card lg-dash smd-dash"><h2>${C.icon('sitemap')} ${esc(T('smd.title'))} <span class="muted small">${esc(T('smd.metaLine', { previous: num(D.previous), current: num(D.current), removed: num(D.removed), added: num(D.added), kept: num(D.kept) }))}</span></h2>
    <div class="lg-kpis compact">
      ${kpi(T('smd.redirect-suggested'), c['redirect-suggested'], c['redirect-suggested'] ? 'err' : '')}${kpi(T('smd.gone-410'), c['gone-410'], c['gone-410'] ? 'err' : '')}${kpi(T('smd.live'), c.live, c.live ? 'warn' : '')}${kpi(T('smd.redirect-ok'), (c['redirect-ok'] || 0) + (c['gone-ok'] || 0) + (c.noindex || 0) + (c['added-ok'] || 0), 'ok')}
    </div>
    ${issues.length ? `<ul class="lg-issues">${issues.map((i) => `<li><button class="link" data-go-issue="${esc(i.id)}"><span class="chip ${i.severity}">${num(i.count)}</span> ${esc(T('issue.' + i.id + '.label', i.params))}</button></li>`).join('')}</ul>` : ''}
    <button class="btn small" data-go-smd>${esc(T('smd.open'))}</button>
  </section>`;
}
export function wireSitemapChangesCard(root) {
  root.querySelector('[data-go-smd]')?.addEventListener('click', () => C.goTab('sitemapChanges'));
  root.querySelectorAll('.smd-dash [data-go-issue]').forEach((b) => b.addEventListener('click', () => C.openIssue(b.dataset.goIssue)));
}

// En-tête de l'onglet : résumé de la comparaison.
export function sitemapChangesHeadHtml(R) {
  const D = R?.meta?.sitemapDiff;
  if (!D) return '';
  const src = D.source ? (D.source.type === 'crawl' ? T('smd.srcCrawl', { name: D.source.name, date: D.source.date ? C.t.date(D.source.date) : '' }) : D.source.type === 'sitemap' ? T('smd.srcSitemap', { name: D.source.name }) : T('smd.srcList')) : '';
  return `<p class="small muted smd-head">${esc(T('smd.metaLine', { previous: num(D.previous), current: num(D.current), removed: num(D.removed), added: num(D.added), kept: num(D.kept) }))}${src ? ` · ${esc(src)}` : ''} · ${esc(T('smd.crawled.' + D.crawled))}</p>`;
}
