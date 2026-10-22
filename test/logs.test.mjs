// Analyse de logs (3.22) : parseur en flux (formats, gzip), robots (classification, vérification DNS), agrégation et
// rattachement au crawl, persistance à côté du crawl, routes du serveur, CLI, outil agent, interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { writeResult, readResult, readRecords, EXT } from '../src/ndjson.mjs';
import { parseLog, parseClfDate, parseAnyDate, parseRequest, detectFormat, compileCustomFormat, maybeGunzip } from '../src/logs/parse.mjs';
import { classify, BotVerifier, BOTS, FAMILIES } from '../src/logs/bots.mjs';
import { LogAggregator, applyLogs, removeLogs, aggregatorRecords, aggregatorFromRecords, logView, isGoogle } from '../src/logs/analyze.mjs';
import { normalizeUrl, compileParamPatterns } from '../src/urlnorm.mjs';
import { lightRecords } from '../src/view.mjs';
import { readNdjson } from '../public/shared/ndjson.js';
import { sliceResult, applySegments } from '../public/shared/segments.js';
import { buildReport } from '../public/shared/report.js';
import { loadPlaywright, startApp, demoCrawlFile, openApp } from './ui-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-logs-'));
test.after(() => fs.rm(tmp, { recursive: true, force: true }));

// ---- Jeux de lignes ----
const UA = {
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googleMobile: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bing: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  gpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot',
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  human: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
const IP = { google: '66.249.66.1', fake: '203.0.113.9', bing: '40.77.167.1', gpt: '20.15.240.1', human: '198.51.100.7' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clfDate = (day, hour = 10) => `${String(day).padStart(2, '0')}/${MONTHS[2]}/2026:${String(hour).padStart(2, '0')}:00:00 +0000`;
const combined = (ip, day, p, status, ua, { bytes = 1234, ref = '-', method = 'GET' } = {}) => `${ip} - - [${clfDate(day)}] "${method} ${p} HTTP/1.1" ${status} ${bytes} "${ref}" "${ua}"`;
const common = (ip, day, p, status) => `${ip} - - [${clfDate(day)}] "GET ${p} HTTP/1.0" ${status} 512`;

// Journal « réaliste » pour un site de test : Googlebot sur les pages du crawl, une page orpheline, une URL disparue,
// une ressource, une redirection, une 5xx, un faux Googlebot, des humains, un autre hôte.
function siteLog(host) {
  const L = [];
  for (let d = 1; d <= 10; d++) {
    L.push(combined(IP.google, d, '/', 200, UA.google));
    L.push(combined(IP.google, d, '/cours', 200, d % 2 ? UA.google : UA.googleMobile));
    L.push(combined(IP.google, d, '/orpheline', 200, UA.google)); // dans le sitemap, jamais liée : orpheline (crawl) mais visitée
    L.push(combined(IP.google, d, '/vieux-article', 200, UA.google)); // hors crawl : orpheline (logs)
    L.push(combined(IP.google, d, '/ancienne', 301, UA.google)); // redirection : budget gaspillé
    L.push(combined(IP.google, d, '/disparue', 404, UA.google)); // 404 hors crawl : budget gaspillé
    L.push(combined(IP.google, d, '/cours?page=2&utm_source=news', 200, UA.google)); // paramètre de suivi retiré → /cours?page=2
    L.push(combined(IP.google, d, '/img/a.jpg', 200, UA.google, { bytes: 200000 })); // ressource
    L.push(combined(IP.bing, d, '/', 200, UA.bing));
    L.push(combined(IP.bing, d, '/blog/', 500, UA.bing)); // 5xx servie à un robot
    L.push(combined(IP.gpt, d, '/blog/fiche_delf', 200, UA.gpt));
    L.push(combined(IP.fake, d, '/', 200, UA.google)); // faux Googlebot
    L.push(combined(IP.fake, d, '/contact', 200, UA.google));
    L.push(combined(IP.human, d, '/contact', 200, UA.human, { ref: 'https://www.google.com/' }));
    L.push(combined(IP.human, d, '/cours', 200, UA.human));
  }
  // Seul Googlebot vérifié compte ; une ligne vers un autre hôte (logs multi-sites, format avec hôte en tête) est ignorée.
  L.push(`autre.example ${combined(IP.google, 3, '/x', 200, UA.google)}`);
  return L.join('\n') + '\n';
}

test('dates et ligne de requête : CLF, ISO, epoch, Cloudflare, requête tronquée', () => {
  assert.equal(new Date(parseClfDate('10/Oct/2026:13:55:36 +0200')).toISOString(), '2026-10-10T11:55:36.000Z');
  assert.equal(new Date(parseClfDate('10/Oct/2026:13:55:36 -0500')).toISOString(), '2026-10-10T18:55:36.000Z');
  assert.ok(Number.isNaN(parseClfDate('pas une date')));
  assert.equal(new Date(parseAnyDate('2026-03-04T05:06:07Z')).toISOString(), '2026-03-04T05:06:07.000Z');
  assert.equal(new Date(parseAnyDate('1772600000')).toISOString(), new Date(1772600000 * 1000).toISOString()); // secondes
  assert.equal(new Date(parseAnyDate(1772600000123)).toISOString(), new Date(1772600000123).toISOString()); // millisecondes
  assert.equal(new Date(parseAnyDate('1772600000123456789')).toISOString(), new Date(1772600000123).toISOString()); // nanosecondes (Cloudflare)
  assert.equal(new Date(parseAnyDate('10/Oct/2026:13:55:36 +0000')).toISOString(), '2026-10-10T13:55:36.000Z');
  assert.deepEqual(parseRequest('GET /a/b?c=1 HTTP/1.1'), { method: 'GET', path: '/a/b?c=1' });
  assert.deepEqual(parseRequest('POST /x'), { method: 'POST', path: '/x' });
  assert.deepEqual(parseRequest('\\x16\\x03\\x01'), { method: '', path: '\\x16\\x03\\x01' }); // scan TLS sur le port HTTP : gardé comme trafic parasite
});

test('détection de format : combined, common, W3C, JSON, inconnu', () => {
  assert.equal(detectFormat([combined(IP.google, 1, '/', 200, UA.google)]), 'combined');
  assert.equal(detectFormat([common(IP.google, 1, '/', 200)]), 'common');
  assert.equal(detectFormat(['#Software: Microsoft Internet Information Services 10.0', '#Fields: date time c-ip cs-method cs-uri-stem sc-status']), 'w3c');
  assert.equal(detectFormat(['{"time":"2026-03-01T00:00:00Z","status":200,"path":"/"}']), 'json');
  assert.equal(detectFormat(['', '# commentaire', 'n’importe quoi']), null);
});

test('parseur en flux : combined (fichier et .gz), common, W3C/IIS, JSON lines (Nginx, Cloudflare, Caddy), Nginx log_format personnalisé, lignes parasites', async () => {
  const events = [];
  const file = path.join(tmp, 'access.log');
  await fs.writeFile(file, [combined(IP.google, 5, '/a?x=1', 200, UA.google, { bytes: 10, ref: 'https://ref.example/' }), '', 'ligne parasite sans structure', combined(IP.human, 6, '/b', 404, UA.human, { method: 'POST' })].join('\n') + '\n');
  const st = await parseLog(file, { onEvent: (e) => events.push(e) });
  assert.equal(st.format, 'combined');
  assert.deepEqual([st.lines, st.parsed, st.skipped], [3, 2, 1]); // la ligne vide ne compte pas
  assert.deepEqual(events[0], { ts: parseClfDate(clfDate(5)), ip: IP.google, method: 'GET', path: '/a?x=1', status: 200, bytes: 10, ua: UA.google, referer: 'https://ref.example/', time: null, host: null });
  assert.equal(events[1].method, 'POST');
  // Même fichier compressé, lu par le même chemin que le téléversement (octets magiques gzip).
  const gz = path.join(tmp, 'access.log.gz');
  await fs.writeFile(gz, gzipSync(await fs.readFile(file)));
  const fromGz = [];
  assert.equal((await parseLog(gz, { onEvent: (e) => fromGz.push(e) })).parsed, 2);
  assert.deepEqual(fromGz, events);
  const viaStream = [];
  await parseLog(maybeGunzip(Readable.from([gzipSync(await fs.readFile(file))])), { onEvent: (e) => viaStream.push(e) });
  assert.deepEqual(viaStream, events);
  const plainStream = [];
  await parseLog(maybeGunzip(Readable.from([Buffer.from(combined(IP.bing, 1, '/', 200, UA.bing) + '\n')])), { onEvent: (e) => plainStream.push(e) });
  assert.equal(plainStream[0].ua, UA.bing);

  // common (sans referer ni UA).
  const c = [];
  assert.equal((await parseLog(Readable.from([common(IP.human, 2, '/p', 200) + '\n']), { onEvent: (e) => c.push(e) })).format, 'common');
  assert.deepEqual([c[0].path, c[0].status, c[0].ua], ['/p', 200, '']);

  // W3C / IIS : champs nommés, requête UA encodée (+), time-taken en ms, date + heure séparées, hôte.
  const w3c = ['#Software: Microsoft Internet Information Services 10.0', '#Version: 1.0', '#Fields: date time s-sitename cs-method cs-uri-stem cs-uri-query c-ip cs(User-Agent) cs-host sc-status sc-bytes time-taken',
    '2026-03-07 08:09:10 W3SVC1 GET /Default.aspx id=3 66.249.66.1 Mozilla/5.0+(compatible;+Googlebot/2.1;+http://www.google.com/bot.html) www.site.test 200 4321 187'].join('\r\n') + '\r\n';
  const w = [];
  const ws = await parseLog(Readable.from([w3c]), { onEvent: (e) => w.push(e) });
  assert.equal(ws.format, 'w3c');
  const { ua: w3cUa, ...w3cRest } = w[0];
  assert.deepEqual(w3cRest, { ts: Date.UTC(2026, 2, 7, 8, 9, 10), ip: IP.google, method: 'GET', path: '/Default.aspx?id=3', status: 200, bytes: 4321, referer: '', time: 187, host: 'www.site.test' });
  assert.ok(/Googlebot\/2\.1/.test(w3cUa) && classify(w3cUa).id === 'googlebot'); // IIS remplace les espaces par « + »

  // JSON lines : Nginx (request_time en secondes), Cloudflare Logpush (nanosecondes), Caddy (objet request).
  const json = [
    JSON.stringify({ time_local: '07/Mar/2026:08:09:10 +0000', remote_addr: IP.human, request: 'GET /n?q=1 HTTP/2.0', status: '200', body_bytes_sent: '99', http_user_agent: UA.human, request_time: '0.250', host: 'site.test' }),
    JSON.stringify({ EdgeStartTimestamp: '1772600000123456789', ClientIP: IP.bing, ClientRequestMethod: 'GET', ClientRequestURI: '/cf', ClientRequestHost: 'site.test', ClientRequestUserAgent: UA.bing, EdgeResponseStatus: 304, EdgeResponseBytes: 0, OriginResponseDurationMs: 42 }),
    JSON.stringify({ ts: 1772600001.5, request: { remote_ip: IP.gpt, method: 'GET', host: 'site.test', uri: '/caddy', headers: { 'User-Agent': [UA.gpt] } }, status: 200, size: 7, duration: 0.5 }),
    '{"pas":"de statut"}',
    'pas du json',
  ].join('\n') + '\n';
  const j = [];
  const js = await parseLog(Readable.from([json]), { onEvent: (e) => j.push(e) });
  assert.equal(js.format, 'json');
  assert.deepEqual([js.parsed, js.skipped], [3, 2]);
  assert.deepEqual(j[0], { ts: Date.UTC(2026, 2, 7, 8, 9, 10), ip: IP.human, method: 'GET', path: '/n?q=1', status: 200, bytes: 99, ua: UA.human, referer: '', time: 250, host: 'site.test' });
  assert.deepEqual([j[1].ts, j[1].path, j[1].status, j[1].time, j[1].ua], [1772600000123, '/cf', 304, 42, UA.bing]);
  assert.deepEqual([j[2].ts, j[2].ip, j[2].path, j[2].ua, j[2].time], [1772600001500, IP.gpt, '/caddy', UA.gpt, 500]);

  // log_format Nginx personnalisé, avec des variables inconnues et le temps de réponse.
  const fmt = '$remote_addr [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" rt=$request_time host=$host';
  const custom = [];
  const cs = await parseLog(Readable.from([`${IP.google} [${clfDate(9)}] "GET /c?x=y HTTP/1.1" 200 12 "-" "${UA.google}" rt=1.250 host=site.test\n`]), { format: 'custom', custom: fmt, onEvent: (e) => custom.push(e) });
  assert.equal(cs.format, 'custom');
  assert.deepEqual([custom[0].path, custom[0].status, custom[0].time, custom[0].host, custom[0].ua], ['/c?x=y', 200, 1250, 'site.test', UA.google]);
  assert.throws(() => compileCustomFormat('pas de variable'), /\$/);

  // Format inconnu : erreur typée avec un échantillon, pas un fichier à moitié lu.
  await assert.rejects(parseLog(Readable.from(['rien\nà voir\n']), {}), (e) => e.code === 'unknown_format' && /rien/.test(e.sample));
  // Progression et annulation.
  const big = Array.from({ length: 3000 }, (_, i) => combined(IP.human, 1, '/p' + i, 200, UA.human)).join('\n') + '\n';
  const progress = [];
  const ac = new AbortController();
  let seen = 0;
  await parseLog(Readable.from([big]), { onEvent: () => { if (++seen === 1500) ac.abort(); }, onProgress: (p) => progress.push(p.lines), signal: ac.signal }).catch(() => {});
  assert.ok(seen < 3000 && seen >= 1500, 'arrêt après abort');
  const full = await parseLog(Readable.from([big]), { onEvent: () => {}, onProgress: (p) => progress.push(p.lines) });
  assert.equal(full.parsed, 3000);
  assert.ok(progress.length > 0);
});

test('robots : classification (recherche, IA, SEO, mobile, humain), table cohérente, vérification DNS simulée', async () => {
  assert.deepEqual(classify(UA.google), { id: 'googlebot', name: 'Googlebot', family: 'search', mobile: false });
  assert.deepEqual(classify(UA.googleMobile), { id: 'googlebot', name: 'Googlebot', family: 'search', mobile: true });
  assert.equal(classify(UA.bing).id, 'bingbot');
  assert.equal(classify(UA.gpt).family, 'ai');
  assert.equal(classify(UA.ahrefs).family, 'seo');
  assert.equal(classify('Mozilla/5.0 (compatible; Googlebot-Image/1.0)').id, 'googlebot-image');
  assert.equal(classify('facebookexternalhit/1.1').family, 'social');
  assert.equal(classify(UA.human), null);
  assert.equal(classify(''), null);
  assert.equal(classify(UA.human), classify(UA.human)); // cache
  assert.ok(BOTS.length >= 60);
  assert.deepEqual([...new Set(BOTS.map((b) => b.family))].sort(), [...FAMILIES].sort().filter((f) => BOTS.some((b) => b.family === f)));
  assert.equal(new Set(BOTS.map((b) => b.id)).size, BOTS.length, 'identifiants uniques');
  assert.ok(isGoogle('googlebot') && isGoogle('googlebot-image') && !isGoogle('bingbot'));

  // Résolveur simulé : 66.249.66.1 → crawl-66-249-66-1.googlebot.com → 66.249.66.1 (authentique) ; 203.0.113.9 sans
  // enregistrement inverse (usurpé) ; 40.77.167.1 → un nom hors search.msn.com (usurpé) ; 10.0.0.1 → erreur réseau.
  const calls = [];
  const resolver = {
    async reverse(ip) {
      calls.push(ip);
      if (ip === IP.google) return ['crawl-66-249-66-1.googlebot.com'];
      if (ip === IP.bing) return ['msnbot-40-77-167-1.evil.example'];
      if (ip === '10.0.0.1') throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
      throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    },
    async resolve4(name) {
      if (name === 'crawl-66-249-66-1.googlebot.com') return [IP.google];
      throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' });
    },
    async resolve6() {
      throw Object.assign(new Error('nope'), { code: 'ENODATA' });
    },
  };
  const v = new BotVerifier({ resolver, concurrency: 2, timeoutMs: 500 });
  assert.equal(await v.verify(IP.google, 'googlebot'), 'verified');
  assert.equal(await v.verify(IP.fake, 'googlebot'), 'spoofed');
  assert.equal(await v.verify(IP.bing, 'bingbot'), 'spoofed');
  assert.equal(await v.verify('10.0.0.1', 'googlebot'), 'error');
  assert.equal(await v.verify(IP.gpt, 'gptbot'), 'unverifiable'); // pas de DNS inverse publié : jamais contacté
  assert.equal(await v.verify(IP.google, 'googlebot'), 'verified');
  assert.equal(calls.filter((c) => c === IP.google).length, 1, 'cache par IP');
  // Nom inverse qui n'appartient pas au domaine du robot mais le contient (« googlebot.com.evil ») : usurpé.
  const tricky = new BotVerifier({ resolver: { ...resolver, reverse: async () => ['x.googlebot.com.evil.example'] } });
  assert.equal(await tricky.verify('1.2.3.4', 'googlebot'), 'spoofed');
  const slow = new BotVerifier({ resolver: { ...resolver, reverse: () => new Promise(() => {}) }, timeoutMs: 20 });
  assert.equal(await slow.verify('5.6.7.8', 'googlebot'), 'error');
});

test('normalisation d’URL partagée crawler / logs : paramètres de suivi, tri, motifs à retirer, ignoreQuery', () => {
  const re = compileParamPatterns('sessionid\nref_*');
  assert.equal(normalizeUrl('http://S.test/a?utm_source=x&b=2&a=1&sessionid=9#frag', { removeParamRes: re }), 'http://s.test/a?a=1&b=2');
  assert.equal(normalizeUrl('http://s.test/a?b=2', { ignoreQuery: true }), 'http://s.test/a');
  assert.equal(normalizeUrl('http://s.test/a?z=1&b=2', { normalizeParams: false }), 'http://s.test/a?z=1&b=2');
  assert.equal(normalizeUrl('http://s.test:80/A%20B/'), 'http://s.test/A%20B/');
  assert.equal(normalizeUrl('pas une url'), null);
});

// ---- Rattachement au crawl : site de test, journal réaliste ----
const site = await startFixture();
const base = `http://127.0.0.1:${site.address().port}`;
test.after(() => site.close());
const crawlResult = () => new Crawler(base + '/', { concurrency: 3, checkImages: true }).start();

async function aggregate(R, text, opts = {}) {
  const agg = new LogAggregator({ origin: new URL(R.meta.finalStart || R.meta.startUrl).origin, options: R.meta.options || {} });
  const st = await parseLog(Readable.from([text]), { onEvent: (e) => agg.add(e), ...opts });
  agg.files.push({ name: 'access.log', ...st });
  agg.format = st.format;
  agg.lines += st.lines;
  agg.parsed += st.parsed;
  agg.skipped += st.skipped;
  return agg;
}

test('agrégation + applyLogs : compteurs par page, URL hors crawl, période, chronologie, six contrôles, score, retrait', async () => {
  const R = await crawlResult();
  const scoreBefore = R.summary.score;
  const issuesBefore = R.issues.length;
  const agg = await aggregate(R, siteLog());
  assert.equal(agg.totals.otherHost, 1);
  assert.equal(agg.totals.events, 150);
  const logs = applyLogs(R, agg);
  assert.equal(logs, R.meta.logs);
  assert.equal(logs.format, 'combined');
  assert.equal(logs.events, 150);
  assert.equal(logs.human, 20);
  assert.equal(logs.botHits, 130);
  assert.deepEqual(logs.period && [logs.period.days, logs.period.start.slice(0, 10), logs.period.end.slice(0, 10)], [10, '2026-03-01', '2026-03-10']);
  assert.equal(logs.timeline.length, 10);
  for (const k of ['day', 'total', 'human', 'search', 'ai', 'googlebot', 'bingbot', 's2', 's5']) assert.ok(k in logs.timeline[0], k);
  assert.deepEqual([logs.timeline[0].day, logs.timeline[0].total, logs.timeline[0].googlebot, logs.timeline[0].human], ['2026-03-01', 15, 10, 2]);
  assert.equal(logs.families.search, 120); // Googlebot (8/jour) + faux Googlebot (2/jour) + Bingbot (2/jour)
  assert.equal(logs.families.ai, 10);
  assert.equal(logs.googlebotHits, 100); // sans vérification DNS, le faux Googlebot compte encore
  assert.equal(logs.bingbotHits, 20);
  assert.equal(logs.statuses.s5, 10);
  assert.equal(logs.bots[0].id, 'googlebot');
  assert.equal(logs.bots.find((b) => b.id === 'googlebot').ips, 2);
  assert.equal(logs.bots.find((b) => b.id === 'googlebot').mobile, 5);
  assert.equal(logs.verification.enabled, false);
  assert.ok(logs.dirs.some((d) => d.dir === '/blog/' && d.search === 10));

  // Par page : la page d'accueil est demandée par Googlebot (20 dont 10 usurpées), Bingbot, un humain jamais.
  const home = R.pages.find((p) => p.url === base + '/');
  assert.deepEqual([home.log.hits, home.log.search, home.log.googlebot, home.log.bingbot, home.log.human, home.log.ai, home.log.spoofed], [30, 30, 20, 10, 0, 0, 0]);
  assert.equal(home.log.last.slice(0, 10), '2026-03-10');
  assert.equal(home.log.status, 200);
  const cours = R.pages.find((p) => p.url === base + '/cours');
  assert.deepEqual([cours.log.googlebot, cours.log.human], [10, 10]);
  // Le paramètre de suivi est retiré comme dans le crawl : /cours?page=2&utm_source=news rejoint /cours?page=2.
  const page2 = R.pages.find((p) => p.url === base + '/cours?page=2');
  assert.equal(page2.log.googlebot, 10);
  // Pages hors crawl : la page disparue, l'ancienne URL, la ressource, pas les pages du crawl.
  const outside = Object.fromEntries(R.logOnly.map((x) => [x.url.replace(base, ''), x]));
  assert.deepEqual(Object.keys(outside).sort(), ['/disparue', '/img/a.jpg', '/vieux-article']);
  assert.equal(outside['/img/a.jpg'].resource, true);
  assert.equal(outside['/vieux-article'].resource, false);
  assert.equal(outside['/vieux-article'].status, 200);
  assert.equal(outside['/disparue'].status, 404);
  assert.equal(logs.outsidePages, 2);
  assert.equal(logs.matched, 8);
  assert.deepEqual(R.pages.filter((p) => p.log?.hits).map((p) => p.url.replace(base, '')).sort(), ['/', '/ancienne', '/blog/', '/blog/fiche_delf', '/contact', '/cours', '/cours?page=2', '/orpheline']);
  assert.ok(R.pages.filter((p) => p.isHtml).every((p) => p.log), 'chaque page HTML porte ses compteurs, même à zéro');
  const view = logView({ url: 'x', hits: 3, human: 1, bots: { googlebot: 2 }, fam: { search: 2 }, st: { 200: 2, 500: 1 }, bytes: 30, tsum: 300, tn: 2, first: 1, last: 2, spoofed: 0 });
  assert.deepEqual([view.googlebot, view.search, view.s5, view.avgTime, view.status], [2, 2, 1, 150, 200]);

  // Contrôles.
  const by = Object.fromEntries(R.issues.filter((i) => i.id.startsWith('log-')).map((i) => [i.id, i]));
  assert.deepEqual(Object.keys(by).sort(), ['log-bot-errors', 'log-crawl-waste', 'log-not-crawled', 'log-orphan']);
  // Orphelines confirmées par les logs : l'URL hors crawl, et la page du sitemap que rien ne lie mais que Googlebot visite.
  assert.deepEqual(by['log-orphan'].items.map((x) => x.url.replace(base, '')).sort(), ['/orpheline', '/vieux-article']);
  assert.ok(by['log-orphan'].items.every((x) => x.detail.k === 'd.logSearchHits' && x.detail.p.n === 10));
  const notCrawled = by['log-not-crawled'].items.map((x) => x.url.replace(base, ''));
  // Sans vérification DNS, le faux Googlebot compte : /contact passe pour visitée ; la fiche DELF (GPTBot seulement) et le guide ne le sont pas.
  for (const [u, inList] of [['/blog/fiche_delf', true], ['/guide-delf', true], ['/contact', false], ['/cours', false], ['/', false]]) assert.equal(notCrawled.includes(u), inList, u + ' ' + notCrawled.join(','));
  assert.equal(by['log-not-crawled'].params.days, 10);
  assert.ok(by['log-not-crawled'].items.every((x) => x.detail.k === 'd.logNoGooglebot'));
  const waste = Object.fromEntries(by['log-crawl-waste'].items.map((x) => [x.url.replace(base, ''), x.detail.k]));
  assert.equal(waste['/ancienne'], 'd.logWasteRedirect');
  assert.equal(waste['/disparue'], 'd.logWasteError');
  assert.equal(waste['/cours?page=2'], 'd.logWasteNonIndexable'); // canonical vers /cours
  assert.deepEqual(by['log-bot-errors'].items.map((x) => [x.url.replace(base, ''), x.detail.p.n]), [['/blog/', 10]]);
  for (const i of Object.values(by)) assert.ok(i.severity && i.category && i.impact && i.effort && i.priority > 0 && ['site', 'page'].includes(i.scope), i.id);
  assert.ok(R.summary.score < scoreBefore, `le score tient compte des logs (${R.summary.score} < ${scoreBefore})`);
  assert.ok(R.summary.categoryScores);

  // Retrait : état d'origine, score compris.
  removeLogs(R);
  assert.equal(R.meta.logs, undefined);
  assert.deepEqual(R.logOnly, []);
  assert.ok(R.pages.every((p) => !p.log));
  assert.equal(R.issues.length, issuesBefore);
  assert.equal(R.summary.score, scoreBefore);
});

test('vérification DNS : les requêtes usurpées sortent des compteurs de robots, contrôle « faux Googlebot », pages lentes', async () => {
  const R = await crawlResult();
  const fmt = '$remote_addr [$time_local] "$request" $status $body_bytes_sent "$http_user_agent" $request_time';
  const line = (ip, day, p, status, ua, rt = '0.100') => `${ip} [${clfDate(day)}] "GET ${p} HTTP/1.1" ${status} 10 "${ua}" ${rt}`;
  const text = [...Array.from({ length: 8 }, (_, d) => [line(IP.google, d + 1, '/', 200, UA.google), line(IP.fake, d + 1, '/', 200, UA.google), line(IP.fake, d + 1, '/cours', 200, UA.google, '3.000'), line(IP.google, d + 1, '/cours', 200, UA.google, '2.500')]).flat()].join('\n') + '\n';
  const agg = await aggregate(R, text, { format: 'custom', custom: fmt });
  const resolver = {
    async reverse(ip) {
      if (ip === IP.google) return ['crawl-66-249-66-1.googlebot.com'];
      throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    },
    async resolve4() {
      return [IP.google];
    },
    async resolve6() {
      return [];
    },
  };
  const progress = [];
  await agg.verify({ verifier: new BotVerifier({ resolver }), onProgress: (p) => progress.push(p) });
  assert.ok(progress.length && progress.at(-1).done === progress.at(-1).total);
  const logs = applyLogs(R, agg);
  assert.deepEqual([logs.verification.enabled, logs.verification.verified, logs.verification.spoofed, logs.verification.ips.verified, logs.verification.ips.spoofed], [true, 16, 16, 1, 1]);
  assert.deepEqual(logs.verification.spoofedIps, [{ ip: IP.fake, bot: 'googlebot', hits: 16 }]);
  assert.equal(logs.googlebotHits, 16);
  const home = R.pages.find((p) => p.url === base + '/');
  assert.deepEqual([home.log.hits, home.log.googlebot, home.log.spoofed], [16, 8, 8]);
  const spoofed = R.issues.find((i) => i.id === 'log-spoofed');
  assert.ok(spoofed && spoofed.scope === 'page' && spoofed.severity === 'notice');
  assert.deepEqual(spoofed.params, { n: 16, ips: 1 });
  assert.deepEqual(spoofed.items.map((x) => [x.url.replace(base, ''), x.detail]), [['/', { k: 'd.logSpoofed', p: { n: 8 } }], ['/cours', { k: 'd.logSpoofed', p: { n: 8 } }]]);
  // Page lente pour les robots : /cours répond en 2,5 s à Googlebot authentique (les 3 s usurpées ne comptent pas).
  const slow = R.issues.find((i) => i.id === 'log-slow');
  assert.ok(slow && slow.items.some((x) => x.url === base + '/cours'));
  assert.ok(!slow.items.some((x) => x.url === base + '/'));
  // Sérialisation de l'agrégat (fichier à côté du crawl) : aller-retour fidèle, vérification comprise.
  const back = aggregatorFromRecords([...aggregatorRecords(agg)]);
  assert.equal(back.totals.events, agg.totals.events);
  assert.equal(back.urls.size, agg.urls.size);
  assert.deepEqual(back.verification, agg.verification);
  const R2 = await crawlResult();
  applyLogs(R2, back);
  assert.deepEqual(R2.meta.logs.bots, logs.bots);
  assert.deepEqual(R2.pages.find((p) => p.url === base + '/').log, home.log);
  assert.deepEqual(R2.issues.filter((i) => i.id.startsWith('log-')).map((i) => [i.id, i.count]), R.issues.filter((i) => i.id.startsWith('log-')).map((i) => [i.id, i.count]));
});

test('segments, résultat léger et rapport : les logs suivent les pages, le navigateur reçoit p.log et logOnly, le rapport a sa section', async () => {
  const R = await crawlResult();
  applyLogs(R, await aggregate(R, siteLog()));
  const { segments } = applySegments(R, [{ id: 'blog', name: 'Blog', color: '#123456', rules: [{ field: 'path', op: 'startsWith', value: '/blog/' }] }]);
  const blog = sliceResult(R, 'blog');
  assert.ok(blog.pages.every((p) => p.url.includes('/blog/')));
  assert.ok(blog.issues.find((i) => i.id === 'log-bot-errors'));
  assert.ok(!blog.issues.find((i) => i.id === 'log-orphan'), 'l’orpheline hors blog ne suit pas le segment');
  assert.equal(blog.meta.logs.events, R.meta.logs.events);
  const seg = R.summary.segments.find((s) => s.id === 'blog');
  assert.deepEqual([seg.logHits, seg.googlebotHits], [20, 0], JSON.stringify(seg)); // Bingbot ×10 sur /blog/ + GPTBot ×10 sur la fiche
  assert.equal(R.summary.segments.find((s) => s.id === '__none').googlebotHits, 100);
  assert.ok(segments.length === 1);
  const light = await readNdjson(Readable.from((function* () { for (const r of lightRecords(R)) yield JSON.stringify(r) + '\n'; })()));
  assert.equal(light.pages.find((p) => p.url === base + '/').log.googlebot, 20);
  assert.equal(light.logOnly.length, R.logOnly.length);
  assert.equal(light.meta.logs.events, 150);
  const t = Object.assign((k, p = {}) => k + (p.n !== undefined ? ':' + p.n : ''), { date: () => 'd', num: (n) => String(n), lang: 'fr' });
  const html = buildReport(R, {}, t);
  assert.ok(html.includes('report.logs') && html.includes('Googlebot') && html.includes('issue.log-orphan.label'));
  removeLogs(R);
  assert.ok(!buildReport(R, {}, t).includes('report.logs'));
});

test('persistance : fichier <crawl>.logs.jsonl.gz à côté du crawl, relu à l’ouverture, retiré avec le crawl', async () => {
  const crawls = path.join(tmp, 'crawls');
  await fs.mkdir(crawls, { recursive: true });
  process.env.ARACHNIDE_CRAWLS = crawls;
  const store = await import('../src/store.mjs?logs');
  const R = await crawlResult();
  const file = path.join(crawls, 'site' + EXT);
  await writeResult(R, file);
  const agg = await aggregate(R, siteLog());
  await store.saveLogs('site' + EXT, agg);
  assert.ok((await fs.stat(path.join(crawls, 'site.logs.jsonl.gz'))).size > 100);
  assert.equal(store.safeName('site.logs.jsonl.gz'), null, 'le fichier de logs n’est pas un crawl');
  assert.ok(!(await store.listCrawls()).some((c) => /logs/.test(c.file)));
  const kinds = new Set();
  for await (const r of readRecords(path.join(crawls, 'site.logs.jsonl.gz'))) kinds.add(r.t);
  assert.deepEqual([...kinds].sort(), ['loghead', 'logday', 'logurl'].sort());
  const loaded = await store.loadCrawl('site' + EXT);
  assert.equal(loaded.meta.logs.events, 150);
  assert.equal(loaded.pages.find((p) => p.url === base + '/').log.googlebot, 20);
  assert.ok(loaded.issues.some((i) => i.id === 'log-orphan'));
  // Le fichier de crawl lui-même ne porte pas les logs : ils vivent à côté et se retirent seuls.
  const raw = await readResult(file);
  assert.equal(raw.meta.logs, undefined);
  await store.deleteLogs('site' + EXT);
  assert.equal((await store.loadCrawl('site' + EXT)).meta.logs, undefined);
  await store.saveLogs('site' + EXT, agg);
  await store.deleteCrawl('site' + EXT);
  await assert.rejects(fs.stat(path.join(crawls, 'site.logs.jsonl.gz')));
});

test('serveur : import en flux (brut et gzip), état, application avec enregistrement, résultat léger, retrait, routes protégées', { timeout: 120000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-logs-srv-'));
  await fs.mkdir(path.join(home, 'crawls'), { recursive: true });
  const R = await crawlResult();
  await writeResult(R, path.join(home, 'crawls', 'site' + EXT));
  const port = 48000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('http://') && resolve());
    child.on('exit', (c) => reject(new Error('app exited ' + c + ' ' + stderr)));
  });
  const B = `http://127.0.0.1:${port}`;
  const j = (u, o) => fetch(B + u, o).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const events = [];
  const es = await fetch(B + '/api/events', { headers: { accept: 'text/event-stream' } });
  const reader = es.body.getReader();
  (async () => {
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (\S+)/m.exec(chunk)?.[1];
        const data = /^data: (.*)$/m.exec(chunk)?.[1];
        if (ev === 'logs') events.push(JSON.parse(data));
      }
    }
  })();
  try {
    assert.equal((await j('/api/logs/import?name=a.log', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'x' })).status, 404, 'pas de crawl ouvert');
    assert.equal((await j('/api/logs', { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await j('/api/logs/import?name=a.log', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 403, 'un formulaire HTML ne peut pas téléverser');
    assert.equal((await j('/api/open?file=site' + EXT, { method: 'POST' })).status, 200);
    const s0 = await j('/api/logs');
    assert.deepEqual(s0.body, { pending: null, applied: null, hasResult: true });
    // Format inconnu : refus explicite avec un échantillon.
    const bad = await j('/api/logs/import?name=bad.txt', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'rien à voir\nvraiment\n' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.key, 'logs.unknownFormat');
    assert.equal((await j('/api/logs/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
    // Deux fichiers : brut puis gzip ; le serveur agrège.
    const text = siteLog();
    const half = text.split('\n');
    const i1 = await j('/api/logs/import?name=access.log', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: half.slice(0, 75).join('\n') + '\n' });
    assert.equal(i1.status, 200, JSON.stringify(i1.body));
    assert.equal(i1.body.file.format, 'combined');
    assert.equal(i1.body.pending.files.length, 1);
    const i2 = await j('/api/logs/import?name=access.log.1.gz', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: gzipSync(half.slice(75).join('\n') + '\n') });
    assert.equal(i2.status, 200, JSON.stringify(i2.body));
    const s1 = await j('/api/logs');
    assert.equal(s1.body.pending.files.length, 2);
    assert.equal(s1.body.pending.events, 150);
    assert.ok(s1.body.pending.bots > 0 && s1.body.pending.urls > 0 && s1.body.pending.period.start);
    // Application sans vérification DNS (pas de réseau dans les tests).
    const ap = await j('/api/logs/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verify: false }) });
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.logs.events, 150);
    assert.equal(ap.body.logs.googlebotHits, 100);
    assert.ok((await fs.stat(path.join(home, 'crawls', 'site.logs.jsonl.gz'))).size > 100, 'enregistré à côté du crawl');
    const s2 = await j('/api/logs');
    assert.equal(s2.body.pending, null);
    assert.equal(s2.body.applied.events, 150);
    // Le résultat léger porte les compteurs et les URL hors crawl.
    const light = await readNdjson((await fetch(B + '/api/result')).body);
    assert.equal(light.pages.find((p) => p.url === base + '/').log.googlebot, 20);
    assert.equal(light.logOnly.length, 3);
    assert.ok(light.issues.some((i) => i.id === 'log-orphan'));
    assert.ok(light.summary.score < R.summary.score);
    // Le crawl réouvert relit les logs ; l'outil agent les voit.
    assert.equal((await j('/api/open?file=site' + EXT, { method: 'POST' })).status, 200);
    assert.equal((await j('/api/logs')).body.applied.events, 150);
    const tok = await j('/api/agent/settings');
    const H = { authorization: 'Bearer ' + tok.body.token, 'content-type': 'application/json' };
    const sum = await j('/api/agent/arachnide_logs', { method: 'POST', headers: H, body: JSON.stringify({ section: 'summary' }) });
    assert.equal(sum.status, 200, JSON.stringify(sum.body));
    assert.equal(sum.body.events, 150);
    assert.equal(sum.body.top_bots[0].id, 'googlebot');
    assert.ok(sum.body.issues.some((i) => i.id === 'log-orphan' && i.label && i.urls === 2));
    const orphans = await j('/api/agent/arachnide_logs', { method: 'POST', headers: H, body: JSON.stringify({ section: 'orphans' }) });
    assert.deepEqual(orphans.body.items.map((x) => x.url).sort(), [base + '/orpheline', base + '/vieux-article']);
    assert.match(orphans.body.items[0].detail, /10/);
    const top = await j('/api/agent/arachnide_logs', { method: 'POST', headers: H, body: JSON.stringify({ section: 'top_urls', bot: 'googlebot', limit: 3 }) });
    assert.equal(top.body.items.length, 3);
    assert.ok(top.body.has_more && top.body.items[0].googlebot >= top.body.items[1].googlebot);
    const sp = await j('/api/agent/arachnide_search_pages', { method: 'POST', headers: H, body: JSON.stringify({ sort: 'googlebot_hits', limit: 2 }) });
    assert.equal(sp.body.pages[0].url, base + '/');
    assert.ok(sp.body.pages[0].googlebot_hits === 20 && sp.body.pages[0].last_crawled_by_googlebot);
    const gs = await j('/api/agent/arachnide_get_summary', { method: 'POST', headers: H, body: '{}' });
    assert.equal(gs.body.server_logs.events, 150);
    // Retrait : contrôles, fichier et compteurs disparaissent ; l'outil le dit.
    assert.equal((await j('/api/logs', { method: 'DELETE' })).status, 200);
    await assert.rejects(fs.stat(path.join(home, 'crawls', 'site.logs.jsonl.gz')));
    const light2 = await readNdjson((await fetch(B + '/api/result')).body);
    assert.equal(light2.meta.logs, undefined);
    assert.ok(!light2.pages.some((p) => p.log) && light2.logOnly.length === 0 && !light2.issues.some((i) => i.id.startsWith('log-')));
    assert.equal(light2.summary.score, R.summary.score);
    const none = await j('/api/agent/arachnide_logs', { method: 'POST', headers: H, body: '{}' });
    assert.equal(none.status, 404);
    assert.match(none.body.error, /--logs/);
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual([...new Set(events.map((e) => e.phase))].sort(), ['applied', 'parsing', 'removed']);
    assert.ok(events.some((e) => e.phase === 'parsing' && e.name === 'access.log' && e.lines > 0));
  } finally {
    reader.cancel().catch(() => {});
    child.kill();
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('CLI : --logs (fichier et .gz, répétable), fichier de logs enregistré, colonnes dans pages.csv, résumé imprimé', { timeout: 120000 }, async () => {
  const out = path.join(tmp, 'cli');
  const text = siteLog();
  const lines = text.split('\n');
  await fs.writeFile(path.join(tmp, 'a.log'), lines.slice(0, 60).join('\n') + '\n');
  await fs.writeFile(path.join(tmp, 'b.log.gz'), gzipSync(lines.slice(60).join('\n') + '\n'));
  // Le site de test vit dans ce processus : la CLI tourne en parallèle, jamais en synchrone.
  const run = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['src/cli.mjs', ...args], { cwd: ROOT, env: { ...process.env, ARACHNIDE_OPEN: '' } });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
  const { stdout, code } = await run([base + '/', '--out', out, '--logs', path.join(tmp, 'a.log'), '--logs', path.join(tmp, 'b.log.gz'), '--lang', 'fr', '--concurrency', '3', '--csv']);
  assert.equal(code, 0, stdout);
  assert.match(stdout, /a\.log : combined, 60/);
  assert.match(stdout, /Logs serveur : 150/);
  const files = await fs.readdir(out);
  const crawl = files.find((f) => f.endsWith(EXT) && !f.endsWith('.logs.jsonl.gz'));
  const logsFile = files.find((f) => f.endsWith('.logs.jsonl.gz'));
  assert.ok(crawl && logsFile && logsFile === crawl.replace(EXT, '.logs.jsonl.gz'), files.join(','));
  const csv = await fs.readFile(path.join(out, files.find((f) => f.endsWith('_pages.csv'))), 'utf8');
  const [head, ...rows] = csv.split('\n');
  assert.ok(head.includes('Requêtes') && head.includes('Googlebot'), head);
  const col = head.split(';').indexOf('Googlebot');
  const homeRow = rows.find((r) => r.startsWith(`"${base}/"`) || r.startsWith(`${base}/`) && !r.startsWith(`${base}/c`));
  assert.ok(homeRow && homeRow.split(';')[col].replace(/"/g, '') === '20', homeRow);
  const stored = await readResult(path.join(out, crawl));
  assert.equal(stored.meta.logs, undefined, 'les logs vivent à côté du crawl, pas dedans');
  const back = aggregatorFromRecords(await (async () => { const a = []; for await (const r of readRecords(path.join(out, logsFile))) a.push(r); return a; })());
  assert.equal(back.totals.events, 150);
  // Format impossible : le fichier est signalé sur la sortie d'erreur, le crawl continue sans lui.
  await fs.writeFile(path.join(tmp, 'bad.log'), 'rien\n');
  const r = await run([base + '/', '--out', out, '--logs', path.join(tmp, 'bad.log'), '--max', '2']);
  assert.match(r.stderr, /bad\.log/);
});

const pw = loadPlaywright();
test('interface : import par l’onglet Logs, tableau, fiche de page, carte du tableau de bord, retrait', { skip: !pw && 'Playwright introuvable', timeout: 180000 }, async () => {
  const { file, base: demo } = await demoCrawlFile();
  const app = await startApp();
  let browser;
  try {
    const o = await openApp(pw, app.url, file);
    if (!o) return;
    browser = o.browser;
    const { page, errors, dialogs } = o;
    // Journal pour le site de démonstration : Googlebot sur l'accueil et le blog, une page jamais liée, un humain.
    const lines = [];
    for (let d = 1; d <= 9; d++) {
      lines.push(combined(IP.google, d, '/', 200, UA.google), combined(IP.google, d, '/blog', 200, UA.google), combined(IP.google, d, '/page-fantome', 200, UA.google), combined(IP.human, d, '/contact', 200, UA.human), combined(IP.gpt, d, '/en', 200, UA.gpt));
    }
    const logFile = path.join(tmp, 'ui-access.log');
    await fs.writeFile(logFile, lines.join('\n') + '\n');
    // Carte d'invitation sur le tableau de bord, puis l'onglet Logs avec son panneau d'import.
    await page.waitForSelector('.lg-dash [data-go-logs]');
    await page.click('.lg-dash [data-go-logs]');
    await page.waitForSelector('#lgDrop');
    assert.ok(await page.$('#lgApply:disabled'));
    await page.setInputFiles('#lgFiles', logFile);
    await page.waitForSelector('#lgApply:not([disabled])', { timeout: 30000 });
    assert.match(await page.textContent('#lgPending'), /1 fichier/);
    assert.ok(await page.isChecked('#lgVerify'), 'la vérification DNS est proposée par défaut');
    await page.uncheck('#lgVerify'); // pas de réseau dans les tests
    await page.click('#lgApply');
    await page.waitForSelector('#lgTable tbody tr', { timeout: 30000 });
    // Résumé et tableau : l'accueil est vu 9 fois par Googlebot ; la page fantôme est hors crawl.
    assert.match(await page.textContent('.lg-kpis'), /Googlebot/);
    const rows = await page.$$eval('#lgTable tbody tr', (trs) => trs.map((tr) => tr.textContent));
    assert.ok(rows.some((r) => r.includes(demo + '/') && r.includes('9')), rows.slice(0, 3).join('|'));
    assert.ok(rows.some((r) => r.includes('/page-fantome')));
    // Filtres de l'onglet : orphelines (logs) → une seule ligne.
    await page.click('[data-f="logOrphans"]');
    await page.waitForTimeout(150);
    assert.equal(await page.$$eval('#lgTable tbody tr', (trs) => trs.length), 1);
    // Le tableau de bord montre la carte des logs et ses contrôles ; la page Problèmes a les contrôles « log-* ».
    await page.evaluate(() => document.querySelector('#tabs [data-tab=dashboard]').click());
    await page.waitForSelector('.lg-dash .lg-kpis');
    assert.ok(await page.$('.lg-dash svg'), 'chronologie dessinée');
    assert.ok(await page.$('.lg-dash [data-go-issue="log-orphan"]'));
    await page.click('.lg-dash [data-go-issue="log-orphan"]');
    await page.waitForTimeout(300);
    // Fiche de page : la ligne « logs » apparaît.
    await page.evaluate(() => document.querySelector('#tabs [data-tab=internal]').click());
    await page.waitForSelector('#tabs [data-tab=internal].active');
    await page.waitForTimeout(200);
    // Retrait : confirmation, puis le panneau d'import revient.
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => document.querySelector('#tabs [data-tab=logs]').click());
    await page.waitForSelector('#lgRemove');
    await page.click('#lgRemove');
    await page.waitForSelector('#lgDrop', { timeout: 30000 });
    assert.deepEqual(errors, []);
    assert.deepEqual(dialogs.filter((d) => !/logs|Logs/.test(d)), []);
  } finally {
    await browser?.close();
    app.child.kill();
  }
});
