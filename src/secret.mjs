// Chiffrement local des secrets (clé API IA, mot de passe d'application WordPress, token GitHub) :
// AES-256-GCM avec une clé machine ~/.arachnide/.secret (0600). Rien n'est jamais renvoyé à l'interface.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG_DIR } from './sites.mjs';

const SECRET = () => path.join(CONFIG_DIR, '.secret');

async function machineKey() {
  try {
    return Buffer.from(await fs.readFile(SECRET(), 'utf8'), 'base64');
  } catch {
    const k = crypto.randomBytes(32);
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(SECRET(), k.toString('base64'), { mode: 0o600 });
    return k;
  }
}

export async function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', await machineKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export async function unseal(box) {
  if (!box) return null;
  const d = crypto.createDecipheriv('aes-256-gcm', await machineKey(), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
}

export async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
