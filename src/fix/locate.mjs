// Localisation, dans le code d'un site (dépôt GitHub), de l'endroit où modifier un title, une meta description,
// un H1, un texte alternatif ou un lien. Retourne des propositions de modification exactes (chaîne avant → après)
// pour que l'utilisateur voie le diff avant la création de la Pull Request.

// Framework d'après package.json (Next.js, Astro, Vite/React avec Helmet, HTML statique).
export function detectFramework(pkg) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps.next) return 'next';
  if (deps.astro) return 'astro';
  if (deps['react-helmet-async'] || deps['react-helmet']) return 'react-helmet';
  if (deps.react || deps.vite) return 'vite';
  return pkg ? 'node' : 'static';
}

export const SOURCE_EXT = /\.(html?|astro|jsx?|tsx?|mdx?|vue|svelte)$/i;
const IGNORE_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|\.astro|out|coverage|public\/assets)\//;
export const isSource = (p) => SOURCE_EXT.test(p) && !IGNORE_DIR.test(p + '/') && !/\.(min|d)\.[jt]s$/.test(p);

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Le texte affiché sur la page peut être échappé dans le code (&amp;, &#39;…) ou répartir ses espaces.
const looseRe = (text) =>
  escRe(String(text).trim())
    .replace(/\s+/g, '\\s+')
    .replace(/&/g, '(?:&|&amp;)')
    .replace(/'/g, "(?:'|&#39;|&apos;|\\\\')")
    .replace(/"/g, '(?:"|&quot;|\\\\")');
const quoteFor = (q, v) => String(v).replace(new RegExp(q, 'g'), q === '"' ? '&quot;' : '\\' + q);

// Modèles de recherche par type de cible : la valeur actuelle est remplacée là où elle apparaît dans le bon contexte.
function patterns(kind, oldValue, target) {
  const o = oldValue == null ? null : looseRe(oldValue);
  switch (kind) {
    case 'seo_title':
      return o
        ? [
            new RegExp(`(<title[^>]*>\\s*)${o}(\\s*</title>)`, 'g'),
            new RegExp(`(\\btitle\\s*[:=]\\s*\\{?\\s*["'\`])${o}(["'\`])`, 'g'),
            new RegExp(`(<meta\\s+(?:property|name)=["']og:title["']\\s+content=["'])${o}(["'])`, 'g'),
          ]
        : [];
    case 'meta_description':
      return o
        ? [new RegExp(`(<meta\\s+name=["']description["']\\s+content=["'])${o}(["'])`, 'g'), new RegExp(`(\\bdescription\\s*[:=]\\s*\\{?\\s*["'\`])${o}(["'\`])`, 'g'), new RegExp(`(content=["'])${o}(["']\\s+name=["']description["'])`, 'g')]
        : [];
    case 'h1':
      return o ? [new RegExp(`(<h1\\b[^>]*>\\s*)${o}(\\s*</h1>)`, 'g')] : [];
    case 'image_alt': {
      const file = escRe(String(target || '').split('?')[0].split('/').pop() || '');
      if (!file) return [];
      // <img src="…/fichier.jpg" …> sans alt, ou avec alt="" : on insère / remplit l'attribut.
      return [new RegExp(`(<(?:img|Image)\\b[^>]*?\\bsrc=\\{?["'\`][^"'\`]*${file}["'\`]\\}?)([^>]*?)(\\s*/?>)`, 'g')];
    }
    case 'link': {
      const u = String(target || '');
      let pathPart = u;
      try {
        pathPart = new URL(u).pathname;
      } catch {
        /* chemin relatif */
      }
      const alts = [...new Set([u, pathPart, pathPart.replace(/\/$/, '')].filter((x) => x && x !== '/'))].map(escRe).join('|');
      return [new RegExp(`(\\b(?:href|to)=\\{?["'\`])(${alts})(["'\`])`, 'g')];
    }
    default:
      return [];
  }
}

// Applique un Fix à un fichier : { content, count, preview } ; count = 0 si rien n'a été trouvé.
export function applyToSource(content, fix) {
  const kind = fix.target.kind;
  let count = 0;
  let out = content;
  for (const re of patterns(kind, fix.oldValue, fix.target.selector)) {
    out = out.replace(re, (...m) => {
      count++;
      if (kind === 'link') {
        // Lien écrit en relatif dans le code : il reste relatif.
        const [, pre, was, post] = m;
        let v = fix.newValue;
        if (was.startsWith('/')) {
          try {
            const n = new URL(fix.newValue);
            v = n.pathname + n.search;
          } catch {
            /* valeur déjà relative */
          }
        }
        return `${pre}${v}${post}`;
      }
      if (kind === 'image_alt') {
        const [, head, attrs, tail] = m;
        const rest = attrs.replace(/\s+alt=(\{[^}]*\}|"[^"]*"|'[^']*')/, '');
        return `${head}${rest} alt="${quoteFor('"', fix.newValue)}"${tail}`;
      }
      const [, pre, post] = m;
      const q = /["'`]$/.exec(pre)?.[0];
      // Valeur placée entre guillemets dans du code : on échappe le guillemet ; dans du HTML : entités.
      const v = q ? quoteFor(q, fix.newValue) : String(fix.newValue).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return `${pre}${v}${post}`;
    });
    if (count) break;
  }
  if (!count && fix.oldValue == null) return insertMissing(content, fix);
  return { content: out, count };
}

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const jsStr = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// Valeur absente : insertion là où le framework l'attend (<head> HTML/Astro, export metadata de Next.js).
function insertMissing(content, fix) {
  const kind = fix.target.kind;
  const v = fix.newValue;
  const head = /<\/head>/i.test(content);
  const nextMeta = /export\s+const\s+metadata\s*(?::\s*\w+\s*)?=\s*\{/.exec(content);
  let out = content;
  if (kind === 'meta_description') {
    if (/name=["']description["']/i.test(content) || /\bdescription\s*:/.test(nextMeta ? content.slice(nextMeta.index) : '')) return { content, count: 0 };
    if (nextMeta) out = content.replace(nextMeta[0], `${nextMeta[0]}\n  description: ${jsStr(v)},`);
    else if (head) out = content.replace(/(<title[^>]*>[\s\S]*?<\/title>|<\/head>)/i, (m) => (m.startsWith('<title') ? `${m}\n    <meta name="description" content="${attr(v)}" />` : `  <meta name="description" content="${attr(v)}" />\n  ${m}`));
  } else if (kind === 'seo_title') {
    if (/<title/i.test(content) || /\btitle\s*:/.test(nextMeta ? content.slice(nextMeta.index) : '')) return { content, count: 0 };
    if (nextMeta) out = content.replace(nextMeta[0], `${nextMeta[0]}\n  title: ${jsStr(v)},`);
    else if (head) out = content.replace(/<\/head>/i, `  <title>${attr(v).replace(/"/g, '"')}</title>\n  </head>`);
  } else if (kind === 'json_ld') {
    if (!head) return { content, count: 0 };
    let json = v;
    try {
      json = JSON.stringify(JSON.parse(v), null, 2).replace(/</g, '\\u003c');
    } catch {
      return { content, count: 0 };
    }
    out = content.replace(/<\/head>/i, `  <script type="application/ld+json">\n${json}\n  </script>\n  </head>`);
  }
  return { content: out, count: out === content ? 0 : 1 };
}

// Fichiers candidats pour une URL : la route correspondante d'abord (Next app/pages, Astro pages, HTML), puis le reste.
export function rankFiles(files, url, framework) {
  let p = '/';
  try {
    p = new URL(url).pathname;
  } catch {
    /* garde / */
  }
  const slug = p.replace(/^\/|\/$/g, '') || 'index';
  const tail = slug.split('/').pop();
  const score = (f) => {
    const n = f.toLowerCase();
    let s = 0;
    if (n.includes(`/${slug}/`) || n.includes(`/${slug}.`)) s += 5;
    if (tail && n.includes(tail.toLowerCase())) s += 3;
    if (slug === 'index' && /(^|\/)(index|page|home|app)\.(html?|astro|[jt]sx?)$/.test(n)) s += 4;
    if (/(^|\/)(layout|_app|_document|app|head|seo|meta)\.[jt]sx?$/.test(n) || /index\.html$/.test(n)) s += 2;
    if (framework === 'next' && /(^|\/)(app|pages)\//.test(n)) s += 1;
    if (framework === 'astro' && /src\/(pages|layouts)\//.test(n)) s += 1;
    return s;
  };
  return [...files].sort((a, b) => score(b) - score(a));
}
