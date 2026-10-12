// Configuration des sites gérés par le serveur MCP : ~/.arachnide/sites.json (ou $ARACHNIDE_CONFIG).
// Les secrets ne passent jamais par Claude : dans le fichier, une valeur "env:NOM" est lue dans la variable
// d'environnement NOM au moment de l'utilisation, et les outils MCP masquent toutes les valeurs sensibles.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = process.env.ARACHNIDE_HOME || path.join(os.homedir(), '.arachnide');
export const CONFIG_FILE = process.env.ARACHNIDE_CONFIG || path.join(CONFIG_DIR, 'sites.json');

export const SECRET_KEY = /pass|token|secret|key$|apikey|credential/i;

export const DEFAULT_POLICY = {
  // Champs que Claude peut modifier sur ce site (tous par défaut).
  allowedFields: ['seo_title', 'meta_description', 'h1', 'canonical', 'noindex', 'image_alt', 'redirect'],
  maxChangesPerBatch: 50,
  readOnly: false,
};

export async function readConfig() {
  try {
    const json = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    return { sites: {}, ...json };
  } catch (e) {
    if (e.code === 'ENOENT') return { sites: {} };
    throw new Error(`Cannot read ${CONFIG_FILE}: ${e.message}`);
  }
}

export async function writeConfig(cfg) {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

// Valeurs « env:NOM » → contenu de la variable d'environnement.
export function resolveSecrets(site, env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(site)) {
    if (typeof v === 'string' && v.startsWith('env:')) {
      const name = v.slice(4);
      if (env[name] === undefined) throw Object.assign(new Error(`Environment variable ${name} (for "${k}") is not set.`), { code: 'config' });
      out[k] = env[name];
    } else out[k] = v;
  }
  return out;
}

// Version affichable : secrets masqués, références env: conservées.
export function publicSite(name, site) {
  const out = { name };
  for (const [k, v] of Object.entries(site)) {
    out[k] = SECRET_KEY.test(k) && typeof v === 'string' && !v.startsWith('env:') ? '••••' : v;
  }
  out.policy = { ...DEFAULT_POLICY, ...site.policy };
  return out;
}

export async function getSite(name) {
  const cfg = await readConfig();
  const site = cfg.sites[name];
  if (!site) {
    const names = Object.keys(cfg.sites);
    throw Object.assign(new Error(`Unknown site "${name}". ${names.length ? `Configured sites: ${names.join(', ')}.` : `No site configured yet: use arachnide_configure_site (config file ${CONFIG_FILE}).`}`), { code: 'config' });
  }
  return { name, ...site, policy: { ...DEFAULT_POLICY, ...site.policy } };
}
