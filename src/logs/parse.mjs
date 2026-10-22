// Lecture des journaux d'accès (access logs) en flux, ligne par ligne, quel que soit leur poids (Go) : jamais le fichier
// entier en mémoire. Formats reconnus automatiquement sur les premières lignes :
//   - combined  : Apache / Nginx « combined » (avec ou sans hôte virtuel en tête, avec ou sans temps de réponse en queue)
//   - common    : Apache « common » (sans referer ni user-agent)
//   - w3c       : W3C Extended (IIS, CloudFront) avec une directive #Fields:
//   - json      : un objet JSON par ligne (Nginx json, Cloudflare Logpush, Caddy…), champs reconnus par leur nom
//   - custom    : format Nginx `log_format` donné par l'utilisateur, avec ses variables $remote_addr, $request…
// Chaque ligne devient un événement { ts, ip, method, path, status, bytes, ua, referer, time, host } ou est comptée
// comme ignorée (ligne vide, commentaire, ligne qui ne correspond pas).
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { PassThrough } from 'node:stream';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// « 10/Oct/2026:13:55:36 +0200 » (Apache) → ms. Retourne NaN si illisible.
export function parseClfDate(s) {
  const m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*([+-]\d{4})?$/.exec(s);
  if (!m) return NaN;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return NaN;
  let ms = Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]);
  if (m[7]) ms -= (Math.sign(+m[7]) || 1) * (Math.abs(+m[7].slice(0, 3)) * 60 + +m[7].slice(3)) * 60000;
  return ms;
}

// Dates rencontrées dans les JSON et W3C : ISO 8601, epoch en secondes / millisecondes / nanosecondes, CLF.
export function parseAnyDate(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return Math.round(v > 1e17 ? v / 1e6 : v > 1e14 ? v / 1e3 : v > 1e11 ? v : v * 1000);
  const s = String(v).trim();
  if (/^\d{9,20}$/.test(s)) return parseAnyDate(Number(s));
  if (/^\d{1,2}\/[A-Za-z]{3}\/\d{4}:/.test(s)) return parseClfDate(s.replace(/^\[|\]$/g, ''));
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

// « GET /path?x=1 HTTP/1.1 » → { method, path }. Les lignes sans requête valide (scans, requêtes tronquées) sont gardées
// avec le chemin brut : elles comptent dans le trafic parasite.
export function parseRequest(req) {
  const m = /^([A-Z]{3,10})\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/.exec(req || '');
  if (!m) return { method: '', path: (req || '').slice(0, 2000) };
  return { method: m[1], path: m[2] };
}

const num = (v) => {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---- combined / common ----
// Un champ : « - », un token sans espace, [entre crochets] ou "entre guillemets" (guillemets échappés \" admis).
const FIELD = String.raw`(?:"((?:[^"\\]|\\.)*)"|\[([^\]]*)\]|(\S+))`;
const fieldRe = new RegExp(FIELD, 'g');
function tokens(line) {
  const out = [];
  fieldRe.lastIndex = 0;
  let m;
  while ((m = fieldRe.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2] !== undefined ? m[2] : m[3]);
  return out;
}
const IP_RE = /^(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+:[0-9a-f:]*|unix:|-)$/i;
const CLF_DATE_RE = /^\d{1,2}\/[A-Za-z]{3}\/\d{4}:/;

// Repère l'IP, la date et la requête : un hôte virtuel peut précéder l'IP, un temps de réponse peut suivre l'UA.
function parseClfLine(line) {
  const f = tokens(line);
  if (f.length < 6) return null;
  let i = 0;
  let host = null;
  if (!IP_RE.test(f[0]) && IP_RE.test(f[1] || '')) {
    host = f[0].replace(/:\d+$/, '');
    i = 1;
  }
  const ip = f[i];
  const dateIdx = f.findIndex((x, k) => k > i && CLF_DATE_RE.test(x));
  if (dateIdx < 0) return null;
  const ts = parseClfDate(f[dateIdx]);
  const req = f[dateIdx + 1];
  const status = num(f[dateIdx + 2]);
  if (req === undefined || status === null) return null;
  const bytes = num(f[dateIdx + 3]) ?? 0;
  const referer = f[dateIdx + 4] && f[dateIdx + 4] !== '-' ? f[dateIdx + 4] : '';
  const ua = f[dateIdx + 5] && f[dateIdx + 5] !== '-' ? f[dateIdx + 5] : '';
  // Nginx : $request_time (secondes) souvent ajouté après l'UA ; Apache %D en microsecondes.
  let time = null;
  for (let k = dateIdx + 6; k < f.length; k++) {
    const n = num(f[k]);
    if (n !== null && f[k].includes('.')) {
      time = Math.round(n * 1000);
      break;
    }
  }
  const { method, path } = parseRequest(req);
  return { ts, ip, method, path, status, bytes, ua, referer, time, host };
}

// ---- W3C extended (#Fields: date time c-ip cs-method cs-uri-stem cs-uri-query sc-status …) ----
const W3C = {
  date: 'date', time: 'time', 'date-time': 'datetime', 'c-ip': 'ip', 'cs-method': 'method', 'cs-uri-stem': 'stem', 'cs-uri-query': 'query', 'cs-uri': 'uri',
  'sc-status': 'status', 'sc-bytes': 'bytes', 'cs(user-agent)': 'ua', 'cs(referer)': 'referer', 'cs(referrer)': 'referer', 'time-taken': 'taken', 'cs-host': 'host', 's-sitename': 's', 'x-edge-location': 'x',
};
function w3cRecord(fields, parts) {
  const r = {};
  fields.forEach((f, i) => (r[W3C[f.toLowerCase()] || f] = parts[i]));
  if (r.status === undefined) return null;
  const dateStr = r.datetime || (r.date ? `${r.date}T${r.time || '00:00:00'}Z` : '');
  const ts = parseAnyDate(dateStr);
  const path = r.uri || (r.stem || '') + (r.query && r.query !== '-' ? (r.query.startsWith('?') ? r.query : '?' + r.query) : '');
  const dec = (v) => {
    try {
      return decodeURIComponent((v || '').replace(/\+/g, ' '));
    } catch {
      return v || '';
    }
  };
  return { ts, ip: r.ip || '-', method: r.method || '', path, status: num(r.status) ?? 0, bytes: num(r.bytes) ?? 0, ua: dec(r.ua === '-' ? '' : r.ua), referer: r.referer && r.referer !== '-' ? dec(r.referer) : '', time: r.taken != null && r.taken !== '-' && num(r.taken) !== null ? Math.round(num(r.taken) * (String(r.taken).includes('.') ? 1000 : 1)) : null, host: r.host || null };
}

// ---- JSON lines : les champs sont reconnus par leur nom, dans les conventions Nginx, Cloudflare, Caddy, Traefik ----
const pick = (o, names) => {
  for (const n of names) if (o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n];
  return undefined;
};
const J = {
  ts: ['time', 'timestamp', '@timestamp', 'time_local', 'time_iso8601', 'datetime', 'date', 'EdgeStartTimestamp', 'ts', 'msec', 'StartTime'],
  ip: ['remote_addr', 'client_ip', 'clientip', 'ip', 'ClientIP', 'remote_ip', 'x_forwarded_for', 'c-ip', 'src_ip'],
  method: ['request_method', 'method', 'ClientRequestMethod', 'http_method'],
  path: ['request_uri', 'uri', 'path', 'url', 'ClientRequestURI', 'request_path', 'cs-uri-stem', 'RequestPath'],
  request: ['request', 'request_line'],
  status: ['status', 'response_status', 'EdgeResponseStatus', 'sc-status', 'http_status', 'OriginResponseStatus', 'DownstreamStatus'],
  bytes: ['body_bytes_sent', 'bytes_sent', 'bytes', 'size', 'EdgeResponseBytes', 'response_size', 'sc-bytes', 'DownstreamContentSize'],
  ua: ['http_user_agent', 'user_agent', 'useragent', 'ua', 'ClientRequestUserAgent', 'cs(User-Agent)', 'request_User-Agent'],
  referer: ['http_referer', 'referer', 'referrer', 'ClientRequestReferer', 'request_Referer'],
  time: ['request_time', 'duration', 'response_time', 'time_taken', 'latency', 'Duration', 'OriginResponseDurationMs', 'upstream_response_time'],
  host: ['host', 'http_host', 'server_name', 'ClientRequestHost', 'vhost', 'RequestHost'],
};
function jsonRecord(o) {
  // Caddy : { request: { method, uri, host, remote_ip, headers: { "User-Agent": [...] } }, status, size }
  const req = o.request && typeof o.request === 'object' ? o.request : null;
  const hdr = (name) => {
    const h = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
    return Array.isArray(h) ? h[0] : h;
  };
  const line = typeof o.request === 'string' ? parseRequest(o.request) : null;
  const status = num(pick(o, J.status));
  if (status === null) return null;
  let path = pick(o, J.path) ?? req?.uri ?? line?.path;
  if (path === undefined) return null;
  path = String(path);
  const query = o.query || o.args || o.query_string || o.cs_uri_query;
  if (query && !path.includes('?')) path += (String(query).startsWith('?') ? '' : '?') + query;
  return {
    ts: parseAnyDate(pick(o, J.ts)),
    ip: String(pick(o, J.ip) ?? req?.remote_ip ?? req?.client_ip ?? '-').split(',')[0].trim(),
    method: String(pick(o, J.method) ?? req?.method ?? line?.method ?? ''),
    path,
    status,
    bytes: num(pick(o, J.bytes)) ?? 0,
    ua: String(pick(o, J.ua) ?? hdr('User-Agent') ?? ''),
    referer: String(pick(o, J.referer) ?? hdr('Referer') ?? ''),
    time: (() => {
      const v = num(pick(o, J.time));
      if (v === null) return null;
      // secondes (Nginx request_time 0.123) ou millisecondes (Cloudflare, Traefik en ns…)
      return v > 1e8 ? Math.round(v / 1e6) : v < 100 && !Number.isInteger(v) ? Math.round(v * 1000) : Math.round(v);
    })(),
    host: pick(o, J.host) ?? req?.host ?? null,
  };
}

// ---- Format personnalisé : log_format Nginx (« $remote_addr - $remote_user [$time_local] "$request" $status … ») ----
const VARS = {
  remote_addr: ['ip', String.raw`\S+`], http_x_forwarded_for: ['xff', String.raw`[^"\s]*`], remote_user: ['_', String.raw`\S+`], time_local: ['ts', String.raw`[^\]]+`], time_iso8601: ['ts', String.raw`\S+`], msec: ['ts', String.raw`[\d.]+`],
  request: ['request', String.raw`(?:[^"\\]|\\.)*`], request_method: ['method', String.raw`\S+`], request_uri: ['path', String.raw`\S+`], uri: ['path', String.raw`\S+`], args: ['query', String.raw`\S*`], status: ['status', String.raw`\d{3}`],
  body_bytes_sent: ['bytes', String.raw`\S+`], bytes_sent: ['bytes', String.raw`\S+`], http_referer: ['referer', String.raw`(?:[^"\\]|\\.)*`], http_user_agent: ['ua', String.raw`(?:[^"\\]|\\.)*`], request_time: ['time', String.raw`[\d.-]+`], upstream_response_time: ['utime', String.raw`[^\s"]+`], host: ['host', String.raw`\S+`], server_name: ['host', String.raw`\S+`], http_host: ['host', String.raw`\S+`],
};
export function compileCustomFormat(fmt) {
  const names = [];
  let re = '';
  const src = (fmt || '').trim();
  if (!/\$\w+/.test(src)) throw new Error('Custom log format: use Nginx variables such as $remote_addr, $time_local, "$request", $status, "$http_user_agent"');
  let i = 0;
  while (i < src.length) {
    const m = /^\$(\w+)/.exec(src.slice(i));
    if (m) {
      const v = VARS[m[1]] || ['_' + m[1], String.raw`\S*`];
      names.push(v[0]);
      re += `(${v[1]})`;
      i += m[0].length;
    } else if (/\s/.test(src[i])) {
      re += String.raw`\s+`;
      while (i < src.length && /\s/.test(src[i])) i++;
    } else {
      re += src[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  const regex = new RegExp('^' + re);
  return (line) => {
    const m = regex.exec(line);
    if (!m) return null;
    const r = {};
    names.forEach((n, k) => (r[n] = m[k + 1]));
    const line2 = r.request ? parseRequest(r.request.replace(/\\"/g, '"')) : null;
    const path = r.path ?? line2?.path;
    const status = num(r.status);
    if (path === undefined || status === null) return null;
    const t = num(r.time);
    return { ts: parseAnyDate(r.ts), ip: r.ip || '-', method: r.method || line2?.method || '', path: path + (r.query ? '?' + r.query : ''), status, bytes: num(r.bytes) ?? 0, ua: (r.ua || '').replace(/\\"/g, '"'), referer: r.referer && r.referer !== '-' ? r.referer : '', time: t === null ? null : Math.round(t * 1000), host: r.host || null };
  };
}

// ---- Détection ----
export function detectFormat(lines) {
  const sample = lines.filter((l) => l && l.trim());
  if (sample.some((l) => /^#Fields:/i.test(l))) return 'w3c';
  const first = sample.find((l) => !l.startsWith('#'));
  if (!first) return null;
  if (first.trim().startsWith('{')) return 'json';
  const rec = parseClfLine(first);
  if (rec) return tokens(first).length >= 9 || /"[^"]*"\s*$/.test(first) ? 'combined' : 'common';
  return null;
}

// Lecteur : source = chemin de fichier (gzip reconnu aux octets magiques ou à l'extension) ou flux lisible.
// Appelle onEvent(event) pour chaque ligne lue, onProgress({ lines, parsed, skipped, bytes }) régulièrement.
// Retourne { format, lines, parsed, skipped, fields } ; une erreur « unknown format » si rien n'est reconnu.
export async function parseLog(source, { format = 'auto', custom = '', onEvent, onProgress, signal } = {}) {
  const input = typeof source === 'string' ? openFile(source) : source;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const stats = { format: format === 'auto' ? null : format, lines: 0, parsed: 0, skipped: 0, fields: null };
  let parseLine = null;
  let w3cFields = null;
  const customFn = format === 'custom' ? compileCustomFormat(custom) : null;
  const pending = [];
  const decide = (line) => {
    if (format === 'custom') return customFn;
    const f = stats.format || detectFormat([...pending, line]);
    if (!f) return null;
    stats.format = f;
    if (f === 'json') return (l) => {
      try {
        return jsonRecord(JSON.parse(l));
      } catch {
        return null;
      }
    };
    if (f === 'w3c') return (l) => (w3cFields ? w3cRecord(w3cFields, l.split(/\s+/)) : null);
    return parseClfLine;
  };
  let lastReport = Date.now();
  for await (const raw of rl) {
    if (signal?.aborted) break;
    const line = raw.trim();
    if (!line) continue; // ligne vide (fin de fichier, rotation) : ni lue ni ignorée
    stats.lines++;
    if (line.startsWith('#')) {
      const m = /^#Fields:\s*(.+)$/i.exec(line);
      if (m) {
        w3cFields = m[1].trim().split(/\s+/);
        stats.fields = w3cFields;
        stats.format ||= 'w3c';
        parseLine ||= decide(line);
      }
      stats.skipped++;
      continue;
    }
    if (!parseLine) {
      pending.push(line);
      parseLine = decide(line);
      if (!parseLine) {
        if (pending.length >= 50) throw Object.assign(new Error('Unknown log format'), { code: 'unknown_format', sample: pending.slice(0, 3) });
        stats.skipped++;
        continue;
      }
    }
    const ev = parseLine(line);
    if (!ev || !ev.path) {
      stats.skipped++;
      continue;
    }
    stats.parsed++;
    onEvent?.(ev);
    if (onProgress && stats.lines % 20000 === 0 && Date.now() - lastReport > 300) {
      lastReport = Date.now();
      onProgress({ ...stats });
    }
  }
  if (!stats.parsed && stats.lines) throw Object.assign(new Error('Unknown log format'), { code: 'unknown_format', sample: pending.slice(0, 3) });
  onProgress?.({ ...stats });
  return stats;
}

function openFile(file) {
  const src = createReadStream(file);
  if (!/\.gz$/i.test(file)) return src;
  const gz = createGunzip();
  src.on('error', (e) => gz.destroy(e));
  return src.pipe(gz);
}

// Flux dont on ne connaît pas la nature (téléversement) : gzip aux deux octets magiques, sinon texte tel quel.
export function maybeGunzip(stream) {
  const out = new PassThrough();
  let head = Buffer.alloc(0);
  let target = null; // flux où écrire une fois la nature connue
  const decide = (final) => {
    if (target) return;
    if (head.length >= 2 || final) {
      if (head[0] === 0x1f && head[1] === 0x8b) {
        const gz = createGunzip();
        gz.on('error', (e) => out.destroy(e));
        gz.pipe(out);
        target = gz;
      } else target = out;
      if (head.length) target.write(head);
    }
  };
  stream.on('data', (chunk) => {
    if (target) return void target.write(chunk);
    head = Buffer.concat([head, chunk]);
    decide(false);
  });
  stream.on('end', () => {
    decide(true);
    target?.end();
  });
  stream.on('error', (e) => out.destroy(e));
  return out;
}
