// Fournisseurs IA (API simulées) et stockage de la clé : chiffrée au repos, jamais renvoyée à l'interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-ai-'));
process.env.ARACHNIDE_HOME = tmp;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
const { AnthropicProvider } = await import('../src/ai/anthropic.mjs');
const { OpenAIProvider } = await import('../src/ai/openai.mjs');
const { saveAiSettings, publicAiSettings, getProvider, testAiConnection, replacementFor } = await import('../src/ai/settings.mjs');

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
    if (url.endsWith('/v1/models')) return Response.json({ data: [
      { id: 'gpt-6-luna' }, { id: 'gpt-6.1-sol' }, { id: 'gpt-6-astra' }, { id: 'gpt-5.6-terra' }, { id: 'gpt-5.4' }, { id: 'gpt-5.4-2026-03-05' },
      { id: 'gpt-4o-mini', shutdown_date: '2027-01-14' }, // retrait annoncé : proposé avec sa date
      { id: 'o4-mini', shutdown_date: '2026-10-23' }, { id: 'gpt-4.1-nano', shutdown_date: 1792454400 }, // déjà retirés
      { id: 'whisper-1' }, { id: 'gpt-4o-audio-preview' }, { id: 'gpt-realtime-2.1' }, { id: 'gpt-image-2.5-flare' }, { id: 'gpt-5.3-codex' }, { id: 'gpt-5.6-cyber' }, { id: 'gpt-transcribe' },
    ] });
    return Response.json({ choices: [{ message: { content: ANSWER } }] });
  };
  const p = new OpenAIProvider({ apiKey: 'sk-test', model: 'gpt-6-luna', fetch });
  const f = await p.generateFix({ id: 'title-short' }, ctx);
  assert.equal(f.provider, 'openai');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(seen[0].init.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.model, 'gpt-6-luna');
  // Modèles de texte seulement, sans les retirés ni les instantanés datés d'un alias présent, les plus récents d'abord.
  const models = await p.listModels();
  assert.deepEqual(models.map((m) => m.id), ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.4', 'gpt-4o-mini']);
  assert.equal(models.find((m) => m.id === 'gpt-4o-mini').label, 'gpt-4o-mini · retires 2027-01-14');
  assert.equal(models.find((m) => m.id === 'gpt-6-luna').label, 'gpt-6-luna');
});

test('OpenAI : catalogue par défaut à jour (GPT-6), modèles retirés migrés vers le remplaçant recommandé', async () => {
  const { openai } = createRequire(import.meta.url)('../src/ai/models.json');
  assert.equal(openai.default, 'gpt-6-luna');
  assert.deepEqual(openai.models.slice(0, 4).map((m) => m.id), ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra']);
  assert.ok(openai.models.every((m) => !openai.retired[m.id]), 'aucun modèle retiré dans le catalogue');
  assert.ok(openai.models.every((m) => m.price.input > 0 && m.price.output > m.price.input));
  assert.equal(replacementFor('openai', 'gpt-4o-mini'), 'gpt-6-luna');
  assert.equal(replacementFor('openai', 'gpt-4o-mini-2024-07-18'), 'gpt-6-luna');
  assert.equal(replacementFor('openai', 'o4-mini'), 'gpt-5.6-terra');
  assert.equal(replacementFor('openai', 'gpt-5-nano'), 'gpt-5.6-luna');
  assert.equal(replacementFor('openai', 'gpt-6-luna'), null);
  assert.equal(replacementFor('anthropic', 'claude-sonnet-5-5'), null);
  // Un ancien ai.json : le modèle et la liste rafraîchie autrefois sont migrés à la lecture ; le coût suit le nouveau modèle.
  await fs.mkdir(tmp, { recursive: true });
  await fs.writeFile(path.join(tmp, 'ai.json'), JSON.stringify({ provider: 'openai', models: { openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-5-5' }, keys: {}, customModels: { openai: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }, { id: 'gpt-4o', label: 'gpt-4o' }] } }));
  const pub = await publicAiSettings();
  assert.equal(pub.providers.openai.model, 'gpt-6-luna');
  assert.deepEqual(pub.providers.openai.models.map((m) => m.id), openai.models.map((m) => m.id), 'liste périmée remplacée par le catalogue');
  assert.equal(pub.providers.anthropic.model, 'claude-sonnet-5-5');
  process.env.OPENAI_API_KEY = 'sk-env-123';
  const prov = await getProvider({ fetch: async () => Response.json({}) });
  delete process.env.OPENAI_API_KEY;
  assert.equal(prov.model, 'gpt-6-luna');
  assert.deepEqual(prov.price, { input: 0.1, output: 0.5 });
  await fs.rm(tmp, { recursive: true, force: true });
});

test('clé API : chiffrée sur disque, jamais renvoyée, test de connexion sans exposer la clé', async () => {
  const pub = await saveAiSettings({ provider: 'openai', providers: { openai: { apiKey: 'sk-secret-123456', model: 'gpt-6.1-sol' } } });
  assert.equal(pub.provider, 'openai');
  assert.equal(pub.providers.openai.hasKey, true);
  assert.equal(pub.providers.openai.model, 'gpt-6.1-sol');
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
