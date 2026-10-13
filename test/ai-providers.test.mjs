// Fournisseurs IA (API simulées) et stockage de la clé : chiffrée au repos, jamais renvoyée à l'interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-ai-'));
process.env.ARACHNIDE_HOME = tmp;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
const { AnthropicProvider } = await import('../src/ai/anthropic.mjs');
const { OpenAIProvider } = await import('../src/ai/openai.mjs');
const { saveAiSettings, publicAiSettings, getProvider, testAiConnection } = await import('../src/ai/settings.mjs');

const ANSWER = JSON.stringify({ newValue: 'Cours de français en ligne avec un professeur natif à Madrid', rationale: 'Reprend le sujet', confidence: 0.85 });
const ctx = { url: 'https://ex.fr/', kind: 'seo_title', lang: 'fr', title: 'Accueil', excerpt: 'Cours' };

test('Anthropic : en-têtes, corps de la requête Messages, réponse, 429 avec Retry-After', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    if (seen.length === 1) return new Response('{"error":{"message":"slow down"}}', { status: 429, headers: { 'retry-after': '3' } });
    return Response.json({ content: [{ type: 'text', text: ANSWER }] });
  };
  const p = new AnthropicProvider({ apiKey: 'sk-ant-test', model: 'claude-sonnet-5-5', fetch });
  await assert.rejects(p.generateFix({ id: 'title-short' }, ctx), (e) => e.status === 429 && e.retryAfter === 3);
  const f = await p.generateFix({ id: 'title-short' }, ctx);
  assert.equal(f.provider, 'anthropic');
  assert.equal(f.newValue, 'Cours de français en ligne avec un professeur natif à Madrid');
  const req = seen[1];
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(req.init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(req.init.body);
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.messages[0].role, 'user');
  assert.match(body.system, /JSON object/);
});

test('OpenAI : Chat Completions en mode JSON, liste des modèles filtrée', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith('/v1/models')) return Response.json({ data: [{ id: 'gpt-4o-mini' }, { id: 'whisper-1' }, { id: 'gpt-4o-audio-preview' }] });
    return Response.json({ choices: [{ message: { content: ANSWER } }] });
  };
  const p = new OpenAIProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetch });
  const f = await p.generateFix({ id: 'title-short' }, ctx);
  assert.equal(f.provider, 'openai');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(seen[0].init.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages[0].role, 'system');
  assert.deepEqual((await p.listModels()).map((m) => m.id), ['gpt-4o-mini']);
});

test('clé API : chiffrée sur disque, jamais renvoyée, test de connexion sans exposer la clé', async () => {
  const pub = await saveAiSettings({ provider: 'openai', providers: { openai: { apiKey: 'sk-secret-123456', model: 'gpt-4o' } } });
  assert.equal(pub.provider, 'openai');
  assert.equal(pub.providers.openai.hasKey, true);
  assert.equal(pub.providers.openai.model, 'gpt-4o');
  assert.equal(pub.simulation, true); // simulation activée par défaut
  assert.ok(!JSON.stringify(pub).includes('sk-secret'));
  const raw = await fs.readFile(path.join(tmp, 'ai.json'), 'utf8');
  assert.ok(!raw.includes('sk-secret'));
  assert.equal((await fs.stat(path.join(tmp, 'ai.json'))).mode & 0o777, 0o600);
  const p = await getProvider({ fetch: async () => Response.json({}) });
  assert.equal(p.apiKey, 'sk-secret-123456');
  const bad = await testAiConnection({ provider: 'openai', fetch: async () => new Response('{"error":{"message":"Incorrect API key sk-secret-123456"}}', { status: 401 }) });
  assert.deepEqual([bad.ok, bad.error], [false, 'invalid_key']);
  await saveAiSettings({ providers: { openai: { apiKey: null } } });
  assert.equal((await publicAiSettings()).providers.openai.hasKey, false);
  await fs.rm(tmp, { recursive: true, force: true });
});
