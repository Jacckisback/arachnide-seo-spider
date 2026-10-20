// Segments : sélecteur de la barre latérale, carte du tableau de bord, bandeau, répartition d'un problème et
// gestionnaire (création, règles, ordre, import / export JSON). Le calcul vit dans shared/segments.js.
// Tout texte saisi ou issu du crawl passe par esc().
import { FIELDS, opsFor, needsValue, normalizeSegments, compileSegments, suggestFromFolders, NONE, NONE_COLOR, SEGMENT_COLORS } from './shared/segments.js';

const segName = (s, t) => (s.id === NONE ? t('seg.none') : s.name);

// ---------- Barre latérale : filtre global ----------
export function barHtml(segments, counts, active, X) {
  const { t, esc, icon, num } = X;
  if (!segments.length) {
    return `<button class="seg-empty" id="segManage" type="button">${icon('layers')}<span><b>${esc(t('seg.title'))}</b><small>${esc(t('seg.emptyHint'))}</small></span>${icon('plus')}</button>`;
  }
  const opt = (s) => `<option value="${esc(s.id)}" ${active === s.id ? 'selected' : ''}>${esc(segName(s, t))} (${num(counts.get(s.id) || 0)})</option>`;
  const none = counts.get(NONE) ? opt({ id: NONE }) : '';
  const cur = segments.find((s) => s.id === active);
  const dot = active === NONE ? NONE_COLOR : cur?.color;
  return `<div class="seg-bar${active ? ' on' : ''}">
    <label class="seg-pick">${dot ? `<span class="seg-dot" style="--c:${esc(dot)}"></span>` : icon('layers')}
      <span class="sr-only">${esc(t('seg.filterLabel'))}</span>
      <select id="segSelect" aria-label="${esc(t('seg.filterLabel'))}"><option value="">${esc(t('seg.all'))}</option>${segments.map(opt).join('')}${none}</select></label>
    <button class="btn icon ghost" id="segManage" type="button" title="${esc(t('seg.manage'))}" aria-label="${esc(t('seg.manage'))}">${icon('settings')}</button>
  </div>`;
}

// ---------- Bandeau en tête de page quand un segment est actif ----------
export function bannerHtml(seg, X) {
  const { t, esc, icon, num } = X;
  if (!seg) return '';
  const name = seg.id === NONE ? t('seg.none') : seg.name;
  return `<span class="seg-dot" style="--c:${esc(seg.color || NONE_COLOR)}"></span>
    <span>${esc(t('seg.bannerPrefix'))} <b>${esc(name)}</b> <span class="muted">· ${esc(t('seg.bannerCount', { n: seg.pages, total: num(seg.total) }))}</span></span>
    <span class="spacer"></span><button class="link" id="segClear" type="button">${icon('x')} ${esc(t('seg.clear'))}</button>`;
}

// ---------- Tableau de bord : une ligne par segment ----------
export function cardHtml(stats, active, X) {
  const { t, esc, icon, num } = X;
  if (!stats.length) {
    return `<section class="card seg-card seg-promo" aria-labelledby="hSeg">
      <div class="seg-promo-ic">${icon('layers')}</div>
      <div><h2 id="hSeg">${esc(t('seg.promoTitle'))}</h2><p class="sub">${esc(t('seg.promoText'))}</p></div>
      <div class="seg-promo-actions"><button class="btn primary" id="segAuto" type="button">${icon('folder')} ${esc(t('seg.fromFolders'))}</button><button class="btn" id="segCreate" type="button">${icon('plus')} ${esc(t('seg.create'))}</button></div>
    </section>`;
  }
  const gradeCls = (g) => (!g ? '' : /^[AB]/.test(g) ? 'solid' : /^C/.test(g) ? 'fair' : 'weak');
  const cell = (v, unit = '') => (v == null ? '<span class="muted">—</span>' : num(v) + unit);
  const max = Math.max(1, ...stats.map((s) => s.pages));
  const hasGa4 = stats.some((s) => s.sessions != null);
  const rows = stats
    .map((s) => `<tr class="${active === s.id ? 'sel' : ''}" data-seg="${esc(s.id)}" tabindex="0" title="${esc(t('seg.rowHint'))}">
      <th scope="row"><span class="seg-name"><span class="seg-dot" style="--c:${esc(s.color)}"></span>${esc(segName(s, t))}</span>
        <span class="seg-share"><span style="width:${(s.pages / max) * 100}%;--c:${esc(s.color)}"></span></span></th>
      <td class="num">${num(s.pages)}<small class="muted"> · ${num(s.share)} %</small></td>
      <td class="num">${s.score == null ? '—' : `<span class="seg-score st-${gradeCls(s.grade)}">${s.score}<small>/100</small></span>`}</td>
      <td class="num">${s.errors ? `<span class="chip error">${num(s.errors)}</span>` : '<span class="muted">0</span>'}</td>
      <td class="num">${s.warnings ? `<span class="chip warning">${num(s.warnings)}</span>` : '<span class="muted">0</span>'}</td>
      <td class="num">${cell(s.indexableRate, ' %')}</td>
      <td class="num">${cell(s.avgDepth)}</td>
      <td class="num">${cell(s.avgWords)}</td>
      <td class="num">${cell(s.avgLinkScore)}</td>
      <td class="num">${s.avgResponseTime == null ? '<span class="muted">—</span>' : num(s.avgResponseTime) + ' ms'}</td>
      ${hasGa4 ? `<td class="num">${cell(s.sessions)}</td>` : ''}
      <td class="seg-top">${s.topIssues.length ? s.topIssues.map((i) => `<button class="seg-issue ${i.severity}" type="button" data-seg-issue="${esc(i.id)}" data-seg-of="${esc(s.id)}" title="${esc(t('issue.' + i.id + '.label', i.params))}">${esc(t('issue.' + i.id + '.label', i.params))} <b>${num(i.count)}</b></button>`).join('') : `<span class="muted">${icon('check')} ${esc(t('seg.noIssue'))}</span>`}</td>
    </tr>`)
    .join('');
  return `<section class="card seg-card" aria-labelledby="hSeg">
    <div class="card-head"><div><h2 id="hSeg">${icon('layers')} ${esc(t('seg.cardTitle'))}</h2><p class="sub">${esc(t('seg.cardSub'))}</p></div>
      <button class="btn small ghost" id="segManage2" type="button">${icon('settings')} ${esc(t('seg.manage'))}</button></div>
    <div class="seg-table-wrap"><table class="seg-table">
      <thead><tr><th scope="col">${esc(t('seg.col.segment'))}</th><th scope="col" class="num">${esc(t('seg.col.pages'))}</th><th scope="col" class="num">${esc(t('seg.col.score'))}</th><th scope="col" class="num">${esc(t('seg.col.errors'))}</th><th scope="col" class="num">${esc(t('seg.col.warnings'))}</th><th scope="col" class="num">${esc(t('seg.col.indexable'))}</th><th scope="col" class="num">${esc(t('seg.col.depth'))}</th><th scope="col" class="num">${esc(t('seg.col.words'))}</th><th scope="col" class="num">Link Score</th><th scope="col" class="num">${esc(t('seg.col.response'))}</th>${hasGa4 ? `<th scope="col" class="num">${esc(t('col.sessions'))}</th>` : ''}<th scope="col">${esc(t('seg.col.top'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </section>`;
}

// ---------- Page Problèmes : répartition d'un problème par segment ----------
export function breakdownHtml(rows, X) {
  const { t, esc, num } = X;
  if (!rows.length) return '';
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return `<div class="iv-seg"><h3>${esc(t('seg.breakdown'))}</h3>
    <div class="seg-stack" role="img" aria-label="${esc(rows.map((r) => `${segName(r, t)} : ${r.count}`).join(', '))}">${rows.map((r) => `<span style="flex:${r.count};--c:${esc(r.color)}"></span>`).join('')}</div>
    <div class="seg-legend">${rows.map((r) => `<button class="seg-chip" type="button" data-seg-pick="${esc(r.id)}"><span class="seg-dot" style="--c:${esc(r.color)}"></span>${esc(segName(r, t))} <b>${num(r.count)}</b><small class="muted">${num(Math.round((100 * r.count) / total))} %</small></button>`).join('')}</div></div>`;
}

// ---------- Gestionnaire ----------
const FIELD_ORDER = ['path', 'url', 'title', 'h1', 'metaDescription', 'contentType', 'indexability', 'indexable', 'status', 'depth', 'words', 'inlinks', 'linkScore', 'responseTime', 'inSitemap', 'isHtml', 'schemaType', 'lang', 'canonical', 'gscClicks', 'ga4Sessions'];

function fieldOptions(R, t, cur) {
  const ex = (R.meta?.options?.extractors || []).map((e) => 'extract:' + e.name);
  const list = [...FIELD_ORDER.filter((f) => (f !== 'gscClicks' || R.meta?.gsc) && (f !== 'ga4Sessions' || R.meta?.ga4)), ...ex];
  return list.map((f) => `<option value="${f}" ${f === cur ? 'selected' : ''}>${f.startsWith('extract:') ? t('seg.field.extract', { name: f.slice(8) }) : t('seg.field.' + f)}</option>`).join('');
}

function ruleHtml(R, r, X) {
  const { t, esc, icon } = X;
  const ops = opsFor(r.field);
  const f = FIELDS[r.field];
  let value = '';
  if (f?.type === 'enum') value = `<select data-r="value">${f.values.map((v) => `<option value="${v}" ${r.value === v ? 'selected' : ''}>${esc(t(v === 'indexable' ? 'idx.indexable' : 'idx.' + v))}</option>`).join('')}</select>`;
  else if (needsValue(r.op)) value = `<input data-r="value" type="${f?.type === 'number' ? 'number' : 'text'}" value="${esc(r.value ?? '')}" spellcheck="false" placeholder="${esc(t(f?.type === 'number' ? 'seg.valueNum' : r.op === 'regex' || r.op === 'notRegex' ? 'seg.valueRegex' : 'seg.valueText'))}">`;
  else value = '<span class="seg-novalue"></span>';
  return `<div class="seg-rule">
    <select data-r="field" aria-label="${esc(t('seg.field'))}">${fieldOptions(R, t, r.field)}</select>
    <select data-r="op" aria-label="${esc(t('seg.operator'))}">${ops.map((o) => `<option value="${o}" ${o === r.op ? 'selected' : ''}>${esc(t('seg.op.' + o))}</option>`).join('')}</select>
    ${value}
    <button class="btn icon ghost" type="button" data-act="delRule" title="${esc(t('seg.delRule'))}" aria-label="${esc(t('seg.delRule'))}">${icon('x')}</button>
  </div>`;
}

function segHtml(R, s, i, n, count, X) {
  const { t, esc, icon, num } = X;
  return `<div class="seg-edit" data-i="${i}">
    <div class="seg-edit-head">
      <input type="color" data-s="color" value="${esc(s.color)}" aria-label="${esc(t('seg.color'))}">
      <input type="text" data-s="name" value="${esc(s.name)}" maxlength="60" placeholder="${esc(t('seg.namePh'))}" aria-label="${esc(t('seg.name'))}">
      <select data-s="match" aria-label="${esc(t('seg.match'))}"><option value="all" ${s.match !== 'any' ? 'selected' : ''}>${esc(t('seg.matchAll'))}</option><option value="any" ${s.match === 'any' ? 'selected' : ''}>${esc(t('seg.matchAny'))}</option></select>
      <span class="seg-count" data-count>${esc(t('seg.pagesN', { n: count }))}</span>
      <span class="seg-tools">
        <button class="btn icon ghost" type="button" data-act="up" ${i === 0 ? 'disabled' : ''} title="${esc(t('seg.up'))}" aria-label="${esc(t('seg.up'))}">${icon('arrowUp')}</button>
        <button class="btn icon ghost" type="button" data-act="down" ${i === n - 1 ? 'disabled' : ''} title="${esc(t('seg.down'))}" aria-label="${esc(t('seg.down'))}">${icon('arrowDown')}</button>
        <button class="btn icon ghost" type="button" data-act="del" title="${esc(t('seg.delete'))}" aria-label="${esc(t('seg.delete'))}">${icon('trash')}</button>
      </span>
    </div>
    <div class="seg-rules">${s.rules.map((r) => ruleHtml(R, r, X)).join('')}</div>
    <button class="link" type="button" data-act="addRule">${icon('plus')} ${esc(t('seg.addRule'))}</button>
  </div>`;
}

// Ouvre le gestionnaire. `onApply(segments)` reçoit la liste nettoyée ; `toast`, `download` viennent de l'application.
export function openManager({ dialog, R, segments, X, onApply, toast, download, host }) {
  const { t, esc, icon, num } = X;
  let list = structuredClone(segments || []);
  if (!list.length) list = [];
  const body = dialog.querySelector('#segBody');
  const live = () => {
    const { segments: clean } = normalizeSegments(list.map((s) => ({ ...s, name: s.name || '?' })));
    const of = compileSegments(clean);
    const counts = new Map();
    for (const p of R.pages) {
      const id = of(p);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    // Les ids nettoyés suivent l'ordre de la liste : on relie par position.
    return { byIndex: clean.map((s) => counts.get(s.id) || 0), none: counts.get(NONE) || 0 };
  };
  const draw = () => {
    const c = live();
    body.innerHTML = `<p class="muted seg-intro">${esc(t('seg.intro'))}</p>
      <div class="seg-toolbar">
        <button class="btn" type="button" data-act="new">${icon('plus')} ${esc(t('seg.create'))}</button>
        <button class="btn" type="button" data-act="auto">${icon('folder')} ${esc(t('seg.fromFolders'))}</button>
        <span class="spacer"></span>
        <label class="btn ghost">${icon('folder')} ${esc(t('seg.import'))}<input type="file" accept=".json,application/json" hidden data-act="import"></label>
        <button class="btn ghost" type="button" data-act="export" ${list.length ? '' : 'disabled'}>${icon('download')} ${esc(t('seg.export'))}</button>
      </div>
      ${list.length ? `<div class="seg-list">${list.map((s, i) => segHtml(R, s, i, list.length, c.byIndex[i] ?? 0, X)).join('')}</div>` : `<div class="seg-none-yet">${icon('layers')}<p>${esc(t('seg.noneYet'))}</p></div>`}
      <p class="seg-rest">${esc(t('seg.restCount', { n: c.none }))}</p>`;
  };
  const refreshCounts = () => {
    const c = live();
    body.querySelectorAll('.seg-edit').forEach((el, i) => (el.querySelector('[data-count]').textContent = t('seg.pagesN', { n: c.byIndex[i] ?? 0 })));
    const rest = body.querySelector('.seg-rest');
    if (rest) rest.textContent = t('seg.restCount', { n: c.none });
  };
  const at = (el) => {
    const box = el.closest('.seg-edit');
    if (!box) return {};
    const i = Number(box.dataset.i);
    const ri = el.closest('.seg-rule') ? [...box.querySelectorAll('.seg-rule')].indexOf(el.closest('.seg-rule')) : -1;
    return { i, ri };
  };
  const newSeg = () => ({ name: '', color: SEGMENT_COLORS[list.length % SEGMENT_COLORS.length], match: 'all', rules: [{ field: 'path', op: 'startsWith', value: '/' }] });

  body.oninput = (e) => {
    const el = e.target;
    const { i, ri } = at(el);
    if (i == null || Number.isNaN(i)) return;
    if (el.dataset.s) list[i][el.dataset.s] = el.value;
    if (el.dataset.r === 'value') list[i].rules[ri].value = el.value;
    refreshCounts();
  };
  body.onchange = async (e) => {
    const el = e.target;
    if (el.dataset.act === 'import') {
      const f = el.files[0];
      if (!f) return;
      try {
        const { segments: imported } = normalizeSegments(JSON.parse(await f.text()));
        if (!imported.length) throw new Error('empty');
        list = imported;
        toast(t('seg.imported', { n: imported.length }), 'ok');
        draw();
      } catch {
        toast(t('seg.importFailed'), 'error');
      }
      return;
    }
    const { i, ri } = at(el);
    if (i == null || Number.isNaN(i)) return;
    if (el.dataset.s) list[i][el.dataset.s] = el.value;
    if (el.dataset.r === 'field') {
      const ops = opsFor(el.value);
      const f = FIELDS[el.value];
      list[i].rules[ri] = { field: el.value, op: ops[0], value: f?.type === 'enum' ? f.values[0] : f?.type === 'number' ? '' : list[i].rules[ri].value };
      draw();
    } else if (el.dataset.r === 'op') {
      list[i].rules[ri].op = el.value;
      draw();
    } else if (el.dataset.r === 'value') list[i].rules[ri].value = el.value;
    refreshCounts();
  };
  body.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const { i, ri } = at(b);
    switch (b.dataset.act) {
      case 'new': list.push(newSeg()); draw(); body.querySelector('.seg-edit:last-child [data-s="name"]')?.focus(); return;
      case 'auto': {
        const sug = suggestFromFolders(R);
        if (!sug.length) return toast(t('seg.noFolders'), 'info');
        const have = new Set(list.map((s) => s.name.toLowerCase()));
        list.push(...sug.filter((s) => !have.has(s.name.toLowerCase())).map((s, k) => ({ ...s, color: SEGMENT_COLORS[(list.length + k) % SEGMENT_COLORS.length] })));
        toast(t('seg.suggested', { n: sug.length }), 'ok');
        return draw();
      }
      case 'export': {
        const { segments: clean } = normalizeSegments(list);
        return download(`${host}_segments.json`, JSON.stringify({ app: 'Arachnide SEO Spider', segments: clean }, null, 2), 'application/json');
      }
      case 'up': [list[i - 1], list[i]] = [list[i], list[i - 1]]; return draw();
      case 'down': [list[i + 1], list[i]] = [list[i], list[i + 1]]; return draw();
      case 'del': list.splice(i, 1); return draw();
      case 'addRule': list[i].rules.push({ field: 'path', op: 'contains', value: '' }); draw(); body.querySelectorAll('.seg-edit')[i]?.querySelector('.seg-rule:last-child [data-r="value"]')?.focus(); return;
      case 'delRule': list[i].rules.splice(ri, 1); return draw();
    }
  };
  dialog.querySelector('#segApply').onclick = () => {
    const unnamed = list.findIndex((s) => !String(s.name || '').trim());
    if (unnamed >= 0) {
      toast(t('seg.nameRequired'), 'error');
      body.querySelectorAll('.seg-edit')[unnamed]?.querySelector('[data-s="name"]')?.focus();
      return;
    }
    const { segments: clean, problems } = normalizeSegments(list);
    if (problems.length) toast(t('seg.badRegex', { rule: problems[0].rule }), 'info');
    dialog.close();
    onApply(clean);
  };
  dialog.querySelector('#segClearAll').onclick = () => {
    if (!list.length || confirm(t('seg.confirmClear'))) {
      list = [];
      draw();
    }
  };
  draw();
  dialog.showModal();
}
