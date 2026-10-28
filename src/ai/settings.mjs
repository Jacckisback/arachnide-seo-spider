// Paramètres IA (BYOK) : fournisseur, modèle, clé API. Stockés uniquement en local dans ~/.arachnide/ai.json,
// la clé chiffrée (AES-256-GCM) avec une clé machine ~/.arachnide/.secret (fichiers en 0600). La clé n'est jamais
// renvoyée au navigateur, jamais journalisée, jamais exportée : elle ne part que vers l'API du fournisseur choisi.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CONFIG_DIR } from '../sites.mjs';
import { seal, unseal } from '../secret.mjs';
import { AnthropicProvider } from './anthropic.mjs';
import { OpenAIProvider } from './openai.mjs';

const MODELS = createRequire(import.meta.url)('./models.json');
const FILE = () => path.join(CONFIG_DIR, 'ai.json');
export const PROVIDERS = { anthropic: AnthropicProvider, openai: OpenAIProvider };
// Variables d'environnement acceptées à la place d'une clé saisie.
const ENV_KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

const encrypt = seal;
const decrypt = unseal;

export async function readAiSettings() {
  let s = {};
  try {
    s = JSON.parse(await fs.readFile(FILE(), 'utf8'));
  } catch {
    /* premier lancement */
  }
  const out = { provider: 'anthropic', models: {}, keys: {}, customModels: {}, simulation: true, realConfirmed: false, ...s };
  migrateModels(out);
  return out;
}

// Un modèle retiré par le fournisseur (ex. gpt-4o-mini, arrêté par OpenAI) est remplacé par celui qu'il recommande,
// dans le réglage comme dans la liste rafraîchie ; la liste ne garde que des modèles encore servis.
export function replacementFor(provider, model) {
  const retired = MODELS[provider]?.retired || {};
  const base = String(model || '').replace(/-\d{4}-\d{2}-\d{2}$/, ''); // instantané daté → alias
  return retired[model] || retired[base] || null;
}
export function migrateModels(s) {
  for (const id of Object.keys(PROVIDERS)) {
    const to = s.models[id] && replacementFor(id, s.models[id]);
    if (to) s.models[id] = to;
    if (Array.isArray(s.customModels[id]) && s.customModels[id].length) {
      s.customModels[id] = s.customModels[id].filter((m) => m && !replacementFor(id, m.id));
      if (!s.customModels[id].length) delete s.customModels[id];
    }
  }
  return s;
}

async function writeAiSettings(s) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
}

// Vue envoyée à l'interface : jamais la clé, seulement sa présence.
export async function publicAiSettings() {
  const s = await readAiSettings();
  const providers = {};
  for (const id of Object.keys(PROVIDERS)) {
    const m = MODELS[id];
    providers[id] = {
      label: m.label,
      models: s.customModels[id]?.length ? s.customModels[id] : m.models.map(({ id: mid, label }) => ({ id: mid, label })),
      model: s.models[id] || m.default,
      hasKey: !!s.keys[id] || !!process.env[ENV_KEYS[id]],
      fromEnv: !s.keys[id] && !!process.env[ENV_KEYS[id]],
    };
  }
  return { provider: s.provider, providers, simulation: s.simulation !== false, realConfirmed: !!s.realConfirmed };
}

export async function saveAiSettings(input) {
  const s = await readAiSettings();
  if (input.provider && PROVIDERS[input.provider]) s.provider = input.provider;
  for (const id of Object.keys(PROVIDERS)) {
    const p = input.providers?.[id];
    if (!p) continue;
    if (typeof p.model === 'string' && p.model.trim()) s.models[id] = p.model.trim().slice(0, 100);
    if (Array.isArray(p.models)) s.customModels[id] = p.models.filter((m) => m && typeof m.id === 'string').slice(0, 50).map((m) => ({ id: m.id.slice(0, 100), label: String(m.label || m.id).slice(0, 100) }));
    if (p.apiKey === null) delete s.keys[id];
    else if (typeof p.apiKey === 'string' && p.apiKey.trim()) s.keys[id] = await encrypt(p.apiKey.trim());
  }
  if (typeof input.simulation === 'boolean') s.simulation = input.simulation;
  if (input.realConfirmed === true) s.realConfirmed = true;
  await writeAiSettings(s);
  return publicAiSettings();
}

export function modelPrice(provider, model) {
  return MODELS[provider]?.models.find((m) => m.id === model)?.price || MODELS[provider]?.models[0]?.price || { input: 3, output: 15 };
}

// Fournisseur prêt à l'emploi (null si aucune clé).
export async function getProvider({ provider, fetch } = {}) {
  const s = await readAiSettings();
  const id = provider || s.provider;
  const Cls = PROVIDERS[id];
  if (!Cls) return null;
  const apiKey = s.keys[id] ? await decrypt(s.keys[id]) : process.env[ENV_KEYS[id]];
  if (!apiKey) return null;
  const model = s.models[id] || MODELS[id].default;
  // ARACHNIDE_ANTHROPIC_BASE_URL / ARACHNIDE_OPENAI_BASE_URL : passerelle d'entreprise ou serveur de test.
  const p = new Cls({ apiKey, model, fetch, baseUrl: process.env[`ARACHNIDE_${id.toUpperCase()}_BASE_URL`] });
  p.price = modelPrice(id, model);
  return p;
}

// Test de connexion : liste des modèles (vérifie la clé sans générer de texte).
export async function testAiConnection({ provider, apiKey, fetch } = {}) {
  const p = apiKey ? new PROVIDERS[provider]({ apiKey, fetch }) : await getProvider({ provider, fetch });
  if (!p) return { ok: false, error: 'no_key' };
  try {
    const models = await p.listModels();
    return { ok: true, models: models.slice(0, 60) };
  } catch (e) {
    return { ok: false, status: e.status, error: e.status === 401 ? 'invalid_key' : e.message.replace(/sk-[\w-]+/g, 'sk-…') };
  }
}
