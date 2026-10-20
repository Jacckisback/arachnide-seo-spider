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

// ——— Google Analytics 4 : sessions, vues et utilisateurs par page (API Data, compte de service) ———
// https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
const GA4_API = 'https://analyticsdata.googleapis.com/v1beta';
const GA4_ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

// « 123456789 », « properties/123456789 », « p123456789 » (URL de l'interface GA4) → « properties/123456789 »
export function normalizeGa4Property(v) {
  const m = /(?:^|properties\/|\bp)(\d{5,})/i.exec(String(v || '').trim());
  return m ? `properties/${m[1]}` : null;
}

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// Propriété GA4 du site : celle dont un flux Web pointe sur le même domaine (API Admin, mêmes droits de lecture).
export async function findGa4Property({ headers, siteUrl, fetch = globalThis.fetch, admin = GA4_ADMIN }) {
  const host = hostOf(siteUrl);
  const props = [];
  let pageToken = '';
  do {
    const r = await fetch(`${admin}/accountSummaries?pageSize=200${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`, { headers });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google Analytics Admin: ${json.error?.message || r.status}`);
    for (const a of json.accountSummaries || []) for (const p of a.propertySummaries || []) props.push(p.property);
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  for (const prop of props) {
    const r = await fetch(`${admin}/${prop}/dataStreams?pageSize=200`, { headers });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) continue;
    if ((json.dataStreams || []).some((s) => s.webStreamData?.defaultUri && hostOf(s.webStreamData.defaultUri) === host)) return prop;
  }
  return props.length === 1 ? props[0] : null;
}

// Sessions / vues / utilisateurs / sessions engagées par hôte + chemin sur les N derniers jours (jusqu'à hier).
export async function fetchGa4Pages({ keyJson, property, siteUrl, days = 90, fetch = globalThis.fetch, api = GA4_API, admin = GA4_ADMIN }) {
  const { token, email } = await serviceAccountToken(keyJson, { scope: GA4_SCOPE, fetch });
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let prop = property ? normalizeGa4Property(property) : null;
  if (property && !prop) throw new Error(`"${property}" is not a GA4 property ID (a number such as 123456789, see Admin → Property settings).`);
  if (!prop) {
    prop = await findGa4Property({ headers, siteUrl, fetch, admin });
    if (!prop) throw new Error(`No Google Analytics 4 property for ${hostOf(siteUrl)} is shared with ${email}. Add this email as a Viewer of the property (Admin → Property access management), or enter the property ID.`);
  }
  const end = new Date(Date.now() - 864e5);
  const start = new Date(end.getTime() - (days - 1) * 864e5);
  const rows = [];
  const LIMIT = 100000;
  for (let offset = 0; offset < 1000000; offset += LIMIT) {
    const r = await fetch(`${api}/${prop}:runReport`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: day(start), endDate: day(end) }],
        dimensions: [{ name: 'hostName' }, { name: 'pagePath' }],
        metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'engagedSessions' }],
        limit: LIMIT,
        offset,
        keepEmptyRows: false,
      }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google Analytics: ${json.error?.message || r.status}${r.status === 403 ? ` (give ${email} Viewer access to the property)` : ''}`);
    for (const row of json.rows || []) {
      const [host, path] = row.dimensionValues.map((d) => d.value);
      const [sessions, views, users, engaged] = row.metricValues.map((m) => Number(m.value) || 0);
      rows.push({ host, path, sessions, views, users, engaged });
    }
    if (!json.rows || offset + LIMIT >= (json.rowCount || 0)) break;
  }
  return { property: prop, start: day(start), end: day(end), rows };
}

// ——— Import d'un export CSV de GA4 (Rapports → Engagement → Pages et écrans, ou Page de destination) ———
// Les lignes « # … » de l'en-tête GA4 sont ignorées ; colonnes reconnues dans les 6 langues de l'interface GA4.
const GA4_HEAD = {
  path: /^(page path.*|page path and screen class|landing page.*|chemin de (la )?page.*|page de destination.*|ruta de (la )?página.*|página de destino.*|seitenpfad.*|zielseite.*|percorso (della )?pagina.*|pagina di destinazione.*|caminho da página.*|página de entrada.*|página de destino.*)$/i,
  host: /^(hostname|host name|nom d'hôte|nom d’hôte|nombre de host|hostname|nome host|nome do host)$/i,
  sessions: /^(sessions?|sesiones|sitzungen|sessioni|sessões|sessoes)$/i,
  views: /^(views|vues|visualizaciones|aufrufe|visualizzazioni|visualizações|visualizacoes|screen page views|pageviews)$/i,
  users: /^(active users|users|utilisateurs actifs|utilisateurs|usuarios activos|usuarios|aktive nutzer|nutzer|utenti attivi|utenti|usuários ativos|usuários|usuarios ativos)$/i,
  engaged: /^(engaged sessions|sessions avec engagement|sesiones con interacción|sitzungen mit interaktionen|sessioni con engagement|sessões engajadas)$/i,
};

export function parseGa4Csv(text) {
  // Les exports GA4 commencent par des lignes de commentaire (« # Pages et écrans … ») et peuvent contenir plusieurs blocs.
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const body = lines.filter((l) => !/^\s*#/.test(l)).join('\n');
  const rows = parseCsv(body);
  if (rows.length < 2) throw new Error('Empty CSV file.');
  let h = rows.findIndex((r) => r.some((c) => GA4_HEAD.path.test(c.trim())) || r.some((c) => GA4_HEAD.sessions.test(c.trim())));
  if (h < 0) h = 0;
  const header = rows[h].map((c) => c.trim());
  const col = Object.fromEntries(Object.entries(GA4_HEAD).map(([k, re]) => [k, header.findIndex((c) => re.test(c))]));
  // Colonne des pages : en-tête reconnu, sinon la première colonne dont les valeurs ressemblent à des chemins ou des URL.
  if (col.path < 0) col.path = header.findIndex((_, i) => rows.slice(h + 1, h + 21).some((r) => /^(\/|https?:\/\/)/i.test(r[i]?.trim() || '')));
  if (col.path < 0) throw new Error('No page path column found: export "Pages and screens" (Page path) or "Landing page" from Google Analytics 4.');
  if (col.sessions < 0 && col.views < 0) throw new Error('No sessions / views column found in this CSV.');
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const raw = (r[col.path] || '').trim();
    if (!/^(\/|https?:\/\/)/i.test(raw)) continue; // ligne de total, « (not set) », bloc suivant…
    let host = col.host >= 0 ? (r[col.host] || '').trim() : '';
    let path = raw;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        host = u.hostname;
        path = u.pathname + u.search;
      } catch {
        continue;
      }
    }
    out.push({ host, path, sessions: col.sessions >= 0 ? num(r[col.sessions]) ?? 0 : null, views: col.views >= 0 ? num(r[col.views]) ?? 0 : null, users: col.users >= 0 ? num(r[col.users]) ?? 0 : null, engaged: col.engaged >= 0 ? num(r[col.engaged]) ?? 0 : null });
  }
  if (!out.length) throw new Error('No page rows found in this CSV.');
  return out;
}
