// Crawls planifiés : chaque planification relance un crawl (quotidien, hebdomadaire ou mensuel), le compare au
// crawl précédent du même site et envoie une alerte par e-mail selon les règles choisies.
// Stockage : ~/.arachnide/schedules.json. Le planificateur tourne dans le serveur (npm start) ou seul (npm run scheduler).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG_DIR } from './sites.mjs';
import { Crawler } from './crawler.mjs';
import { toCrawlerOptions } from './options.mjs';
import { listCrawls, loadCrawl, saveResult } from './store.mjs';
import { sendMail } from './mailer.mjs';
import { getT } from '../public/shared/i18n.js';
import { compareResults } from '../public/shared/compare.js';
import { buildReport } from '../public/shared/report.js';

const FILE = path.join(CONFIG_DIR, 'schedules.json');

export const DEFAULT_ALERTS = { scoreDrop: 5, errors: true, newIssues: false, always: false };

export async function readSchedules() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writeSchedules(list) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2) + '\n');
}

export function normalizeSchedule(input, prev = {}) {
  const url = new URL(String(input.url || prev.url)).href;
  const frequency = ['daily', 'weekly', 'monthly'].includes(input.frequency) ? input.frequency : 'weekly';
  const time = /^\d{1,2}:\d{2}$/.test(input.time || '') ? input.time.padStart(5, '0') : '06:00';
  const emails = (Array.isArray(input.emails) ? input.emails : String(input.emails || '').split(/[,;\s]+/)).map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const options = { ...(input.options || prev.options || {}) };
  for (const k of ['httpPass', 'gscCsv']) delete options[k]; // jamais stockés
  return {
    id: prev.id || crypto.randomBytes(6).toString('hex'),
    name: String(input.name || prev.name || new URL(url).hostname).slice(0, 80),
    url,
    enabled: input.enabled !== false,
    frequency,
    time,
    weekday: Math.min(6, Math.max(0, Number(input.weekday ?? 1))),
    monthday: Math.min(28, Math.max(1, Number(input.monthday ?? 1))),
    emails,
    lang: input.lang || prev.lang || 'en',
    alerts: { ...DEFAULT_ALERTS, ...prev.alerts, ...input.alerts, scoreDrop: Math.max(0, Number(input.alerts?.scoreDrop ?? prev.alerts?.scoreDrop ?? DEFAULT_ALERTS.scoreDrop)) },
    options,
    createdAt: prev.createdAt || new Date().toISOString(),
    lastRun: prev.lastRun || null,
    lastResult: prev.lastResult || null,
  };
}

export async function saveSchedule(input) {
  const list = await readSchedules();
  const i = list.findIndex((s) => s.id === input.id);
  const s = normalizeSchedule(input, i >= 0 ? list[i] : {});
  if (i >= 0) list[i] = s;
  else list.push(s);
  await writeSchedules(list);
  return s;
}

export async function deleteSchedule(id) {
  await writeSchedules((await readSchedules()).filter((s) => s.id !== id));
}

async function updateSchedule(id, patch) {
  const list = await readSchedules();
  const s = list.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
  await writeSchedules(list);
  return s;
}

// Dernière échéance prévue au plus tard à `now` (heure locale de la machine).
export function lastDue(s, now = new Date()) {
  const [h, m] = s.time.split(':').map(Number);
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h, m);
  if (s.frequency === 'daily') {
    if (d > now) d.setDate(d.getDate() - 1);
  } else if (s.frequency === 'weekly') {
    d.setDate(d.getDate() - ((d.getDay() - s.weekday + 7) % 7));
    if (d > now) d.setDate(d.getDate() - 7);
  } else {
    d.setDate(s.monthday);
    if (d > now) d.setMonth(d.getMonth() - 1);
  }
  return d;
}

export function nextRun(s, now = new Date()) {
  const last = lastDue(s, now);
  const n = new Date(last);
  if (s.frequency === 'daily') n.setDate(n.getDate() + 1);
  else if (s.frequency === 'weekly') n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
}

// Une échéance non exécutée (machine éteinte à l'heure prévue) est rattrapée au démarrage suivant.
export function isDue(s, now = new Date()) {
  if (!s.enabled) return false;
  const due = lastDue(s, now);
  const since = new Date(s.lastRun || s.createdAt);
  return due > since;
}

// Règles d'alerte → liste d'alertes { key, params } (vide = pas d'e-mail, sauf « toujours »).
export function evaluateAlerts(cur, prev, rules = DEFAULT_ALERTS) {
  const alerts = [];
  if (!prev) return { alerts, compare: null };
  const c = compareResults(cur, prev);
  if (rules.scoreDrop > 0 && prev.summary.score - cur.summary.score >= rules.scoreDrop) alerts.push({ key: 'alert.scoreDrop', params: { from: prev.summary.score, to: cur.summary.score } });
  if (rules.errors) {
    for (const i of [...c.appeared, ...c.worsened, ...c.changed.filter((x) => x.newCount)].filter((x) => x.severity === 'error')) alerts.push({ key: 'alert.errors', params: { id: i.id, from: i.prev, to: i.cur } });
  }
  if (rules.newIssues) {
    for (const i of c.appeared.filter((x) => x.severity !== 'error' || !rules.errors)) alerts.push({ key: 'alert.newIssue', params: { id: i.id, to: i.cur, severity: i.severity } });
  }
  return { alerts, compare: c };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function alertEmail({ R, prev, alerts, compare, t, schedule }) {
  const host = new URL(R.meta.startUrl).hostname;
  const delta = prev ? R.summary.score - prev.summary.score : null;
  const issueLabel = (id) => t('issue.' + id + '.label', R.issues.find((i) => i.id === id)?.params || prev?.issues.find((i) => i.id === id)?.params || {});
  const lines = alerts.map((a) => (a.key === 'alert.scoreDrop' ? t('alert.scoreDrop', a.params) : `${issueLabel(a.params.id)} : ${a.params.from ?? 0} → ${a.params.to}`));
  const subject = `[Arachnide] ${host} — ${t('dash.health')} ${R.summary.score}/100${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}${alerts.length ? ` — ${t('alert.count', { n: alerts.length })}` : ''}`;
  const row = (k, a, b) => `<tr><td style="padding:4px 10px;color:#5b6578">${esc(k)}</td><td style="padding:4px 10px;text-align:right">${esc(a ?? '—')}</td><td style="padding:4px 10px;text-align:right"><b>${esc(b)}</b></td></tr>`;
  const html = `<div style="font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1b1f27;max-width:640px">
<h2 style="margin:0 0 4px">${esc(schedule?.name || host)}</h2>
<p style="margin:0 0 14px;color:#5b6578">${esc(R.meta.startUrl)} · ${esc(new Date(R.meta.finishedAt).toLocaleString(t.lang))}</p>
${alerts.length ? `<div style="border-left:4px solid #d93036;background:#fdf0f0;padding:10px 14px;margin-bottom:14px"><b>${esc(t('alert.title'))}</b><ul style="margin:6px 0 0;padding-left:18px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : `<p>${esc(t('alert.none'))}</p>`}
<table style="border-collapse:collapse;margin-bottom:14px"><tr><th></th><th style="padding:4px 10px;color:#5b6578;font-weight:500">${esc(t('alert.before'))}</th><th style="padding:4px 10px;color:#5b6578;font-weight:500">${esc(t('alert.now'))}</th></tr>
${row(t('dash.health'), prev?.summary.score, `${R.summary.score}/100 (${R.summary.grade})`)}${row(t('sev.errors'), prev?.summary.errors, R.summary.errors)}${row(t('sev.warnings'), prev?.summary.warnings, R.summary.warnings)}${row(t('dash.urls'), prev?.summary.totalUrls, R.summary.totalUrls)}</table>
${compare?.fixed.length ? `<p style="color:#0c8a4a">✓ ${esc(t('alert.fixed', { n: compare.fixed.length }))}</p>` : ''}
<p style="color:#5b6578;font-size:12px">${esc(t('alert.footer'))}</p></div>`;
  const text = `${subject}\n\n${lines.join('\n') || t('alert.none')}\n\n${R.meta.startUrl}`;
  return { subject, html, text };
}

// Exécute une planification : crawl, sauvegarde, comparaison, e-mail.
export async function runSchedule(schedule, { onProgress, now = new Date() } = {}) {
  const t = await getT(schedule.lang || 'en');
  const startedAt = now.toISOString();
  await updateSchedule(schedule.id, { lastRun: startedAt, lastResult: { status: 'running', at: startedAt } });
  try {
    const c = new Crawler(schedule.url, toCrawlerOptions(schedule.options || {}));
    if (onProgress) c.on('progress', onProgress);
    const R = await c.start();
    const host = new URL(R.meta.startUrl).hostname;
    const previous = (await listCrawls()).find((x) => x.host === host && String(x.finishedAt) < R.meta.finishedAt);
    const file = await saveResult(R);
    const prev = previous ? await loadCrawl(previous.file).catch(() => null) : null;
    const { alerts, compare } = evaluateAlerts(R, prev, schedule.alerts);
    let emailed = false;
    let mailError = null;
    if (schedule.emails?.length && (alerts.length || schedule.alerts?.always)) {
      try {
        const mail = alertEmail({ R, prev, alerts, compare, t, schedule });
        const report = buildReport(R, { title: schedule.name, maxUrls: 10, compare }, t);
        await sendMail({ to: schedule.emails, ...mail, attachments: [{ filename: `${host}_report.html`, content: report, contentType: 'text/html' }] });
        emailed = true;
      } catch (e) {
        mailError = e.message;
      }
    }
    const lastResult = { status: 'ok', at: new Date().toISOString(), file, score: R.summary.score, grade: R.summary.grade, alerts: alerts.length, emailed, mailError };
    await updateSchedule(schedule.id, { lastResult });
    return { ...lastResult, alertList: alerts };
  } catch (e) {
    const lastResult = { status: 'error', at: new Date().toISOString(), error: e.message };
    await updateSchedule(schedule.id, { lastResult });
    return lastResult;
  }
}

// Boucle du planificateur : vérifie chaque minute, exécute les planifications dues l'une après l'autre.
export function startScheduler({ log = console.log, interval = 60000, canRun = () => true } = {}) {
  let busy = false;
  const tick = async () => {
    if (busy || !canRun()) return;
    busy = true;
    try {
      for (const s of await readSchedules()) {
        if (!isDue(s)) continue;
        log(`[scheduler] ${s.name}: crawling ${s.url}`);
        const r = await runSchedule(s);
        log(`[scheduler] ${s.name}: ${r.status === 'ok' ? `score ${r.score}, ${r.alerts} alert(s)${r.emailed ? ', email sent' : ''}${r.mailError ? `, email failed: ${r.mailError}` : ''}` : `failed: ${r.error}`}`);
      }
    } catch (e) {
      log(`[scheduler] ${e.message}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, interval);
  timer.unref?.();
  setTimeout(tick, 2000).unref?.();
  return { stop: () => clearInterval(timer), tick };
}
