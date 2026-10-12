// Moteur de modifications : aperçu → application → vérification → retour arrière.
// Chaque modification appliquée est journalisée (valeur avant / après) dans ~/.arachnide/journal/<site>.jsonl,
// ce qui permet d'annuler un lot entier et de prouver ce qui a été changé, quand et pourquoi.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { FIELDS, ConnectorError } from './connectors/base.mjs';
import { createConnector } from './connectors/index.mjs';
import { manualInstructions } from './connectors/manual.mjs';
import { CONFIG_DIR, resolveSecrets } from './sites.mjs';
import { readLive } from './live.mjs';
import { titlePixels, descPixels } from './pixel.mjs';
import { THRESHOLDS } from './analyze.mjs';

const JOURNAL_DIR = path.join(CONFIG_DIR, 'journal');
const norm = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v ?? null);
const same = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  if (typeof x === 'boolean' || typeof y === 'boolean') return !!x === !!y;
  if (typeof x === 'string' && typeof y === 'string' && /^https?:/i.test(x) && /^https?:/i.test(y)) return x.replace(/\/+$/, '') === y.replace(/\/+$/, '');
  return x === y;
};

// Contrôle et normalisation d'une modification demandée par Claude.
export function validateChange(site, c) {
  const errors = [];
  if (!FIELDS[c.field]) errors.push(`unknown field "${c.field}" (allowed: ${Object.keys(FIELDS).join(', ')})`);
  let url;
  try {
    url = new URL(c.url, site.url).href;
  } catch {
    errors.push(`invalid url "${c.url}"`);
  }
  const host = (h) => h.replace(/^www\./, '');
  if (url && host(new URL(url).hostname) !== host(new URL(site.url).hostname)) errors.push(`${url} is not on ${new URL(site.url).hostname}`);
  if (!site.policy.allowedFields.includes(c.field)) errors.push(`field "${c.field}" is not allowed by this site's policy`);
  let value = c.value;
  if (c.field === 'noindex') {
    if (typeof value !== 'boolean') errors.push('noindex value must be true or false');
  } else if (value !== null && value !== undefined) {
    value = String(value).trim();
    if (c.field === 'seo_title' && value.length > 300) errors.push('seo_title is longer than 300 characters');
    if (c.field === 'meta_description' && value.length > 1000) errors.push('meta_description is longer than 1000 characters');
    if (c.field === 'canonical' || c.field === 'redirect') {
      try {
        value = new URL(value, site.url).href;
      } catch {
        errors.push(`${c.field} value must be a URL`);
      }
    }
  } else value = null;
  if (c.field === 'image_alt' && !c.target) errors.push('image_alt needs "target": the image src');
  if (c.field === 'redirect' && value && url && same(value, url)) errors.push('a page cannot redirect to itself');
  const target = c.target ? new URL(c.target, url || site.url).href : undefined;
  return { change: { url, field: c.field, value, target, reason: c.reason || '' }, errors };
}

// Avertissements SEO sur la nouvelle valeur (longueur en pixels, etc.) : informatifs, non bloquants.
export function seoWarnings(change) {
  const w = [];
  const v = change.value;
  if (change.field === 'seo_title' && v) {
    const px = titlePixels(v);
    if (px > THRESHOLDS.titleMaxPx) w.push(`title is ${px}px wide (> ${THRESHOLDS.titleMaxPx}px): Google will truncate it`);
    if (v.length < THRESHOLDS.titleMin) w.push(`title is short (${v.length} characters)`);
  }
  if (change.field === 'meta_description' && v) {
    const px = descPixels(v);
    if (px > THRESHOLDS.descMaxPx) w.push(`description is ${px}px wide (> ${THRESHOLDS.descMaxPx}px): it will be truncated`);
    if (v.length < THRESHOLDS.descMin) w.push(`description is short (${v.length} characters)`);
  }
  if (change.field === 'image_alt' && v && v.length > 150) w.push('alt text over 150 characters');
  if (change.field === 'noindex' && v === true) w.push('this page will disappear from Google');
  if (change.field === 'redirect' && v) w.push('the old URL will no longer be reachable (301)');
  return w;
}

async function connectorFor(site, opts) {
  const resolved = resolveSecrets(site);
  return createConnector(resolved, opts);
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

const errInfo = (e) => ({ code: e.code || 'error', message: e.message, hint: e.hint || undefined });

// Aperçu : valeur actuelle (via le connecteur et telle que publiée), nouvelle valeur, mode d'application.
export async function previewChanges(site, changes, { fetch, live = true } = {}) {
  const connector = await connectorFor(site, { fetch });
  return mapLimit(changes, 4, async (raw) => {
    const { change, errors } = validateChange(site, raw);
    const item = { ...change, warnings: [], errors };
    if (errors.length) return { ...item, mode: 'invalid' };
    item.warnings = seoWarnings(change);
    const auto = connector.supports(change.field) && !site.policy.readOnly;
    item.mode = auto ? 'auto' : 'manual';
    if (auto) {
      try {
        item.current = await connector.get(change);
      } catch (e) {
        if (e.code === 'unsupported' || e.code === 'not_found') {
          item.mode = 'manual';
          item.note = e.message;
        } else item.error = errInfo(e);
      }
    }
    if (item.mode === 'manual') item.instructions = manualInstructions(site.cms || site.connector, change);
    if (live) {
      try {
        const v = await readLive(change.url, change.field, { target: change.target, fetch });
        item.published = change.field === 'redirect' ? v?.to ?? null : v;
      } catch (e) {
        item.published_error = e.message;
      }
    }
    item.unchanged = same(item.current ?? item.published, change.value);
    return item;
  });
}

async function journalAppend(siteName, entries) {
  await fs.mkdir(JOURNAL_DIR, { recursive: true });
  await fs.appendFile(path.join(JOURNAL_DIR, `${siteName.replace(/[^\w.-]/g, '_')}.jsonl`), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

export async function readJournal(siteName) {
  const text = await fs.readFile(path.join(JOURNAL_DIR, `${siteName.replace(/[^\w.-]/g, '_')}.jsonl`), 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// Application : séquentielle (respect du site), avec lecture avant / après pour chaque champ.
export async function applyChanges(site, changes, { fetch, dryRun = false } = {}) {
  if (site.policy.readOnly) throw Object.assign(new Error(`Site "${site.name}" is read-only (policy.readOnly).`), { code: 'config' });
  if (changes.length > site.policy.maxChangesPerBatch) throw Object.assign(new Error(`Too many changes (${changes.length}); this site allows ${site.policy.maxChangesPerBatch} per batch. Split them into smaller batches.`), { code: 'config' });
  const connector = await connectorFor(site, { fetch });
  const batch = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  const results = [];
  for (const raw of changes) {
    const { change, errors } = validateChange(site, raw);
    const entry = { batch, id: crypto.randomBytes(4).toString('hex'), site: site.name, connector: site.connector, ...change, at: new Date().toISOString() };
    if (errors.length) {
      results.push({ ...entry, status: 'invalid', errors });
      continue;
    }
    if (!connector.supports(change.field)) {
      results.push({ ...entry, status: 'manual', instructions: manualInstructions(site.cms || site.connector, change) });
      continue;
    }
    try {
      entry.before = await connector.get(change);
      if (same(entry.before, change.value)) {
        results.push({ ...entry, status: 'unchanged' });
        continue;
      }
      if (dryRun) {
        results.push({ ...entry, status: 'dry_run' });
        continue;
      }
      await connector.set(change);
      entry.after = await connector.get(change);
      entry.status = same(entry.after, change.value) ? 'applied' : 'mismatch';
    } catch (e) {
      if (e.code === 'manual' || e.code === 'unsupported') {
        results.push({ ...entry, status: 'manual', instructions: e.code === 'manual' ? e.message : manualInstructions(site.cms || site.connector, change), note: e.code === 'unsupported' ? e.message : undefined });
        continue;
      }
      entry.status = 'failed';
      entry.error = errInfo(e);
    }
    results.push(entry);
  }
  const written = results.filter((r) => ['applied', 'mismatch'].includes(r.status));
  if (written.length) await journalAppend(site.name, written);
  return { batch, dryRun, results };
}

// Annule un lot (ou des modifications précises) en réécrivant les valeurs d'origine, dans l'ordre inverse.
export async function rollback(site, { batch, ids } = {}, { fetch } = {}) {
  const journal = await readJournal(site.name);
  const undone = new Set(journal.filter((e) => e.status === 'rolled_back').map((e) => e.of));
  const targets = journal.filter((e) => (e.status === 'applied' || e.status === 'mismatch') && !undone.has(e.id) && (batch ? e.batch === batch : ids?.includes(e.id))).reverse();
  if (!targets.length) throw Object.assign(new Error(`Nothing to roll back for ${batch ? `batch ${batch}` : `ids ${ids?.join(', ')}`} on site ${site.name}.`), { code: 'not_found' });
  const connector = await connectorFor(site, { fetch });
  const rb = `rb-${crypto.randomBytes(3).toString('hex')}`;
  const results = [];
  for (const e of targets) {
    const change = { url: e.url, field: e.field, target: e.target, value: e.before ?? null };
    const r = { batch: rb, id: crypto.randomBytes(4).toString('hex'), of: e.id, site: site.name, url: e.url, field: e.field, target: e.target, at: new Date().toISOString() };
    try {
      r.before = await connector.get(change);
      await connector.set(change);
      r.after = await connector.get(change);
      r.status = same(r.after, change.value) ? 'rolled_back' : 'rollback_mismatch';
    } catch (err) {
      r.status = 'rollback_failed';
      r.error = errInfo(err);
    }
    results.push(r);
  }
  await journalAppend(site.name, results.filter((r) => r.status === 'rolled_back' || r.status === 'rollback_mismatch'));
  return { batch: rb, results };
}

// Vérifie sur le site public que les modifications d'un lot sont visibles (cache et CDN peuvent retarder).
export async function verifyBatch(site, batch, { fetch } = {}) {
  const entries = (await readJournal(site.name)).filter((e) => e.batch === batch && (e.status === 'applied' || e.status === 'mismatch'));
  if (!entries.length) throw Object.assign(new Error(`No applied change in batch ${batch} for site ${site.name}.`), { code: 'not_found' });
  return mapLimit(entries, 4, async (e) => {
    try {
      const v = await readLive(e.url, e.field, { target: e.target, fetch });
      const published = e.field === 'redirect' ? v?.to ?? null : v;
      return { id: e.id, url: e.url, field: e.field, target: e.target, expected: e.value, published, status: same(published, e.value) ? 'live' : 'not_yet_visible' };
    } catch (err) {
      return { id: e.id, url: e.url, field: e.field, status: 'check_failed', error: err.message };
    }
  });
}
