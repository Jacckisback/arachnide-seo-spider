// Analyse des journaux d'accès : agrégation en flux (jamais les événements en mémoire), puis rattachement au crawl
// ouvert — comme les données Search Console et GA4, mais vues du côté serveur : ce que les robots demandent vraiment.
//
//   LogAggregator  : une entrée par URL normalisée (hits par robot, statuts, octets, temps, première / dernière vue),
//                    une entrée par jour (chronologie), une entrée par (robot, IP) pour la vérification ;
//   applyLogs(R)   : p.log sur chaque page, R.logOnly pour les URL vues dans les logs mais absentes du crawl,
//                    R.meta.logs (résumé, chronologie, robots, vérification), et six contrôles « log-* » ;
//   toJSON / fromJSON : l'agrégat se range dans un fichier voisin du crawl (<nom>.logs.jsonl.gz).
import { classify, botById, BotVerifier, FAMILIES } from './bots.mjs';
import { normalizeUrl, compileParamPatterns } from '../urlnorm.mjs';
import { RESOURCE_EXT } from '../../public/viz.js';
import { computeSummary, applySegments } from '../../public/shared/segments.js';
import { THRESHOLDS, SEV_W, LVL_W, PRIO_FLOOR, SEV_ORDER } from '../analyze.mjs';

const MAX_URLS = 2_000_000; // au-delà, les URL nouvelles sont comptées sans détail (overflow)
const MAX_IP_URLS = 300; // URL retenues par (robot, IP) pour réattribuer les hits usurpés
const DAY = 86_400_000;
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
const SEARCH_MAIN = new Set(['googlebot', 'googlebot-image', 'googlebot-video', 'googlebot-news', 'storebot-google', 'google-inspectiontool', 'googleother', 'bingbot', 'adidxbot', 'bingpreview']);
export const isGoogle = (id) => id === 'googlebot' || id === 'googlebot-image' || id === 'googlebot-video' || id === 'googlebot-news' || id === 'storebot-google' || id === 'google-inspectiontool' || id === 'googleother';

function newStat(url) {
  return { url, hits: 0, human: 0, bots: {}, fam: {}, st: {}, bytes: 0, tsum: 0, tn: 0, first: Infinity, last: 0, spoofed: 0 };
}

export class LogAggregator {
  constructor({ origin, normalize = null, options = {} } = {}) {
    this.origin = origin.replace(/\/$/, '');
    this.host = new URL(this.origin).hostname.replace(/^www\./, '').toLowerCase();
    this.norm = normalize || ((u) => normalizeUrl(u, { ignoreQuery: !!options.ignoreQuery, removeParamRes: compileParamPatterns(options.removeParams), normalizeParams: options.normalizeParams !== false }));
    this.urls = new Map();
    this.days = new Map();
    this.ipBots = new Map(); // `${botId}|${ip}` → { bot, ip, hits, urls: Map }
    this.bots = new Map(); // botId → { hits, ips: Set }
    this.totals = { events: 0, human: 0, bots: 0, bytes: 0, otherHost: 0, overflow: 0, fam: {}, st: {} };
    this.period = { start: Infinity, end: 0 };
    this.files = [];
    this.format = null;
    this.lines = 0;
    this.parsed = 0;
    this.skipped = 0;
    this.verification = null;
  }

  // Événement du parseur. Les requêtes vers un autre hôte (logs multi-sites) sont comptées à part et ignorées.
  add(ev) {
    if (ev.host) {
      const h = String(ev.host).replace(/:\d+$/, '').replace(/^www\./, '').toLowerCase();
      if (h !== this.host && h !== '-' && h !== '_') {
        this.totals.otherHost++;
        return;
      }
    }
    const url = this.norm(/^https?:\/\//i.test(ev.path) ? ev.path : this.origin + (ev.path.startsWith('/') ? ev.path : '/' + ev.path));
    if (!url) {
      this.totals.overflow++;
      return;
    }
    const bot = classify(ev.ua);
    const ts = Number.isFinite(ev.ts) ? ev.ts : NaN;
    let s = this.urls.get(url);
    if (!s) {
      if (this.urls.size >= MAX_URLS) {
        this.totals.overflow++;
        s = null;
      } else {
        s = newStat(url);
        this.urls.set(url, s);
      }
    }
    const fam = bot ? bot.family : 'human';
    const sc = Number.isFinite(ev.status) ? ev.status : 0;
    this.totals.events++;
    this.totals.bytes += ev.bytes || 0;
    if (bot) this.totals.bots++;
    else this.totals.human++;
    this.totals.fam[fam] = (this.totals.fam[fam] || 0) + 1;
    this.totals.st[sc] = (this.totals.st[sc] || 0) + 1;
    if (!Number.isNaN(ts)) {
      if (ts < this.period.start) this.period.start = ts;
      if (ts > this.period.end) this.period.end = ts;
      const k = dayKey(ts);
      let d = this.days.get(k);
      if (!d) this.days.set(k, (d = { day: k, total: 0, human: 0, search: 0, ai: 0, seo: 0, social: 0, monitor: 0, other: 0, s2: 0, s3: 0, s4: 0, s5: 0, googlebot: 0, bingbot: 0 }));
      d.total++;
      d[fam]++;
      const cls = sc >= 500 ? 's5' : sc >= 400 ? 's4' : sc >= 300 ? 's3' : 's2';
      d[cls]++;
      if (bot && isGoogle(bot.id)) d.googlebot++;
      if (bot && bot.id === 'bingbot') d.bingbot++;
    }
    if (bot) {
      let b = this.bots.get(bot.id);
      if (!b) this.bots.set(bot.id, (b = { hits: 0, ips: new Set(), mobile: 0 }));
      b.hits++;
      if (bot.mobile) b.mobile++;
      if (ev.ip && ev.ip !== '-' && b.ips.size < 100_000) b.ips.add(ev.ip);
      if (botById(bot.id)?.rdns && ev.ip && ev.ip !== '-') {
        const key = bot.id + '|' + ev.ip;
        let ib = this.ipBots.get(key);
        if (!ib) this.ipBots.set(key, (ib = { bot: bot.id, ip: ev.ip, hits: 0, urls: new Map() }));
        ib.hits++;
        if (s && (ib.urls.size < MAX_IP_URLS || ib.urls.has(url))) ib.urls.set(url, (ib.urls.get(url) || 0) + 1);
      }
    }
    if (!s) return;
    s.hits++;
    if (bot) {
      s.bots[bot.id] = (s.bots[bot.id] || 0) + 1;
      s.fam[bot.family] = (s.fam[bot.family] || 0) + 1;
    } else s.human++;
    s.st[sc] = (s.st[sc] || 0) + 1;
    s.bytes += ev.bytes || 0;
    if (ev.time != null) {
      s.tsum += ev.time;
      s.tn++;
    }
    if (!Number.isNaN(ts)) {
      if (ts < s.first) s.first = ts;
      if (ts > s.last) s.last = ts;
    }
  }

  // Vérification DNS des IP qui se présentent comme un robot de recherche : les hits usurpés sont retirés des
  // compteurs du robot et comptés comme « spoofed » sur chaque URL concernée.
  async verify({ verifier = new BotVerifier(), onProgress } = {}) {
    const res = { enabled: true, verified: 0, spoofed: 0, unverifiable: 0, error: 0, ips: { verified: 0, spoofed: 0, error: 0 }, spoofedIps: [] };
    const entries = [...this.ipBots.values()];
    let done = 0;
    await Promise.all(
      entries.map(async (ib) => {
        const status = await verifier.verify(ib.ip, ib.bot);
        ib.status = status;
        res[status === 'verified' || status === 'spoofed' || status === 'error' ? status : 'unverifiable'] += ib.hits;
        if (res.ips[status] !== undefined) res.ips[status]++;
        if (status === 'spoofed') {
          res.spoofedIps.push({ ip: ib.ip, bot: ib.bot, hits: ib.hits });
          for (const [url, n] of ib.urls) {
            const s = this.urls.get(url);
            if (!s) continue;
            s.spoofed += n;
            s.bots[ib.bot] = Math.max(0, (s.bots[ib.bot] || 0) - n);
            const fam = botById(ib.bot).family;
            s.fam[fam] = Math.max(0, (s.fam[fam] || 0) - n);
          }
          const b = this.bots.get(ib.bot);
          if (b) b.spoofed = (b.spoofed || 0) + ib.hits;
        }
        done++;
        if (onProgress && done % 25 === 0) onProgress({ done, total: entries.length });
      })
    );
    if (onProgress && done % 25) onProgress({ done, total: entries.length });
    res.spoofedIps.sort((a, b) => b.hits - a.hits);
    res.spoofedIps = res.spoofedIps.slice(0, 200);
    this.verification = res;
    return res;
  }

  // Robots sans vérification : tous les hits des robots vérifiables restent « non vérifiés ».
  unverified() {
    let n = 0;
    for (const ib of this.ipBots.values()) n += ib.hits;
    return { enabled: false, unverified: n };
  }

  toJSON() {
    return {
      v: 1,
      origin: this.origin,
      files: this.files,
      format: this.format,
      lines: this.lines,
      parsed: this.parsed,
      skipped: this.skipped,
      totals: this.totals,
      period: this.period,
      days: [...this.days.values()],
      bots: [...this.bots.entries()].map(([id, b]) => ({ id, hits: b.hits, ips: b.ips.size, mobile: b.mobile, spoofed: b.spoofed || 0 })),
      verification: this.verification,
      urls: [...this.urls.values()].map((s) => ({ ...s, first: s.first === Infinity ? null : s.first })),
    };
  }

  static fromJSON(j) {
    const a = new LogAggregator({ origin: j.origin });
    Object.assign(a, { files: j.files || [], format: j.format, lines: j.lines || 0, parsed: j.parsed || 0, skipped: j.skipped || 0, totals: j.totals, period: j.period, verification: j.verification || null });
    for (const d of j.days || []) a.days.set(d.day, d);
    for (const b of j.bots || []) a.bots.set(b.id, { hits: b.hits, ips: new Set(), ipsCount: b.ips, mobile: b.mobile, spoofed: b.spoofed });
    for (const s of j.urls || []) a.urls.set(s.url, { ...s, first: s.first ?? Infinity });
    return a;
  }
}

// Enregistrements NDJSON de l'agrégat (une ligne par URL : un fichier voisin du crawl, lu en flux).
export function* aggregatorRecords(agg) {
  const j = agg.toJSON();
  const { urls, days, ...head } = j;
  yield { t: 'loghead', ...head };
  for (const d of days) yield { t: 'logday', ...d };
  for (const u of urls) yield { t: 'logurl', ...u };
}
export function aggregatorFromRecords(records) {
  const j = { days: [], urls: [] };
  for (const r of records) {
    const { t, ...rest } = r;
    if (t === 'loghead') Object.assign(j, rest);
    else if (t === 'logday') j.days.push(rest);
    else if (t === 'logurl') j.urls.push(rest);
  }
  return LogAggregator.fromJSON(j);
}

// Clé de correspondance tolérante (hôte sans www, barre finale, requête), la même que pour Search Console / GA4.
const keyOf = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, '').toLowerCase() + (x.pathname.replace(/\/+$/, '') || '/') + x.search;
  } catch {
    return u;
  }
};
const isResource = (u) => {
  try {
    return RESOURCE_EXT.test(new URL(u).pathname);
  } catch {
    return false;
  }
};
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const stClass = (st, c) => Object.entries(st || {}).reduce((a, [k, n]) => (String(k)[0] === c ? a + n : a), 0);

// Vue d'une entrée de log pour une page ou une URL hors crawl (compacte : envoyée au navigateur avec chaque page).
export function logView(s) {
  let googlebot = 0;
  for (const [id, n] of Object.entries(s.bots)) if (isGoogle(id)) googlebot += n;
  const bingbot = (s.bots.bingbot || 0) + (s.bots.adidxbot || 0);
  const topStatus = Object.entries(s.st).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    hits: s.hits,
    human: s.human,
    search: s.fam.search || 0,
    ai: s.fam.ai || 0,
    seo: s.fam.seo || 0,
    other: (s.fam.social || 0) + (s.fam.monitor || 0) + (s.fam.other || 0),
    googlebot,
    bingbot,
    status: topStatus ? Number(topStatus) : null,
    s2: stClass(s.st, '2'),
    s3: stClass(s.st, '3'),
    s4: stClass(s.st, '4'),
    s5: stClass(s.st, '5'),
    bytes: s.bytes,
    avgTime: s.tn ? Math.round(s.tsum / s.tn) : null,
    first: s.first === Infinity || s.first == null ? null : new Date(s.first).toISOString(),
    last: s.last ? new Date(s.last).toISOString() : null,
    spoofed: s.spoofed || 0,
  };
}

// Rattache l'agrégat au crawl : pages, URL hors crawl, résumé, contrôles. Idempotent (une nouvelle application
// remplace la précédente).
export function applyLogs(R, agg, { slowMs = THRESHOLDS.slowMs } = {}) {
  const pages = R.pages;
  const byKey = new Map();
  const byBare = new Map();
  for (const p of pages) {
    const k = keyOf(p.url);
    if (!byKey.has(k)) byKey.set(k, p);
    const bare = k.replace(/\?.*$/, '');
    if (!byBare.has(bare) || (p.isHtml && p.status === 200 && !(byBare.get(bare).isHtml && byBare.get(bare).status === 200))) byBare.set(bare, p);
    delete p.log;
  }
  const logOnly = [];
  let matched = 0;
  for (const s of agg.urls.values()) {
    const k = keyOf(s.url);
    const p = byKey.get(k) || byBare.get(k.replace(/\?.*$/, ''));
    const v = logView(s);
    if (p) {
      // Plusieurs URL de log pour une page (barre finale, paramètres de suivi déjà retirés) : on additionne.
      if (p.log) {
        for (const f of ['hits', 'human', 'search', 'ai', 'seo', 'other', 'googlebot', 'bingbot', 's2', 's3', 's4', 's5', 'bytes', 'spoofed']) p.log[f] += v[f];
        if (v.last && (!p.log.last || v.last > p.log.last)) p.log.last = v.last;
        if (v.first && (!p.log.first || v.first < p.log.first)) p.log.first = v.first;
      } else {
        p.log = v;
        matched++;
      }
    } else logOnly.push({ url: s.url, resource: isResource(s.url), ...v });
  }
  const hasLogs = agg.totals.events > 0;
  for (const p of pages) if (hasLogs && !p.log && (p.isHtml || p.status >= 300)) p.log = { hits: 0, human: 0, search: 0, ai: 0, seo: 0, other: 0, googlebot: 0, bingbot: 0, status: null, s2: 0, s3: 0, s4: 0, s5: 0, bytes: 0, avgTime: null, first: null, last: null, spoofed: 0 };
  logOnly.sort((a, b) => b.search - a.search || b.hits - a.hits);
  R.logOnly = logOnly;

  // Résumé pour l'en-tête du résultat.
  const days = [...agg.days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const periodDays = agg.period.end >= agg.period.start ? Math.max(1, Math.round((agg.period.end - agg.period.start) / DAY) + 1) : 0;
  const dirs = new Map();
  for (const s of agg.urls.values()) {
    let dir = '/';
    try {
      const seg = new URL(s.url).pathname.split('/').filter(Boolean);
      dir = seg.length > 1 || s.url.endsWith('/') ? '/' + (seg[0] || '') + (seg.length ? '/' : '') : '/';
      if (seg.length === 1 && !new URL(s.url).pathname.endsWith('/')) dir = '/';
    } catch {}
    const d = dirs.get(dir) || { dir, hits: 0, search: 0, urls: 0 };
    d.hits += s.hits;
    d.search += s.fam.search || 0;
    d.urls++;
    dirs.set(dir, d);
  }
  const bots = [...agg.bots.entries()].map(([id, b]) => ({ id, name: botById(id)?.name || id, family: botById(id)?.family || 'other', hits: b.hits, ips: b.ips?.size || b.ipsCount || 0, mobile: b.mobile || 0, spoofed: b.spoofed || 0 })).sort((a, b) => b.hits - a.hits);
  // Requêtes authentiques : les hits usurpés (vérification DNS) sont retirés des totaux par robot.
  const authentic = (b) => b.hits - (b.spoofed || 0);
  const googlebotHits = bots.filter((b) => isGoogle(b.id)).reduce((a, b) => a + authentic(b), 0);
  R.meta = {
    ...R.meta,
    logs: {
      files: agg.files,
      format: agg.format,
      lines: agg.lines,
      parsed: agg.parsed,
      skipped: agg.skipped,
      events: agg.totals.events,
      human: agg.totals.human,
      botHits: agg.totals.bots,
      bytes: agg.totals.bytes,
      otherHost: agg.totals.otherHost,
      overflow: agg.totals.overflow,
      urls: agg.urls.size,
      matched,
      outside: logOnly.length,
      outsidePages: logOnly.filter((x) => !x.resource).length,
      period: agg.period.end >= agg.period.start ? { start: new Date(agg.period.start).toISOString(), end: new Date(agg.period.end).toISOString(), days: periodDays } : null,
      families: Object.fromEntries(FAMILIES.map((f) => [f, agg.totals.fam[f] || 0])),
      statuses: { s2: stClass(agg.totals.st, '2'), s3: stClass(agg.totals.st, '3'), s4: stClass(agg.totals.st, '4'), s5: stClass(agg.totals.st, '5'), other: agg.totals.st[0] || 0 },
      googlebotHits,
      bingbotHits: bots.filter((b) => b.id === 'bingbot').reduce((a, b) => a + authentic(b), 0),
      bots: bots.slice(0, 40),
      timeline: days,
      dirs: [...dirs.values()].sort((a, b) => b.search - a.search || b.hits - a.hits).slice(0, 50),
      verification: agg.verification || agg.unverified(),
    },
  };

  // Contrôles. Les hits de robots de recherche authentiques (ou non vérifiés) sont la mesure ; les usurpés sont à part.
  const html200 = pages.filter((p) => p.isHtml && p.status === 200);
  const indexable = html200.filter((p) => p.indexable);
  const start = R.meta.finalStart || R.meta.startUrl;
  const D = (k, p = {}) => ({ k, p });
  const issues = R.issues.filter((i) => !i.id.startsWith('log-'));
  const add = (id, severity, category, impact, effort, items, params = {}) => {
    if (items.length) issues.push({ id, severity, category, impact, effort, params, count: items.length, items });
  };
  const crawlable = (x) => !x.resource;
  // Orphelines : demandées par Google / Bing, servies en 200, absentes du crawl ou sans lien interne.
  const orphansOut = logOnly.filter((x) => crawlable(x) && x.search > 0 && x.s2 > 0 && !/\?/.test(x.url));
  const orphansIn = html200.filter((p) => p.log?.search > 0 && !p.uniqueInlinks && p.depth !== 0 && p.url !== start);
  add('log-orphan', 'warning', 'sitemap', 'high', 'medium', [...orphansOut.map((x) => ({ url: x.url, detail: D('d.logSearchHits', { n: x.search, last: (x.last || '').slice(0, 10) }) })), ...orphansIn.map((p) => ({ url: p.url, detail: D('d.logSearchHits', { n: p.log.search, last: (p.log.last || '').slice(0, 10) }) }))]);
  // Jamais visitées : indexables, et aucun passage de Google sur la période (quand Google est bien présent dans les logs).
  if (googlebotHits > 0 && periodDays >= 7) add('log-not-crawled', 'notice', 'architecture', 'medium', 'medium', indexable.filter((p) => p.log && !p.log.googlebot && p.url !== start).map((p) => ({ url: p.url, detail: D('d.logNoGooglebot', { days: periodDays }) })), { days: periodDays });
  // Budget gaspillé : robots de recherche sur des URL non indexables, redirigées, en erreur ou à paramètres.
  const waste = [];
  for (const p of pages) {
    if (!p.log?.search) continue;
    const reason = p.status >= 500 ? null : p.status >= 400 ? 'error' : p.status >= 300 ? 'redirect' : p.isHtml && !p.indexable ? 'nonIndexable' : null;
    if (reason) waste.push({ url: p.url, reason, detail: D('d.logWaste' + reason[0].toUpperCase() + reason.slice(1), { n: p.log.search, status: p.status }) });
  }
  for (const x of logOnly) {
    if (!crawlable(x) || !x.search) continue;
    const reason = x.s4 > 0 ? 'error' : x.s3 > 0 ? 'redirect' : /\?/.test(x.url) ? 'params' : null;
    if (reason) waste.push({ url: x.url, reason, detail: D('d.logWaste' + reason[0].toUpperCase() + reason.slice(1), { n: x.search, status: x.status }) });
  }
  add('log-crawl-waste', 'warning', 'directives', 'medium', 'medium', waste.sort((a, b) => b.detail.p.n - a.detail.p.n).map(({ reason: _r, ...it }) => it));
  // Erreurs serveur servies aux robots.
  const botErrors = [];
  for (const p of pages) if (p.log?.s5 > 0 && (p.log.search > 0 || p.log.ai > 0)) botErrors.push({ url: p.url, detail: D('d.logErrors', { n: p.log.s5, hits: p.log.hits }) });
  for (const x of logOnly) if (x.s5 > 0 && (x.search > 0 || x.ai > 0)) botErrors.push({ url: x.url, detail: D('d.logErrors', { n: x.s5, hits: x.hits }) });
  add('log-bot-errors', 'error', 'codes', 'high', 'medium', botErrors.sort((a, b) => b.detail.p.n - a.detail.p.n));
  // Robots usurpés : des IP qui se disent Googlebot / Bingbot sans l'être.
  const spoofedUrls = [...pages.filter((p) => p.log?.spoofed > 0).map((p) => ({ url: p.url, n: p.log.spoofed })), ...logOnly.filter((x) => x.spoofed > 0).map((x) => ({ url: x.url, n: x.spoofed }))].sort((a, b) => b.n - a.n).slice(0, 500);
  const spoofedTotal = agg.verification?.spoofed || 0;
  if (spoofedTotal) add('log-spoofed', 'notice', 'security', 'low', 'low', spoofedUrls.length ? spoofedUrls.map((x) => ({ url: x.url, detail: D('d.logSpoofed', { n: x.n }) })) : [{ url: start, detail: D('d.logSpoofedSite', { n: spoofedTotal, ips: agg.verification.ips.spoofed }) }], { n: spoofedTotal, ips: agg.verification.ips.spoofed });
  // Pages lentes pour les robots (quand le temps de réponse est journalisé).
  add('log-slow', 'notice', 'performance', 'medium', 'high', html200.filter((p) => p.log?.avgTime > slowMs && p.log.search > 0).map((p) => ({ url: p.url, detail: `${p.log.avgTime} ms` })), { max: slowMs });

  // Portée, priorité et ordre : les mêmes règles que le moteur.
  const pageSet = new Set(pages.map((p) => p.url));
  const htmlN = Math.max(1, html200.length);
  for (const is of issues) {
    if (!is.id.startsWith('log-')) continue;
    is.scope = is.id === 'log-orphan' || is.items.some((it) => pageSet.has(it.url)) ? 'page' : 'site';
    const n = is.scope === 'site' ? htmlN : is.count;
    const raw = (SEV_W[is.severity] * LVL_W[is.impact] * Math.log2(n + 1)) / LVL_W[is.effort];
    is.priority = Math.round((raw + PRIO_FLOOR[is.severity]) * 10) / 10;
  }
  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);
  R.issues = issues;
  // Score et piliers recalculés avec la méthode du moteur ; les compteurs de liens sont repris, pas recomptés.
  const S = R.summary || {};
  R.summary = { ...S, ...computeSummary(R, { internalLinks: S.internalLinks || 0, externalLinks: S.externalLinks || 0, uniqueExternal: S.uniqueExternal || 0 }) };
  if (R.meta.segments?.length) applySegments(R, R.meta.segments);
  return R.meta.logs;
}

// Retire les logs d'un crawl (annulation de l'import).
export function removeLogs(R) {
  for (const p of R.pages) delete p.log;
  R.logOnly = [];
  const { logs, ...meta } = R.meta;
  R.meta = meta;
  R.issues = R.issues.filter((i) => !i.id.startsWith('log-'));
  const S = R.summary || {};
  R.summary = { ...S, ...computeSummary(R, { internalLinks: S.internalLinks || 0, externalLinks: S.externalLinks || 0, uniqueExternal: S.uniqueExternal || 0 }) };
  if (R.meta.segments?.length) applySegments(R, R.meta.segments);
}
