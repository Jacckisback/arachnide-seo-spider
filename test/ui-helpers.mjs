// Outils communs aux tests d'interface (Playwright) : site de démonstration, crawl, application lancée à part.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Crawler } from '../src/crawler.mjs';

const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    try {
      return require(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright'));
    } catch {
      return null;
    }
  }
}
export const XSS = '<img src=x onerror=alert(1)>';

// Site « type agence » : /en sans barre finale avec des pages sous /en/…, un blog paginé, une page au titre piégé.
export function startSite() {
  const P = {};
  const add = (p, title, links) => (P[p] = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${'Texte de démonstration. '.repeat(60)}</p>${links.map((h) => `<a href="${h}">${h}</a>`).join(' ')}</body></html>`);
  const posts = Array.from({ length: 24 }, (_, i) => `/blog/article-${i + 1}`);
  add('/', 'Accueil agence', ['/blog', '/contact', '/en', '/piege']);
  add('/blog', 'Blog', posts);
  for (const p of posts) add(p, 'Article ' + p.split('-')[1], ['/blog']);
  add('/contact', 'Contact', []);
  add('/piege', XSS.replace(/</g, '&lt;').replace(/>/g, '&gt;'), []);
  add('/en', 'Web agency', ['/en/services', '/en/blog']);
  add('/en/services', 'Services', []);
  add('/en/blog', 'English blog', ['/en/blog/post-1', '/en/blog/post-2']);
  add('/en/blog/post-1', 'Post 1', []);
  add('/en/blog/post-2', 'Post 2', []);
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const body = P[req.url.split('?')[0]];
      res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body || 'Not found');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

export async function startApp() {
  const port = 47000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), env: { ...process.env, PORT: String(port), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('app did not start')), 15000);
    child.stdout.on('data', (d) => String(d).includes('http://') && (clearTimeout(to), resolve()));
    child.on('exit', (c) => reject(new Error('app exited ' + c)));
  });
  return { child, url: `http://127.0.0.1:${port}/` };
}

// Crawl du site de démonstration, enregistré comme un fichier que l'interface peut ouvrir.
export async function demoCrawlFile() {
  const site = await startSite();
  const base = `http://127.0.0.1:${site.address().port}`;
  const R = await new Crawler(base + '/', { concurrency: 4, useSitemaps: false }).start();
  site.close();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arachnide-e2e-')), 'crawl.json');
  fs.writeFileSync(file, JSON.stringify(R));
  return { file, base };
}

// Navigateur + page qui collecte les erreurs JavaScript et les boîtes de dialogue (signe d'un script injecté).
export async function openApp(pw, url, file, viewport = { width: 1440, height: 900 }) {
  const browser = await pw.chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }).catch(() => null);
  if (!browser) return null;
  const ctx = await browser.newContext({ viewport, locale: 'fr', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('dialog', (d) => (dialogs.push(d.message()), d.dismiss().catch(() => {})));
  await page.goto(url);
  await page.evaluate(() => (localStorage.clear(), localStorage.setItem('lang', 'fr')));
  await page.reload();
  await page.setInputFiles('#importInput', file);
  await page.waitForSelector('#tabs [data-tab=viz]:not([disabled])');
  return { browser, page, errors, dialogs };
}
