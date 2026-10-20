// Passerelle agents IA : jeton, OpenAPI, REST, MCP sur HTTP, crawl lancé par un agent et suivi dans l'app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startFixture } from './fixture-site.mjs';
import { geoReadiness } from '../src/agent/tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startApp(home) {
  const port = 46000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('app did not start')), 15000);
    child.stdout.on('data', (d) => String(d).includes('http://') && (clearTimeout(to), resolve()));
    child.on('exit', (c) => reject(new Error('app exited ' + c)));
  });
  return { child, base: `http://127.0.0.1:${port}` };
}

test('passerelle agents : jeton, OpenAPI, REST, MCP HTTP, crawl partagé avec l’interface', { timeout: 120000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-agent-'));
  const site = await startFixture();
  const siteUrl = `http://127.0.0.1:${site.address().port}/`;
  const app = await startApp(home);
  const B = app.base;
  const j = async (u, o = {}) => {
    const r = await fetch(B + u, o);
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const post = (u, body, headers = {}) => j(u, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    // Réglages : lisibles par l'interface locale seulement ; un jeton existe dès le premier démarrage.
    const s = await j('/api/agent/settings');
    assert.equal(s.status, 200);
    assert.match(s.body.token, /^ara_[A-Za-z0-9_-]{20,}$/);
    assert.equal(s.body.enabled, true);
    assert.ok(s.body.tools >= 24);
    assert.equal(s.body.mcp_url, B + '/mcp');
    const forged = await j('/api/agent/settings', { headers: { origin: 'https://evil.example' } });
    assert.equal(forged.status, 403);
    const token = s.body.token;
    const H = { authorization: 'Bearer ' + token };

    // OpenAPI public (import dans une Action ChatGPT) ; chaque outil a son chemin et son schéma.
    const oa = await j('/openapi.json');
    assert.equal(oa.status, 200);
    assert.equal(oa.body.openapi, '3.1.0');
    assert.equal(oa.body.servers[0].url, B);
    const op = oa.body.paths['/api/agent/arachnide_search_pages'].post;
    assert.equal(op.operationId, 'arachnide_search_pages');
    assert.equal(op['x-openai-isConsequential'], false);
    assert.equal(op.requestBody.content['application/json'].schema.properties.limit.type, 'integer');
    assert.equal(oa.body.paths['/api/agent/arachnide_apply_changes'].post['x-openai-isConsequential'], true);

    // Sans jeton ou avec un mauvais jeton : refus ; le jeton passe aussi par X-API-Key.
    assert.equal((await post('/api/agent/arachnide_list_crawls', {})).status, 401);
    assert.equal((await post('/api/agent/arachnide_list_crawls', {}, { authorization: 'Bearer nope' })).status, 401);
    assert.equal((await post('/api/agent/arachnide_list_crawls', {}, { 'x-api-key': token })).status, 200);
    assert.equal((await post('/api/agent/arachnide_nope', {}, H)).status, 404);
    const bad = await post('/api/agent/arachnide_search_pages', { limit: 'x' }, H);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.issues[0].path, 'limit');
    assert.equal((await post('/api/agent/arachnide_get_summary', {}, H)).status, 404); // aucun crawl encore

    // Un agent lance un crawl : il tourne dans l'app (même moteur, visible dans l'interface) et devient « current ».
    const started = await post('/api/agent/arachnide_start_crawl', { url: siteUrl, max_pages: 50, check_images: false }, H);
    assert.equal(started.status, 200);
    assert.match(started.body.job_id, /^job_/);
    assert.equal((await j('/api/state')).body.running, true);
    let status;
    for (let i = 0; i < 100; i++) {
      status = (await post('/api/agent/arachnide_crawl_status', { job_id: started.body.job_id }, H)).body;
      if (status.state !== 'running') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(status.state, 'done', JSON.stringify(status));
    assert.ok(status.summary.score > 0 && status.summary.urls > 5);
    assert.equal((await j('/api/state')).body.hasResult, true);
    const sum = await post('/api/agent/arachnide_get_summary', {}, H);
    assert.equal(sum.body.crawl_id, 'current');
    const list = await post('/api/agent/arachnide_list_crawls', {}, H);
    assert.equal(list.body[0].crawl_id, 'current');
    assert.ok(list.body.length >= 2); // + le crawl enregistré

    // Nouveaux outils d'exploration.
    const plan = await post('/api/agent/arachnide_action_plan', { limit: 5 }, H);
    assert.ok(plan.body.total_actions > 5 && plan.body.start_here.rank === 1 && plan.body.actions[0].action);
    const qw = await post('/api/agent/arachnide_action_plan', { quick_wins_only: true }, H);
    assert.ok(qw.body.actions.every((a) => a.quick_win));
    const pages = await post('/api/agent/arachnide_search_pages', { status: 'client_error' }, H);
    assert.ok(pages.body.pages.some((p) => p.url === siteUrl + 'cassee'));
    const deep = await post('/api/agent/arachnide_search_pages', { depth_min: 4, sort: 'depth' }, H);
    assert.ok(deep.body.pages.every((p) => p.depth >= 4));
    const geo = await post('/api/agent/arachnide_geo_readiness', {}, H);
    assert.ok(geo.body.geo_score >= 0 && geo.body.geo_score <= 100);
    assert.ok(geo.body.ai_crawlers.blocked.includes('GPTBot')); // le site de test bloque GPTBot
    assert.ok(geo.body.recommendations.some((r) => /GPTBot/.test(r.text)));
    assert.equal(geo.body.llms_txt.present, false);

    // MCP sur HTTP : mêmes outils, même crawl « current », refus sans jeton.
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(B + '/mcp'), { requestInit: { headers: H } }));
    const tools = await client.listTools();
    assert.ok(tools.tools.length >= 24);
    assert.equal(tools.tools.find((x) => x.name === 'arachnide_apply_changes').annotations.destructiveHint, true);
    const r = await client.callTool({ name: 'arachnide_get_summary', arguments: {} });
    assert.equal(JSON.parse(r.content[0].text).crawl_id, 'current');
    assert.ok((await client.listPrompts()).prompts.some((p) => p.name === 'optimize_site'));
    await client.close();
    const anon = new Client({ name: 'anon', version: '1.0.0' });
    await assert.rejects(anon.connect(new StreamableHTTPClientTransport(new URL(B + '/mcp'))), /invalid token/);

    // Journal des appels, visible dans l'interface ; renouvellement du jeton.
    const after = await j('/api/agent/settings');
    assert.ok(after.body.log.some((l) => l.via === 'mcp' && l.tool === 'arachnide_get_summary'));
    assert.ok(after.body.log.some((l) => l.via === 'rest' && l.tool === 'arachnide_start_crawl'));
    const rotated = await post('/api/agent/settings', { rotate: true });
    assert.notEqual(rotated.body.token, token);
    assert.equal((await post('/api/agent/arachnide_list_crawls', {}, H)).status, 401);
    assert.equal((await post('/api/agent/arachnide_list_crawls', {}, { authorization: 'Bearer ' + rotated.body.token })).status, 200);
    // Désactivé : plus aucun accès, même avec le bon jeton.
    await post('/api/agent/settings', { enabled: false });
    assert.equal((await post('/api/agent/arachnide_list_crawls', {}, { authorization: 'Bearer ' + rotated.body.token })).status, 401);
    await post('/api/agent/settings', { enabled: true, public_url: 'https://seo.example.com' });
    assert.equal((await j('/openapi.json')).body.servers[0].url, 'https://seo.example.com');
    assert.equal((await post('/api/agent/settings', { public_url: 'not a url' })).status, 400);
  } finally {
    app.child.kill();
    site.close();
  }
});

test('GEO : score et recommandations à partir d’un crawl', () => {
  const page = (u, x = {}) => ({ url: u, isHtml: true, status: 200, indexable: true, title: 'T ' + u, metaDescription: 'D ' + u, h1Count: 1, mainWordCount: 600, hasMain: true, lang: 'fr', og: { title: 'x' }, schemaTypes: ['Article'], ...x });
  const R = {
    meta: { startUrl: 'https://x.fr/', botAccess: [{ bot: 'Googlebot', allowed: true }, { bot: 'GPTBot', allowed: false }, { bot: 'ClaudeBot', allowed: true }, { bot: 'PerplexityBot', allowed: true }], llmsTxt: null, sitemapUrlCount: 3 },
    pages: [page('https://x.fr/'), page('https://x.fr/a'), page('https://x.fr/b', { schemaTypes: [], mainWordCount: 50 }), page('https://x.fr/c', { schemaTypes: ['FAQPage'] })],
    issues: [{ id: 'thin-content', count: 1, category: 'content', severity: 'warning', items: [] }],
  };
  const g = geoReadiness(R);
  assert.deepEqual(g.ai_crawlers.blocked, ['GPTBot']);
  assert.equal(g.structured_data.pages_with_schema_pct, 75);
  assert.equal(g.structured_data.answer_oriented_types.FAQPage, 1);
  assert.equal(g.content.thin_pages_lt_200_words, 1);
  assert.ok(g.geo_score > 40 && g.geo_score < 90, String(g.geo_score));
  assert.equal(g.recommendations[0].priority, 'high');
  assert.match(g.recommendations[0].text, /GPTBot/);
  // Tout est en ordre : score élevé, pas de recommandation forte.
  const good = geoReadiness({ ...R, meta: { ...R.meta, botAccess: R.meta.botAccess.map((b) => ({ ...b, allowed: true })), llmsTxt: { size: 500 } }, pages: R.pages.map((p) => page(p.url)), issues: [] });
  assert.ok(good.geo_score >= 95, String(good.geo_score));
  assert.ok(!good.recommendations.some((r) => r.priority === 'high'));
});
