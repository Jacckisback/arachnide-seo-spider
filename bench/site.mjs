// Site synthétique local pour les mesures d'échelle : N pages générées à la volée (/p/<i>), ~60 liens de gabarit et
// 40 liens déterministes vers d'autres pages, une part de 404, de redirections et de quasi-doublons. Aucun site réel.
//   node bench/site.mjs --pages 200000 [--port 4800]   (ou startBenchSite() depuis bench/run.mjs)
import http from 'node:http';

export function pageHtml(i, N) {
  const nav = Array.from({ length: 60 }, (_, k) => `<a href="/p/${(k * 997) % N}">Rubrique ${k}</a>`).join(' ');
  const body = Array.from({ length: 40 }, (_, k) => `<a href="/p/${(i * 31 + k * 7 + 1) % N}">Page ${(i * 31 + k * 7 + 1) % N}</a>`).join(' ');
  const words = Array.from({ length: 120 }, (_, k) => `mot${(i * 13 + k * 7) % 500}`).join(' ');
  // Un quart des pages est une quasi-copie de la précédente (même texte, un mot changé) ; 2 % renvoient vers une 404.
  const text = i % 4 === 3 ? Array.from({ length: 120 }, (_, k) => `mot${((i - 1) * 13 + k * 7) % 500}`).join(' ') + ' variante' : words;
  const broken = i % 50 === 0 ? `<a href="/missing/${i}">lien cassé</a>` : '';
  const redirect = i % 40 === 0 ? `<a href="/old/${i}">ancienne adresse</a>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Page ${i} — Site synthétique</title><meta name="description" content="Description de la page ${i} du site synthétique de mesure."><link rel="canonical" href="/p/${i}"></head><body><nav>${nav}</nav><main><h1>Page ${i}</h1><p>${text}</p>${body} ${broken} ${redirect}</main></body></html>`;
}

export function startBenchSite({ pages = 1000, port = 0, delayMs = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const reply = (status, type, body, headers = {}) => {
      const send = () => {
        res.writeHead(status, { 'content-type': type, ...headers });
        res.end(body);
      };
      delayMs ? setTimeout(send, delayMs) : send();
    };
    if (url.pathname === '/robots.txt') return reply(200, 'text/plain', 'User-agent: *\nDisallow: /admin/\nSitemap: /sitemap.xml\n');
    if (url.pathname === '/sitemap.xml') return reply(200, 'application/xml', `<?xml version="1.0"?><urlset>${Array.from({ length: Math.min(pages, 50000) }, (_, i) => `<url><loc>http://${req.headers.host}/p/${i}</loc></url>`).join('')}</urlset>`);
    if (url.pathname === '/') return reply(200, 'text/html; charset=utf-8', pageHtml(0, pages));
    const m = /^\/p\/(\d+)$/.exec(url.pathname);
    if (m && Number(m[1]) < pages) return reply(200, 'text/html; charset=utf-8', pageHtml(Number(m[1]), pages));
    const old = /^\/old\/(\d+)$/.exec(url.pathname);
    if (old) return reply(301, 'text/plain', '', { location: `/p/${old[1]}` });
    return reply(404, 'text/html; charset=utf-8', '<!doctype html><title>404</title><h1>Introuvable</h1>');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, '/'))) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const server = await startBenchSite({ pages: Number(arg('pages', 1000)), port: Number(arg('port', 4800)) });
  console.log(`Site synthétique : http://127.0.0.1:${server.address().port}/ (${arg('pages', 1000)} pages)`);
}
