// Connecteur GitHub : pour les sites en code (Lovable, Bolt.new, React, Next.js, Astro, HTML statique).
// Un lot de corrections validées = une branche arachnide/fix-AAAAMMJJ-HHMM + une Pull Request à relire et fusionner.
// Rien n'est publié tant que la PR n'est pas fusionnée (Lovable synchronise ensuite la branche par défaut).
// Token « fine-grained » limité à un dépôt : Contents (read/write) + Pull requests (read/write).
import path from 'node:path';
import { CMSConnector } from './connectors.mjs';
import { detectFramework, isSource, applyToSource, rankFiles } from './locate.mjs';
import { CONFIG_DIR } from '../sites.mjs';
import { readJsonFile, writeJsonFile } from '../secret.mjs';

const KINDS = new Set(['seo_title', 'meta_description', 'h1', 'image_alt', 'link', 'json_ld']);
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64').toString('utf8');
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const batchesFile = (repo) => path.join(CONFIG_DIR, 'github', repo.replace(/[^\w.-]/g, '_') + '.json');

export class GitHubFixConnector extends CMSConnector {
  static id = 'github';
  static batch = true;
  constructor(conn, opts = {}) {
    super(conn, opts);
    this.repo = String(conn.repo || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    this.api = opts.githubApi || conn.apiBase || 'https://api.github.com';
    this.provider = opts.provider || null; // IA facultative : localisation quand l'emplacement est ambigu
    this.files = new Map();
  }

  async gh(route, { method = 'GET', body } = {}) {
    if (!this.conn.token) throw Object.assign(new Error('GitHub token missing'), { code: 'config' });
    const res = await this.fetch(this.api + route, {
      method,
      headers: { authorization: `Bearer ${this.conn.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Arachnide-SEO-Spider', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status}: ${data?.message || res.statusText}`), { status: res.status, code: res.status === 401 ? 'auth' : res.status === 404 ? 'not_found' : 'github' });
    return data;
  }

  async testConnection() {
    if (!/^[\w.-]+\/[\w.-]+$/.test(this.repo)) return { ok: false, error: 'Repository must be "owner/name".' };
    const r = await this.gh(`/repos/${this.repo}`);
    if (r.permissions && !r.permissions.push) return { ok: false, error: 'The token cannot write to this repository (Contents: Read and write).' };
    return { ok: true, details: `${r.full_name} · ${r.default_branch}` };
  }

  canApply(fix) {
    return KINDS.has(fix.target.kind);
  }

  async baseBranch() {
    if (this.conn.branch) return this.conn.branch;
    return (await this.gh(`/repos/${this.repo}`)).default_branch;
  }

  async readFile(p, ref) {
    if (!this.files.has(p)) this.files.set(p, this.gh(`/repos/${this.repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`).then((f) => ({ sha: f.sha, content: unb64(f.content || '') })));
    return this.files.get(p);
  }

  // Calcule les modifications sans rien écrire : { files: [{ path, sha, before, after, fixes }], unresolved: [fix] }.
  async plan(fixes) {
    const base = await this.baseBranch();
    const ref = await this.gh(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(base)}`);
    const tree = await this.gh(`/repos/${this.repo}/git/trees/${ref.object.sha}?recursive=1`);
    const prefix = String(this.conn.basePath || '').replace(/^\/+|\/+$/g, '');
    const all = tree.tree.filter((e) => e.type === 'blob' && isSource(e.path) && (!prefix || e.path.startsWith(prefix + '/'))).map((e) => e.path);
    const pkgPath = prefix ? `${prefix}/package.json` : 'package.json';
    const pkg = tree.tree.some((e) => e.path === pkgPath) ? JSON.parse((await this.readFile(pkgPath, base)).content) : null;
    const framework = detectFramework(pkg);
    const edits = new Map();
    const unresolved = [];
    for (const fix of fixes) {
      let done = false;
      for (const p of rankFiles(all, fix.url, framework).slice(0, 40)) {
        const cur = edits.get(p) || { path: p, ...(await this.readFile(p, base)), fixes: [] };
        const before = cur.after ?? cur.content;
        const r = applyToSource(before, fix);
        if (r.count) {
          edits.set(p, { ...cur, before: cur.before ?? cur.content, after: r.content, fixes: [...cur.fixes, fix.id] });
          done = true;
          break;
        }
      }
      if (!done && this.provider) done = await this.aiLocate(fix, rankFiles(all, fix.url, framework).slice(0, 3), base, edits);
      if (!done) unresolved.push(fix);
    }
    return { base, baseSha: ref.object.sha, framework, files: [...edits.values()].map(({ path: p, sha, before, after, fixes: ids }) => ({ path: p, sha, before, after, fixes: ids })), unresolved };
  }

  // Emplacement ambigu : l'IA propose un remplacement exact { path, search, replace } dans l'un des fichiers candidats.
  // Il n'est retenu que si « search » existe tel quel dans le fichier ; le diff est montré avant la création de la PR.
  async aiLocate(fix, candidates, base, edits) {
    const files = [];
    for (const p of candidates) files.push({ path: p, content: (edits.get(p)?.after ?? (await this.readFile(p, base)).content).slice(0, 12000) });
    const system = 'You edit website source code. Answer with ONLY a JSON object {"path": string, "search": string, "replace": string}: "search" must be an exact substring of the file (a few lines), "replace" the same text with the change applied. If no file fits, answer {"path": ""}.';
    const user = `Change for page ${fix.url}: set ${fix.target.kind}${fix.target.selector ? ` (${fix.target.selector})` : ''} from ${JSON.stringify(fix.oldValue)} to ${JSON.stringify(fix.newValue)}.\n\n${files.map((f) => `=== ${f.path} ===\n${f.content}`).join('\n\n')}`;
    try {
      const text = await this.provider.complete({ system, user, maxTokens: 1500 });
      const a = JSON.parse(String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1));
      const f = files.find((x) => x.path === a.path);
      if (!f || !a.search || !f.content.includes(a.search) || a.search === a.replace) return false;
      const cur = edits.get(f.path) || { path: f.path, ...(await this.readFile(f.path, base)), fixes: [] };
      const before = cur.after ?? cur.content;
      edits.set(f.path, { ...cur, before: cur.before ?? cur.content, after: before.replace(a.search, () => a.replace), fixes: [...cur.fixes, fix.id], ai: true });
      return true;
    } catch {
      return false;
    }
  }

  async preview(fixes) {
    const p = await this.plan(fixes);
    return { repo: this.repo, base: p.base, framework: p.framework, files: p.files.map(({ path: f, before, after, fixes: ids }) => ({ path: f, before, after, fixes: ids })), unresolved: p.unresolved.map((f) => f.id) };
  }

  async applyBatch(fixes, { batch }) {
    const p = await this.plan(fixes);
    if (!p.files.length) return { ok: false, error: 'not_found_in_code', unresolved: p.unresolved.map((f) => f.id) };
    const branch = `arachnide/fix-${stamp()}`;
    await this.gh(`/repos/${this.repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: p.baseSha } });
    for (const f of p.files) {
      // https://docs.github.com/rest/repos/contents#create-or-update-file-contents
      await this.gh(`/repos/${this.repo}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: { message: `SEO: ${f.fixes.length} fix(es) in ${f.path} (Arachnide)`, content: b64(f.after), sha: f.sha, branch } });
    }
    const byId = new Map(fixes.map((x) => [x.id, x]));
    const cell = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);
    const rows = p.files.flatMap((f) => f.fixes.map((id) => byId.get(id)).map((x) => `| ${cell(x.url)} | ${cell(x.issueType)} · ${cell(x.target.kind)} | ${cell(x.oldValue)} | ${cell(x.newValue)} | \`${f.path}\` |`));
    const body = [
      `Corrections SEO validées dans **Arachnide SEO Spider** (lot \`${batch}\`).`,
      '',
      '| URL | Problème | Avant | Après | Fichier |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      p.unresolved.length ? `⚠️ ${p.unresolved.length} correction(s) non localisée(s) dans le code : à appliquer à la main.\n` : '',
      'Relisez le diff, puis fusionnez. Lovable : la branche par défaut est synchronisée automatiquement après la fusion.',
    ].join('\n');
    const pr = await this.gh(`/repos/${this.repo}/pulls`, { method: 'POST', body: { title: `SEO : ${rows.length} correction(s) Arachnide`, head: branch, base: p.base, body } });
    const store = await readJsonFile(batchesFile(this.repo), {});
    store[batch] = { branch, number: pr.number, url: pr.html_url, base: p.base, files: p.files.map((f) => ({ path: f.path, sha: f.sha })) };
    await writeJsonFile(batchesFile(this.repo), store);
    return { ok: true, pr: pr.html_url, branch, unresolved: p.unresolved.map((f) => f.id) };
  }

  // Annulation : PR pas encore fusionnée → fermée et branche supprimée ; déjà fusionnée → nouvelle PR qui remet les
  // fichiers dans leur état d'avant le lot.
  async rollbackBatch(fixes, { batch }) {
    const store = await readJsonFile(batchesFile(this.repo), {});
    const info = store[fixes[0]?.batch];
    if (!info) return { ok: false, error: 'unknown_batch' };
    const pr = await this.gh(`/repos/${this.repo}/pulls/${info.number}`);
    if (!pr.merged) {
      if (pr.state === 'open') await this.gh(`/repos/${this.repo}/pulls/${info.number}`, { method: 'PATCH', body: { state: 'closed' } });
      await this.gh(`/repos/${this.repo}/git/refs/heads/${info.branch.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }).catch(() => {});
      return { ok: true, pr: pr.html_url };
    }
    const ref = await this.gh(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(info.base)}`);
    const branch = `arachnide/revert-${stamp()}`;
    await this.gh(`/repos/${this.repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: ref.object.sha } });
    for (const f of info.files) {
      const old = await this.gh(`/repos/${this.repo}/git/blobs/${f.sha}`);
      const cur = await this.gh(`/repos/${this.repo}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      await this.gh(`/repos/${this.repo}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: { message: `Revert Arachnide SEO fixes in ${f.path}`, content: old.content.replace(/\n/g, ''), sha: cur.sha, branch } });
    }
    const rev = await this.gh(`/repos/${this.repo}/pulls`, { method: 'POST', body: { title: `Annulation des corrections SEO Arachnide (${fixes[0].batch})`, head: branch, base: info.base, body: `Remet les fichiers modifiés par ${info.url} dans leur état d'avant. Vérifiez qu'aucune autre modification n'a été faite entre-temps sur ces fichiers.` } });
    return { ok: true, pr: rev.html_url };
  }
}
