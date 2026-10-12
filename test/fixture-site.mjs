// Petit site de test servi en local, avec des problèmes SEO volontaires.
import http from 'node:http';

const layout = (title, body, head = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${head}</head><body>
<nav><a href="/">Accueil</a> <a href="/cours">Cours</a> <a href="/blog/">Blog</a> <a href="/contact">Contact</a></nav>${body}</body></html>`;
const lorem = (n) => Array.from({ length: n }, (_, i) => 'mot' + (i % 50)).join(' ');

const routes = {
  '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /admin\nSitemap: http://HOST/sitemap.xml\n'],
  '/sitemap.xml': [200, 'application/xml', `<?xml version="1.0"?><urlset><url><loc>http://HOST/</loc></url><url><loc>http://HOST/cours</loc></url><url><loc>http://HOST/orpheline</loc></url><url><loc>http://HOST/ancienne</loc></url></urlset>`],
  '/': [200, 'text/html', layout('Cours de français en ligne avec un professeur natif', `<h1>Cours de français</h1><h2>Pourquoi</h2><p>${lorem(400)}</p><img src="/img/a.jpg"><a href="/ancienne">ancienne</a> <a href="/admin">admin</a> <a href="https://example.org/">externe</a> <a href="/cassee">cassé</a>`,
    '<meta name="description" content="Apprenez le français en ligne avec un professeur natif : cours particuliers, préparation DELF DALF et TCF."><link rel="canonical" href="http://HOST/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>')],
  '/cours': [200, 'text/html', layout('Cours', `<h1>Cours</h1><h1>Deuxième H1</h1><p>${lorem(50)}</p><a href="/cours?page=2">page 2</a> <a href="/blog/Article_Un">article</a>`, '<meta name="robots" content="index,follow">')],
  '/cours?page=2': [200, 'text/html', layout('Cours', `<h1>Cours</h1><p>${lorem(50)}</p>`, '<link rel="canonical" href="http://HOST/cours">')],
  '/blog/': [200, 'text/html', layout('Blog', `<h1>Blog</h1><p>${lorem(300)}</p><a href="/blog/Article_Un" rel="nofollow">article</a>`, '<meta name="description" content="Blog">')],
  '/blog/Article_Un': [200, 'text/html', layout('Blog', `<p>${lorem(300)}</p><img src="/img/b.jpg" alt="Photo">`, '<meta name="robots" content="noindex">')],
  '/contact': [200, 'text/html', layout('Blog', `<h1>Contact</h1><p>${lorem(300)}</p>`, '<meta name="description" content="Blog">')],
  '/orpheline': [200, 'text/html', layout('Page orpheline jamais liée depuis le site web', `<h1>Orpheline</h1><p>${lorem(300)}</p>`)],
  '/ancienne': [301, null, '/intermediaire'],
  '/intermediaire': [302, null, '/contact'],
  '/admin': [200, 'text/html', layout('Admin', 'secret')],
  '/img/a.jpg': [200, 'image/jpeg', 'x'.repeat(200000)],
  '/img/b.jpg': [200, 'image/jpeg', 'x'],
};

export function startFixture(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const host = req.headers.host;
      const r = routes[req.url];
      if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
      const [status, type, body] = r;
      if (status >= 300 && status < 400) { res.writeHead(status, { location: body }); return res.end(); }
      const b = body.replaceAll('HOST', host);
      res.writeHead(status, { 'content-type': type + (type.startsWith('text') ? '; charset=utf-8' : ''), 'content-length': Buffer.byteLength(b) });
      res.end(req.method === 'HEAD' ? undefined : b);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFixture(Number(process.argv[2]) || 4555);
  console.log('Site de test sur http://127.0.0.1:' + s.address().port);
}
