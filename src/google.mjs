// Données Google : PageSpeed Insights (score Lighthouse + Core Web Vitals terrain CrUX) et Search Console
// (clics, impressions, CTR, position par URL) via l'API (compte de service) ou l'import du CSV exporté.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

// ——— PageSpeed Insights / CrUX ———
// https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed
const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CWV = {
  LARGEST_CONTENTFUL_PAINT_MS: 'lcp',
  INTERACTION_TO_NEXT_PAINT: 'inp',
  CUMULATIVE_LAYOUT_SHIFT_SCORE: 'cls',
  FIRST_CONTENTFUL_PAINT_MS: 'fcp',
  EXPERIMENTAL_TIME_TO_FIRST_BYTE: 'ttfb',
};
const CATEGORY = { FAST: 'good', AVERAGE: 'ni', SLOW: 'poor' };

// Expérience terrain CrUX renvoyée par PSI → { lcp: { p75, cat }, …, overall }
export function parseField(exp) {
  if (!exp?.metrics || !Object.keys(exp.metrics).length) return null;
  const out = { overall: CATEGORY[exp.overall_category] || null };
  for (const [key, id] of Object.entries(CWV)) {
    const m = exp.metrics[key];
    if (!m) continue;
    // CLS : la valeur CrUX est multipliée par 100 dans PSI (5 = 0,05).
    out[id] = { p75: id === 'cls' ? m.percentile / 100 : m.percentile, cat: CATEGORY[m.category] || null };
  }
  return out;
}

export function parsePsi(json) {
  const lh = json.lighthouseResult;
  const audit = (k) => lh?.audits?.[k]?.numericValue;
  const field = json.loadingExperience?.origin_fallback ? null : parseField(json.loadingExperience);
  return {
    score: lh?.categories?.performance?.score != null ? Math.round(lh.categories.performance.score * 100) : null,
    field,
    origin: parseField(json.originLoadingExperience),
    lab: lh ? { lcp: audit('largest-contentful-paint'), cls: audit('cumulative-layout-shift'), tbt: audit('total-blocking-time'), si: audit('speed-index') } : null,
  };
}

export async function runPsi(url, { key, strategy = 'mobile', fetch = globalThis.fetch, api = PSI_API } = {}) {
  const q = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) q.set('key', key);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${api}?${q}`, { signal: AbortSignal.timeout(90000) });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error?.message || `PageSpeed Insights ${res.status}`);
    return parsePsi(json);
  }
}

// ——— Search Console : authentification par compte de service (JWT signé RS256, sans dépendance) ———
// https://developers.google.com/identity/protocols/oauth2/service-account#httprest
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function serviceAccountToken(keyJson, { scope = 'https://www.googleapis.com/auth/webmasters.readonly', fetch = globalThis.fetch } = {}) {
  const key = typeof keyJson === 'string' ? JSON.parse(keyJson) : keyJson;
  if (!key.client_email || !key.private_key) throw new Error('The Search Console key file is not a service account JSON key (client_email / private_key missing).');
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: key.client_email, scope, aud: tokenUri, iat: now, exp: now + 3600 }))}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Google token error: ${json.error_description || json.error || res.status}`);
  return { token: json.access_token, email: key.client_email };
}

const GSC_API = 'https://searchconsole.googleapis.com/webmasters/v3';
const day = (d) => d.toISOString().slice(0, 10);

// Propriété Search Console correspondant au site : domaine (sc-domain:) ou préfixe d'URL.
export function pickProperty(sites, siteUrl) {
  const u = new URL(siteUrl);
  const bare = u.hostname.replace(/^www\./, '');
  const ok = sites.filter((s) => s.permissionLevel !== 'siteUnverifiedUser');
  return (
    ok.find((s) => s.siteUrl === `sc-domain:${bare}`)?.siteUrl ||
    ok.filter((s) => /^https?:/.test(s.siteUrl) && siteUrl.startsWith(s.siteUrl)).sort((a, b) => b.siteUrl.length - a.siteUrl.length)[0]?.siteUrl ||
    null
  );
}

// Clics / impressions / CTR / position par page sur les N derniers jours (données finales : J-3).
export async function fetchGscPages({ keyJson, property, siteUrl, days = 90, fetch = globalThis.fetch, api = GSC_API }) {
  const { token, email } = await serviceAccountToken(keyJson, { fetch });
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let prop = property;
  if (!prop) {
    const r = await fetch(`${api}/sites`, { headers });
    const json = await r.json().catch(() => ({}));
    prop = pickProperty(json.siteEntry || [], siteUrl);
    if (!prop) throw new Error(`No Search Console property for ${new URL(siteUrl).hostname} is shared with ${email}. Add this email as a user of the property (Settings → Users and permissions).`);
  }
  const end = new Date(Date.now() - 3 * 864e5);
  const start = new Date(end.getTime() - (days - 1) * 864e5);
  const rows = [];
  for (let startRow = 0; startRow < 100000; startRow += 25000) {
    const r = await fetch(`${api}/sites/${encodeURIComponent(prop)}/searchAnalytics/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ startDate: day(start), endDate: day(end), dimensions: ['page'], rowLimit: 25000, startRow, dataState: 'final' }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Search Console: ${json.error?.message || r.status}${r.status === 403 ? ` (share the property with ${email})` : ''}`);
    for (const row of json.rows || []) rows.push({ url: row.keys[0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position });
    if (!json.rows || json.rows.length < 25000) break;
  }
  return { property: prop, start: day(start), end: day(end), rows };
}

// ——— Import du CSV « Pages » exporté depuis Search Console (toutes langues de l'interface) ———
function parseCsv(text) {
  const t = String(text).replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// « 1 234 », « 1,234 », « 3,2 % », « 3.2% » → nombre
function num(v, { percent = false } = {}) {
  let s = String(v ?? '').replace(/[\s  ]/g, '').replace('%', '');
  if (!s) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s) && !percent) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return percent ? n / 100 : n;
}

const HEAD = {
  clicks: /^(clicks?|clics?|klicks?|clic|cliques|clique)$/i,
  impressions: /^(impressions?|impresiones|impressionen|impressioni|impressões|impressoes)$/i,
  ctr: /^(ctr)$/i,
  position: /^(position|posición|posicion|posizione|posição|posicao|average position|position moyenne)$/i,
};

export function parseGscCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Empty CSV file.');
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1);
  const urlCol = header.findIndex((_, i) => body.slice(0, 20).some((r) => /^https?:\/\//i.test(r[i]?.trim() || '')));
  if (urlCol < 0) throw new Error('No URL column found: export the "Pages" table from the Search Console performance report.');
  const col = Object.fromEntries(Object.entries(HEAD).map(([k, re]) => [k, header.findIndex((h) => re.test(h))]));
  if (col.clicks < 0 && col.impressions < 0) throw new Error('No clicks / impressions columns found in this CSV.');
  return body
    .filter((r) => /^https?:\/\//i.test(r[urlCol]?.trim() || ''))
    .map((r) => ({
      url: r[urlCol].trim(),
      clicks: col.clicks >= 0 ? num(r[col.clicks]) ?? 0 : null,
      impressions: col.impressions >= 0 ? num(r[col.impressions]) ?? 0 : null,
      ctr: col.ctr >= 0 ? num(r[col.ctr], { percent: true }) : null,
      position: col.position >= 0 ? num(r[col.position]) : null,
    }));
}

export async function readGscKey(path) {
  return fs.readFile(path, 'utf8');
}
