// Chantier « 200 000 pages », étape 6 : garde-fous de crawl. Budget sur les pages téléchargées, paramètres d'URL
// normalisés, pièges à facettes signalés, robots.txt selon la RFC 9309 et par origine, nouvelle tentative différée
// sur 5xx et coupures, corps lu en flux et borné, extraction regex interrompable, XPath, liste depuis un sitemap.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Crawler } from '../src/crawler.mjs';
import { toCrawlerOptions } from '../src/options.mjs';
import { RegexRunner } from '../src/regex-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} description assez longue pour passer"></head><body><h1>${title}</h1><p>${'texte '.repeat(80)}</p>${body}</body></html>`;

// Petit serveur à routes : fn(url, req) → [status, type, body, headers?] ; peut répondre en morceaux sans Content-Length.
function serve(routes) {
  const server = http.createServer((req, res) => {
    const r = routes(new URL(req.url, 'http://x'), req, res);
    if (!r) return;
    const [status, type, body, headers = {}] = r;
    res.writeHead(status, { 'content-type': type, ...headers });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}
const links = (hrefs) => hrefs.map((h) => `<a href="${h}">${h}</a>`).join(' ');

test('paramètres d’URL : triés, paramètres de suivi retirés, désactivable ; ?a=1&b=2 et ?b=2&a=1 sont une seule page', async () => {
  const c = new Crawler('https://x.fr/', {});
  assert.equal(c.normalize('https://x.fr/p?b=2&a=1'), 'https://x.fr/p?a=1&b=2');
  assert.equal(c.normalize('https://x.fr/p?utm_source=nl&id=3&gclid=abc&fbclid=x'), 'https://x.fr/p?id=3');
  assert.equal(c.normalize('https://x.fr/p?utm_campaign=x'), 'https://x.fr/p');
  assert.equal(c.normalize('https://x.fr/p?page=2'), 'https://x.fr/p?page=2'); // un vrai paramètre reste
  assert.equal(c.normalize('https://x.fr/p?q=a%20b&q=c'), 'https://x.fr/p?q=a%20b&q=c'); // valeurs intactes, ordre stable
  const raw = new Crawler('https://x.fr/', { normalizeParams: false });
  assert.equal(raw.normalize('https://x.fr/p?b=2&a=1&utm_source=x'), 'https://x.fr/p?b=2&a=1&utm_source=x');
  assert.equal(toCrawlerOptions({ normalizeParams: false }).normalizeParams, false);
  assert.equal(toCrawlerOptions({}).normalizeParams, undefined); // défaut du moteur : true
});

test('budget : maxPages compte les pages téléchargées, pas les URL découvertes ni celles bloquées par robots.txt', async () => {
  const { server, base } = await serve((u) => {
    if (u.pathname === '/robots.txt') return [200, 'text/plain', 'User-agent: *\nDisallow: /admin/\n'];
    if (u.pathname === '/') return [200, 'text/html', page('Accueil', links([...Array.from({ length: 10 }, (_, i) => `/admin/${i}`), ...Array.from({ length: 30 }, (_, i) => `/p/${i}`)]))];
    if (u.pathname.startsWith('/p/')) return [200, 'text/html', page('P' + u.pathname, links(Array.from({ length: 5 }, (_, i) => `/q/${u.pathname.slice(3)}-${i}`)))];
    if (u.pathname.startsWith('/q/')) return [200, 'text/html', page('Q', '')];
    return [404, 'text/html', 'nope'];
  });
  try {
    const c = new Crawler(base + '/', { maxPages: 12, concurrency: 2, useSitemaps: false });
    const R = await c.start();
    const fetched = R.pages.filter((p) => !p.blockedByRobots);
    assert.equal(fetched.length, 12, 'pages téléchargées');
    assert.equal(R.pages.filter((p) => p.blockedByRobots).length, 10, 'les pages bloquées sont enregistrées mais ne consomment pas le budget');
    assert.ok(R.meta.skipped.total > 0);
    assert.ok(c.seen.size > 12, 'la découverte dépasse le budget sans le consommer');
  } finally {
    server.close();
  }
});

test('facettes : un chemin qui produit des centaines de variantes de paramètres est signalé une fois', async () => {
  const { server, base } = await serve((u) => {
    if (u.pathname === '/') return [200, 'text/html', page('Accueil', links(Array.from({ length: 260 }, (_, i) => `/catalogue?taille=${i % 20}&couleur=${Math.floor(i / 20)}`)))];
    if (u.pathname === '/catalogue') return [200, 'text/html', page('Catalogue ' + u.search, '')];
    return [404, 'text/html', 'nope'];
  });
  try {
    const R = await new Crawler(base + '/', { maxPages: 5, concurrency: 2, useSitemaps: false }).start();
    const w = R.meta.warnings.filter((x) => x.key === 'warn.facets');
    assert.equal(w.length, 1);
    assert.equal(w[0].params.path, '/catalogue');
    assert.equal(w[0].params.n, 200);
  } finally {
    server.close();
  }
});

test('robots.txt en 5xx : tout interdit (RFC 9309), sauf option « allow » ou mode « report » ; 4xx = tout permis', async () => {
  for (const [status, opts, expectBlocked] of [[500, {}, true], [500, { robotsUnavailable: 'allow' }, false], [500, { robotsMode: 'report' }, false], [403, {}, false], [404, {}, false]]) {
    const { server, base } = await serve((u) => {
      if (u.pathname === '/robots.txt') return [status, 'text/plain', 'boom'];
      if (u.pathname === '/') return [200, 'text/html', page('Accueil', links(['/a', '/b']))];
      return [200, 'text/html', page('Page', '')];
    });
    try {
      const R = await new Crawler(base + '/', { concurrency: 2, useSitemaps: false, ...opts }).start();
      const blocked = R.pages.filter((p) => p.blockedByRobots).length;
      if (expectBlocked) {
        assert.equal(blocked, R.pages.length, `${status} ${JSON.stringify(opts)}`);
        assert.ok(R.meta.warnings.some((w) => w.key === 'warn.robotsDisallowAll' && w.params.status === 500));
      } else {
        assert.equal(blocked, 0, `${status} ${JSON.stringify(opts)}`);
        assert.ok(R.pages.length >= 3);
        assert.ok(!R.meta.warnings.some((w) => w.key === 'warn.robotsDisallowAll'));
      }
    } finally {
      server.close();
    }
  }
});

test('mode liste : robots.txt lu par origine, à la première URL de chaque hôte', async () => {
  const a = await serve((u) => (u.pathname === '/robots.txt' ? [200, 'text/plain', 'User-agent: *\nAllow: /\n'] : [200, 'text/html', page('A ' + u.pathname, '')]));
  const b = await serve((u) => (u.pathname === '/robots.txt' ? [200, 'text/plain', 'User-agent: *\nDisallow: /secret\n'] : [200, 'text/html', page('B ' + u.pathname, '')]));
  try {
    const urls = [a.base + '/x', b.base + '/ok', b.base + '/secret/1', b.base + '/secret/2'];
    const R = await new Crawler('', { mode: 'list', urls, concurrency: 2 }).start();
    const by = Object.fromEntries(R.pages.map((p) => [p.url, p]));
    assert.equal(by[a.base + '/x'].status, 200);
    assert.equal(by[b.base + '/ok'].status, 200);
    assert.equal(by[b.base + '/secret/1'].blockedByRobots, true);
    assert.equal(by[b.base + '/secret/2'].blockedByRobots, true);
  } finally {
    a.server.close();
    b.server.close();
  }
});

test('5xx et coupure réseau : une nouvelle tentative différée, puis la page est enregistrée avec son nombre d’essais', async () => {
  let hits = 0;
  let cut = 0;
  const { server, base } = await serve((u, req, res) => {
    if (u.pathname === '/') return [200, 'text/html', page('Accueil', links(['/flaky', '/cut', '/dead']))];
    if (u.pathname === '/flaky') return ++hits === 1 ? [502, 'text/html', 'bad gateway'] : [200, 'text/html', page('Flaky', '')];
    if (u.pathname === '/cut') {
      if (++cut === 1) return (res.socket.destroy(), null);
      return [200, 'text/html', page('Cut', '')];
    }
    if (u.pathname === '/dead') return [500, 'text/html', 'always'];
    return [404, 'text/html', 'nope'];
  });
  try {
    const t0 = Date.now();
    const R = await new Crawler(base + '/', { concurrency: 2, useSitemaps: false }).start();
    const by = Object.fromEntries(R.pages.map((p) => [p.url.replace(base, ''), p]));
    assert.equal(by['/flaky'].status, 200);
    assert.equal(by['/flaky'].retries, 1);
    assert.equal(by['/cut'].status, 200);
    assert.equal(by['/dead'].status, 500);
    assert.equal(by['/dead'].retries, 1);
    assert.equal(hits, 2);
    assert.ok(Date.now() - t0 >= 4000, 'la relance attend quelques secondes');
  } finally {
    server.close();
  }
});

test('taille des réponses : corps lu en flux et abandonné au-delà de la limite, même sans Content-Length ; sitemaps bornés', async () => {
  const { server, base } = await serve((u, req, res) => {
    if (u.pathname === '/') return [200, 'text/html', page('Accueil', links(['/huge', '/ok']))];
    if (u.pathname === '/huge') {
      res.writeHead(200, { 'content-type': 'text/html' }); // chunked : pas de Content-Length
      const chunk = Buffer.alloc(64 * 1024, 'a');
      let n = 0;
      const write = () => (n++ < 40 ? res.write(chunk, write) : res.end());
      write();
      return null;
    }
    if (u.pathname === '/ok') return [200, 'text/html', page('Ok', '')];
    if (u.pathname === '/sitemap.xml') return [200, 'application/xml', '<urlset>' + '<url><loc>' + base + '/ok</loc></url>'.repeat(20000) + '</urlset>'];
    return [404, 'text/html', 'nope'];
  });
  try {
    const R = await new Crawler(base + '/', { concurrency: 2, maxPageSizeKb: 512, maxSitemapKb: 64, useSitemaps: true }).start();
    const huge = R.pages.find((p) => p.url.endsWith('/huge'));
    assert.equal(huge.tooLarge, true);
    assert.ok(huge.size > 512 * 1024 && huge.size < 40 * 64 * 1024, String(huge.size)); // interrompu avant la fin
    assert.equal(R.meta.skipped.pageSize, 1);
    assert.ok(R.pages.find((p) => p.url.endsWith('/ok')).status === 200);
    assert.equal(R.meta.sitemapFiles.length, 0, 'sitemap trop gros ignoré');
  } finally {
    server.close();
  }
});

test('extraction regex dans un Worker : une regex catastrophique est interrompue, le crawl continue ; XPath via jsdom et attr/html/count', async () => {
  const runner = new RegexRunner({ timeoutMs: 300 });
  const slow = await runner.run('a'.repeat(40) + '!', [{ name: 'boom', selector: '^(a+)+$' }, { name: 'ok', selector: 'a(a)' }]);
  assert.deepEqual(slow, { boom: ['⚠ timeout'], ok: ['⚠ timeout'] });
  const fine = await runner.run('prix 12 € et 15 €', [{ name: 'prix', selector: '(\\d+) €' }]);
  assert.deepEqual(fine, { prix: ['12', '15'] });
  await runner.close();
  const { server, base } = await serve((u) => [200, 'text/html', page('Accueil', `<div class="prix">12 €</div><div class="prix">15 €</div><a class="cta" href="/go">Go</a> ${u.pathname === '/' ? links(['/a']) : ''}`)]);
  try {
    const extractors = [
      { name: 'xp', type: 'xpath', selector: '//div[@class="prix"]', target: 'text' },
      { name: 'xpc', type: 'xpath', selector: '//div', target: 'count' },
      { name: 'href', type: 'css', selector: 'a.cta', target: 'attr', attr: 'href' },
      { name: 'html', type: 'css', selector: 'a.cta', target: 'html' },
      { name: 'n', type: 'css', selector: '.prix', target: 'count' },
      { name: 're', type: 'regex', selector: '(\\d+) €' },
      { name: 'boom', type: 'regex', selector: '^(a+)+$' },
    ];
    const R = await new Crawler(base + '/', { concurrency: 2, useSitemaps: false, extractors: toCrawlerOptions({ extractors }).extractors }).start();
    const home = R.pages.find((p) => p.url === base + '/');
    assert.deepEqual(home.extracted.xp, ['12 €', '15 €']);
    assert.ok(home.extracted.xpc[0] >= 2);
    assert.deepEqual(home.extracted.href, ['/go']);
    assert.match(home.extracted.html[0], /^<a class="cta"/);
    assert.deepEqual(home.extracted.n, [2]);
    assert.deepEqual(home.extracted.re, ['12', '15']);
    assert.ok(Array.isArray(home.extracted.boom));
  } finally {
    server.close();
  }
});

test('liste depuis un sitemap (option et CLI --sitemap), extraction CLI attr/html/count/xpath avec une colonne par règle', { timeout: 60000 }, async () => {
  const { server, base } = await serve((u) => {
    if (u.pathname === '/sitemap.xml') return [200, 'application/xml', `<sitemapindex><sitemap><loc>${base}/pages.xml</loc></sitemap></sitemapindex>`];
    if (u.pathname === '/pages.xml') return [200, 'application/xml', `<urlset><url><loc>${base}/a</loc></url><url><loc>${base}/b?utm_source=x</loc></url><url><loc>${base}/a</loc></url></urlset>`];
    if (u.pathname === '/robots.txt') return [404, 'text/plain', ''];
    return [200, 'text/html', page('P ' + u.pathname, `<span class="k">${u.pathname.slice(1)}</span> ${links(['/zzz'])}`)];
  });
  try {
    const R = await new Crawler('', { mode: 'list', sitemapUrl: base + '/sitemap.xml', concurrency: 2 }).start();
    assert.deepEqual(R.pages.map((p) => p.url.replace(base, '')).sort(), ['/a', '/b']); // dédoublonné, paramètre de suivi retiré, liens non suivis
    const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-cli-sitemap-')), 'out');
    await promisify(execFile)(process.execPath, ['src/cli.mjs', '--sitemap', base + '/sitemap.xml', '--extract', 'k=.k', '--extract', 'kx=xpath://span[@class="k"]', '--extract', 'nb=count:span', '--extract', 'h=html:span.k', '--csv', '--out', out, '--lang', 'en', '--no-journal'], { cwd: ROOT });
    const files = await fs.readdir(out);
    const csv = await fs.readFile(path.join(out, files.find((f) => f.endsWith('_pages.csv'))), 'utf8');
    const [header, ...rows] = csv.trim().split('\n');
    assert.ok(header.endsWith(';k;kx;nb;h'), header);
    assert.equal(rows.length, 2);
    const a = rows.find((r) => r.startsWith(base + '/a;'));
    assert.match(a, /;a;a;1;"?<span class=""?k""?>a<\/span>"?$/);
  } finally {
    server.close();
  }
});
