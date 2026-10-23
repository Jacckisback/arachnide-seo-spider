// Stockage des crawls sur disque (dossier crawls/), partagé par le serveur web, la CLI et le serveur MCP.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXT, isNdjson, writeResult, readResult, readHead, writeRecords, readRecords } from './ndjson.mjs';
import { aggregatorRecords, aggregatorFromRecords, applyLogs } from './logs/analyze.mjs';
import { applySegments } from '../public/shared/segments.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CRAWLS = process.env.ARACHNIDE_CRAWLS || path.join(ROOT, 'crawls');
const INDEX = path.join(CRAWLS, '_index.json');

// Fichiers de crawl : NDJSON gzip (.jsonl.gz, depuis la 3.18) ou JSON d'un bloc (.json, versions antérieures, toujours lisible).
export const safeName = (n) => (/^[\w.-]+\.(json|jsonl\.gz)$/.test(n) && n !== '_index.json' && !n.endsWith('.segments.json') && !n.endsWith('.logs.jsonl.gz') ? n : null);
export const crawlId = (file) => file.replace(/\.(jsonl\.gz|json)$/, '');
// Fichier d'un identifiant de crawl (nom sans extension, ou nom complet).
export async function crawlFileOf(id) {
  if (safeName(id)) return id;
  for (const f of [id + EXT, id + '.json']) if (safeName(f) && (await fs.stat(path.join(CRAWLS, f)).catch(() => null))) return f;
  return null;
}
// Dossier des crawls en cours (journaux de reprise).
export const PENDING = path.join(CRAWLS, '.en-cours');
export const journalPath = (id) => path.join(PENDING, id.replace(/[^\w.-]/g, '_') + '.ndjson');
export async function listPending() {
  let files;
  try {
    files = (await fs.readdir(PENDING)).filter((f) => f.endsWith('.ndjson'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const st = await fs.stat(path.join(PENDING, f));
    out.push({ id: f.replace(/\.ndjson$/, ''), file: path.join(PENDING, f), size: st.size, mtime: st.mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

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
  mode: r.meta.mode,
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
        // Nouveau format : seule la ligne d'en-tête est lue ; ancien : le fichier entier.
        index[f] = summaryOf(isNdjson(f) ? await readHead(path.join(CRAWLS, f)) : JSON.parse(await fs.readFile(path.join(CRAWLS, f), 'utf8')));
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
  const file = `${host}_${stamp}${EXT}`;
  await writeResult(result, path.join(CRAWLS, file));
  const index = await readIndex();
  index[file] = summaryOf(result);
  await writeAtomic(INDEX, JSON.stringify(index));
  return file;
}

// Lecture d'un fichier de crawl, quel que soit son format.
export async function readResultFile(file) {
  return isNdjson(file) ? readResult(file) : JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function loadCrawl(file) {
  const name = safeName(file);
  if (!name) throw Object.assign(new Error('Invalid crawl file name: ' + file), { status: 400 });
  const R = await readResultFile(path.join(CRAWLS, name));
  // Journaux d'accès importés après le crawl : fichier voisin (agrégat), rattaché à l'ouverture.
  const agg = await readLogs(name);
  if (agg) applyLogs(R, agg);
  // Segments modifiés après le crawl : fichier voisin, appliqué à l'ouverture (le crawl n'est jamais réécrit).
  const segs = await readSegments(name);
  if (segs) applySegments(R, segs);
  return R;
}

// Agrégat des journaux d'accès d'un crawl : <nom>.logs.jsonl.gz à côté du fichier, écrit en flux.
const logsFile = (name) => path.join(CRAWLS, crawlId(name) + '.logs.jsonl.gz');
export async function saveLogs(name, agg) {
  if (!safeName(name)) return;
  await writeRecords(aggregatorRecords(agg), logsFile(name));
}
export async function readLogs(name) {
  try {
    await fs.access(logsFile(name));
  } catch {
    return null;
  }
  const recs = [];
  for await (const r of readRecords(logsFile(name))) recs.push(r);
  return aggregatorFromRecords(recs);
}
export async function deleteLogs(name) {
  if (safeName(name)) await fs.unlink(logsFile(name)).catch(() => {});
}

// Segments d'un crawl enregistré : <nom>.segments.json à côté du fichier, plutôt que de réécrire tout le crawl.
const segmentsFile = (name) => path.join(CRAWLS, crawlId(name) + '.segments.json');
export async function saveSegments(name, segments) {
  if (!safeName(name)) return;
  await writeAtomic(segmentsFile(name), JSON.stringify(segments || []));
}
export async function readSegments(name) {
  try {
    return JSON.parse(await fs.readFile(segmentsFile(name), 'utf8'));
  } catch {
    return null;
  }
}

export async function deleteCrawl(name) {
  await fs.unlink(path.join(CRAWLS, name));
  await fs.unlink(segmentsFile(name)).catch(() => {});
  await fs.unlink(logsFile(name)).catch(() => {});
  const index = await readIndex();
  delete index[name];
  await fs.writeFile(INDEX, JSON.stringify(index)).catch(() => {});
}
