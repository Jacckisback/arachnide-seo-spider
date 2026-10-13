// Application des corrections validées : connecteur → re-crawl de l'URL → verified / failed, et annulation.
// Mode simulation : rien n'est écrit, on renvoie ce qui serait fait.
import crypto from 'node:crypto';
import { readLive } from '../live.mjs';
import { DEFAULT_UA } from '../crawler.mjs';
import { readFixes, saveFixes, readConnection } from './store.mjs';
import { fixConnectorFor } from './connectors.mjs';

const norm = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().replace(/\/+$/, '') : v);
const LIVE_FIELDS = new Set(['seo_title', 'meta_description', 'h1', 'canonical', 'noindex', 'image_alt', 'redirect']);

// Re-crawl de l'URL corrigée : la nouvelle valeur est-elle bien publiée ?
export async function verifyFix(fix, { fetch = globalThis.fetch } = {}) {
  const kind = fix.target.kind;
  if (LIVE_FIELDS.has(kind)) {
    const v = await readLive(fix.url, kind, { target: fix.target.selector || undefined, fetch });
    const got = kind === 'redirect' ? v?.to ?? null : v;
    if (kind === 'noindex') return !!got === !!fix.newValue;
    return norm(got) === norm(fix.newValue);
  }
  const html = await (await fetch(fix.url + (fix.url.includes('?') ? '&' : '?') + '_arachnide=' + Date.now().toString(36), { headers: { 'user-agent': DEFAULT_UA }, signal: AbortSignal.timeout(20000) })).text();
  if (kind === 'json_ld') {
    const type = (() => {
      try {
        return JSON.parse(fix.newValue)['@type'];
      } catch {
        return null;
      }
    })();
    return /application\/ld\+json/i.test(html) && (!type || html.includes(`"${type}"`));
  }
  if (kind === 'link') return html.includes(fix.newValue) && !html.includes(`href="${fix.target.selector}"`);
  return false;
}

const batchId = () => `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${crypto.randomBytes(2).toString('hex')}`;

export async function applyFixes(siteUrl, ids, { simulation = true, fetch = globalThis.fetch, onProgress } = {}) {
  const conn = await readConnection(siteUrl, { withSecrets: true });
  const connector = await fixConnectorFor(conn, { fetch });
  const all = await readFixes(siteUrl);
  const todo = all.filter((f) => ids.includes(f.id) && f.status === 'approved' && f.target.kind !== 'action_plan');
  const skipped = todo.filter((f) => !connector.canApply(f)).map((f) => f.id);
  const ready = todo.filter((f) => connector.canApply(f));
  if (simulation) return { simulated: true, connector: conn.type, wouldApply: ready.map((f) => ({ id: f.id, url: f.url, kind: f.target.kind, oldValue: f.oldValue, newValue: f.newValue })), skipped };
  const batch = batchId();
  const done = [];
  if (connector.constructor.batch) {
    // GitHub : toutes les corrections du lot dans une seule Pull Request.
    const r = await connector.applyBatch(ready, { batch });
    for (const f of ready) done.push({ ...f, status: r.ok ? 'applied' : 'failed', appliedAt: new Date().toISOString(), connector: conn.type, batch, error: r.ok ? undefined : r.error, rationale: f.rationale });
    await saveFixes(siteUrl, done);
    return { simulated: false, batch, pr: r.pr, results: done, skipped };
  }
  let n = 0;
  for (const f of ready) {
    let next;
    try {
      const { previous } = await connector.apply(f);
      next = { ...f, oldValue: previous ?? f.oldValue ?? null, status: 'applied', appliedAt: new Date().toISOString(), connector: conn.type, batch, error: undefined };
      try {
        next.status = (await verifyFix(next, { fetch })) ? 'verified' : 'applied';
        if (next.status === 'applied') next.error = 'not_visible_yet';
      } catch {
        next.error = 'verify_failed';
      }
    } catch (e) {
      next = { ...f, status: 'failed', connector: conn.type, batch, error: String(e.message || e).slice(0, 300) };
    }
    done.push(next);
    onProgress?.({ done: ++n, total: ready.length });
  }
  await saveFixes(siteUrl, done);
  return { simulated: false, batch, results: done, skipped };
}

// Nouvelle vérification (cache du site purgé, PR fusionnée…).
export async function reverifyFixes(siteUrl, ids, { fetch = globalThis.fetch } = {}) {
  const list = (await readFixes(siteUrl)).filter((f) => ids.includes(f.id) && ['applied', 'verified'].includes(f.status));
  const out = [];
  for (const f of list) {
    const ok = await verifyFix(f, { fetch }).catch(() => false);
    out.push({ ...f, status: ok ? 'verified' : 'applied', error: ok ? undefined : 'not_visible_yet' });
  }
  await saveFixes(siteUrl, out);
  return out;
}

// Annulation d'une correction ou d'un lot entier : la valeur d'avant est remise.
export async function rollbackFixes(siteUrl, { ids, batch } = {}, { fetch = globalThis.fetch } = {}) {
  const conn = await readConnection(siteUrl, { withSecrets: true });
  const connector = await fixConnectorFor(conn, { fetch });
  const list = (await readFixes(siteUrl)).filter((f) => ['applied', 'verified'].includes(f.status) && ((ids && ids.includes(f.id)) || (batch && f.batch === batch)));
  const out = [];
  if (connector.constructor.batch && list.length) {
    const r = await connector.rollbackBatch(list, { batch: batchId() });
    for (const f of list) out.push({ ...f, status: r.ok ? 'rolled_back' : f.status, error: r.ok ? undefined : r.error });
    await saveFixes(siteUrl, out);
    return { results: out, pr: r.pr };
  }
  for (const f of [...list].reverse()) {
    try {
      await connector.rollback(f);
      out.push({ ...f, status: 'rolled_back', error: undefined });
    } catch (e) {
      out.push({ ...f, error: 'rollback: ' + String(e.message || e).slice(0, 280) });
    }
  }
  await saveFixes(siteUrl, out);
  return { results: out };
}
