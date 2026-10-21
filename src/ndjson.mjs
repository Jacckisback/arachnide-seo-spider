// Lecture et écriture des crawls en NDJSON gzip, en flux (voir public/shared/ndjson.js pour le format).
// pipeline() gère la contre-pression ; le renommage final rend l'écriture atomique.
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { resultRecords, assembler } from '../public/shared/ndjson.js';

export const EXT = '.jsonl.gz';
export const isNdjson = (file) => file.endsWith(EXT);

async function* lines(R) {
  for (const rec of resultRecords(R)) yield JSON.stringify(rec) + '\n';
}

// Écrit le résultat : fichier temporaire, gzip niveau 1 (rapide, le JSON se compresse très bien), puis rename.
export async function writeResult(R, file) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await pipeline(Readable.from(lines(R)), createGzip({ level: 1 }), createWriteStream(tmp));
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

// Lignes décompressées d'un fichier, une par une.
export function readLines(file) {
  const src = createReadStream(file);
  const rl = readline.createInterface({ input: src.pipe(createGunzip()), crlfDelay: Infinity });
  return { rl, close: () => src.destroy() };
}

// Résultat entier, ligne par ligne : la mémoire ne contient jamais le fichier sous forme de chaîne.
export async function readResult(file) {
  const A = assembler();
  const { rl } = readLines(file);
  for await (const line of rl) if (line) A.push(JSON.parse(line));
  return A.finish();
}

// Seule la première ligne : meta et summary, pour l'historique.
export async function readHead(file) {
  const { rl, close } = readLines(file);
  try {
    for await (const line of rl) {
      if (!line) continue;
      const rec = JSON.parse(line);
      if (rec.t !== 'head') throw new Error('Not a crawl file');
      return { version: rec.app_version ?? rec.version, meta: rec.meta, summary: rec.summary };
    }
    throw new Error('Empty crawl file');
  } finally {
    close();
  }
}

// Flux NDJSON décompressé (pour l'envoyer tel quel au navigateur, qui l'assemble ligne par ligne).
export const ndjsonStream = (file) => createReadStream(file).pipe(createGunzip());
