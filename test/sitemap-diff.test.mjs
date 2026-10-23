// Changements de sitemap (3.23) : comparer le sitemap (index à plusieurs sous-sitemaps) à une référence, ne crawler que
// les URL retirées / ajoutées, suivre les redirections et trancher 301 / 410 / garder. Cœur, crawler, persistance,
// serveur + agent, CLI, interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Crawler } from '../src/crawler.mjs';
import { toCrawlerOptions } from '../src/options.mjs';
import { writeResult, readResult, EXT } from '../src/ndjson.mjs';
import { lightRecords } from '../src/view.mjs';
import { readNdjson } from '../public/shared/ndjson.js';
import { buildReport } from '../public/shared/report.js';
import { diffUrls, parseUrlList, readSitemapUrls, similarity, suggestTarget, previousUrlsOf, resolveSitemapPrevious, DECISIONS, ACTION_DECISIONS } from '../src/sitemap-diff.mjs';
import { loadPlaywright, openApp } from './ui-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-smd-'));
test.after(() => fs.rm(tmp, { recursive: true, force: true }));

// ---- Boutique de test : le sitemap d'aujourd'hui (index + 2 sous-sitemaps) a perdu dix produits et en a gagné deux ----
const page = (t, extra = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${t}</title><meta name="description" content="${t} : description assez longue pour le test de la boutique">${extra}</head><body><h1>${t}</h1><p>${'Contenu produit détaillé. '.repeat(80)}</p><a href="/">Accueil</a></body></html>`;
const ROUTES = {
  '/': [200, page('Boutique')],
  '/produits/chaussure-rouge-42': [200, page('Chaussure rouge 42')],
  '/produits/chaussure-rouge-43': [200, page('Chaussure rouge 43')],
  '/produits/chaussure-bleue-40': [200, page('Chaussure bleue 40')],
  '/produits/veste-cuir': [200, page('Veste cuir')],
  '/produits/nouveau-sac': [200, page('Nouveau sac')],
  '/produits/nouveau-casse': [500, 'boom'],
  '/produits/chaussure-rouge-41': [404, 'nope'], // retiré : proche de chaussure-rouge-42 → 301 proposée
  '/produits/truc-bizarre-xyz': [404, 'nope'], // retiré : rien de proche → 410
  '/produits/ancien-sac': [301, '/produits/nouveau-sac'], // retiré : redirection correcte
  '/produits/vieille-veste': [301, '/produits/veste-disparue'], // retiré : redirection vers une 404
  '/produits/veste-disparue': [404, 'nope'],
  '/produits/chaine-1': [301, '/produits/chaine-2'],
  '/produits/chaine-2': [302, '/produits/veste-cuir'], // retiré : chaîne de deux sauts
  '/produits/boucle-a': [301, '/produits/boucle-b'],
  '/produits/boucle-b': [301, '/produits/boucle-a'], // retiré : boucle
  '/produits/encore-la': [200, page('Encore là')], // retiré mais vivant et indexable
  '/produits/encore-la-noindex': [200, page('Noindex', '<meta name="robots" content="noindex">')], // retiré, hors index
  '/produits/parti': [410, 'gone'],
  '/produits/timeout': [503, 'later'],
};
const CURRENT = { '/sitemap-1.xml': ['/', '/produits/chaussure-rouge-42', '/produits/chaussure-rouge-43'], '/sitemap-2.xml': ['/produits/chaussure-bleue-40', '/produits/veste-cuir', '/produits/nouveau-sac', '/produits/nouveau-casse'] };
const PREVIOUS = ['/', '/produits/chaussure-rouge-42', '/produits/chaussure-rouge-43', '/produits/chaussure-bleue-40', '/produits/veste-cuir', '/produits/chaussure-rouge-41', '/produits/truc-bizarre-xyz', '/produits/ancien-sac', '/produits/vieille-veste', '/produits/chaine-1', '/produits/boucle-a', '/produits/encore-la', '/produits/encore-la-noindex', '/produits/parti', '/produits/timeout'];
const hits = [];
const shop = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const host = req.headers.host;
  hits.push(u.pathname);
  const urlset = (paths) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>http://${host}${p}</loc></url>`).join('')}</urlset>`;
  if (u.pathname === '/robots.txt') return res.end('User-agent: *\nAllow: /\n');
  if (u.pathname === '/sitemap_index.xml') return res.end(`<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>http://${host}/sitemap-1.xml</loc></sitemap><sitemap><loc>http://${host}/sitemap-2.xml</loc></sitemap></sitemapindex>`);
  if (CURRENT[u.pathname]) return res.end(urlset(CURRENT[u.pathname]));
  if (u.pathname === '/old-sitemap.xml') return res.end(urlset(PREVIOUS)); // l'ancien sitemap, encore servi
  if (u.pathname === '/old-sitemap.xml.gz') return res.end(gzipSync(urlset(PREVIOUS)));
  const r = ROUTES[u.pathname];
  if (!r) {
    res.writeHead(404);
    return res.end('nf');
  }
  if (r[0] >= 300 && r[0] < 400) {
    res.writeHead(r[0], { location: r[1] });
    return res.end();
  }
  res.writeHead(r[0], { 'content-type': 'text/html; charset=utf-8' });
  res.end(r[1]);
});
await new Promise((r) => shop.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${shop.address().port}`;
test.after(() => shop.close());
const abs = (paths) => paths.map((p) => base + p);

test('cœur : diff, lecture d’un sitemap / index / liste, similarité et cible proposée', async () => {
  assert.deepEqual(diffUrls(['a', 'b', 'c'], ['b', 'c', 'd']), { removed: ['d'], added: ['a'], kept: 2 });
  assert.deepEqual(diffUrls(new Set(['a']), new Set(['a'])), { removed: [], added: [], kept: 1 });
  assert.deepEqual(parseUrlList('<?xml version="1.0"?><urlset><url><loc>http://a/b</loc></url><url><loc><![CDATA[http://a/c?x=1&amp;y=2]]></loc></url></urlset>'), ['http://a/b', 'http://a/c?x=1&y=2']);
  assert.deepEqual(parseUrlList('<sitemapindex><sitemap><loc>http://a/s1.xml</loc></sitemap></sitemapindex>'), ['http://a/s1.xml']);
  assert.deepEqual(parseUrlList('# ancien export\nhttp://a/x\n\nftp://nope\nhttps://a/y \n'), ['http://a/x', 'https://a/y']);
  const fetchText = async (u) => { const r = await fetch(u); return r.ok ? r.text() : null; };
  const idx = await readSitemapUrls(base + '/sitemap_index.xml', fetchText);
  assert.equal(idx.files, 3);
  assert.deepEqual(idx.urls, abs([...CURRENT['/sitemap-1.xml'], ...CURRENT['/sitemap-2.xml']]));
  assert.equal((await readSitemapUrls(base + '/old-sitemap.xml', fetchText)).urls.length, PREVIOUS.length);
  assert.equal((await readSitemapUrls(base + '/nope.xml', fetchText)).urls.length, 0);
  // Similarité : même dossier et slug proche ; un slug identique ailleurs reste pertinent ; rien de commun → 0.
  assert.ok(similarity('http://s/produits/chaussure-rouge-41', 'http://s/produits/chaussure-rouge-42') >= 70);
  assert.ok(similarity('http://s/produits/chaussure-rouge-41', 'http://s/produits/veste-cuir') < 34);
  assert.ok(similarity('http://s/a/veste-cuir-noir', 'http://s/b/veste-cuir') >= 40);
  assert.equal(similarity('http://s/x/truc-bizarre', 'http://s/y/autre-chose'), 0);
  const cands = abs(['/produits/chaussure-rouge-42', '/produits/veste-cuir', '/']);
  assert.deepEqual(suggestTarget(base + '/produits/chaussure-rouge-41', cands).url, base + '/produits/chaussure-rouge-42');
  assert.equal(suggestTarget(base + '/produits/truc-bizarre-xyz', cands), null);
  assert.equal(suggestTarget(base + '/produits/veste-cuir', cands)?.url, undefined); // jamais soi-même
  assert.equal(DECISIONS.length, 11);
  assert.ok(ACTION_DECISIONS.has('redirect-suggested') && !ACTION_DECISIONS.has('redirect-ok'));
});

test('crawler : index à deux sous-sitemaps comparé à l’ancien sitemap, seules les URL changées sont crawlées, redirections suivies, une décision par URL, six contrôles', async () => {
  hits.length = 0;
  const c = new Crawler('', toCrawlerOptions({ mode: 'list', sitemapUrl: base + '/sitemap_index.xml', sitemapPrevious: abs(PREVIOUS), sitemapChanges: 'both', concurrency: 4, timeoutMs: 3000, sitemapPreviousSource: { type: 'sitemap', name: 'old-sitemap.xml' } }));
  const R = await c.start();
  const D = R.meta.sitemapDiff;
  assert.deepEqual({ previous: D.previous, current: D.current, removed: D.removed, added: D.added, kept: D.kept, crawled: D.crawled, source: D.source }, { previous: 15, current: 7, removed: 10, added: 2, kept: 5, crawled: 'both', source: { type: 'sitemap', name: 'old-sitemap.xml', date: '' } });
  assert.equal(D.sitemapUrl, base + '/sitemap_index.xml');
  // Les sous-sitemaps ont été lus ; les pages inchangées (chaussure-rouge-42…) n'ont pas été téléchargées.
  assert.ok(hits.includes('/sitemap-1.xml') && hits.includes('/sitemap-2.xml'));
  assert.ok(!hits.includes('/produits/chaussure-rouge-42') && !hits.includes('/produits/chaussure-bleue-40'));
  assert.equal(hits.filter((h) => h === '/produits/veste-cuir').length, 1, 'veste-cuir n’est téléchargée que comme cible de la chaîne');
  assert.equal(c.listUrls.length, 12);
  assert.equal(R.pages.length, 16, 'les cibles de redirection sont téléchargées pour connaître le code final');
  assert.ok(R.pages.find((p) => p.url === base + '/produits/veste-disparue')?.via === 'redirect');
  assert.equal(R.sitemapUrls.length, 7, 'le sitemap complet du jour est gardé comme référence du prochain crawl');
  assert.equal(R.meta.options.sitemapPrevious, 15, 'la liste de référence ne se retrouve pas dans les options enregistrées');
  const by = Object.fromEntries(R.sitemapChanges.map((r) => [r.url.replace(base, ''), r]));
  const exp = {
    '/produits/chaussure-rouge-41': ['removed', 404, 'redirect-suggested'],
    '/produits/truc-bizarre-xyz': ['removed', 404, 'gone-410'],
    '/produits/ancien-sac': ['removed', 301, 'redirect-ok'],
    '/produits/vieille-veste': ['removed', 301, 'redirect-broken'],
    '/produits/chaine-1': ['removed', 301, 'redirect-chain'],
    '/produits/boucle-a': ['removed', 301, 'redirect-broken'],
    '/produits/encore-la': ['removed', 200, 'live'],
    '/produits/encore-la-noindex': ['removed', 200, 'noindex'],
    '/produits/parti': ['removed', 410, 'gone-ok'],
    '/produits/timeout': ['removed', 503, 'error'],
    '/produits/nouveau-sac': ['added', 200, 'added-ok'],
    '/produits/nouveau-casse': ['added', 500, 'added-bad'],
  };
  assert.deepEqual(Object.keys(by).sort(), Object.keys(exp).sort());
  for (const [u, [change, status, decision]] of Object.entries(exp)) assert.deepEqual([by[u].change, by[u].status, by[u].decision], [change, status, decision], u);
  assert.equal(by['/produits/chaussure-rouge-41'].suggest, base + '/produits/chaussure-rouge-42');
  assert.ok(by['/produits/chaussure-rouge-41'].score >= 70);
  assert.deepEqual([by['/produits/ancien-sac'].finalUrl, by['/produits/ancien-sac'].finalStatus, by['/produits/ancien-sac'].hops], [base + '/produits/nouveau-sac', 200, 1]);
  assert.deepEqual([by['/produits/vieille-veste'].finalStatus, by['/produits/vieille-veste'].hops], [404, 1]);
  assert.deepEqual([by['/produits/chaine-1'].finalUrl, by['/produits/chaine-1'].finalStatus, by['/produits/chaine-1'].hops], [base + '/produits/veste-cuir', 200, 2]);
  assert.equal(by['/produits/boucle-a'].hops, 2);
  assert.equal(by['/produits/encore-la-noindex'].indexabilityReason, 'noindex');
  // Les décisions sont triées : d'abord ce qui demande une action.
  assert.equal(R.sitemapChanges[0].decision, 'redirect-suggested');
  assert.ok(R.sitemapChanges.findIndex((r) => r.decision === 'redirect-ok') > R.sitemapChanges.findIndex((r) => r.decision === 'live'));
  assert.deepEqual(D.counts, { 'redirect-suggested': 1, 'gone-410': 1, 'redirect-broken': 2, error: 1, live: 1, 'added-bad': 1, 'redirect-chain': 1, 'redirect-ok': 1, 'gone-ok': 1, noindex: 1, 'added-ok': 1, actions: 8 });
  // Contrôles, avec détails traduisibles.
  const issues = Object.fromEntries(R.issues.filter((i) => i.id.startsWith('sitemap-')).map((i) => [i.id, i]));
  assert.deepEqual(Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, [v.severity, v.count, v.scope]])), {
    'sitemap-removed-404': ['error', 2, 'page'],
    'sitemap-removed-redirect-broken': ['error', 2, 'page'],
    'sitemap-removed-error': ['error', 1, 'page'],
    'sitemap-removed-live': ['warning', 1, 'page'],
    'sitemap-added-not-indexable': ['error', 1, 'page'],
    'sitemap-removed-redirect-chain': ['notice', 1, 'page'],
  });
  const d404 = Object.fromEntries(issues['sitemap-removed-404'].items.map((x) => [x.url.replace(base, ''), x.detail]));
  assert.deepEqual(d404['/produits/chaussure-rouge-41'], { k: 'd.smRedirectTo', p: { url: base + '/produits/chaussure-rouge-42', score: by['/produits/chaussure-rouge-41'].score } });
  assert.deepEqual(d404['/produits/truc-bizarre-xyz'], { k: 'd.smGone', p: {} });
  assert.equal(issues['sitemap-added-not-indexable'].items[0].detail.k, 'd.smStatus');
  assert.ok(R.pages.find((p) => p.url === base + '/produits/encore-la').sitemapChange === 'removed');
  assert.ok(R.issues.every((i) => i.priority > 0));
  // Les contrôles pèsent dans le score comme les autres ; le résultat léger et le rapport portent la section.
  assert.ok(R.summary.score < 100);
  const light = await readNdjson((async function* () { for (const r of lightRecords(R)) yield JSON.stringify(r) + '\n'; })());
  assert.equal(light.sitemapChanges.length, 12);
  assert.equal(light.sitemapUrls.length, 0, 'la référence ne voyage pas vers le navigateur');
  assert.equal(light.meta.sitemapDiff.counts.actions, 8);
  const t = Object.assign((k, p = {}) => k + (p.url ? ':' + p.url : ''), { date: () => 'd', num: (n) => String(n), lang: 'fr', has: () => true });
  const html = buildReport(R, {}, t);
  assert.ok(html.includes('report.sitemapChanges') && html.includes('smd.redirect-suggested') && html.includes('/produits/chaussure-rouge-41'));
  // Persistance : aller-retour NDJSON.
  const file = path.join(tmp, 'diff' + EXT);
  await writeResult(R, file);
  const back = await readResult(file);
  assert.deepEqual(back.sitemapChanges, R.sitemapChanges);
  assert.deepEqual(back.sitemapUrls, R.sitemapUrls);
  assert.deepEqual(back.meta.sitemapDiff, D);
  // Un crawl de changements sert de référence au suivant : sa référence est le sitemap complet du jour, pas ses 12 URL.
  assert.deepEqual(previousUrlsOf(back).sort(), abs([...CURRENT['/sitemap-1.xml'], ...CURRENT['/sitemap-2.xml']]).sort());
});

test('références : crawl spider (URL du sitemap), crawl liste, sitemap distant (index, .gz), texte ; seulement les retirées par défaut ; sans changement', async () => {
  // Crawl spider de la boutique d'hier : ses URL de sitemap font référence.
  const spiderPrev = await new Crawler(base + '/', { concurrency: 4, timeoutMs: 3000, sitemapUrl: '', maxPages: 30 }).start();
  // (le site n'a pas de robots.txt avec Sitemap: → la référence spider vient d'un crawl liste du vieux sitemap)
  const listPrev = await new Crawler('', toCrawlerOptions({ mode: 'list', sitemapUrl: base + '/old-sitemap.xml', concurrency: 4, timeoutMs: 3000 })).start();
  assert.equal(previousUrlsOf(listPrev).length, 15, 'en mode liste, les cibles de redirection ne font pas partie de la référence');
  assert.equal(previousUrlsOf(spiderPrev).length, spiderPrev.pages.filter((p) => p.inSitemap).length);
  const prevFile = path.join(tmp, 'prev' + EXT);
  await writeResult(listPrev, prevFile);
  // resolveSitemapPrevious : crawl, texte (XML / liste), URL (index, gzip).
  const o1 = await resolveSitemapPrevious({ sitemapPreviousCrawl: 'prev' + EXT }, { loadCrawl: async (n) => (n === 'prev' + EXT ? readResult(prevFile) : null) });
  assert.equal(o1.sitemapPrevious.length, 15);
  assert.deepEqual(o1.sitemapPreviousSource.type, 'crawl');
  await assert.rejects(resolveSitemapPrevious({ sitemapPreviousCrawl: 'nope' }, { loadCrawl: async () => null }), /not found/);
  const o2 = await resolveSitemapPrevious({ sitemapPreviousText: `<urlset>${PREVIOUS.map((p) => `<url><loc>${base}${p}</loc></url>`).join('')}</urlset>` });
  assert.equal(o2.sitemapPrevious.length, 15);
  assert.equal(o2.sitemapPreviousText, undefined);
  await assert.rejects(resolveSitemapPrevious({ sitemapPreviousText: 'rien' }), /no URL/);
  const fetchText = async (u) => { const r = await fetch(u); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return (b[0] === 0x1f && b[1] === 0x8b ? (await import('node:zlib')).gunzipSync(b) : b).toString('utf8'); };
  const o3 = await resolveSitemapPrevious({ sitemapPreviousUrl: base + '/old-sitemap.xml.gz' }, { fetchText });
  assert.equal(o3.sitemapPrevious.length, 15);
  // Par défaut : seules les URL retirées (les produits sortis du flux), redirections suivies.
  const c = new Crawler('', toCrawlerOptions({ mode: 'list', sitemapUrl: base + '/sitemap_index.xml', sitemapPrevious: o1.sitemapPrevious, sitemapPreviousSource: o1.sitemapPreviousSource, concurrency: 4, timeoutMs: 3000 }));
  const R = await c.start();
  assert.equal(R.meta.sitemapDiff.crawled, 'removed');
  assert.equal(R.sitemapChanges.length, 10);
  assert.ok(R.sitemapChanges.every((r) => r.change === 'removed'));
  assert.equal(R.meta.sitemapDiff.source.type, 'crawl');
  // Liste collée + référence : la liste tient lieu de sitemap du jour.
  const c2 = new Crawler('', toCrawlerOptions({ mode: 'list', urls: abs(['/', '/produits/veste-cuir']), sitemapPrevious: abs(['/', '/produits/veste-cuir', '/produits/parti']), sitemapChanges: 'removed', concurrency: 2, timeoutMs: 3000 }));
  const R2 = await c2.start();
  assert.deepEqual(R2.sitemapChanges.map((r) => [r.url.replace(base, ''), r.decision]), [['/produits/parti', 'gone-ok']]);
  // followRedirects: false en mode liste garde l'ancien comportement (la cible n'est pas téléchargée).
  const c3 = new Crawler('', toCrawlerOptions({ mode: 'list', urls: abs(['/produits/ancien-sac']), sitemapPrevious: abs(['/produits/ancien-sac', '/produits/vieille-veste']), followRedirects: false, concurrency: 2, timeoutMs: 3000 }));
  const R3 = await c3.start();
  assert.equal(R3.pages.length, 1);
  assert.deepEqual([R3.sitemapChanges[0].decision, R3.sitemapChanges[0].finalStatus], ['redirect-ok', null]);
  // Aucun changement : avertissement, rien de crawlé.
  const c4 = new Crawler('', toCrawlerOptions({ mode: 'list', urls: abs(['/']), sitemapPrevious: abs(['/']), concurrency: 1, timeoutMs: 3000 }));
  const R4 = await c4.start();
  assert.equal(R4.pages.length, 0);
  assert.ok(R4.meta.warnings.some((w) => w.key === 'warn.sitemapNoChange'));
});

// ---- Serveur + agent, CLI, interface ----
async function startServer(home) {
  const port = 46000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('http://') && resolve());
    child.on('exit', (c) => reject(new Error('app exited ' + c + ' ' + stderr)));
  });
  return { child, B: `http://127.0.0.1:${port}`, port };
}

test('serveur et agent : crawl des changements depuis l’historique, outil arachnide_sitemap_changes, résultat léger', { timeout: 120000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-smd-srv-'));
  await fs.mkdir(path.join(home, 'crawls'), { recursive: true });
  const prev = await new Crawler('', toCrawlerOptions({ mode: 'list', sitemapUrl: base + '/old-sitemap.xml', concurrency: 4, timeoutMs: 3000 })).start();
  await writeResult(prev, path.join(home, 'crawls', 'hier' + EXT));
  const { child, B } = await startServer(home);
  const j = (u, o) => fetch(B + u, o).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  try {
    const tok = await j('/api/agent/settings');
    const H = { authorization: 'Bearer ' + tok.body.token, 'content-type': 'application/json' };
    const post = (u, body) => j(u, { method: 'POST', headers: H, body: JSON.stringify(body) });
    // Pas de référence : erreur claire. Référence inconnue : 404.
    const none = await post('/api/agent/arachnide_sitemap_changes', { crawl_id: 'hier' });
    assert.equal(none.status, 404);
    assert.match(none.body.error, /sitemap_previous_crawl/);
    const bad = await post('/api/agent/arachnide_crawl', { sitemap_url: base + '/sitemap_index.xml', sitemap_previous_crawl: 'nope' });
    assert.ok(bad.status >= 400, JSON.stringify(bad.body));
    // Le crawl des changements, par l'agent (bloquant).
    const cr = await post('/api/agent/arachnide_crawl', { sitemap_url: base + '/sitemap_index.xml', sitemap_previous_crawl: 'hier', sitemap_changes: 'both', concurrency: 4 });
    assert.equal(cr.status, 200, JSON.stringify(cr.body));
    const id = cr.body.crawl_id;
    const sc = await post('/api/agent/arachnide_sitemap_changes', { crawl_id: id });
    assert.equal(sc.status, 200, JSON.stringify(sc.body));
    assert.deepEqual([sc.body.previous_urls, sc.body.current_urls, sc.body.removed, sc.body.added, sc.body.kept, sc.body.crawled, sc.body.total], [15, 7, 10, 2, 5, 'both', 12]);
    assert.equal(sc.body.reference.type, 'crawl');
    assert.equal(sc.body.items[0].decision, 'redirect-suggested');
    assert.equal(sc.body.items[0].suggested_target, base + '/produits/chaussure-rouge-42');
    assert.match(sc.body.items[0].what_to_do, /301/);
    const act = await post('/api/agent/arachnide_sitemap_changes', { crawl_id: id, decision: 'actions', limit: 3 });
    assert.deepEqual([act.body.total, act.body.items.length, act.body.has_more], [8, 3, true]);
    const gone = await post('/api/agent/arachnide_sitemap_changes', { crawl_id: id, decision: 'gone-410' });
    assert.deepEqual(gone.body.items.map((x) => x.url), [base + '/produits/truc-bizarre-xyz']);
    const added = await post('/api/agent/arachnide_sitemap_changes', { crawl_id: id, change: 'added' });
    assert.equal(added.body.total, 2);
    // L'interface : le crawl est ouvert, le résultat léger porte les décisions et la carte.
    const light = await readNdjson((await fetch(B + '/api/result')).body);
    assert.equal(light.sitemapChanges.length, 12);
    assert.equal(light.meta.sitemapDiff.removed, 10);
    assert.ok(light.issues.some((i) => i.id === 'sitemap-removed-404'));
    // Le crawl de changements est à son tour une référence valable (le sitemap complet du jour).
    const again = await post('/api/agent/arachnide_crawl', { sitemap_url: base + '/sitemap_index.xml', sitemap_previous_crawl: id, concurrency: 2 });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const sc2 = await post('/api/agent/arachnide_sitemap_changes', { crawl_id: again.body.crawl_id });
    assert.deepEqual([sc2.body.previous_urls, sc2.body.removed, sc2.body.added], [7, 0, 0]);
    // La route de l'interface : options telles que le formulaire les envoie.
    const ui = await j('/api/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ options: { mode: 'list', urls: [], sitemapUrl: base + '/sitemap_index.xml', sitemapPreviousCrawl: 'hier' + EXT, sitemapChanges: 'removed', followRedirects: true } }) });
    assert.equal(ui.status, 200, JSON.stringify(ui.body));
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const l2 = await fetch(B + '/api/result');
      if (l2.status === 200) {
        const Rn = await readNdjson(l2.body);
        if (Rn.meta.sitemapDiff?.crawled === 'removed') {
          assert.equal(Rn.sitemapChanges.length, 10);
          break;
        }
      }
      if (i === 99) assert.fail('crawl de l’interface jamais terminé');
    }
    const uiBad = await j('/api/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ options: { mode: 'list', sitemapUrl: base + '/sitemap_index.xml', sitemapPreviousCrawl: 'inconnu.jsonl.gz' } }) });
    assert.equal(uiBad.status, 404);
  } finally {
    child.kill();
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('CLI : --sitemap + --sitemap-previous (crawl, sitemap distant, fichier), résumé et CSV des décisions', { timeout: 120000 }, async () => {
  const out = path.join(tmp, 'cli');
  const run = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['src/cli.mjs', ...args], { cwd: ROOT, env: { ...process.env, ARACHNIDE_OPEN: '' } });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
  // 1. Le crawl d'hier (liste du vieux sitemap).
  const r1 = await run(['--sitemap', base + '/old-sitemap.xml', '--out', out, '--lang', 'fr', '--concurrency', '4']);
  assert.equal(r1.code, 0, r1.stdout + r1.stderr);
  const prevFile = (await fs.readdir(out)).find((f) => f.endsWith(EXT));
  // 2. Aujourd'hui : seulement les produits retirés, référence = ce crawl.
  const r2 = await run(['--sitemap', base + '/sitemap_index.xml', '--sitemap-previous', path.join(out, prevFile), '--out', out, '--lang', 'fr', '--concurrency', '4', '--csv']);
  assert.equal(r2.code, 0, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /Changements de sitemap : 15 URL avant → 7 aujourd’hui · 10 retirées · 2 ajoutées · 5 inchangées/);
  assert.match(r2.stdout, /1  301 vers la page proposée/);
  assert.match(r2.stdout, /1  Renvoyer 410/);
  const csvName = (await fs.readdir(out)).find((f) => f.endsWith('_sitemap-changes.csv'));
  assert.ok(csvName, (await fs.readdir(out)).join(','));
  const csv = await fs.readFile(path.join(out, csvName), 'utf8');
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 11);
  assert.match(lines[0], /URL;Changement;Code;Indexabilité;Redirige vers;URL finale;Code final;Sauts;Décision;Cible proposée;Similarité/);
  assert.match(csv, new RegExp(`${base}/produits/chaussure-rouge-41;removed;404;;;;;;redirect-suggested;${base}/produits/chaussure-rouge-42;[1-9]\\d*`));
  assert.match(csv, new RegExp(`${base}/produits/chaine-1;removed;301;;${base}/produits/chaine-2;${base}/produits/veste-cuir;200;2;redirect-chain;;`));
  // 3. Référence = l'ancien sitemap en ligne (gzip) et les deux sens ; référence = fichier texte.
  const r3 = await run(['--sitemap', base + '/sitemap_index.xml', '--sitemap-previous', base + '/old-sitemap.xml.gz', '--sitemap-changes', 'both', '--out', out, '--lang', 'en', '--concurrency', '4']);
  assert.equal(r3.code, 0, r3.stdout + r3.stderr);
  assert.match(r3.stdout, /15 URLs before → 7 now · 10 removed · 2 added/);
  assert.match(r3.stdout, /1  Added but not indexable/);
  await fs.writeFile(path.join(tmp, 'old.txt'), abs(PREVIOUS).join('\n') + '\n');
  const r4 = await run(['--sitemap', base + '/sitemap_index.xml', '--sitemap-previous', path.join(tmp, 'old.txt'), '--out', out, '--lang', 'en', '--concurrency', '4']);
  assert.equal(r4.code, 0, r4.stdout + r4.stderr);
  assert.match(r4.stdout, /10 removed/);
  // Sans --sitemap ni --list : refus explicite.
  const r5 = await run([base + '/', '--sitemap-previous', path.join(tmp, 'old.txt'), '--out', out]);
  assert.equal(r5.code, 2);
  assert.match(r5.stderr, /--sitemap-previous needs --sitemap/);
});

const pw = loadPlaywright();
test('interface : options du mode liste (sitemap, comparaison avec l’historique), crawl des retirées, onglet des décisions, carte du tableau de bord', { skip: !pw && 'Playwright introuvable', timeout: 180000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-smd-ui-'));
  await fs.mkdir(path.join(home, 'crawls'), { recursive: true });
  const prev = await new Crawler('', toCrawlerOptions({ mode: 'list', sitemapUrl: base + '/old-sitemap.xml', concurrency: 4, timeoutMs: 3000 })).start();
  const prevFile = path.join(home, 'crawls', 'hier' + EXT);
  await writeResult(prev, prevFile);
  const srv = await startServer(home);
  let browser;
  try {
    const o = await openApp(pw, srv.B + '/', prevFile);
    if (!o) return;
    browser = o.browser;
    const { page, errors } = o;
    await page.evaluate(() => localStorage.removeItem('arachnide.listOpts'));
    // Mode liste → bouton des options → sitemap + comparaison avec le crawl d'hier.
    await page.click('#modeSeg [data-mode=list]');
    await page.waitForSelector('#listOptsBtn:not([hidden])');
    await page.click('#listOptsBtn');
    await page.waitForSelector('#loSitemap');
    await page.fill('#loSitemap', base + '/sitemap_index.xml');
    await page.dispatchEvent('#loSitemap', 'change');
    await page.waitForSelector('#loPrev option[value="hier' + EXT + '"]', { state: 'attached' });
    await page.selectOption('#loPrev', 'hier' + EXT);
    await page.waitForSelector('#loChangesRow:not([hidden])');
    await page.click('#loChanges [data-k=removed]');
    await page.click('#loSave');
    await page.waitForSelector('#listChip:not([hidden])');
    assert.match(await page.textContent('#listChip'), /sitemap/);
    // Lancer : liste vide, le sitemap et la comparaison suffisent.
    await page.evaluate(() => document.querySelector('#crawlForm').requestSubmit());
    await page.waitForSelector('#stopBtn:not([hidden])', { timeout: 15000 }); // le crawl démarre
    await page.waitForFunction(() => document.querySelector('#stopBtn').hidden, null, { timeout: 60000 }); // et se termine
    await page.waitForSelector('#tabs [data-tab=sitemapChanges]', { state: 'attached', timeout: 30000 }); // l'onglet existe (groupe replié)
    await page.evaluate(() => document.querySelector('#tabs [data-tab=sitemapChanges]').click());
    await page.waitForSelector('#view tbody tr');
    const rows = await page.$$eval('#view tbody tr', (trs) => trs.map((tr) => tr.textContent));
    assert.equal(rows.length, 7, 'le filtre « À traiter » est actif par défaut (10 retirées, 7 à traiter)');
    assert.ok(rows.some((r) => r.includes('chaussure-rouge-41') && r.includes('chaussure-rouge-42')));
    assert.match(await page.textContent('.smd-head'), /15 URL avant → 7 aujourd’hui/);
    await page.click('[data-f="all"]');
    await page.waitForTimeout(150);
    assert.equal(await page.$$eval('#view tbody tr', (trs) => trs.length), 10);
    await page.click('[data-f="smGone"]');
    await page.waitForTimeout(150);
    assert.equal(await page.$$eval('#view tbody tr', (trs) => trs.length), 1);
    // Tableau de bord : la carte et ses raccourcis.
    await page.evaluate(() => document.querySelector('#tabs [data-tab=dashboard]').click());
    await page.waitForSelector('.smd-dash [data-go-smd]');
    assert.ok(await page.$('.smd-dash [data-go-issue="sitemap-removed-404"]'));
    await page.click('.smd-dash [data-go-smd]');
    await page.waitForSelector('#tabs [data-tab=sitemapChanges].active', { state: 'attached' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    srv.child.kill();
    await fs.rm(home, { recursive: true, force: true });
  }
});
