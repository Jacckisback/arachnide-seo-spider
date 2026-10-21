// Mesure d'échelle reproductible, sans réseau : crawl du site synthétique local, puis analyse et sauvegarde.
//   npm run bench -- --pages 200000 [--concurrency 20] [--memory-mb 4096]
// Affiche la durée, la mémoire maximale (process.resourceUsage().maxRSS) et la taille du fichier ; échoue (code 1)
// au-delà du budget mémoire. Le chiffre à publier dans le README vient d'ici.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startBenchSite } from './site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { writeResult, readHead, EXT } from '../src/ndjson.mjs';
import { VERSION } from '../src/crawler.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const pages = Number(arg('pages', 20000));
const concurrency = Number(arg('concurrency', 20));
const budgetMb = Number(arg('memory-mb', 4096));
const site = await startBenchSite({ pages });
const base = `http://127.0.0.1:${site.address().port}/`;
const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-bench-')), 'bench' + EXT);
const t0 = Date.now();
const c = new Crawler(base, { maxPages: pages, concurrency, maxUrlPerSec: 0, checkImages: false, useSitemaps: false, timeoutMs: 30000 });
let last = 0;
c.on('progress', (p) => { if (Date.now() - last > 5000) { last = Date.now(); process.stdout.write(`\r  ${p.crawled} pages · ${p.queued} en file · ${Math.round(p.elapsed / 1000)} s   `); } });
const R = await c.start();
const tCrawl = Date.now() - t0;
const t1 = Date.now();
await writeResult(R, out);
const tSave = Date.now() - t1;
const t2 = Date.now();
const head = await readHead(out);
const size = (await fs.stat(out)).size;
const maxRss = process.resourceUsage().maxRSS / 1024; // Mo (Linux : Ko)
site.close();
await fs.unlink(out).catch(() => {});
console.log(`\n\nArachnide ${VERSION} · site synthétique de ${pages} pages, concurrence ${concurrency}`);
console.log(`  pages crawlées     ${R.summary.totalUrls}`);
console.log(`  liens              ${R.summary.internalLinks + R.summary.externalLinks}`);
console.log(`  crawl + analyse    ${(tCrawl / 1000).toFixed(1)} s`);
console.log(`  sauvegarde         ${(tSave / 1000).toFixed(1)} s · fichier ${(size / 1e6).toFixed(1)} Mo · en-tête relu en ${Date.now() - t2} ms`);
console.log(`  mémoire maximale   ${maxRss.toFixed(0)} Mo (budget ${budgetMb} Mo)`);
if (maxRss > budgetMb) {
  console.error(`✖ budget mémoire dépassé`);
  process.exit(1);
}
