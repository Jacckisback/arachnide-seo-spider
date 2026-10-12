// Petit site de test servi en local, avec des problèmes SEO volontaires.
import http from 'node:http';

const layout = (title, body, head = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${head}</head><body>
<nav><a href="/">Accueil</a> <a href="/cours">Cours</a> <a href="/blog/">Blog</a> <a href="/contact">Contact</a></nav>${body}</body></html>`;
const lorem = (n) => Array.from({ length: n }, (_, i) => 'mot' + (i % 50)).join(' ');
const VOCAB = 'apprendre français grammaire conjugaison verbe examen oral écrit niveau professeur exercice leçon phrase texte lecture écoute accent vocabulaire méthode progrès session épreuve conseil erreur réponse question dialogue histoire culture voyage'.split(' ');
const prose = (seed, n) => {
  let a = seed * 2654435761;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => VOCAB[Math.floor(rand() * VOCAB.length)]).join(' ');
};
const article = prose(5, 400);

const routes = {
  '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nDisallow: /\nSitemap: http://HOST/sitemap.xml\n'],
  '/sitemap.xml': [200, 'application/xml', `<?xml version="1.0"?><urlset><url><loc>http://HOST/</loc></url><url><loc>http://HOST/cours</loc></url><url><loc>http://HOST/orpheline</loc></url><url><loc>http://HOST/ancienne</loc></url></urlset>`],
  '/': [200, 'text/html', layout('Cours de français en ligne avec un professeur natif', `<h1>Cours de français</h1><h2>Pourquoi</h2><p>${lorem(400)}</p><img src="/img/a.jpg"><a href="/ancienne">ancienne</a> <a href="/admin">admin</a> <a href="https://example.org/">externe</a> <a href="/cassee">cassé</a> <a href="/guide-delf">DELF</a> <a href="/js">JS</a> <a href="/refresh">refresh</a> <a href="/es/guia-delf">es</a> <a href="/produits?utm_source=x&id=3">produit</a> <a href="/a/b/c/d/profond">profond</a> <a href="/secret">secret</a>`,
    '<meta name="description" content="Apprenez le français en ligne avec un professeur natif : cours particuliers, préparation DELF DALF et TCF."><link rel="canonical" href="http://HOST/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>')],
  '/cours': [200, 'text/html', layout('Cours', `<h1>Cours</h1><h1>Deuxième H1</h1><p>${lorem(50)}</p><a href="/cours?page=2">page 2</a> <a href="/blog/Article_Un">article</a>`, '<meta name="robots" content="index,follow">')],
  '/cours?page=2': [200, 'text/html', layout('Cours', `<h1>Cours</h1><p>${lorem(50)}</p>`, '<link rel="canonical" href="http://HOST/cours">')],
  '/blog/': [200, 'text/html', layout('Blog', `<h1>Blog</h1><p>${lorem(300)}</p><a href="/blog/Article_Un" rel="nofollow">article</a>`, '<meta name="description" content="Blog">')],
  '/blog/Article_Un': [200, 'text/html', layout('Blog', `<p>${lorem(300)}</p><img src="/img/b.jpg" alt="Photo">`, '<meta name="robots" content="noindex">')],
  '/contact': [200, 'text/html', layout('Blog', `<h1>Contact</h1><p>${lorem(300)}</p>`, '<meta name="description" content="Blog">')],
  '/guide-delf': [200, 'text/html', layout('Préparation DELF B2 : guide complet', `<main><h1>Préparation DELF B2</h1><h3>Saut de niveau</h3><p>${article}</p><a href="/guide-delf-2">en savoir plus</a> <a href="/cours"><img src="/img/c.jpg"></a></main>`,
    '<meta name="description" content="Tout pour réussir la préparation DELF B2 : épreuves, conseils, exercices corrigés et calendrier des sessions."><link rel="canonical" href="http://HOST/guide-delf"><link rel="alternate" hreflang="fr" href="http://HOST/guide-delf"><link rel="alternate" hreflang="es" href="http://HOST/es/guia-delf"><link rel="alternate" hreflang="english" href="http://HOST/en/delf"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"DELF"}</script>')],
  '/guide-delf-2': [200, 'text/html', layout('Préparation DELF B2 : nos conseils', `<main><h1>Conseils DELF B2</h1><p>${article} fin</p></main>`, '<meta name="description" content="Nos conseils pour la préparation DELF B2 : méthode, exercices et erreurs fréquentes à éviter le jour de l’examen.">')],
  '/es/guia-delf': [200, 'text/html', layout('Guía DELF B2 completa para aprobar', `<main><h1>Guía DELF</h1><p>${prose(3, 300)}</p></main>`, '<link rel="alternate" hreflang="es" href="http://HOST/es/guia-delf">')],
  '/js': [200, 'text/html', `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page JavaScript</title></head><body><div id="app"></div><script>document.getElementById('app').innerHTML='<h1>Rendu JS</h1><p>' + ${JSON.stringify(prose(7, 300))} + '</p>' + Array.from({length:8},(_, i)=>'<a href="/js-lien-'+i+'">lien '+i+'</a>').join(' ');document.title='Titre modifié par JavaScript';</script></body></html>`],
  '/secret': [200, 'text/html', 'AUTH'],
  '/produits?utm_source=x&id=3': [200, 'text/html', layout('Produit 3 avec suivi', '<h1>Produit</h1><span class="prix">19,90 €</span><span class="prix">29,90 €</span>')],
  '/produits?id=3': [200, 'text/html', layout('Produit 3', '<h1>Produit</h1><span class="prix">19,90 €</span><span class="prix">29,90 €</span><p>Réf. ABC-123</p>')],
  '/a/b/c/d/profond': [200, 'text/html', layout('Page très profonde dans les dossiers', '<h1>Profond</h1>')],
  '/refresh': [200, 'text/html', layout('Page avec meta refresh', '<p>redirection</p>', '<meta http-equiv="refresh" content="0;url=/contact">')],
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
      if (req.url === '/secret') {
        const ok = req.headers.authorization === 'Basic ' + Buffer.from('demo:pass').toString('base64') && req.headers['x-test'] === '1';
        res.writeHead(ok ? 200 : 401, { 'content-type': 'text/html' });
        return res.end(ok ? '<html><head><title>Zone protégée</title></head><body><h1>OK</h1></body></html>' : 'Unauthorized');
      }
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

export const ROUTES = routes;

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFixture(Number(process.argv[2]) || 4555);
  console.log('Site de test sur http://127.0.0.1:' + s.address().port);
}
