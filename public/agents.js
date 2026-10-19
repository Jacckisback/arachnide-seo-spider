// Paramètres → Agents IA : jeton d'accès, URL à donner aux agents (MCP pour Claude, OpenAPI pour ChatGPT),
// URL publique quand Arachnide est exposé en HTTPS, et journal des derniers appels reçus.
// Le jeton ne quitte jamais cette machine : il est lu par l'interface locale uniquement.
let C = {};
let S = null;
const $ = (s) => document.querySelector(s);
const T = (k, p) => C.t()(k, p);
const esc = (s) => C.esc(s);

async function api(body) {
  const r = await fetch('/api/agent/settings', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.key ? T(j.key) : j.error || r.statusText), { key: j.key });
  return j;
}

const copy = async (text, ok) => {
  try {
    await navigator.clipboard.writeText(text);
    C.toast(ok || T('agents.copied'), 'ok');
  } catch {
    C.toast(T('toast.copyFailed'), 'error');
  }
};

const mask = (tok) => (tok ? tok.slice(0, 8) + '•'.repeat(Math.max(8, tok.length - 12)) + tok.slice(-4) : '');

// Extraits prêts à coller : connecteur Claude (URL + jeton), Claude Desktop (fichier de config), Action ChatGPT.
const snippets = (s) => ({
  claudeDesktop: JSON.stringify({ mcpServers: { arachnide: { url: s.mcp_url, headers: { Authorization: 'Bearer ' + s.token } } } }, null, 2),
  chatgpt: `${T('agents.snip.chatgpt1')}: ${s.openapi_url}\n${T('agents.snip.chatgpt2')}: API Key · Bearer · ${s.token}`,
  curl: `curl -X POST ${s.base_url}/api/agent/arachnide_get_summary -H "Authorization: Bearer ${s.token}" -H "Content-Type: application/json" -d '{}'`,
});

function render() {
  const s = S;
  if (!s) return;
  const t = C.t();
  const tokEl = $('#agToken');
  tokEl.textContent = tokEl.dataset.shown === '1' ? s.token : mask(s.token);
  $('#agEnabled').checked = !!s.enabled;
  $('#agFromEnv').hidden = !s.from_env;
  $('#agRotate').disabled = !!s.from_env;
  $('#agMcpUrl').textContent = s.mcp_url;
  $('#agOpenapiUrl').textContent = s.openapi_url;
  if (document.activeElement !== $('#agPublicUrl')) $('#agPublicUrl').value = s.public_url || '';
  $('#agLocalNote').hidden = !!s.public_url;
  $('#agTools').textContent = t('agents.tools', { n: s.tools });
  const log = s.log || [];
  $('#agLog').innerHTML = log.length
    ? `<table class="mini ag-log"><tbody>${log.slice(0, 12).map((l) => `<tr><td class="muted nowrap">${esc(new Date(l.at).toLocaleTimeString(t.lang))}</td><td><span class="chip ${l.via === 'mcp' ? 'info' : 'muted'}">${esc(l.via.toUpperCase())}</span></td><td><code>${esc(l.tool || '')}</code>${l.args && Object.keys(l.args).length ? ` <span class="muted small">${esc(JSON.stringify(l.args))}</span>` : ''}</td></tr>`).join('')}</tbody></table>`
    : `<p class="muted small">${esc(t('agents.logEmpty'))}</p>`;
}

export async function initAgents(ctx) {
  C = ctx;
  const load = async () => {
    try {
      S = await api();
      render();
    } catch (e) {
      $('#agLog').innerHTML = `<p class="muted small">${esc(e.message)}</p>`;
    }
  };
  $('#agReveal').addEventListener('click', () => {
    const el = $('#agToken');
    el.dataset.shown = el.dataset.shown === '1' ? '0' : '1';
    render();
  });
  $('#agCopy').addEventListener('click', () => S && copy(S.token));
  $('#agCopyMcp').addEventListener('click', () => S && copy(S.mcp_url));
  $('#agCopyOpenapi').addEventListener('click', () => S && copy(S.openapi_url));
  $('#agCopyDesktop').addEventListener('click', () => S && copy(snippets(S).claudeDesktop, T('agents.copiedDesktop')));
  $('#agCopyChatgpt').addEventListener('click', () => S && copy(snippets(S).chatgpt, T('agents.copiedChatgpt')));
  $('#agCopyCurl').addEventListener('click', () => S && copy(snippets(S).curl));
  $('#agRotate').addEventListener('click', async () => {
    if (!confirm(T('agents.rotateConfirm'))) return;
    S = await api({ rotate: true });
    $('#agToken').dataset.shown = '1';
    render();
    C.toast(T('agents.rotated'), 'ok');
  });
  $('#agEnabled').addEventListener('change', async (e) => {
    S = await api({ enabled: e.target.checked });
    render();
  });
  $('#agPublicUrl').addEventListener('change', async (e) => {
    try {
      S = await api({ public_url: e.target.value });
      render();
      C.toast(T('agents.saved'), 'ok');
    } catch (err) {
      C.toast(err.message, 'error');
    }
  });
  $('#optionsBtn').addEventListener('click', load);
  // Un appel d'agent vient d'arriver : le journal se met à jour s'il est affiché.
  ctx.onAgentEvent((entry) => {
    if (!S) return;
    S.log = [entry, ...(S.log || [])].slice(0, 50);
    if ($('#configDialog').open) render();
  });
  return load;
}
