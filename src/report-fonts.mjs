// Polices du rapport client, lues sur disque et embarquées dans le HTML (data: URL) : le rapport est envoyé par
// e-mail, ouvert hors ligne et imprimé en PDF, il doit avoir le même aspect partout. Newsreader (titres, chiffres)
// et Inter (texte, tableaux), sous-ensemble latin, licence SIL OFL 1.1 (public/fonts/LICENSE-*.txt).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
export const REPORT_FONT_FILES = { serif: 'newsreader-latin-wght-normal.woff2', sans: 'inter-latin-wght-normal.woff2' };
let cache = null;

export async function reportFonts() {
  if (cache) return cache;
  try {
    const out = {};
    for (const [k, f] of Object.entries(REPORT_FONT_FILES)) out[k] = 'data:font/woff2;base64,' + (await fs.readFile(path.join(DIR, f))).toString('base64');
    cache = out;
  } catch {
    cache = {}; // polices absentes : le rapport retombe sur les polices du système
  }
  return cache;
}
