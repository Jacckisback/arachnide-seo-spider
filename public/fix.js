// Interface « Corriger en 1 clic » : paramètres IA, revue des corrections, application, historique.
// Le navigateur ne parle qu'au serveur local ; la clé API ne revient jamais du serveur.
let C = null; // contexte fourni par app.js : { t: () => t, esc, icon, toast, getResult }
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const T = (k, p) => C.t()(k, p);
export const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { key: j.key, data: j });
  return j;
};

// ---------- Paramètres > IA ----------
let aiState = null;
function renderAiSettings() {
  const id = $('#aiProvider').value;
  const p = aiState.providers[id];
  $('#aiModelList').innerHTML = p.models.map((m) => `<option value="${C.esc(m.id)}">${C.esc(m.label)}</option>`).join('');
  $('#aiModel').value = p.model;
  $('#aiKey').value = '';
  $('#aiKey').placeholder = p.hasKey ? '••••••••••••' : id === 'anthropic' ? 'sk-ant-…' : 'sk-…';
  $('#aiKeyState').textContent = p.fromEnv ? T('ai.keyEnv') : p.hasKey ? T('ai.keySaved') : T('ai.keyMissing');
  $('#aiForget').hidden = !p.hasKey || p.fromEnv;
}

async function loadAiSettings() {
  aiState = await api('/api/ai/settings');
  $('#aiProvider').value = aiState.provider;
  renderAiSettings();
}

async function saveAi() {
  const id = $('#aiProvider').value;
  const key = $('#aiKey').value.trim();
  aiState = await api('/api/ai/settings', { provider: id, providers: { [id]: { model: $('#aiModel').value, ...(key ? { apiKey: key } : {}) } } });
  renderAiSettings();
  return aiState;
}

function initAiSettings() {
  $('#aiProvider').addEventListener('change', renderAiSettings);
  $('#aiSave').addEventListener('click', async () => {
    try {
      await saveAi();
      $('#aiStatus').textContent = T('ai.saved');
    } catch (e) {
      $('#aiStatus').textContent = e.message;
    }
  });
  $('#aiTest').addEventListener('click', async () => {
    $('#aiStatus').textContent = T('ai.testing');
    try {
      await saveAi();
      const r = await api('/api/ai/test', { provider: $('#aiProvider').value });
      if (r.ok && r.models?.length) {
        // Liste des modèles disponibles pour ce compte : proposée dans le champ Modèle.
        $('#aiModelList').innerHTML = r.models.map((m) => `<option value="${C.esc(m.id)}">${C.esc(m.label)}</option>`).join('');
      }
      $('#aiStatus').textContent = r.ok ? T('ai.ok', { n: r.models?.length || 0 }) : T('ai.err.' + (r.error === 'no_key' || r.error === 'invalid_key' ? r.error : 'other'), { error: r.error });
    } catch (e) {
      $('#aiStatus').textContent = e.message;
    }
  });
  $('#aiForget').addEventListener('click', async () => {
    const id = $('#aiProvider').value;
    aiState = await api('/api/ai/settings', { providers: { [id]: { apiKey: null } } });
    renderAiSettings();
  });
}

export async function initFix(ctx) {
  C = ctx;
  initAiSettings();
  await loadAiSettings().catch(() => {});
}
export const refreshFixTexts = () => aiState && renderAiSettings();
