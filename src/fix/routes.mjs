// Routes HTTP du module « Corriger en 1 clic » (paramètres IA, propositions, application, historique).
import crypto from 'node:crypto';
import { publicAiSettings, saveAiSettings, testAiConnection, getProvider, readAiSettings } from '../ai/settings.mjs';
import { fixGroups, proposeFixes, estimateCost } from './engine.mjs';
import { readFixes, saveFixes, replaceProposals, readConnection, saveConnection } from './store.mjs';
import { applyFixes, rollbackFixes, reverifyFixes, previewFixes } from './apply.mjs';
import { fixConnectorFor } from './connectors.mjs';
import { fixesToCsv } from './export.mjs';
import { zipDirectory } from '../zip.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../integrations/wordpress/arachnide-connector');

const jobs = new Map();
const siteOf = (R) => R.meta.finalStart || R.meta.startUrl;

// Renvoie true si la route a été traitée.
// Ces routes dépensent des crédits IA et peuvent écrire sur un site : seule l'interface locale peut les appeler.
// Host local (contre le DNS rebinding), même Origin, et JSON obligatoire en POST (une page tierce ne peut pas
// l'envoyer sans requête CORS préalable, que le serveur n'autorise pas).
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
export function isTrustedRequest(req) {
  const host = req.headers.host || '';
  if (!LOCAL_HOST.test(host) && !(process.env.HOST && host.startsWith(process.env.HOST))) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) return false;
  return true;
}

export async function handleFixRoutes(req, res, p, { send, readBody, broadcast, getResult }) {
  const reply = (code, body) => (send(res, code, body), true);
  if (!isTrustedRequest(req)) return reply(403, { error: 'Forbidden: this route only accepts requests from the local Arachnide interface.' });
  if (p === '/api/ai/settings' && req.method === 'GET') return reply(200, await publicAiSettings());
  if (p === '/api/ai/settings' && req.method === 'POST') return reply(200, await saveAiSettings(await readBody(req)));
  if (p === '/api/ai/test' && req.method === 'POST') {
    const { provider, apiKey } = await readBody(req);
    return reply(200, await testAiConnection({ provider, apiKey }));
  }
  if (!p.startsWith('/api/fix/')) return false;
  if (p === '/api/fix/wp-plugin.zip') {
    const zip = await zipDirectory(PLUGIN_DIR, 'arachnide-connector');
    res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="arachnide-connector.zip"', 'content-length': zip.length });
    return res.end(zip), true;
  }
  const R = getResult();
  if (!R) return reply(409, { error: 'No crawl loaded', key: 'fix.noCrawl' });
  const site = siteOf(R);

  if (p === '/api/fix/catalog') {
    const provider = await getProvider().catch(() => null);
    const groups = fixGroups(R).map((g) => ({ ...g, estimate: g.method === 'ai' ? estimateCost(R, [g.id], provider?.price) : null }));
    return reply(200, { site, groups, provider: provider ? { id: provider.id, model: provider.model } : null, ai: await publicAiSettings(), connection: await readConnection(site) });
  }
  if (p === '/api/fix/list') return reply(200, { fixes: await readFixes(site) });

  if (p === '/api/fix/propose' && req.method === 'POST') {
    const { issueIds, urls, lang } = await readBody(req);
    const provider = await getProvider();
    const id = crypto.randomUUID();
    jobs.set(id, { status: 'running' });
    proposeFixes(R, { issueIds, urls, provider, lang, onProgress: (pr) => broadcast('fix-progress', { job: id, ...pr }) })
      .then(async ({ fixes, errors }) => {
        await replaceProposals(site, fixes);
        jobs.set(id, { status: 'done', count: fixes.length, errors });
        broadcast('fix-done', { job: id, count: fixes.length, errors });
      })
      .catch((e) => {
        jobs.set(id, { status: 'error', error: e.message, code: e.code });
        broadcast('fix-done', { job: id, error: e.message, code: e.code });
      });
    return reply(202, { job: id });
  }
  const jm = /^\/api\/fix\/job\/([\w-]+)$/.exec(p);
  if (jm) return reply(jobs.has(jm[1]) ? 200 : 404, jobs.get(jm[1]) || { error: 'unknown job' });

  if (p === '/api/fix/update' && req.method === 'POST') {
    // Édition inline (→ edited), validation (→ approved), ignorer (→ ignored), remise en proposition.
    const { updates } = await readBody(req);
    const all = new Map((await readFixes(site)).map((f) => [f.id, f]));
    const changed = [];
    for (const u of updates || []) {
      const f = all.get(u.id);
      if (!f || ['applied', 'verified', 'rolled_back'].includes(f.status)) continue;
      const next = { ...f };
      if (u.newValue !== undefined && u.newValue !== f.newValue) Object.assign(next, { newValue: u.newValue, status: 'edited' });
      if (['approved', 'ignored', 'proposed'].includes(u.status)) next.status = u.status;
      changed.push(next);
    }
    return reply(200, { fixes: await saveFixes(site, changed).then(() => changed) });
  }

  if (p === '/api/fix/connection' && req.method === 'GET') return reply(200, await readConnection(site));
  if (p === '/api/fix/connection' && req.method === 'POST') return reply(200, await saveConnection(site, await readBody(req)));
  if (p === '/api/fix/connection/test' && req.method === 'POST') {
    try {
      const c = await fixConnectorFor(await readConnection(site, { withSecrets: true }));
      return reply(200, await c.testConnection());
    } catch (e) {
      return reply(200, { ok: false, error: e.message, hint: e.hint });
    }
  }

  if (p === '/api/fix/apply' && req.method === 'POST') {
    const { ids } = await readBody(req);
    const s = await readAiSettings();
    // Écriture réelle seulement si le mode simulation est désactivé ET l'avertissement accepté.
    const simulation = s.simulation !== false || !s.realConfirmed;
    return reply(200, await applyFixes(site, ids || [], { simulation, onProgress: (pr) => broadcast('fix-apply', pr) }));
  }
  if (p === '/api/fix/preview' && req.method === 'POST') {
    try {
      return reply(200, await previewFixes(site, (await readBody(req)).ids || []));
    } catch (e) {
      return reply(400, { error: e.message });
    }
  }
  if (p === '/api/fix/verify' && req.method === 'POST') return reply(200, { fixes: await reverifyFixes(site, (await readBody(req)).ids || []) });
  if (p === '/api/fix/rollback' && req.method === 'POST') {
    const { ids, batch } = await readBody(req);
    return reply(200, await rollbackFixes(site, { ids, batch }));
  }
  if (p === '/api/fix/export') {
    const fmt = new URL(req.url, 'http://x').searchParams.get('format') || 'json';
    const fixes = (await readFixes(site)).filter((f) => f.status !== 'ignored');
    const name = `arachnide-fixes-${new URL(site).hostname}`;
    if (fmt === 'csv') {
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` });
      return res.end('﻿' + fixesToCsv(fixes)), true;
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}.json"` });
    return res.end(JSON.stringify({ site, exportedAt: new Date().toISOString(), fixes }, null, 2)), true;
  }
  return false;
}
