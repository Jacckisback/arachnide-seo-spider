// Connecteur GitHub (API simulée) : localisation dans le code, branche, commits, Pull Request, annulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubFixConnector } from '../src/fix/github.mjs';
import { makeFix } from '../src/fix/schema.mjs';
import { detectFramework, applyToSource, rankFiles } from '../src/fix/locate.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.ARACHNIDE_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-gh-'));

// Dépôt type Lovable : Vite + React + react-helmet-async.
function fakeGitHub() {
  const files = {
    'package.json': JSON.stringify({ dependencies: { react: '18', 'react-helmet-async': '2', vite: '5' } }),
    'index.html': '<!doctype html><html><head><title>Mon site</title></head><body><div id="root"></div></body></html>',
    'src/pages/Index.tsx': `import { Helmet } from 'react-helmet-async';\nexport default () => (<>\n<Helmet><title>Accueil</title><meta name="description" content="Ancienne description" /></Helmet>\n<h1>Bienvenue</h1><img src="/images/prof.jpg" className="hero" /><a href="/ancienne">Cours</a>\n</>);`,
    'src/pages/Contact.tsx': '<h1>Contact</h1>',
  };
  const calls = [];
  let n = 0;
  const pulls = {};
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const route = u.pathname.replace('/repos/owner/site', '');
    const method = init.method || 'GET';
    calls.push(`${method} ${route}`);
    const body = init.body ? JSON.parse(init.body) : null;
    const json = (status, data) => new Response(data === null ? null : JSON.stringify(data), { status });
    assert.equal(init.headers.authorization, 'Bearer github_pat_test');
    if (route === '' && method === 'GET') return json(200, { full_name: 'owner/site', default_branch: 'main', permissions: { push: true } });
    if (route === '/git/ref/heads/main') return json(200, { object: { sha: 'base-sha' } });
    if (route === '/git/trees/base-sha') return json(200, { tree: Object.keys(files).map((p) => ({ path: p, type: 'blob' })) });
    const c = /^\/contents\/(.+)$/.exec(route);
    if (c && method === 'GET') return json(200, { sha: 'sha-' + decodeURIComponent(c[1]), content: Buffer.from(files[decodeURIComponent(c[1])]).toString('base64') });
    if (c && method === 'PUT') {
      files[decodeURIComponent(c[1])] = Buffer.from(body.content, 'base64').toString();
      return json(200, { commit: { sha: 'c' + ++n } });
    }
    if (route === '/git/refs' && method === 'POST') return json(201, { ref: body.ref });
    if (route === '/pulls' && method === 'POST') {
      pulls[1] = { number: 1, html_url: 'https://github.com/owner/site/pull/1', state: 'open', merged: false, ...body };
      return json(201, pulls[1]);
    }
    if (route === '/pulls/1' && method === 'GET') return json(200, pulls[1]);
    if (route === '/pulls/1' && method === 'PATCH') return json(200, Object.assign(pulls[1], body));
    if (route.startsWith('/git/refs/heads/') && method === 'DELETE') return json(204, null);
    return json(404, { message: 'Not Found ' + route });
  };
  return { files, calls, pulls, fetch };
}

const fix = (kind, oldValue, newValue, extra = {}) => makeFix({ issueType: 'x', url: 'https://site.lovable.app/', kind, oldValue, newValue, method: 'ai', provider: 'anthropic', confidence: 0.9, rationale: 'r', status: 'approved', batch: 'B1', ...extra });

test('localisation : framework, échappement JSX, insertion et classement des fichiers', () => {
  assert.equal(detectFramework({ dependencies: { next: '15' } }), 'next');
  assert.equal(detectFramework({ dependencies: { astro: '5' } }), 'astro');
  assert.equal(detectFramework(null), 'static');
  assert.equal(applyToSource("title: 'Old'", fix('seo_title', 'Old', "It's new")).content, "title: 'It\\'s new'");
  assert.equal(applyToSource('<p>rien</p>', fix('h1', 'Absent', 'X')).count, 0);
  assert.equal(rankFiles(['src/pages/Contact.tsx', 'src/pages/Index.tsx'], 'https://x/contact', 'vite')[0], 'src/pages/Contact.tsx');
});

test('GitHub : test du token, diff avant PR, branche + commit + Pull Request avec récapitulatif, annulation', async () => {
  const gh = fakeGitHub();
  const c = new GitHubFixConnector({ type: 'github', repo: 'owner/site', token: 'github_pat_test' }, { fetch: gh.fetch });
  assert.deepEqual(await c.testConnection(), { ok: true, details: 'owner/site · main' });
  const fixes = [
    fix('seo_title', 'Accueil', 'Cours de français en ligne | Mon site'),
    fix('meta_description', 'Ancienne description', 'Apprenez le français avec un professeur natif.'),
    fix('image_alt', null, 'Thierry pendant un cours', { selector: 'https://site.lovable.app/images/prof.jpg' }),
    fix('link', 'https://site.lovable.app/ancienne', 'https://site.lovable.app/cours', { selector: 'https://site.lovable.app/ancienne' }),
    fix('h1', 'Introuvable', 'X'),
  ];
  const pv = await c.preview(fixes);
  assert.equal(pv.framework, 'react-helmet');
  assert.deepEqual(pv.files.map((f) => f.path), ['src/pages/Index.tsx']);
  assert.match(pv.files[0].after, /alt="Thierry pendant un cours"/);
  assert.match(pv.files[0].after, /href="\/cours"/);
  assert.equal(pv.unresolved.length, 1);
  assert.ok(!gh.calls.some((x) => x.startsWith('PUT') || x.startsWith('POST')), 'aperçu : aucune écriture');
  const r = await c.applyBatch(fixes, { batch: 'B1' });
  assert.equal(r.ok, true);
  assert.equal(r.pr, 'https://github.com/owner/site/pull/1');
  assert.match(r.branch, /^arachnide\/fix-\d{8}-\d{4}$/);
  assert.match(gh.files['src/pages/Index.tsx'], /<title>Cours de français en ligne \| Mon site<\/title>/);
  assert.match(gh.pulls[1].body, /\| URL \| Problème \| Avant \| Après \| Fichier \|/);
  assert.match(gh.pulls[1].body, /non localisée/);
  assert.equal(gh.pulls[1].base, 'main');
  const back = await c.rollbackBatch(fixes, { batch: 'B2' });
  assert.equal(back.ok, true);
  assert.equal(gh.pulls[1].state, 'closed'); // PR non fusionnée : fermée
});
