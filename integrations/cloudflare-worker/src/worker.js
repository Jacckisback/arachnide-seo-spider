// Arachnide SEO Worker — applique les corrections SEO décidées avec Arachnide (via Claude + MCP)
// à la volée, devant n'importe quel site (CMS, framework, site sur mesure), sans toucher au serveur d'origine.
//
// Les règles sont stockées dans le KV « ARACHNIDE », écrites par le connecteur Cloudflare d'Arachnide :
//   p:<chemin>  → {"seo_title","meta_description","h1","canonical","noindex","image_alt":{"<src>":"<alt>"}}
//   r:<chemin>  → {"to":"https://…","status":301}
// <chemin> = pathname sans « / » final (« / » pour l'accueil).

const CACHE_TTL = 60; // secondes : délai maximal avant qu'une règle modifiée soit visible

export const normPath = (p) => {
  let s = p;
  try {
    s = decodeURIComponent(p);
  } catch {
    // chemin mal encodé : on le garde tel quel
  }
  return s.replace(/\/+$/, '') || '/';
};

const fileName = (s) => {
  try {
    return new URL(s, 'https://x').pathname.split('/').pop();
  } catch {
    return s;
  }
};

async function readRule(env, key) {
  const v = await env.ARACHNIDE.get(key, { cacheTtl: CACHE_TTL });
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildRewriter(rule, pageUrl, Rewriter = HTMLRewriter) {
  const seen = { title: false, description: false, canonical: false, robots: false, h1: false };
  const alts = rule.image_alt || {};
  const altByFile = Object.fromEntries(Object.entries(alts).map(([src, alt]) => [fileName(src), alt]));
  let rw = new Rewriter();
  if (rule.seo_title != null) {
    rw = rw.on('title', {
      element(el) {
        if (seen.title) return;
        seen.title = true;
        el.setInnerContent(rule.seo_title);
      },
    });
  }
  if (rule.meta_description != null) {
    rw = rw.on('meta[name="description" i]', {
      element(el) {
        seen.description = true;
        el.setAttribute('content', rule.meta_description);
      },
    });
  }
  if (rule.canonical != null) {
    rw = rw.on('link[rel="canonical" i]', {
      element(el) {
        if (seen.canonical) return el.remove();
        seen.canonical = true;
        el.setAttribute('href', rule.canonical);
      },
    });
  }
  if (rule.noindex != null) {
    rw = rw.on('meta[name="robots" i]', {
      element(el) {
        seen.robots = true;
        const tokens = (el.getAttribute('content') || '').split(',').map((s) => s.trim()).filter((s) => s && !/^(noindex|index)$/i.test(s));
        if (rule.noindex) tokens.unshift('noindex');
        if (tokens.length) el.setAttribute('content', tokens.join(', '));
        else el.remove();
      },
    });
  }
  if (rule.h1 != null) {
    rw = rw.on('h1', {
      element(el) {
        if (seen.h1) return;
        seen.h1 = true;
        el.setInnerContent(rule.h1);
      },
    });
  }
  if (Object.keys(alts).length) {
    rw = rw.on('img', {
      element(el) {
        const src = el.getAttribute('src') || el.getAttribute('data-src');
        if (!src) return;
        let abs = src;
        try {
          abs = new URL(src, pageUrl).href;
        } catch {
          // src invalide : on compare le nom de fichier
        }
        const alt = alts[abs] ?? alts[src] ?? altByFile[fileName(src)];
        if (alt != null) el.setAttribute('alt', alt);
      },
    });
  }
  // Balises absentes de la page d'origine : ajoutées à la fin du <head>.
  rw = rw.on('head', {
    element(el) {
      el.onEndTag((end) => {
        let add = '';
        if (rule.seo_title != null && !seen.title) add += `<title>${esc(rule.seo_title)}</title>`;
        if (rule.meta_description != null && !seen.description) add += `<meta name="description" content="${esc(rule.meta_description)}">`;
        if (rule.canonical != null && !seen.canonical) add += `<link rel="canonical" href="${esc(rule.canonical)}">`;
        if (rule.noindex && !seen.robots) add += '<meta name="robots" content="noindex">';
        if (add) end.before(add, { html: true });
      });
    },
  });
  return rw;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return fetch(request);
    const path = normPath(url.pathname);
    const redirect = await readRule(env, 'r:' + path);
    if (redirect?.to) return Response.redirect(new URL(redirect.to, url).href, redirect.status || 301);
    const response = await fetch(request);
    if (!(response.headers.get('content-type') || '').includes('text/html')) return response;
    const rule = await readRule(env, 'p:' + path);
    if (!rule) return response;
    let out = response;
    if (rule.noindex === false && /noindex/i.test(response.headers.get('x-robots-tag') || '')) {
      out = new Response(response.body, response);
      out.headers.delete('x-robots-tag');
    }
    out = buildRewriter(rule, url.href).transform(out);
    if (rule.noindex === true) {
      out = new Response(out.body, out);
      out.headers.set('x-robots-tag', 'noindex');
    }
    return out;
  },
};
