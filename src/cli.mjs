#!/usr/bin/env node
// Crawl en ligne de commande : node src/cli.mjs https://exemple.fr --max 1000 --csv
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Crawler, USER_AGENTS } from './crawler.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const val = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const VALUE_FLAGS = new Set(['max', 'depth', 'concurrency', 'delay', 'ua', 'include', 'exclude', 'out']);
const url = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(args[i - 1].slice(2))))[0];

if (!url || flag('help')) {
  console.log(`Usage : node src/cli.mjs <url> [options]

  --max N            Nombre maximum d'URLs (défaut 500)
  --depth N          Profondeur maximale (défaut 20)
  --concurrency N    Requêtes simultanées (défaut 5)
  --delay MS         Pause entre requêtes par worker (défaut 0)
  --ua NOM           arachnide | googlebot | googlebotMobile | chrome
  --external         Vérifie le statut des liens externes
  --images           Vérifie le statut et le poids des images
  --ignore-robots    Ignore le robots.txt
  --subdomains       Crawle aussi les sous-domaines
  --no-sitemap       N'utilise pas les sitemaps XML
  --include REGEX    Ne crawle que les URLs correspondant au motif
  --exclude REGEX    Exclut les URLs correspondant au motif
  --csv              Exporte aussi pages.csv et problemes.csv
  --out DOSSIER      Dossier de sortie (défaut ./crawls)`);
  process.exit(url ? 0 : 1);
}

const opts = {
  maxPages: Number(val('max', 500)),
  maxDepth: Number(val('depth', 20)),
  concurrency: Number(val('concurrency', 5)),
  delayMs: Number(val('delay', 0)),
  userAgent: USER_AGENTS[val('ua', 'arachnide')] || val('ua'),
  checkExternal: flag('external'),
  checkImages: flag('images'),
  respectRobots: !flag('ignore-robots'),
  crawlSubdomains: flag('subdomains'),
  useSitemaps: !flag('no-sitemap'),
  include: val('include', ''),
  exclude: val('exclude', ''),
};

const crawler = new Crawler(url, opts);
const tty = process.stdout.isTTY;
crawler.on('status', (s) => console.log(`→ ${s.message}`));
crawler.on('progress', (p) => {
  if (tty) process.stdout.write(`\r  ${p.crawled} URLs crawlées · ${p.queued} en file · ${Math.round(p.elapsed / 1000)} s   `);
});
process.on('SIGINT', () => {
  console.log('\nArrêt demandé, analyse des pages déjà crawlées…');
  crawler.stop();
});

const r = await crawler.start();
if (tty) process.stdout.write('\n');

const S = r.summary;
const icon = { error: '✖', warning: '▲', notice: '•' };
console.log(`\n=== ${r.meta.startUrl} ===`);
console.log(`Score de santé : ${S.score}/100`);
console.log(`URLs : ${S.totalUrls} · Pages HTML 200 : ${S.htmlPages} · Indexables : ${S.indexable}`);
console.log(`Temps de réponse moyen : ${S.avgResponseTime} ms · Mots moyens/page : ${S.avgWords}`);
console.log(`Codes : ${Object.entries(S.statusBuckets).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`\nProblèmes (${S.errors} erreurs, ${S.warnings} avertissements, ${S.notices} remarques) :`);
for (const i of r.issues) console.log(`  ${icon[i.severity]} ${String(i.count).padStart(5)}  ${i.label}`);

const outDir = path.resolve(val('out', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'crawls')));
await fs.mkdir(outDir, { recursive: true });
const base = `${new URL(r.meta.startUrl).hostname}_${r.meta.finishedAt.replace(/[:]/g, '-').replace(/\..+$/, '')}`;
await fs.writeFile(path.join(outDir, base + '.json'), JSON.stringify(r));
console.log(`\nRésultat complet : ${path.join(outDir, base + '.json')} (ouvrable dans l'interface)`);

if (flag('csv')) {
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join(' | ') : v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (rows, cols) => '﻿' + [cols.join(';'), ...rows.map((row) => cols.map((c) => esc(row[c])).join(';'))].join('\n');
  const cols = ['url', 'status', 'indexable', 'indexabilityReason', 'depth', 'title', 'titleLength', 'metaDescription', 'metaDescriptionLength', 'h1', 'h1Count', 'h2Count', 'wordCount', 'canonical', 'metaRobots', 'inlinks', 'uniqueInlinks', 'internalOutlinks', 'externalOutlinks', 'responseTime', 'size', 'inSitemap', 'redirectUrl'];
  await fs.writeFile(path.join(outDir, base + '_pages.csv'), toCsv(r.pages, cols));
  const issueRows = r.issues.flatMap((i) => i.items.map((it) => ({ gravite: i.severity, categorie: i.category, probleme: i.label, url: it.url, detail: it.detail, correction: i.fix })));
  await fs.writeFile(path.join(outDir, base + '_problemes.csv'), toCsv(issueRows, ['gravite', 'categorie', 'probleme', 'url', 'detail', 'correction']));
  console.log(`CSV : ${base}_pages.csv, ${base}_problemes.csv`);
}
