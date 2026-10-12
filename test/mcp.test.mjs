// Test de bout en bout du serveur MCP : un vrai client MCP pilote le serveur (stdio) sur un site statique local,
// avec le connecteur « fichiers » : crawl → suggestions → aperçu → application → vérification → annulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = (title, body, head = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
const lorem = 'Le français s’apprend mieux avec un professeur natif qui corrige la prononciation et explique la grammaire. '.repeat(30);

async function makeSite(dir) {
  await fs.mkdir(path.join(dir, 'cours'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), page('Accueil', `<h1>Cours de français</h1><p>${lorem}</p><a href="/cours/">Cours</a> <a href="/contact.html">Contact</a> <a href="/ancien-tarif">Tarifs</a>`, '<meta name="description" content="Cours de français en ligne avec un professeur natif à Madrid, pour adultes et enfants, tous niveaux.">'));
  await fs.writeFile(path.join(dir, 'cours', 'index.html'), page('Cours', `<h1>Nos cours</h1><p>${lorem}</p><img src="/img/classe.jpg"><a href="/">Accueil</a>`));
  await fs.writeFile(path.join(dir, 'contact.html'), page('Contact', `<h1>Contact</h1><p>${lorem}</p><a href="/">Accueil</a>`, '<meta name="description" content="Contactez-nous pour réserver votre premier cours de français en ligne, gratuit et sans engagement.">'));
}

// Serveur statique façon Netlify : sert le dossier et applique le fichier _redirects.
function serve(dir) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const redirects = await fs.readFile(path.join(dir, '_redirects'), 'utf8').catch(() => '');
    for (const line of redirects.split('\n')) {
      const m = /^(\S+)\s+(\S+)\s+301/.exec(line.trim());
      if (m && m[1] === u.pathname) {
        res.writeHead(301, { location: m[2] });
        return res.end();
      }
    }
    if (u.pathname.startsWith('/img/')) {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': 10 });
      return res.end('0123456789');
    }
    const rel = u.pathname.endsWith('/') ? path.join(u.pathname, 'index.html') : u.pathname;
    const html = await fs.readFile(path.join(dir, rel), 'utf8').catch(() => null);
    if (html == null) {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<h1>404</h1>');
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('serveur MCP : du crawl à l’annulation sur un site statique', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-mcp-'));
  const siteDir = path.join(tmp, 'site');
  await makeSite(siteDir);
  const server = await serve(siteDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'src/mcp.mjs')], env: { ...process.env, ARACHNIDE_HOME: path.join(tmp, 'home'), ARACHNIDE_CRAWLS: path.join(tmp, 'crawls'), ARACHNIDE_LANG: 'fr' }, stderr: 'ignore' }));
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const data = JSON.parse(r.content[0].text);
    if (r.isError) throw new Error(`${name}: ${data.error}`);
    return data;
  };
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 19);
    assert.equal(tools.find((x) => x.name === 'arachnide_apply_changes').annotations.destructiveHint, true);
    const prompts = await client.listPrompts();
    assert.ok(prompts.prompts.some((p) => p.name === 'optimize_site'));

    const det = await call('arachnide_detect_site', { url: base + '/' });
    assert.equal(det.cms, null);
    assert.equal(det.connector, 'files');

    const crawl = await call('arachnide_crawl', { url: base + '/', max_pages: 50 });
    assert.ok(crawl.crawl_id && crawl.score > 0);
    assert.ok(crawl.top_issues.length);
    const list = await call('arachnide_list_crawls');
    assert.equal(list[0].crawl_id, crawl.crawl_id);
    const issue = await call('arachnide_get_issue', { issue_id: 'desc-missing' });
    assert.deepEqual(issue.items.map((i) => i.url), [base + '/cours/']);
    assert.match(issue.label, /description/i);

    const fixes = await call('arachnide_suggest_fixes', { crawl_id: crawl.crawl_id });
    const cours = fixes.items.find((i) => i.url === base + '/cours/');
    assert.ok(cours.suggestions.some((s) => s.field === 'meta_description' && s.current === null));
    assert.ok(cours.suggestions.some((s) => s.field === 'image_alt' && s.target === base + '/img/classe.jpg'));
    const broken = fixes.items.find((i) => i.url === base + '/ancien-tarif');
    assert.equal(broken.suggestions[0].field, 'redirect');

    const live = await call('arachnide_fetch_page', { url: base + '/cours/' });
    assert.equal(live.h1, 'Nos cours');
    assert.match(live.text_excerpt, /professeur natif/);

    // Un secret en clair est refusé ; la configuration passe par une référence env:.
    await assert.rejects(call('arachnide_configure_site', { name: 'demo', url: base, connector: 'wordpress', settings: { appPassword: 'abcd efgh' } }), /env:/);
    await call('arachnide_configure_site', { name: 'demo', url: base, connector: 'files', settings: { root: siteDir, redirectsFormat: 'netlify' }, policy: { maxChangesPerBatch: 10 } });
    const t = await call('arachnide_test_site', { site: 'demo' });
    assert.equal(t.ok, true);
    assert.ok(t.writable_fields.includes('redirect'));

    const changes = [
      { url: base + '/cours/', field: 'meta_description', value: 'Découvrez nos cours de français en ligne : conversation, grammaire et préparation au DELF avec un professeur natif.', reason: 'desc-missing' },
      { url: base + '/cours/', field: 'seo_title', value: 'Cours de français en ligne avec un professeur natif | Madrid' },
      { url: base + '/cours/', field: 'image_alt', target: '/img/classe.jpg', value: 'Élèves en cours de français' },
      { url: base + '/ancien-tarif', field: 'redirect', value: base + '/contact.html' },
      { url: 'https://autre-site.fr/x', field: 'h1', value: 'x' },
    ];
    const preview = await call('arachnide_preview_changes', { site: 'demo', changes });
    assert.equal(preview.auto, 4);
    assert.equal(preview.invalid, 1);
    assert.equal(preview.items[0].current, null);
    assert.equal(preview.items[1].current, 'Cours');
    // Rien n'a été écrit pendant l'aperçu.
    assert.doesNotMatch(await fs.readFile(path.join(siteDir, 'cours/index.html'), 'utf8'), /Découvrez/);

    const applied = await call('arachnide_apply_changes', { site: 'demo', changes: changes.slice(0, 4) });
    assert.equal(applied.applied, 4, JSON.stringify(applied.results, null, 1));
    const html = await fs.readFile(path.join(siteDir, 'cours/index.html'), 'utf8');
    assert.match(html, /<meta name="description" content="Découvrez nos cours/);
    assert.match(html, /<title>Cours de français en ligne avec un professeur natif \| Madrid<\/title>/);
    assert.match(html, /<img alt="Élèves en cours de français" src="\/img\/classe.jpg">/);

    const verify = await call('arachnide_verify_changes', { site: 'demo', batch: applied.batch });
    assert.equal(verify.live, 4, JSON.stringify(verify.items, null, 1));

    // Réappliquer les mêmes valeurs ne change rien.
    const again = await call('arachnide_apply_changes', { site: 'demo', changes: changes.slice(0, 2) });
    assert.equal(again.unchanged, 2);

    const journal = await call('arachnide_list_changes', { site: 'demo' });
    assert.equal(journal.total, 4);

    const rb = await call('arachnide_rollback_changes', { site: 'demo', batch: applied.batch });
    assert.ok(rb.results.every((r) => r.status === 'rolled_back'), JSON.stringify(rb.results, null, 1));
    const restored = await fs.readFile(path.join(siteDir, 'cours/index.html'), 'utf8');
    assert.doesNotMatch(restored, /Découvrez|alt=/);
    assert.match(restored, /<title>Cours<\/title>/);
    assert.equal((await fetch(base + '/ancien-tarif', { redirect: 'manual' })).status, 404);

    // Limite de la politique du site.
    await assert.rejects(call('arachnide_apply_changes', { site: 'demo', changes: Array.from({ length: 11 }, () => changes[0]) }), /Too many changes/);
  } finally {
    await client.close();
    server.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
