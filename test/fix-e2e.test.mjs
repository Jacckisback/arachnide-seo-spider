// Flux complet « Corriger en 1 clic » en mode simulation, par les routes HTTP du serveur :
// crawl → catalogue → propositions (IA simulée + règles) → édition / validation → simulation → export.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture-site.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('e2e : du crawl à la simulation, sans rien écrire sur le site, clé jamais renvoyée', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-e2e-'));
  const site = await startFixture();
  const base = `http://127.0.0.1:${site.address().port}`;
  // Faux fournisseur (API Messages d'Anthropic) : répond dans la langue de la page, compte les appels.
  const aiCalls = [];
  const ai = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    aiCalls.push({ key: req.headers['x-api-key'], body: JSON.parse(body) });
    res.writeHead(200, { 'content-type': 'application/json' });
    const b = aiCalls.at(-1).body;
    const text = /action plan/.test(b.system) ? '- Activer HTTPS chez l’hébergeur\n- Rediriger http vers https en 301' : JSON.stringify({ newValue: 'Cours de français en ligne avec un professeur natif, préparation DELF.', rationale: 'Résume la page', confidence: 0.82 });
    res.end(JSON.stringify({ content: [{ type: 'text', text }] }));
  });
  await new Promise((r) => ai.listen(0, '127.0.0.1', r));
  const port = 4700 + Math.floor(Math.random() * 200);
  const srv = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_NO_OPEN: '1', BROWSER: 'none', ARACHNIDE_ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.address().port}` }, stdio: 'ignore' });
  const app = `http://127.0.0.1:${port}`;
  const call = async (p, body) => {
    const r = await fetch(app + p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    assert.ok(!text.includes('sk-ant-e2e-secret'), `${p} renvoie la clé`);
    return { status: r.status, json: /json/.test(r.headers.get('content-type') || '') ? JSON.parse(text) : text };
  };
  const waitJob = async (job) => {
    for (let i = 0; i < 100; i++) {
      const { json } = await call('/api/fix/job/' + job);
      if (json.status !== 'running') return json;
      await sleep(100);
    }
    throw new Error('job timeout');
  };
  try {
    for (let i = 0; i < 50; i++) {
      if (await fetch(app + '/api/env').then(() => true, () => false)) break;
      await sleep(100);
    }
    assert.equal((await call('/api/fix/catalog')).status, 409); // pas encore de crawl
    await call('/api/crawl', { url: base + '/', maxPages: 40 });
    for (let i = 0; i < 100; i++) {
      const { json } = await call('/api/state');
      if (json.hasResult && !json.running) break;
      await sleep(150);
    }
    await call('/api/ai/settings', { provider: 'anthropic', providers: { anthropic: { apiKey: 'sk-ant-e2e-secret', model: 'claude-haiku-5-5' } } });
    const cat = (await call('/api/fix/catalog')).json;
    const g = Object.fromEntries(cat.groups.map((x) => [x.id, x]));
    assert.equal(g['desc-missing'].method, 'ai');
    assert.ok(g['desc-missing'].estimate.requests > 0);
    assert.equal(g['4xx'].method, 'deterministic');
    assert.equal(cat.ai.simulation, true);
    assert.equal(cat.connection.type, 'export');
    // Propositions : IA (meta description) + règles (404 → 301) + plan d'action (non automatisable).
    const { json: job } = await call('/api/fix/propose', { issueIds: ['desc-missing', '4xx', 'no-https'], lang: 'fr' });
    const done = await waitJob(job.job);
    assert.equal(done.status, 'done', JSON.stringify(done));
    assert.deepEqual(done.errors, []);
    let fixes = (await call('/api/fix/list')).json.fixes;
    const desc = fixes.filter((f) => f.issueType === 'desc-missing');
    assert.equal(desc.length, g['desc-missing'].estimate.requests);
    assert.ok(desc.every((f) => f.provider === 'anthropic' && f.status === 'proposed'));
    assert.equal(aiCalls[0].key, 'sk-ant-e2e-secret');
    assert.equal(aiCalls[0].body.model, 'claude-haiku-5-5');
    assert.ok(fixes.some((f) => f.issueType === '4xx' && f.target.kind === 'redirect' && f.method === 'deterministic'));
    const plan = fixes.find((f) => f.issueType === 'no-https');
    assert.equal(plan.target.kind, 'action_plan');
    assert.match(plan.newValue, /HTTPS/);
    // Édition inline puis validation de deux corrections.
    const [a, b] = desc;
    await call('/api/fix/update', { updates: [{ id: a.id, newValue: 'Ma description retouchée à la main pour cette page de cours.' }] });
    await call('/api/fix/update', { updates: [{ id: a.id, status: 'approved' }, { id: b.id, status: 'approved' }] });
    fixes = (await call('/api/fix/list')).json.fixes;
    assert.equal(fixes.find((f) => f.id === a.id).newValue, 'Ma description retouchée à la main pour cette page de cours.');
    // Simulation : rien n'est écrit, rien dans l'historique.
    const sim = (await call('/api/fix/apply', { ids: [a.id, b.id] })).json;
    assert.equal(sim.simulated, true);
    assert.equal(sim.wouldApply.length, 0); // connecteur « export » : rien d'automatique
    assert.equal(sim.skipped.length, 2);
    fixes = (await call('/api/fix/list')).json.fixes;
    assert.ok(fixes.filter((f) => [a.id, b.id].includes(f.id)).every((f) => f.status === 'approved'));
    // Même en désactivant la simulation, rien n'est écrit sans avoir accepté l'avertissement.
    await call('/api/ai/settings', { simulation: false });
    assert.equal((await call('/api/fix/apply', { ids: [a.id] })).json.simulated, true);
    // Export pour application manuelle (CSV / JSON), sans aucun secret.
    const csv = (await call('/api/fix/export?format=csv')).json;
    assert.match(csv, /^\ufeff?status,url,issueType/); // le BOM (pour Excel) est retiré par fetch().text()
    assert.match(csv, /retouchée à la main/);
    const exp = (await call('/api/fix/export?format=json')).json;
    assert.ok(exp.fixes.length >= 3);
    const zip = await fetch(app + '/api/fix/wp-plugin.zip');
    assert.equal(zip.headers.get('content-type'), 'application/zip');
    assert.equal(Buffer.from(await zip.arrayBuffer()).readUInt32LE(0), 0x04034b50);
    const raw = await fs.readFile(path.join(home, 'ai.json'), 'utf8');
    assert.ok(!raw.includes('sk-ant-e2e-secret'));
  } finally {
    srv.kill();
    site.close();
    ai.close();
    await fs.rm(home, { recursive: true, force: true });
  }
});
