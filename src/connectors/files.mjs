// Connecteur « fichiers » : sites sans CMS (HTML statique, sortie d'un générateur, dépôt Git, export FTP).
// Modifie directement les fichiers HTML d'un dossier local et écrit les redirections dans le format du serveur.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Connector, ConnectorError, setImageAltInHtml, getImageAltInHtml } from './base.mjs';
import { readFieldFromHtml } from '../live.mjs';

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Insère une balise juste avant </head> (ou après <head> s'il n'y a pas de fermeture).
function insertInHead(html, tag) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, () => `  ${tag}\n</head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${tag}`);
  throw new ConnectorError('unsupported', 'No <head> element in this file.');
}

// Balise <meta>/<link> repérée par un attribut (name="description", rel="canonical"…).
function findTag(html, tagName, attr, value) {
  const re = new RegExp(`<${tagName}\\b[^>]*\\s${attr}=["']${value}["'][^>]*>`, 'i');
  return re.exec(html);
}

function setTagAttr(tag, attr, value) {
  const re = new RegExp(`\\s${attr}=("[^"]*"|'[^']*'|[^\\s>]*)`, 'i');
  return re.test(tag) ? tag.replace(re, () => ` ${attr}="${escAttr(value)}"`) : tag.replace(/\s*\/?>$/, (end) => ` ${attr}="${escAttr(value)}"${end}`);
}

export function editHtml(html, field, value, target) {
  switch (field) {
    case 'seo_title': {
      if (value === null) return html.replace(/\s*<title\b[^>]*>[\s\S]*?<\/title>/i, '');
      if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) return html.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/i, (m, a, b) => `${a}${escText(value)}${b}`);
      return insertInHead(html, `<title>${escText(value)}</title>`);
    }
    case 'meta_description':
    case 'canonical': {
      const [tagName, attr, key, valAttr] = field === 'canonical' ? ['link', 'rel', 'canonical', 'href'] : ['meta', 'name', 'description', 'content'];
      const m = findTag(html, tagName, attr, key);
      if (value === null) return m ? html.replace(new RegExp(`\\s*${m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '') : html;
      if (m) return html.replace(m[0], () => setTagAttr(m[0], valAttr, value));
      return insertInHead(html, tagName === 'link' ? `<link rel="canonical" href="${escAttr(value)}">` : `<meta name="description" content="${escAttr(value)}">`);
    }
    case 'noindex': {
      const m = findTag(html, 'meta', 'name', 'robots');
      const current = m ? (/\scontent=["']([^"']*)["']/i.exec(m[0])?.[1] || '') : '';
      const tokens = current.split(',').map((s) => s.trim()).filter((s) => s && !/^(noindex|index)$/i.test(s));
      if (value) tokens.unshift('noindex');
      const content = tokens.join(', ');
      if (!content) return m ? html.replace(new RegExp(`\\s*${m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '') : html;
      if (m) return html.replace(m[0], () => setTagAttr(m[0], 'content', content));
      return insertInHead(html, `<meta name="robots" content="${escAttr(content)}">`);
    }
    case 'h1': {
      if (value === null) throw new ConnectorError('unsupported', 'Removing the H1 is not supported; give the new heading text.');
      if (!/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html)) throw new ConnectorError('not_found', 'No <h1> in this page: add one in the template.');
      return html.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, (m, a, b) => `${a}${escText(value)}${b}`);
    }
    case 'image_alt': {
      const r = setImageAltInHtml(html, target, value ?? null);
      if (!r.found) throw new ConnectorError('not_found', `Image ${target} not found in this file.`);
      return r.html;
    }
    default:
      throw new ConnectorError('unsupported', `Field ${field} is not supported by the files connector.`);
  }
}

// Formats de redirection : une règle par ligne, dans un bloc délimité pour ne jamais toucher au reste du fichier.
const REDIRECT_FORMATS = {
  netlify: { file: '_redirects', line: (from, to) => `${from} ${to} 301`, parse: (l) => /^(\S+)\s+(\S+)\s+301!?$/.exec(l), comment: '#' },
  apache: { file: '.htaccess', line: (from, to) => `Redirect 301 ${from} ${to}`, parse: (l) => /^Redirect\s+301\s+(\S+)\s+(\S+)$/i.exec(l), comment: '#' },
  nginx: { file: 'arachnide-redirects.conf', line: (from, to) => `location = ${from} { return 301 ${to}; }`, parse: (l) => /^location\s+=\s+(\S+)\s+\{\s*return\s+301\s+(\S+);\s*\}$/.exec(l), comment: '#' },
};
const BEGIN = 'BEGIN Arachnide redirects';
const END = 'END Arachnide redirects';

export class FilesConnector extends Connector {
  static id = 'files';
  static label = 'HTML files';
  static fields = ['seo_title', 'meta_description', 'h1', 'canonical', 'noindex', 'image_alt', 'redirect'];
  static setup = {
    root: 'Folder that contains the published HTML files (static site, build output or Git checkout)',
    redirectsFormat: 'netlify (_redirects, also Cloudflare Pages) | apache (.htaccess) | nginx (include file) | vercel (vercel.json)',
    redirectsFile: 'Optional: path of the redirects file (default depends on the format, inside root)',
  };

  constructor(site, opts) {
    super(site, opts);
    if (!site.root) throw new ConnectorError('config', 'The files connector needs "root": the folder with the site HTML files.');
    this.root = path.resolve(site.root);
  }

  async test() {
    const st = await fs.stat(this.root).catch(() => null);
    if (!st?.isDirectory()) throw new ConnectorError('config', `Folder not found: ${this.root}`);
    const home = await this.fileFor(this.origin + '/').catch(() => null);
    return { ok: true, details: `Folder ${this.root}${home ? `, home page ${path.relative(this.root, home)}` : ', no index.html found'}; redirects: ${this.site.redirectsFormat || 'netlify'}` };
  }

  // URL publique → fichier HTML (chemin/index.html, chemin.html ou chemin tel quel), sans sortir du dossier.
  async fileFor(url) {
    const p = decodeURIComponent(new URL(url, this.origin).pathname);
    const rel = p.replace(/^\/+/, '');
    const candidates = p.endsWith('/') || !rel ? [path.join(rel, 'index.html')] : /\.html?$/i.test(rel) ? [rel] : [rel + '.html', path.join(rel, 'index.html'), rel];
    for (const c of candidates) {
      const abs = path.resolve(this.root, c);
      if (!abs.startsWith(this.root + path.sep) && abs !== this.root) continue;
      const st = await fs.stat(abs).catch(() => null);
      if (st?.isFile()) return abs;
    }
    throw new ConnectorError('not_found', `No HTML file for ${p} in ${this.root} (tried ${candidates.join(', ')}).`);
  }

  async get(change) {
    if (change.field === 'redirect') return (await this.readRedirects()).get(this.redirectKey(change.url)) ?? null;
    const html = await fs.readFile(await this.fileFor(change.url), 'utf8');
    if (change.field === 'image_alt') {
      const v = getImageAltInHtml(html, change.target);
      if (v === undefined) throw new ConnectorError('not_found', `Image ${change.target} not found in this file.`);
      return v;
    }
    return readFieldFromHtml(html, change.field, { url: change.url, target: change.target });
  }

  async set(change) {
    if (change.field === 'redirect') return this.writeRedirect(this.redirectKey(change.url), change.value);
    const file = await this.fileFor(change.url);
    const html = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, editHtml(html, change.field, change.value, change.target));
  }

  redirectKey(url) {
    const u = new URL(url, this.origin);
    return u.pathname + u.search;
  }

  redirectsPath() {
    const fmt = this.site.redirectsFormat || 'netlify';
    if (this.site.redirectsFile) return path.resolve(this.root, this.site.redirectsFile);
    return path.join(this.root, fmt === 'vercel' ? 'vercel.json' : REDIRECT_FORMATS[fmt]?.file || '_redirects');
  }

  async readRedirects() {
    const fmt = this.site.redirectsFormat || 'netlify';
    const text = await fs.readFile(this.redirectsPath(), 'utf8').catch(() => '');
    const map = new Map();
    if (fmt === 'vercel') {
      for (const r of (text ? JSON.parse(text) : {}).redirects || []) map.set(r.source, r.destination);
      return map;
    }
    const f = REDIRECT_FORMATS[fmt];
    if (!f) throw new ConnectorError('config', `Unknown redirectsFormat "${fmt}" (netlify, apache, nginx or vercel).`);
    for (const line of text.split('\n')) {
      const m = f.parse(line.trim());
      if (m) map.set(m[1], m[2]);
    }
    return map;
  }

  async writeRedirect(from, to) {
    const fmt = this.site.redirectsFormat || 'netlify';
    const file = this.redirectsPath();
    const text = await fs.readFile(file, 'utf8').catch(() => '');
    if (fmt === 'vercel') {
      const json = text ? JSON.parse(text) : {};
      json.redirects = (json.redirects || []).filter((r) => r.source !== from);
      if (to) json.redirects.push({ source: from, destination: to, permanent: true });
      return fs.writeFile(file, JSON.stringify(json, null, 2) + '\n');
    }
    const f = REDIRECT_FORMATS[fmt];
    if (!f) throw new ConnectorError('config', `Unknown redirectsFormat "${fmt}".`);
    const lines = text.split('\n');
    let b = lines.findIndex((l) => l.includes(BEGIN));
    let e = lines.findIndex((l) => l.includes(END));
    if (b < 0 || e < b) {
      // Bloc Arachnide en tête de fichier : les règles spécifiques passent avant les règles génériques.
      const block = [`${f.comment} ${BEGIN}`, `${f.comment} ${END}`];
      lines.splice(0, 0, ...block, ...(text ? [''] : []));
      b = 0;
      e = 1;
    }
    const inside = lines.slice(b + 1, e).filter((l) => f.parse(l.trim())?.[1] !== from);
    if (to) inside.push(f.line(from, to));
    lines.splice(b + 1, e - b - 1, ...inside);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, lines.join('\n').replace(/\n*$/, '\n'));
  }
}

export default FilesConnector;
