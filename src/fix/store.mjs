// Corrections (Fix) et connexion CMS par site : ~/.arachnide/fixes/<hôte>.json et ~/.arachnide/connections.json.
// Les secrets de connexion (mot de passe d'application, token) sont chiffrés et jamais renvoyés à l'interface.
import path from 'node:path';
import { CONFIG_DIR } from '../sites.mjs';
import { seal, unseal, readJsonFile, writeJsonFile } from '../secret.mjs';
import { FixSchema } from './schema.mjs';

const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const fixesFile = (host) => path.join(CONFIG_DIR, 'fixes', host.replace(/[^\w.-]/g, '_') + '.json');
const CONN_FILE = () => path.join(CONFIG_DIR, 'connections.json');

export async function readFixes(siteUrl) {
  return (await readJsonFile(fixesFile(hostOf(siteUrl)), { fixes: [] })).fixes;
}

// Ajoute ou remplace des Fix (par id) ; chaque Fix est revalidé contre le schéma avant écriture.
export async function saveFixes(siteUrl, fixes) {
  const all = await readFixes(siteUrl);
  const byId = new Map(all.map((f) => [f.id, f]));
  for (const f of fixes) byId.set(f.id, FixSchema.parse(f));
  const list = [...byId.values()];
  await writeJsonFile(fixesFile(hostOf(siteUrl)), { fixes: list });
  return list;
}

// Propositions non traitées (proposed/edited/failed) remplacées par une nouvelle génération pour la même cible.
export async function replaceProposals(siteUrl, fresh) {
  const key = (f) => `${f.issueType}|${f.url}|${f.target.kind}|${f.target.selector || ''}`;
  const keys = new Set(fresh.map(key));
  const kept = (await readFixes(siteUrl)).filter((f) => !(keys.has(key(f)) && ['proposed', 'edited', 'failed', 'ignored'].includes(f.status)));
  await writeJsonFile(fixesFile(hostOf(siteUrl)), { fixes: [...kept, ...fresh.map((f) => FixSchema.parse(f))] });
  return fresh;
}

// ---------- Connexion CMS ----------
const SECRET_FIELDS = ['appPassword', 'token'];

export async function readConnection(siteUrl, { withSecrets = false } = {}) {
  const all = await readJsonFile(CONN_FILE(), {});
  const c = all[hostOf(siteUrl)];
  if (!c) return { type: 'export' };
  const out = { ...c };
  for (const k of SECRET_FIELDS) {
    if (!c[k]) continue;
    out[k] = withSecrets ? await unseal(c[k]) : undefined;
    out['has_' + k] = true;
  }
  return out;
}

export async function saveConnection(siteUrl, input) {
  const all = await readJsonFile(CONN_FILE(), {});
  const host = hostOf(siteUrl);
  const prev = all[host] || {};
  const type = ['wordpress', 'github', 'export'].includes(input.type) ? input.type : 'export';
  const next = { type, url: input.url || prev.url || new URL(siteUrl).origin };
  for (const k of ['user', 'repo', 'branch', 'basePath']) if (input[k] !== undefined) next[k] = String(input[k]).trim().slice(0, 300);
  else if (prev[k] !== undefined && prev.type === type) next[k] = prev[k];
  for (const k of SECRET_FIELDS) {
    if (input[k] === null) continue;
    if (typeof input[k] === 'string' && input[k].trim()) next[k] = await seal(input[k].trim());
    else if (prev[k] && prev.type === type) next[k] = prev[k];
  }
  all[host] = next;
  await writeJsonFile(CONN_FILE(), all);
  return readConnection(siteUrl);
}
