// Accès des agents IA à Arachnide : un jeton porteur, créé au premier démarrage, stocké en local
// (~/.arachnide/agent.json, 0600). Il se lit dans l'interface (Paramètres → Agents IA), se renouvelle d'un clic,
// et peut être remplacé par la variable d'environnement ARACHNIDE_AGENT_TOKEN (déploiement sur un serveur).
// Les requêtes de l'interface locale restent reconnues sans jeton (même règle que les routes de correction).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_DIR } from '../sites.mjs';

const FILE = () => path.join(CONFIG_DIR, 'agent.json');
let cache = null;

const newToken = () => 'ara_' + crypto.randomBytes(24).toString('base64url');

export async function readAgentSettings() {
  if (cache) return cache;
  let s = {};
  try {
    s = JSON.parse(await fs.readFile(FILE(), 'utf8'));
  } catch {
    /* premier lancement */
  }
  if (!s.token) {
    s = { token: newToken(), createdAt: new Date().toISOString(), enabled: true, ...s };
    await writeAgentSettings(s);
  }
  cache = { enabled: true, ...s };
  return cache;
}

export async function writeAgentSettings(s) {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(FILE(), JSON.stringify(s, null, 2), { mode: 0o600 });
  cache = s;
  return s;
}

export async function rotateToken() {
  const s = await readAgentSettings();
  return writeAgentSettings({ ...s, token: newToken(), createdAt: new Date().toISOString() });
}

// URL publique (HTTPS) sous laquelle Arachnide est exposé aux agents hébergés (claude.ai, ChatGPT).
export async function setPublicUrl(url) {
  const s = await readAgentSettings();
  const clean = String(url || '').trim().replace(/\/$/, '');
  if (clean && !/^https?:\/\/[^\s/]+$/i.test(clean)) throw Object.assign(new Error('Invalid public URL'), { status: 400, key: 'agents.badUrl' });
  return writeAgentSettings({ ...s, publicUrl: clean || undefined });
}

export async function setAgentEnabled(enabled) {
  const s = await readAgentSettings();
  return writeAgentSettings({ ...s, enabled: !!enabled });
}

// Jeton effectif : l'environnement l'emporte (déploiement), sinon le fichier.
export async function effectiveToken() {
  return process.env.ARACHNIDE_AGENT_TOKEN || (await readAgentSettings()).token;
}

const timingEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Jeton fourni par la requête : Authorization: Bearer …, ou X-API-Key (Actions ChatGPT), ou ?token= (déconseillé).
export function tokenOf(req, url) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) return m[1].trim();
  if (req.headers['x-api-key']) return String(req.headers['x-api-key']).trim();
  return url?.searchParams.get('token') || null;
}

export async function isAuthorized(req, url) {
  const s = await readAgentSettings();
  if (!s.enabled && !process.env.ARACHNIDE_AGENT_TOKEN) return false;
  const given = tokenOf(req, url);
  if (!given) return false;
  return timingEqual(given, await effectiveToken());
}
