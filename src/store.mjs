// Stockage des crawls sur disque (dossier crawls/), partagé par le serveur web, la CLI et le serveur MCP.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CRAWLS = process.env.ARACHNIDE_CRAWLS || path.join(ROOT, 'crawls');
const INDEX = path.join(CRAWLS, '_index.json');

export const safeName = (n) => (/^[\w.-]+\.json$/.test(n) && n !== '_index.json' ? n : null);

// Index des crawls (score, date, hôte) pour afficher l'historique sans relire chaque fichier.
async function readIndex() {
  try {
    return JSON.parse(await fs.readFile(INDEX, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`Index des crawls illisible (${e.code || e.message}) : il sera reconstruit.`);
    return {};
  }
}

// Écriture atomique : fichier temporaire puis renommage, pour qu'un arrêt pendant l'écriture ne laisse jamais
// un crawl tronqué (un JSON de plusieurs centaines de Mo s'écrit en plusieurs secondes).
export async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

const summaryOf = (r) => ({
  host: new URL(r.meta.startUrl).hostname,
  startUrl: r.meta.startUrl,
  finishedAt: r.meta.finishedAt,
  score: r.summary.score,
  grade: r.summary.grade,
  totalUrls: r.summary.totalUrls,
});

export async function listCrawls() {
  let files;
  try {
    files = (await fs.readdir(CRAWLS)).filter((f) => safeName(f));
  } catch {
    return [];
  }
  const index = await readIndex();
  let dirty = false;
  const out = [];
  for (const f of files) {
    const st = await fs.stat(path.join(CRAWLS, f));
    if (!index[f]) {
      try {
        index[f] = summaryOf(JSON.parse(await fs.readFile(path.join(CRAWLS, f), 'utf8')));
        dirty = true;
      } catch (e) {
        // Fichier tronqué ou corrompu : il reste listé (l'utilisateur peut le supprimer), mais on le dit.
        console.error(`Crawl illisible, ignoré dans l'historique : crawls/${f} (${e.code || e.message})`);
        index[f] = { unreadable: true };
        dirty = true;
      }
    }
    out.push({ file: f, size: st.size, mtime: st.mtime, ...index[f] });
  }
  if (dirty) await writeAtomic(INDEX, JSON.stringify(index)).catch((e) => console.error('Index des crawls non enregistré :', e.message));
  return out.sort((a, b) => String(b.finishedAt || b.mtime).localeCompare(String(a.finishedAt || a.mtime)));
}

export async function saveResult(result) {
  await fs.mkdir(CRAWLS, { recursive: true });
  const host = new URL(result.meta.startUrl).hostname.replace(/[^\w.-]/g, '_').slice(0, 100); // nom de fichier borné
  const stamp = result.meta.finishedAt.replace(/[:]/g, '-').replace(/\..+$/, '');
  const file = `${host}_${stamp}.json`;
  await writeAtomic(path.join(CRAWLS, file), JSON.stringify(result));
  const index = await readIndex();
  index[file] = summaryOf(result);
  await writeAtomic(INDEX, JSON.stringify(index));
  return file;
}

export async function loadCrawl(file) {
  const name = safeName(file);
  if (!name) throw Object.assign(new Error('Invalid crawl file name: ' + file), { status: 400 });
  return JSON.parse(await fs.readFile(path.join(CRAWLS, name), 'utf8'));
}

export async function deleteCrawl(name) {
  await fs.unlink(path.join(CRAWLS, name));
  const index = await readIndex();
  delete index[name];
  await fs.writeFile(INDEX, JSON.stringify(index)).catch(() => {});
}
