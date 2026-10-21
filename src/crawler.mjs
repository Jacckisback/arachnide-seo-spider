// Moteur de crawl : file d'attente BFS, concurrence, robots.txt, sitemaps, redirections manuelles, rendu JS optionnel.
import { EventEmitter } from 'node:events';
import { createWriteStream, createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { parseHtml, resolveUrl } from './parse.mjs';
import { robotsFlags } from '../public/shared/directives.js';
import { parseRobots, rulesFor, isAllowed } from './robots.mjs';
import { analyze } from './analyze.mjs';
import { Renderer } from './renderer.mjs';
import { runPsi, fetchGscPages, parseGscCsv, readGscKey, fetchGa4Pages, parseGa4Csv } from './google.mjs';
import { Interner, LinkStore, FLAG } from './graph.mjs';
import { RegexRunner } from './regex-runner.mjs';
import { xpathExtract } from './xpath.mjs';

export const VERSION = '3.21.0';

// Formats d'image sans compression moderne (pas de WebP / AVIF / SVG / JPEG XL).
const LEGACY_FORMATS = new Set(['jpg', 'png', 'gif', 'bmp', 'tiff']);
// Pages qui utilisent une image ou un lien externe : les pages étant traitées une par une, un compteur et la dernière
// page vue suffisent à compter les pages distinctes, sans Set par image (il y en a des centaines de milliers).
const MAX_ALTS = 5;
const newImage = (src) => ({ src, role: 'src', of: '', descriptor: '', type: '', media: '', alts: [], missingAlt: false, pages: 0, firstPage: '', lastPage: '', status: null, size: null, contentType: '', responsive: false, picture: false, variantCount: 0 });
// Paramètres de suivi retirés par défaut : ils ne changent pas la page (RFC 3986 ne les distingue pas, Google les ignore).
const TRACKING_PARAMS = /^(utm_[a-z0-9_]+|gclid|gclsrc|dclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|yclid|twclid|ttclid|igshid|srsltid|_hsenc|_hsmi|hsctatracking|mkt_tok|vero_id|s_kwcid|ef_id|zanpid|_ga|_gl|_gid|_ke|oly_enc_id|oly_anon_id|rb_clickid|trk_[a-z0-9_]+|ref_src|ref_url)$/i;
// Facettes : au-delà de ce nombre de variantes de paramètres sur un même chemin, le site est probablement un piège à facettes.
const FACET_WARN = 200;
const FACET_PATHS_MAX = 20;
// Budget de pages : au-delà de maxPages × ce facteur d'URL découvertes, la file cesse de grandir (mémoire bornée).
const DISCOVERY_FACTOR = 4;
const RETRY_STATUS = new Set([500, 502, 504]);
const RETRY_DELAY_MS = 5000;
const newExternal = (url) => ({ url, status: null, statusText: '', inlinks: 0, pages: 0, firstPage: '', lastPage: '' });
// Options rejouables : tout ce qui se sérialise (les fonctions injectées pour les tests sont ignorées).
const journalOpts = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function' && v !== undefined));
// Corps de réponse lu en flux : abandonné dès que la limite est dépassée, sans attendre la fin du téléchargement.
async function readBodyLimited(res, maxBytes) {
  if (!res.body) return { buf: new Uint8Array(await res.arrayBuffer()) };
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      await res.body.cancel().catch(() => {});
      return { tooLarge: true, size };
    }
    chunks.push(chunk);
  }
  return { buf: Buffer.concat(chunks) };
}
const seenOn = (rec, pageUrl) => {
  if (rec.lastPage === pageUrl) return;
  rec.lastPage = pageUrl;
  rec.pages++;
  if (!rec.firstPage) rec.firstPage = pageUrl;
};

export const DEFAULT_UA = 'Mozilla/5.0 (compatible; ArachnideSEO/2.0; +https://github.com/Jacckisback/arachnide-seo-spider)';
export const USER_AGENTS = {
  arachnide: DEFAULT_UA,
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotMobile:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

// URL de départ saisie par l'utilisateur → URL absolue, ou erreur 400 explicite. On refuse ce qui n'est pas une
// adresse web plausible (« htp:/x », « javascript:… », « 12345 », texte de 5 000 caractères) au lieu de deviner
// un hôte et d'aller le crawler.
export function startUrlOf(x) {
  const bad = () => Object.assign(new Error('Invalid URL'), { status: 400, key: 'toast.badUrl' });
  let u = String(x ?? '').trim();
  if (!u || u.length > 2048 || /\s/.test(u)) throw bad();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(u);
  if (scheme && !/^https?$/i.test(scheme[1])) throw bad();
  if (!scheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u)) throw bad(); // javascript:, mailto:, htp:/x (mais pas localhost:4000)
  if (!scheme) u = 'https://' + u;
  let url;
  try {
    url = new URL(u);
  } catch {
    throw bad();
  }
  const rawHost = u.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase();
  const host = url.hostname.toLowerCase();
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(rawHost) || host.startsWith('[');
  if (!ip && host !== 'localhost' && !(/^[a-z0-9-]+(\.[a-z0-9-]+)+\.?$/i.test(host) && /[a-z]/i.test(rawHost.split('.').pop() || ''))) throw bad();
  if (host.length > 253) throw bad();
  return url.href;
}

export const DEFAULT_OPTIONS = {
  maxPages: 500,
  maxDepth: 20,
  concurrency: 5,
  delayMs: 0,
  timeoutMs: 20000,
  userAgent: DEFAULT_UA,
  respectRobots: true,
  crawlSubdomains: false,
  ignoreQuery: false,
  useSitemaps: true,
  crawlCanonicals: true,
  checkExternal: false,
  checkImages: false,
  include: '', // une regex par ligne : seules les URL qui correspondent à l'une d'elles sont crawlées
  exclude: '', // une regex par ligne : les URL qui correspondent à l'une d'elles ne sont pas crawlées
  stayInFolder: false, // ne pas sortir du dossier de l'URL de départ (https://x.fr/blog/ → seulement /blog/…)
  maxExternal: 1000,
  maxImages: 2000,
  mode: 'spider', // 'spider' : suit les liens ; 'list' : crawle uniquement opts.urls
  urls: [],
  render: false, // rendu JavaScript avec Chrome
  renderConcurrency: 3,
  search: '', // texte ou /regex/ recherché dans le code source de chaque page
  acceptLanguage: '', // vide comme Googlebot
  // Spider > Limites (null = illimité)
  limitPerDepth: null, // URLs max par niveau de profondeur
  maxFolderDepth: null, // nombre max de dossiers dans le chemin
  maxQueryParams: null, // nombre max de paramètres d'URL
  maxRedirects: 10, // redirections suivies dans une chaîne
  maxUrlLength: 2000,
  maxLinksPerPage: 10000,
  maxPageSizeKb: 51200, // 50 Mo, lu en flux : au-delà, le corps est abandonné
  maxSitemapKb: 51200, // taille maximale d'un fichier sitemap ou robots.txt
  normalizeParams: true, // paramètres d'URL triés, paramètres de suivi (utm_*, gclid, fbclid…) retirés
  robotsUnavailable: 'disallow', // robots.txt en 5xx ou injoignable : tout interdit (RFC 9309 § 2.3.1.4) ; 'allow' pour crawler quand même
  renderRestartEvery: 500, // Chrome relancé toutes les N pages rendues, pour borner sa mémoire
  sitemapUrl: '', // mode liste : URL d'un sitemap (ou index) qui fournit la liste
  pathLimits: [], // [{ pattern: '/blog/', max: 200 }]
  // Vitesse
  maxUrlPerSec: 0, // 0 = illimité ; plafond global de requêtes par seconde
  // robots.txt : 'respect' | 'report' (ignorer mais signaler) | 'ignore'
  robotsMode: 'respect',
  customRobots: '', // robots.txt de test qui remplace celui du site pendant le crawl
  // Réécriture d'URL & accès
  removeParams: '', // ex. "utm_*, gclid, fbclid"
  httpUser: '',
  httpPass: '',
  customHeaders: '', // une ligne "Nom: valeur" par en-tête (cookies, jetons…)
  extractors: [], // [{ name, type: 'css' | 'regex', selector, target: 'text' | 'html' | 'attr' | 'count', attr }]
  // Données Google (facultatives)
  psiMax: 0, // nombre de pages testées avec PageSpeed Insights (0 = désactivé)
  psiKey: '', // clé API Google (PageSpeed Insights) — conseillée au-delà de quelques pages
  psiStrategy: 'mobile', // mobile | desktop
  gscKeyFile: '', // chemin du fichier JSON du compte de service Search Console
  gscProperty: '', // propriété (sc-domain:exemple.fr ou https://www.exemple.fr/) ; détectée si vide
  gscDays: 90,
  gscCsv: '', // contenu d'un export CSV « Pages » de Search Console
  ga4KeyFile: '', // chemin du fichier JSON du compte de service Google Analytics 4 (peut être celui de Search Console)
  ga4Property: '', // ID de propriété GA4 (123456789) ; détectée par le domaine si vide
  ga4Days: 90,
  ga4Csv: '', // contenu d'un export CSV GA4 « Pages et écrans » ou « Page de destination »
};

// Robots des moteurs de recherche et des IA dont on vérifie l'accès dans le robots.txt.
export const BOTS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'meta-externalagent', 'Amazonbot'];

function searchRegex(q) {
  if (!q) return null;
  const m = /^\/(.+)\/([a-z]*)$/.exec(q);
  try {
    return m ? new RegExp(m[1], m[2].includes('g') ? m[2] : m[2] + 'g') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  } catch {
    return null;
  }
}

const normalizeTarget = (u, c) => (u ? c.normalize(u) : null);

// Entités XML d'un <loc> : &amp; &lt; &gt; &quot; &apos; et numériques (&#38; &#x26;).
function decodeXml(v) {
  return v
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Retry-After : nombre de secondes ou date HTTP.
function retryAfterMs(v) {
  if (!v) return null;
  if (/^\d+$/.test(v.trim())) return Number(v) * 1000;
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : Math.max(0, d - Date.now());
}
const HTML_TYPES = /text\/html|application\/xhtml\+xml/i;

// Décodage comme un navigateur : BOM d'abord, puis l'en-tête HTTP, puis <meta charset> (hors commentaires, 8 Ko),
// sinon UTF-8 s'il est valide, et windows-1252 en dernier recours (pages anciennes sans déclaration).
export function decodeBody(buf, contentType) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  let charset = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1];
  if (!charset) {
    const head = Buffer.from(b.subarray(0, 8192)).toString('latin1').replace(/<!--[\s\S]*?-->/g, '');
    charset = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1];
  }
  if (charset) {
    try {
      return new TextDecoder(charset).decode(b);
    } catch {
      /* jeu de caractères inconnu : détection ci-dessous */
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

export class Crawler extends EventEmitter {
  constructor(startUrl, options = {}) {
    super();
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    const fix = (x) => startUrlOf(x);
    if (this.opts.mode === 'list') {
      this.listUrls = [...new Set((this.opts.urls || []).map((x) => { try { return fix(x); } catch { return null; } }).filter(Boolean))];
      // Liste issue d'un sitemap : remplie au démarrage par le lecteur de sitemaps (sitemapUrlsFrom).
      if (!this.listUrls.length && !this.opts.sitemapUrl) throw new Error('URL list is empty');
      startUrl = this.listUrls[0] || new URL(this.opts.sitemapUrl).origin + '/';
      this.opts.maxPages = Math.max(this.opts.maxPages, this.listUrls.length);
    }
    this.startUrl = fix(startUrl);
    if (options.respectRobots === false && !options.robotsMode) this.opts.robotsMode = 'ignore'; // compatibilité 2.0
    this.removeParamRes = String(this.opts.removeParams || '').split(/[\s,]+/).filter(Boolean)
      .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));
    this.pathLimits = (this.opts.pathLimits || [])
      .map((l) => { try { return { re: new RegExp(l.pattern, 'i'), max: Number(l.max), count: 0, pattern: l.pattern }; } catch { return null; } })
      .filter((l) => l && l.max >= 0);
    this.depthCounts = new Map();
    this.skipped = {}; // URLs non crawlées à cause des limites, par motif
    this.nextRequestAt = 0;
    this.extraHeaders = {};
    for (const line of String(this.opts.customHeaders || '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) this.extraHeaders[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    if (this.opts.httpUser) this.extraHeaders.authorization = 'Basic ' + Buffer.from(`${this.opts.httpUser}:${this.opts.httpPass || ''}`).toString('base64');
    this.searchRe = searchRegex(this.opts.search);
    this.warnings = [];
    this.botAccess = [];
    this.llmsTxt = null;
    // Une regex par ligne ; une ligne invalide est ignorée et signalée au lieu de faire échouer le crawl.
    this.includeRes = this.compileScope(this.opts.include, 'include');
    this.excludeRes = this.compileScope(this.opts.exclude, 'exclude');
    const sp = new URL(this.startUrl).pathname;
    this.startFolder = this.opts.stayInFolder ? sp.slice(0, sp.lastIndexOf('/') + 1) || '/' : null;
    this.pages = new Map(); // url -> enregistrement
    this.queue = [];
    this.qHead = 0;
    this.deferred = []; // URLs issues des sitemaps, crawlées en dernier
    this.seen = new Set();
    // Liens en colonnes d'entiers (src/graph.mjs) : URL et ancres internées, 14 octets par lien.
    this.urls = new Interner();
    this.anchors = new Interner();
    this.links = new LinkStore(this.urls, this.anchors);
    this.images = new Map(); // url -> {src, role: src|srcset|source, of, alts: [], missingAlt, pages, firstPage, status, size, …}
    this.externals = new Map(); // url -> {url, status, inlinks, pages, firstPage}
    this.sitemapUrls = new Set();
    this.sitemapFiles = [];
    // Journal de reprise (NDJSON en ajout seul) : une ligne par URL mise en file, une par page traitée.
    this.journal = null;
    this.journalFile = null;
    this.resumeFile = null;
    this.resumed = false;
    // Garde-fous : pages réellement téléchargées (budget), variantes de paramètres par chemin (facettes),
    // robots.txt par origine (mode liste, sous-domaines), extraction regex hors du fil principal, rendus comptés.
    this.fetched = 0;
    this.variants = new Map();
    this.facetWarned = new Set();
    this.robotsByOrigin = new Map();
    this.regexRunner = null;
    this.rendered = 0;
    this.rendererRestarts = 0;
    this.robotsRules = [];
    this.robotsTxt = null;
    this.active = 0;
    this.stopped = false;
    this.startedAt = null;
    this.finishedAt = null;
    this.phase = 'idle';
  }

  stop() {
    this.stopped = true;
  }

  normalize(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      // %c3%a9 et %C3%A9 désignent la même ressource (RFC 3986) : forme canonique en majuscules.
      const upperHex = (x) => x.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
      u.pathname = upperHex(u.pathname);
      if (this.opts.ignoreQuery) u.search = '';
      else if (this.removeParamRes.length && u.search) {
        // Suppression sur la chaîne brute : URLSearchParams réécrirait « ?b » en « ?b= » et « %20 » en « + ».
        const kept = u.search
          .slice(1)
          .split('&')
          .filter((kv) => {
            let k = kv.split('=')[0];
            try {
              k = decodeURIComponent(k.replace(/\+/g, ' '));
            } catch {
              /* clé mal encodée : comparée telle quelle */
            }
            return kv && !this.removeParamRes.some((re) => re.test(k));
          });
        u.search = kept.length ? '?' + kept.join('&') : '';
      }
      if (u.search && this.opts.normalizeParams) {
        // ?b=2&a=1 et ?a=1&b=2 sont la même page : paramètres triés par clé ; les paramètres de suivi sont retirés.
        const pairs = u.search.slice(1).split('&').filter(Boolean);
        const keyOf = (kv) => {
          let k = kv.split('=')[0];
          try {
            k = decodeURIComponent(k.replace(/\+/g, ' '));
          } catch {}
          return k;
        };
        const kept = pairs.filter((kv) => !TRACKING_PARAMS.test(keyOf(kv)));
        kept.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
        u.search = kept.length ? '?' + kept.join('&') : '';
      }
      if (u.search) u.search = upperHex(u.search);
      // « /a? » (requête vide) est la même requête que « /a ».
      return u.href.endsWith('?') ? u.href.slice(0, -1) : u.href;
    } catch {
      return null;
    }
  }

  isInternal(url) {
    let h;
    let port;
    try {
      ({ hostname: h, port } = new URL(url));
      h = h.toLowerCase();
    } catch {
      return false;
    }
    // Un autre port (serveur de dev, interface d'administration :8443) n'est pas le site audité.
    if (port && this.ports && !this.ports.has(port)) return false;
    if (this.hosts.has(h)) return true;
    if (this.opts.crawlSubdomains) return h === this.rootDomain || h.endsWith('.' + this.rootDomain);
    return false;
  }

  compileScope(src, kind) {
    const out = [];
    for (const line of String(src || '').split(/\r?\n/)) {
      const p = line.trim();
      if (!p) continue;
      try {
        out.push(new RegExp(p, 'i'));
      } catch {
        this.warnings.push({ key: 'warn.badRegex', params: { kind, pattern: p.slice(0, 200) } });
      }
    }
    return out;
  }

  inScope(url) {
    if (this.includeRes.length && !this.includeRes.some((re) => re.test(url))) return false;
    if (this.excludeRes.some((re) => re.test(url))) return false;
    if (this.startFolder && this.startFolder !== '/') {
      try {
        const u = new URL(url);
        if (!u.pathname.startsWith(this.startFolder)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  skip(reason) {
    this.skipped[reason] = (this.skipped[reason] || 0) + 1;
  }

  enqueue(url, depth, via = 'link', hops = 0) {
    const n = this.normalize(url);
    if (!n || this.seen.has(n)) return;
    if (!this.isInternal(n)) return;
    // L'URL de départ (et celles d'une liste) est toujours explorée : c'est le point d'entrée, même hors des motifs.
    if (via !== 'start' && via !== 'list' && !this.inScope(n)) return this.skip('scope');
    const o = this.opts;
    if (via !== 'start' && via !== 'list') {
      // Spider > Limites
      if (depth > o.maxDepth) return this.skip('depth');
      if (hops > o.maxRedirects) return this.skip('redirects');
      if (n.length > o.maxUrlLength) return this.skip('urlLength');
      const u = new URL(n);
      if (o.maxFolderDepth != null && u.pathname.split('/').filter(Boolean).length - (u.pathname.endsWith('/') ? 0 : 1) > o.maxFolderDepth) return this.skip('folderDepth');
      if (o.maxQueryParams != null && [...u.searchParams.keys()].length > o.maxQueryParams) return this.skip('queryParams');
      if (o.limitPerDepth != null && (this.depthCounts.get(depth) || 0) >= o.limitPerDepth) return this.skip('perDepth');
      const pl = this.pathLimits.find((l) => l.re.test(n));
      if (pl && pl.count >= pl.max) return this.skip('path');
      if (pl) pl.count++;
    }
    // maxPages compte les pages téléchargées (voir worker) ; ici seulement une borne de mémoire sur la découverte.
    if (this.seen.size >= o.maxPages * DISCOVERY_FACTOR + 1000) return this.skip('total');
    this.seen.add(n);
    this.noteVariant(n);
    this.depthCounts.set(depth, (this.depthCounts.get(depth) || 0) + 1);
    this.queue.push({ url: n, depth, via, hops });
    this.jlog({ t: 'q', u: n, d: depth, v: via, h: hops });
  }

  // Facettes : un même chemin qui produit un grand nombre de variantes de paramètres est la signature d'un piège
  // à facettes (filtres combinables). Signalé une fois par chemin, pour que l'utilisateur borne les paramètres.
  noteVariant(url) {
    const q = url.indexOf('?');
    if (q < 0) return;
    const path = url.slice(0, q);
    const n = (this.variants.get(path) || 0) + 1;
    this.variants.set(path, n);
    if (n === FACET_WARN && this.facetWarned.size < FACET_PATHS_MAX) {
      this.facetWarned.add(path);
      this.warn('warn.facets', { path: new URL(path).pathname, n });
    }
  }

  // ---- Journal de reprise ----
  // Tout est en ajout seul : un arrêt brutal ne perd que les dernières secondes. La reprise relit le journal dans
  // l'ordre (les lignes q reconstituent la file et « seen », les lignes p les pages faites, leurs liens et leurs images),
  // puis crawle ce qui est en file sans être fait. Les identifiants d'URL (src/graph.mjs) sont attribués dans l'ordre
  // de lecture : ils se reconstruisent à l'identique.
  async openJournal(file, { fresh = true } = {}) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    this.journalFile = file;
    this.journal = createWriteStream(file, { flags: 'a' });
    if (fresh) this.jlog({ t: 'start', version: VERSION, url: this.startUrl, opts: journalOpts(this.opts), startedAt: new Date().toISOString() });
  }
  jlog(rec) {
    if (this.journal) this.journal.write(JSON.stringify(rec) + '\n');
  }
  async closeJournal({ remove = false } = {}) {
    if (!this.journal) return;
    const j = this.journal;
    this.journal = null;
    await new Promise((r) => j.end(r));
    if (remove) await fs.unlink(this.journalFile).catch(() => {});
  }
  // Crawler reconstitué depuis un journal : mêmes options, même URL de départ, file et pages rejouées.
  static async resume(file, extra = {}) {
    let head = null;
    for await (const line of readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (line) head = JSON.parse(line);
      break;
    }
    if (!head || head.t !== 'start') throw new Error('Not a crawl journal: ' + file);
    const c = new Crawler(head.url, { ...head.opts, ...extra });
    c.startedAt = head.startedAt;
    c.resumeFile = file; // rejoué au démarrage, une fois le périmètre du site connu (resolveStart)
    c.resumed = true;
    return c;
  }
  async replay(file) {
    let n = 0;
    for await (const line of readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (!line) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue; // dernière ligne tronquée par l'arrêt
      }
      if (rec.t === 'q' && rec.r) this.queue.push({ url: rec.u, depth: rec.d, via: rec.v, hops: rec.h, retry: rec.r });
      else if (rec.t === 'q') this.enqueue(rec.u, rec.d, rec.v, rec.h);
      else if (rec.t === 'p') {
        this.settle({ url: rec.rec.url, depth: rec.rec.depth, via: rec.rec.via }, rec.rec, rec.d, true);
        n++;
      }
    }
    this.emit('resumed', { pages: this.pages.size, queued: this.queue.length - this.qHead });
    return n;
  }

  // Vitesse : plafond global de requêtes par seconde, partagé par tous les workers.
  async throttle() {
    // Le site a demandé de ralentir (429/503 + Retry-After) : toutes les requêtes attendent.
    if (this.backoffUntil > Date.now()) await sleep(this.backoffUntil - Date.now());
    if (!this.opts.maxUrlPerSec) return;
    const gap = 1000 / this.opts.maxUrlPerSec;
    const now = Date.now();
    const at = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = at + gap;
    if (at > now) await sleep(at - now);
  }

  async request(url, method = 'GET') {
    await this.throttle();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': this.opts.userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(this.opts.acceptLanguage ? { 'accept-language': this.opts.acceptLanguage } : {}),
          // Authentification et en-têtes personnalisés : uniquement vers le site audité.
          ...(this.hosts && this.isInternal(url) ? this.extraHeaders : {}),
        },
      });
      const ttfb = Math.round(performance.now() - t0);
      return { res, ttfb, t0, timer };
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // info (facultatif) reçoit le statut final et le type de contenu, pour distinguer « absent » de « illisible ».
  async fetchText(url, info = {}, hops = 0) {
    try {
      const { res, timer } = await this.request(url);
      try {
        info.status = res.status;
        info.type = res.headers.get('content-type') || '';
        if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops < 5) {
          await res.body?.cancel();
          return this.fetchText(new URL(res.headers.get('location'), url).href, info, hops + 1);
        }
        if (res.status !== 200) {
          await res.body?.cancel();
          return null;
        }
        const body = await readBodyLimited(res, this.opts.maxSitemapKb * 1024);
        if (body.tooLarge) {
          info.tooLarge = true;
          return null;
        }
        let buf = Buffer.from(body.buf);
        // Un .gz servi avec Content-Encoding: gzip est déjà décompressé par fetch : seuls les octets magiques comptent.
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          try {
            buf = zlib.gunzipSync(buf);
          } catch {
            /* fichier tronqué : on garde les octets bruts */
          }
        }
        return buf.toString('utf8');
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      info.status = 0;
      info.error = e?.cause?.code || e?.name || 'Error';
      return null;
    }
  }

  async resolveStart() {
    // Suit les redirections de l'URL de départ pour connaître l'hôte réel du site.
    this.hosts = new Set([new URL(this.startUrl).hostname.toLowerCase()]);
    this.ports = new Set([new URL(this.startUrl).port]);
    if (this.listUrls) for (const x of this.listUrls) {
      this.hosts.add(new URL(x).hostname.toLowerCase());
      this.ports.add(new URL(x).port);
    }
    let url = this.startUrl;
    for (let i = 0; i < 10; i++) {
      try {
        const { res, timer } = await this.request(url);
        clearTimeout(timer);
        await res.body?.cancel();
        const loc = res.headers.get('location');
        this.startStatus = res.status;
        if (res.status >= 300 && res.status < 400 && loc) {
          url = new URL(loc, url).href;
          this.hosts.add(new URL(url).hostname.toLowerCase());
          this.ports.add(new URL(url).port);
          continue;
        }
      } catch {
        /* l'erreur sera enregistrée lors du crawl */
      }
      break;
    }
    // Protection anti-bot (LiteSpeed, Cloudflare, Sucuri…) : certains hébergeurs refusent les user-agents inconnus
    // avec un 403 alors qu'un navigateur passe. Dans ce cas on crawle avec le user-agent Chrome et on le signale,
    // pour que l'audit reflète ce que voient les visiteurs et Google, et non la protection.
    if ([401, 403, 406, 429, 503].includes(this.startStatus) && this.opts.userAgent === DEFAULT_UA) {
      const blockedStatus = this.startStatus;
      this.opts.userAgent = USER_AGENTS.chrome;
      try {
        const { res, timer } = await this.request(url);
        clearTimeout(timer);
        await res.body?.cancel();
        if (res.status < 400) {
          this.uaFallback = true;
          this.warn('warn.uaBlocked', { status: blockedStatus });
        } else this.opts.userAgent = DEFAULT_UA;
      } catch {
        this.opts.userAgent = DEFAULT_UA;
      }
    }
    this.finalStart = url;
    this.origin = new URL(url).origin;
    this.rootDomain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  }

  async loadRobotsAndSitemaps() {
    this.setPhase('robots');
    const rInfo = {};
    const [txt, llms] = await Promise.all([this.fetchText(this.origin + '/robots.txt', rInfo), this.fetchText(this.origin + '/llms.txt')]);
    // robots.txt illisible : 5xx, refus (401/403/429), erreur réseau ou page HTML. Google bloque tout le crawl tant
    // qu'un 5xx persiste ; dans tous les cas l'accès des robots est « inconnu », pas « autorisé ».
    const robotsHtml = txt != null && /<(html|head|body)[\s>]/i.test(txt.slice(0, 1000));
    this.robotsStatus = rInfo.status ?? null;
    this.robotsUnreadable = robotsHtml || (rInfo.status !== 200 && rInfo.status !== 404 && rInfo.status !== 410);
    if (robotsHtml) this.warn('warn.robotsHtml');
    else if (this.robotsUnreadable && !this.opts.customRobots) this.warn('warn.robotsUnavailable', { status: rInfo.status || rInfo.error || '—' });
    this.robotsTxt = robotsHtml ? null : txt;
    this.llmsTxt = llms && !/<html/i.test(llms.slice(0, 500)) ? { size: llms.length } : null;
    if (this.opts.customRobots) this.robotsTxt = this.opts.customRobots;
    const robots = this.robotsTxt ? parseRobots(this.robotsTxt) : null;
    this.robotsRules = robots ? rulesFor(robots, this.opts.userAgent) : [];
    const unknown = this.robotsUnreadable && !this.opts.customRobots;
    // RFC 9309 § 2.3.1.4 : robots.txt en 5xx ou injoignable = tout interdit ; § 2.3.1.3 : 4xx = tout permis.
    this.robotsBlockAll = this.blockAllFor(rInfo, robotsHtml);
    if (this.robotsBlockAll) this.warn('warn.robotsDisallowAll', { status: rInfo.status || rInfo.error || '—' });
    this.robotsByOrigin.set(this.origin, { rules: this.robotsRules, blockAll: this.robotsBlockAll });
    this.botAccess = BOTS.map((bot) => ({ bot, allowed: unknown ? null : robots ? isAllowed(rulesFor(robots, bot), '/') : true }));
    if (!this.opts.useSitemaps || this.opts.mode === 'list') return;

    this.setPhase('sitemaps');
    const toFetch = [...new Set([...(robots?.sitemaps || []), this.origin + '/sitemap.xml', this.origin + '/sitemap_index.xml'])];
    const done = new Set();
    const MAX_FILES = 500;
    const siteHost = (h) => h.replace(/^www\./, '');
    while (toFetch.length && !this.stopped) {
      if (done.size >= MAX_FILES) {
        this.sitemapsTruncated = true;
        break;
      }
      const sm = toFetch.shift();
      if (done.has(sm)) continue;
      done.add(sm);
      const xml = await this.fetchText(sm);
      if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
      const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeXml(m[1]).trim());
      if (/<sitemapindex/i.test(xml)) {
        // Sitemaps d'images, de vidéos ou d'actualités : ils ne listent pas de pages, inutile d'épuiser le quota.
        const pages = locs.filter((l) => !/(^|[/_-])(image|video|news)[-_]?sitemap|sitemap[-_](image|video|news)/i.test(l));
        // Index : les sitemaps de pages passent avant les sitemaps imbriqués suivants (parcours en largeur).
        for (const p of pages) toFetch.push(p); // pas de spread : un index de sitemaps peut lister des centaines de milliers d'entrées
        this.sitemapFiles.push({ url: sm, type: 'index', count: locs.length });
      } else {
        let n = 0;
        for (const l of locs) {
          let norm = this.normalize(l);
          if (!norm) continue;
          // Sitemap en http:// ou sans www alors que le site est en https://www : Google ignore ces URL. On le signale
          // et on les rapproche des pages réelles pour que la couverture du sitemap reste juste.
          const u = new URL(norm);
          if (u.origin !== this.origin && siteHost(u.hostname) === siteHost(new URL(this.origin).hostname)) {
            this.sitemapHostMismatch = (this.sitemapHostMismatch || 0) + 1;
            this.sitemapMismatchExample ||= l;
            norm = this.normalize(this.origin + u.pathname + u.search) || norm;
          }
          this.sitemapUrls.add(norm);
          n++;
        }
        this.sitemapFiles.push({ url: sm, type: 'urlset', count: n });
      }
    }
    if (this.sitemapsTruncated) this.warn('warn.sitemapsTruncated', { n: MAX_FILES });
  }

  blockAllFor(info, html) {
    if (this.opts.customRobots || this.opts.robotsMode !== 'respect' || this.opts.robotsUnavailable !== 'disallow') return false;
    return !html && (info.status === 0 || info.status == null || info.status >= 500);
  }

  // robots.txt d'une autre origine du périmètre (mode liste, sous-domaines) : lu à la première URL de cet hôte.
  async ensureRobots(origin) {
    const known = this.robotsByOrigin.get(origin);
    if (known) return known.ready; // un seul téléchargement par origine ; les autres workers attendent la même promesse
    const entry = { rules: [], blockAll: false, ready: null };
    this.robotsByOrigin.set(origin, entry);
    entry.ready = (async () => {
      const info = {};
      const txt = await this.fetchText(origin + '/robots.txt', info);
      const html = txt != null && /<(html|head|body)[\s>]/i.test(txt.slice(0, 1000));
      if (txt && !html && info.status === 200) entry.rules = rulesFor(parseRobots(txt), this.opts.userAgent);
      entry.blockAll = this.blockAllFor(info, html);
    })();
    return entry.ready;
  }

  blockedByRobots(url) {
    if (this.opts.robotsMode === 'ignore') return false;
    const u = new URL(url);
    const entry = u.origin === this.origin ? { rules: this.robotsRules, blockAll: this.robotsBlockAll } : this.robotsByOrigin.get(u.origin);
    if (!entry) return false;
    if (entry.blockAll) return true;
    return entry.rules.length ? !isAllowed(entry.rules, u.pathname + u.search) : false;
  }

  setPhase(phase) {
    this.phase = phase;
    this.emit('status', { phase });
  }

  warn(key, params = {}) {
    this.warnings.push({ key, params });
    this.emit('warning', { key, params });
  }

  async startRenderer() {
    if (!this.opts.render) return;
    this.setPhase('browser');
    const r = new Renderer({ userAgent: this.opts.userAgent, timeoutMs: this.opts.timeoutMs, headers: this.extraHeaders, isInternal: (u) => this.isInternal(u) });
    try {
      await r.start();
      this.renderer = r;
      this.renderSlots = Math.max(1, Math.min(this.opts.renderConcurrency, this.opts.concurrency));
      this.renderWaiters = [];
    } catch (e) {
      this.warn(e.code === 'NO_CHROME' ? 'warn.noChrome' : 'warn.renderFailed', { error: e.message });
    }
  }

  async withRenderSlot(fn) {
    while (this.renderSlots <= 0) await new Promise((r) => this.renderWaiters.push(r));
    this.renderSlots--;
    try {
      return await fn();
    } finally {
      this.renderSlots++;
      this.renderWaiters.shift()?.();
    }
  }

  async start() {
    this.startedAt = new Date().toISOString();
    this.setPhase('start');
    await this.resolveStart();
    await this.loadRobotsAndSitemaps();
    await this.startRenderer();
    if (this.resumeFile) {
      await this.replay(this.resumeFile);
      await this.openJournal(this.resumeFile, { fresh: false });
    }
    if (this.listUrls && this.opts.sitemapUrl && !this.listUrls.length) {
      this.listUrls = await this.sitemapUrlsFrom([this.opts.sitemapUrl]);
      this.opts.maxPages = Math.max(this.opts.maxPages, this.listUrls.length);
      if (!this.listUrls.length) this.warn('warn.sitemapListEmpty', { url: this.opts.sitemapUrl });
    }
    if (this.listUrls) {
      for (const u of this.listUrls) this.enqueue(u, 0, 'list');
    } else {
      this.enqueue(this.startUrl, 0, 'start');
      if (this.finalStart !== this.startUrl) this.enqueue(this.finalStart, 0, 'redirect');
      if (this.opts.useSitemaps) this.deferred = [...this.sitemapUrls];
    }

    this.setPhase('crawl');
    const progressTimer = setInterval(() => this.emit('progress', this.progress()), 500);
    try {
      await Promise.all(Array.from({ length: Math.max(1, this.opts.concurrency) }, () => this.worker()));
      if (!this.stopped && this.opts.checkExternal) await this.checkExternals();
      if (!this.stopped && this.opts.checkImages) await this.checkImages();
      if (!this.stopped) await this.loadSearchConsole();
      if (!this.stopped) await this.loadAnalytics();
      if (!this.stopped && this.opts.psiMax > 0) await this.runPageSpeed();
    } finally {
      clearInterval(progressTimer);
      await this.renderer?.close();
      await this.regexRunner?.close();
    }
    this.setPhase('analyse');
    this.finishedAt = new Date().toISOString();
    // Crawl terminé : le journal n'a plus d'utilité. Arrêté par l'utilisateur : il reste, pour une reprise.
    await this.closeJournal({ remove: !this.stopped });
    const result = analyze(this);
    this.phase = 'done';
    this.emit('progress', this.progress());
    this.emit('done', result);
    return result;
  }

  progress() {
    return {
      phase: this.phase,
      crawled: this.pages.size,
      queued: this.queue.length - this.qHead,
      discovered: this.seen.size,
      maxPages: this.opts.maxPages,
      active: this.active,
      externals: this.externals.size,
      stopped: this.stopped,
      elapsed: this.startedAt ? Date.now() - Date.parse(this.startedAt) : 0,
      rendering: !!this.renderer,
    };
  }

  async worker() {
    while (!this.stopped) {
      if (this.qHead >= this.queue.length) {
        if (this.active === 0) {
          // File vide : on injecte les URLs des sitemaps non découvertes par les liens.
          const pending = this.deferred.filter((u) => !this.seen.has(u));
          this.deferred = [];
          if (!pending.length) return;
          for (const u of pending) this.enqueue(u, 0, 'sitemap');
          if (this.qHead >= this.queue.length) return;
          continue;
        }
        await sleep(30);
        continue;
      }
      const item = this.queue[this.qHead++];
      if (this.pages.has(item.url)) continue; // déjà traitée (reprise)
      // Budget : maxPages compte les pages réellement téléchargées, pas les URL découvertes ni celles bloquées par robots.txt.
      if (this.fetched >= this.opts.maxPages) {
        this.skip('total');
        continue;
      }
      if (item.notBefore && item.notBefore > Date.now()) await sleep(Math.min(item.notBefore - Date.now(), RETRY_DELAY_MS));
      this.active++;
      try {
        await this.process(item);
      } catch (e) {
        this.pages.set(item.url, this.errorRecord(item, e));
      } finally {
        this.active--;
      }
      if (this.opts.delayMs) await sleep(this.opts.delayMs);
    }
  }

  baseRecord(item) {
    return {
      url: item.url,
      via: item.via,
      depth: item.depth,
      status: 0,
      statusText: '',
      contentType: '',
      isHtml: false,
      responseTime: null,
      size: 0,
      redirectUrl: '',
      xRobotsTag: '',
      lastModified: '',
      blockedByRobots: false,
      error: '',
      inSitemap: this.sitemapUrls.has(item.url),
      crawledAt: new Date().toISOString(),
    };
  }

  errorRecord(item, e) {
    const rec = this.baseRecord(item);
    rec.error = e?.name === 'AbortError' ? 'Timeout' : e?.cause?.code || e?.message || String(e);
    return rec;
  }

  async process(item) {
    const rec = this.baseRecord(item);
    const origin = new URL(item.url).origin;
    if (origin !== this.origin && this.opts.robotsMode !== 'ignore') await this.ensureRobots(origin);
    const blocked = this.blockedByRobots(item.url);
    if (blocked && this.opts.robotsMode === 'report') rec.robotsBlocked = true; // crawlé quand même, mais signalé
    else if (blocked) {
      rec.blockedByRobots = true;
      this.settle(item, rec);
      return;
    }
    this.fetched++;
    if (item.retry) rec.retries = (rec.retries || 0) + item.retry;
    let reqRes;
    try {
      // 429 / 503 : le serveur demande de ralentir. On attend (Retry-After, 30 s max) et on réessaie deux fois
      // avant de conclure ; une page seulement freinée n'est pas une page cassée.
      for (let attempt = 0; ; attempt++) {
        reqRes = await this.request(item.url);
        const st = reqRes.res.status;
        if ((st !== 429 && st !== 503) || attempt >= 2) break;
        const wait = retryAfterMs(reqRes.res.headers.get('retry-after')) ?? 2000 * (attempt + 1);
        clearTimeout(reqRes.timer);
        await reqRes.res.body?.cancel();
        if (st === 429 && !this.rateLimitWarned) {
          this.rateLimitWarned = true;
          this.warn('warn.rateLimited', { status: st });
        }
        this.backoffUntil = Math.max(this.backoffUntil || 0, Date.now() + Math.min(wait, 30000));
        rec.retries = attempt + 1;
      }
    } catch (e) {
      // Coupure réseau ou délai : une nouvelle tentative différée avant de conclure (sur 200 000 URL, les incidents
      // passagers sont certains).
      if (this.deferRetry(item)) return;
      this.settle(item, this.errorRecord(item, e));
      return;
    }
    const { res, ttfb, timer } = reqRes;
    try {
      if (RETRY_STATUS.has(res.status) && !item.retry && !this.stopped) {
        await res.body?.cancel();
        clearTimeout(timer);
        this.fetched--;
        this.deferRetry(item);
        return;
      }
      rec.status = res.status;
      // Toujours freinée après les nouvelles tentatives : artefact du crawl, pas une erreur du site.
      if (res.status === 429 || (res.status === 503 && rec.retries)) rec.rateLimited = true;
      rec.statusText = res.statusText;
      rec.contentType = res.headers.get('content-type') || '';
      rec.xRobotsTag = res.headers.get('x-robots-tag') || '';
      rec.lastModified = res.headers.get('last-modified') || '';
      rec.responseTime = ttfb;
      rec.headers = {
        hsts: !!res.headers.get('strict-transport-security'),
        xcto: !!res.headers.get('x-content-type-options'),
        csp: !!res.headers.get('content-security-policy'),
        encoding: res.headers.get('content-encoding') || '',
        cacheControl: res.headers.get('cache-control') || '',
      };
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        if (loc) {
          rec.redirectUrl = resolveUrl(loc, item.url) || loc;
          if (this.opts.mode !== 'list') this.enqueue(rec.redirectUrl, item.depth, 'redirect', (item.hops || 0) + 1);
        } else {
          // Un 3xx sans en-tête Location ne mène nulle part : navigateurs et Google affichent une page d'erreur.
          rec.error = 'Redirect without Location';
        }
        this.settle(item, rec);
        return;
      }
      rec.isHtml = HTML_TYPES.test(rec.contentType);
      if (!rec.isHtml) {
        rec.size = Number(res.headers.get('content-length')) || 0;
        await res.body?.cancel();
        this.settle(item, rec);
        return;
      }
      const maxBytes = this.opts.maxPageSizeKb * 1024;
      // Corps lu en flux et abandonné au-delà de la limite, Content-Length présent ou non.
      const body = Number(res.headers.get('content-length')) > maxBytes ? { tooLarge: true, size: Number(res.headers.get('content-length')) } : await readBodyLimited(res, maxBytes);
      if (body.tooLarge) {
        rec.size = body.size;
        rec.tooLarge = true;
        this.skip('pageSize');
        this.settle(item, rec);
        return;
      }
      const buf = body.buf;
      rec.downloadTime = Math.round(performance.now() - reqRes.t0);
      rec.size = buf.byteLength;
      const html = decodeBody(buf, rec.contentType);
      const popts = { extractors: this.opts.extractors, skipExtractors: this.asyncExtractorTypes() };
      let data = parseHtml(html, item.url, popts);
      await this.extractAsync(data, html, item.url);
      if (this.searchRe) rec.searchMatches = (html.match(this.searchRe) || []).length;
      if (this.renderer && res.status === 200) {
        const raw = data;
        try {
          const r = await this.withRenderSlot(() => this.renderSafe(item.url));
          // La page rendue est une autre URL : redirection JavaScript (location.href…) ou meta refresh. Google la traite
          // comme une redirection : la page n'est pas indexée et la cible est explorée. On garde le HTML brut.
          const landed = this.normalize(r.finalUrl);
          if (landed && landed !== item.url) {
            if (normalizeTarget(raw.metaRefreshUrl, this) !== landed) {
              rec.jsRedirectUrl = landed;
              if (this.opts.mode !== 'list') this.enqueue(landed, item.depth, 'redirect', (item.hops || 0) + 1);
            }
            throw new Error(`JS redirect → ${r.finalUrl}`);
          }
          data = parseHtml(r.html, item.url, popts);
          await this.extractAsync(data, r.html, item.url, r.extracted);
          const rawLinks = new Set(raw.links.map((l) => l.to));
          rec.js = {
            rendered: true,
            loadTime: r.loadTime,
            lcp: r.lcp,
            cls: r.cls,
            requests: r.requests,
            consoleErrors: r.consoleErrors,
            rawWordCount: raw.wordCount,
            rawTitle: raw.title,
            rawH1: raw.h1[0] || '',
            rawCanonical: raw.canonical,
            rawMetaRobots: raw.metaRobots,
            rawLinkCount: raw.links.length,
            jsOnlyLinks: data.links.filter((l) => !rawLinks.has(l.to)).length,
          };
          if (this.searchRe) rec.searchMatches = (r.html.match(this.searchRe) || []).length;
        } catch (e) {
          rec.js = { rendered: false, error: e.message.slice(0, 200) };
        }
      }
      this.settle(item, rec, data);
    } finally {
      clearTimeout(timer);
    }
  }

  // 500 / 502 / 504 ou coupure réseau : une seule nouvelle tentative, repoussée en fin de file après quelques secondes.
  deferRetry(item) {
    if (item.retry || this.stopped) return false;
    const again = { ...item, retry: 1, notBefore: Date.now() + RETRY_DELAY_MS };
    this.queue.push(again);
    this.jlog({ t: 'q', u: item.url, d: item.depth, v: item.via, h: item.hops, r: 1 });
    return true;
  }

  // Types d'extraction traités hors du parse : regex (Worker avec délai) et xpath (jsdom ou Chrome).
  asyncExtractorTypes() {
    const types = new Set();
    for (const e of this.opts.extractors || []) if (e.type === 'regex' || e.type === 'xpath') types.add(e.type);
    return types;
  }
  async extractAsync(data, html, url, rendered = null) {
    const ex = this.opts.extractors || [];
    const regex = ex.filter((e) => e.type === 'regex');
    const xpath = ex.filter((e) => e.type === 'xpath');
    if (!regex.length && !xpath.length) return;
    data.extracted ||= {};
    if (regex.length) {
      this.regexRunner ||= new RegexRunner({ onTimeout: (rules) => this.regexWarned || ((this.regexWarned = true), this.warn('warn.regexTimeout', { name: rules.map((r) => r.name).join(', ') })) });
      Object.assign(data.extracted, await this.regexRunner.run(html, regex));
    }
    if (xpath.length) {
      // En rendu JavaScript, Chrome a déjà évalué les XPath ; sinon jsdom, sur le HTML brut.
      if (rendered) Object.assign(data.extracted, rendered);
      else {
        const r = await xpathExtract(html, url, xpath);
        if (!this.xpathWarned && Object.values(r).some((v) => /^⚠ xpath/.test(v[0]))) {
          this.xpathWarned = true;
          this.warn('warn.xpathUnavailable');
        }
        Object.assign(data.extracted, r);
      }
    }
  }

  // Rendu avec filet : si Chrome meurt, il est relancé une fois (signalé) ; relancé aussi toutes les N pages pour
  // borner sa mémoire. Sans Chrome, la page garde son HTML brut et rendered: false, mais l'utilisateur est prévenu.
  async renderSafe(url) {
    const r = this.renderer;
    if (!r) throw new Error('Renderer unavailable');
    if (this.opts.renderRestartEvery && this.rendered > 0 && this.rendered % this.opts.renderRestartEvery === 0 && !r.restarting) await r.restart();
    try {
      this.rendered++;
      return await r.render(url, { xpath: (this.opts.extractors || []).filter((e) => e.type === 'xpath') });
    } catch (e) {
      if (!r.dead && !/disconnected|Target closed|Session closed|Protocol error|Connection closed/i.test(e.message)) throw e;
      if (this.rendererRestarts >= 1) {
        if (this.renderer) {
          this.renderer = null;
          this.warn('warn.renderLost', { error: e.message.slice(0, 120) });
        }
        throw e;
      }
      this.rendererRestarts++;
      this.warn('warn.renderRestart', { error: e.message.slice(0, 120) });
      await r.restart();
      return r.render(url, { xpath: (this.opts.extractors || []).filter((e) => e.type === 'xpath') });
    }
  }

  // Mode liste depuis un sitemap : les URL de pages d'un sitemap ou d'un index (parcours en largeur, 500 fichiers au plus).
  async sitemapUrlsFrom(urls) {
    const toFetch = [...urls];
    const done = new Set();
    const out = [];
    const seen = new Set();
    while (toFetch.length && done.size < 500 && !this.stopped) {
      const sm = toFetch.shift();
      if (done.has(sm)) continue;
      done.add(sm);
      const xml = await this.fetchText(sm);
      if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
      const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeXml(m[1]).trim());
      if (/<sitemapindex/i.test(xml)) for (const l of locs) toFetch.push(l);
      else for (const l of locs) {
        const n = this.normalize(l);
        if (n && /^https?:/.test(n) && !seen.has(n)) {
          seen.add(n);
          out.push(n);
        }
      }
    }
    return out;
  }

  // Page terminée : enregistrée, journalisée, annoncée. data (liens, images, champs HTML) est absent pour les pages
  // sans HTML (erreur, redirection, fichier). En reprise (replay), rien n'est journalisé ni annoncé.
  settle(item, rec, data = null, replay = false) {
    if (data) this.ingest(item, rec, data, replay);
    // Redirection vers un autre site : sa cible est vérifiée avec les liens externes.
    if (rec.redirectUrl && !this.isInternal(rec.redirectUrl) && /^https?:/.test(rec.redirectUrl)) {
      const ex = this.externals.get(rec.redirectUrl) || newExternal(rec.redirectUrl);
      seenOn(ex, item.url);
      this.externals.set(rec.redirectUrl, ex);
    }
    this.pages.set(item.url, rec);
    if (replay) return;
    this.jlog({ t: 'p', rec, d: data ? { links: data.links, images: data.images } : null });
    this.emit('page', rec);
  }

  // Ce que la page apporte au crawl : champs HTML, liens (file, liens externes, graphe), images.
  ingest(item, rec, data, replay = false) {
    const { links, images, ...fields } = data;
    Object.assign(rec, fields);
    rec.internalOutlinks = 0;
    rec.externalOutlinks = 0;
    rec.imagesCount = images.length;
    // alt absent = problème ; alt="" = image déclarée décorative (valide pour Google et l'accessibilité).
    rec.imagesMissingAlt = images.filter((i) => i.alt === null).length;
    rec.imagesEmptyAlt = images.filter((i) => i.alt === '').length;
    if (rec.imagesMissingAlt) rec.imagesMissingAltSrc = images.filter((i) => i.alt === null).slice(0, 30).map((i) => i.src);
    rec.imagesNoDimensions = images.filter((i) => !i.hasDimensions).length;
    rec.imagesResponsive = images.filter((i) => i.responsive).length;
    rec.imagesNoSizes = images.filter((i) => i.noSizes).length;
    rec.imagesLegacyOnly = images.filter((i) => i.formats.length && i.formats.every((f) => LEGACY_FORMATS.has(f))).length;
    rec.imageVariants = images.reduce((n, i) => n + i.variants.length, 0);

    const followAll = !robotsFlags(rec.metaRobots, rec.xRobotsTag).nofollow;
    const follow = this.opts.mode !== 'list' && !replay; // en reprise, la file vient des lignes q du journal
    if (links.length > this.opts.maxLinksPerPage) {
      rec.linksTruncated = links.length;
      links.length = this.opts.maxLinksPerPage;
    }
    for (const l of links) {
      const to = this.normalize(l.to) || l.to;
      const internal = this.isInternal(to);
      this.links.add({ from: item.url, to, anchor: l.anchor, nofollow: l.nofollow, internal, imageLink: l.imageLink, pos: l.pos, code: l.code });
      if (internal) {
        rec.internalOutlinks++;
        if (follow && followAll && !l.nofollow) this.enqueue(to, item.depth + 1, 'link');
      } else {
        rec.externalOutlinks++;
        const ex = this.externals.get(to) || newExternal(to);
        ex.inlinks++;
        seenOn(ex, item.url);
        this.externals.set(to, ex);
      }
    }
    for (const img of images) {
      const im = this.images.get(img.src) || newImage(img.src);
      Object.assign(im, { role: 'src', of: '' });
      if (img.alt === null) im.missingAlt = true;
      else if (img.alt === '') im.emptyAlt = true;
      else if (im.alts.length < MAX_ALTS && !im.alts.includes(img.alt)) im.alts.push(img.alt);
      seenOn(im, item.url);
      if (img.responsive) im.responsive = true;
      if (img.picture) im.picture = true;
      im.variantCount = Math.max(im.variantCount, img.variants.length);
      this.images.set(img.src, im);
      // Chaque fichier de srcset / <picture> est un fichier distinct à contrôler (poids, statut).
      for (const v of img.variants) {
        const vm = this.images.get(v.url) || Object.assign(newImage(v.url), { role: v.role, of: img.src, descriptor: v.descriptor, type: v.type || '', media: v.media || '' });
        seenOn(vm, item.url);
        this.images.set(v.url, vm);
      }
    }
    if (follow && this.opts.crawlCanonicals && rec.canonical && rec.canonical !== item.url) this.enqueue(rec.canonical, item.depth + 1, 'canonical');
    // Versions linguistiques déclarées en hreflang : explorées pour vérifier qu'elles répondent 200, sont indexables et renvoient le lien.
    if (follow && this.opts.crawlCanonicals) for (const h of rec.hreflang || []) this.enqueue(h.href, item.depth + 1, 'hreflang');
    if (follow && rec.relNext) this.enqueue(rec.relNext, item.depth + 1, 'pagination');
    if (follow && rec.metaRefreshUrl) this.enqueue(rec.metaRefreshUrl, item.depth, 'redirect', (item.hops || 0) + 1);
  }

  async pool(items, fn, concurrency) {
    let i = 0;
    const run = async () => {
      while (i < items.length && !this.stopped) await fn(items[i++]);
    };
    await Promise.all(Array.from({ length: concurrency }, run));
  }

  async headStatus(url) {
    try {
      let { res, timer } = await this.request(url, 'HEAD');
      clearTimeout(timer);
      // Beaucoup de serveurs répondent mal à HEAD (404, 500, 403) alors que la page existe : seul un GET fait foi.
      if (res.status >= 400) {
        ({ res, timer } = await this.request(url, 'GET'));
        clearTimeout(timer);
        await res.body?.cancel();
      }
      return { status: res.status, statusText: res.statusText, size: Number(res.headers.get('content-length')) || null, location: res.headers.get('location') || '', type: (res.headers.get('content-type') || '').split(';')[0].trim() };
    } catch (e) {
      return { status: 0, statusText: e?.name === 'AbortError' ? 'Timeout' : e?.cause?.code || 'Error', size: null };
    }
  }

  // Search Console : export CSV importé, sinon API avec un compte de service.
  async loadSearchConsole() {
    const o = this.opts;
    if (!o.gscCsv && !o.gscKeyFile) return;
    this.setPhase('gsc');
    try {
      if (o.gscCsv) {
        this.gsc = { source: 'csv', rows: parseGscCsv(o.gscCsv) };
      } else {
        const r = await fetchGscPages({ keyJson: await readGscKey(o.gscKeyFile), property: o.gscProperty, siteUrl: this.finalStart || this.startUrl, days: o.gscDays || 90, fetch: o.googleFetch, api: o.gscApi });
        this.gsc = { source: 'api', property: r.property, start: r.start, end: r.end, rows: r.rows };
      }
    } catch (e) {
      this.warn('warn.gscFailed', { error: e.message });
    }
  }

  // Google Analytics 4 : export CSV importé, sinon API Data avec un compte de service.
  async loadAnalytics() {
    const o = this.opts;
    if (!o.ga4Csv && !o.ga4KeyFile) return;
    this.setPhase('ga4');
    try {
      if (o.ga4Csv) {
        this.ga4 = { source: 'csv', rows: parseGa4Csv(o.ga4Csv) };
      } else {
        const r = await fetchGa4Pages({ keyJson: await readGscKey(o.ga4KeyFile), property: o.ga4Property, siteUrl: this.finalStart || this.startUrl, days: o.ga4Days || 90, fetch: o.googleFetch, api: o.ga4Api, admin: o.ga4Admin });
        this.ga4 = { source: 'api', property: r.property, start: r.start, end: r.end, rows: r.rows };
      }
    } catch (e) {
      this.warn('warn.ga4Failed', { error: e.message });
    }
  }

  // PageSpeed Insights sur les pages les plus importantes : les plus cliquées (Search Console), sinon l'accueil
  // puis les pages qui reçoivent le plus de liens internes.
  async runPageSpeed() {
    this.setPhase('psi');
    const html = [...this.pages.values()].filter((p) => p.isHtml && p.status === 200 && !robotsFlags(p.metaRobots, p.xRobotsTag).noindex);
    const inl = new Map();
    const { from, to, flags } = this.links.columns();
    for (let i = 0; i < this.links.n; i++) if (flags[i] & FLAG.internal && from[i] !== to[i]) inl.set(this.urls.values[to[i]], (inl.get(this.urls.values[to[i]]) || 0) + 1);
    const clicks = new Map((this.gsc?.rows || []).map((r) => [r.url, r.clicks || 0]));
    const home = this.finalStart || this.startUrl;
    const ranked = html.sort((a, b) => (b.url === home) - (a.url === home) || (clicks.get(b.url) || 0) - (clicks.get(a.url) || 0) || (inl.get(b.url) || 0) - (inl.get(a.url) || 0)).slice(0, this.opts.psiMax);
    this.psi = new Map();
    let failures = 0;
    await this.pool(ranked, async (p) => {
      try {
        this.psi.set(p.url, await runPsi(p.url, { key: this.opts.psiKey, strategy: this.opts.psiStrategy, fetch: this.opts.googleFetch, api: this.opts.psiApi }));
      } catch (e) {
        if (++failures === 1) this.warn('warn.psiFailed', { error: e.message });
      }
      this.emit('progress', this.progress());
    }, this.opts.psiKey ? 4 : 1);
  }

  async checkExternals() {
    this.setPhase('externals');
    const list = [...this.externals.values()].slice(0, this.opts.maxExternal);
    await this.pool(list, async (ex) => Object.assign(ex, await this.headStatus(ex.url)), this.opts.concurrency * 2);
  }

  async checkImages() {
    this.setPhase('images');
    const list = [...this.images.values()].slice(0, this.opts.maxImages);
    await this.pool(list, async (im) => {
      const r = await this.headStatus(im.src);
      im.status = r.status;
      im.size = r.size;
      if (r.type) im.contentType = r.type;
    }, this.opts.concurrency * 2);
  }
}
