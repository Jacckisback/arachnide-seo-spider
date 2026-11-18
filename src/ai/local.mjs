// IA locale — tout serveur compatible avec l'API OpenAI (LM Studio, Ollama, llama.cpp server, vLLM, LocalAI, Jan…).
// Rien ne sort de la machine (ou du réseau local) : pas de clé obligatoire, coût nul. La consigne JSON est donnée dans
// le message, sans response_format (LM Studio refuse { type: "json_object" }) ; les blocs de réflexion <think> des
// modèles qui raisonnent sont retirés avant la lecture du JSON.
import { AIError } from './provider.mjs';
import { OpenAIProvider } from './openai.mjs';

export const LOCAL_DEFAULT_URL = 'http://localhost:1234/v1'; // LM Studio ; Ollama : http://localhost:11434/v1

// URL saisie → racine …/v1 (« localhost:11434 » ou « http://127.0.0.1:1234/ » suffisent).
export function normalizeLocalUrl(u) {
  let s = String(u || '').trim();
  if (!s) return LOCAL_DEFAULT_URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return null; // ftp://, file://…
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  let path = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '');
  if (!path) path = '/v1';
  return url.origin + path;
}

export class LocalProvider extends OpenAIProvider {
  static id = 'local';
  get root() {
    return normalizeLocalUrl(this.baseUrl) || LOCAL_DEFAULT_URL;
  }
  headers() {
    return { ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}), 'content-type': 'application/json' };
  }
  // Sans modèle choisi : le premier modèle chargé sur le serveur.
  async resolveModel() {
    if (this.model) return this.model;
    const list = await this.listModels();
    if (!list.length) throw new AIError('No model loaded on the local server', { code: 'no_model' });
    this.model = list[0].id;
    return this.model;
  }
  async complete({ system, user, maxTokens = 400 }) {
    const model = await this.resolveModel();
    let res;
    try {
      res = await this.fetch(this.root + '/chat/completions', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          // Les modèles qui raisonnent consomment des jetons avant de répondre : marge confortable, c'est gratuit.
          max_tokens: Math.max(maxTokens * 4, 2000),
          temperature: 0.3,
          stream: false,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(300000), // un modèle local sur CPU peut être lent
      });
    } catch (e) {
      throw unreachable(this.root, e);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`Local AI ${res.status}: ${data.error?.message || data.error || res.statusText}`, { status: res.status });
    return stripThinking(data.choices?.[0]?.message?.content || '');
  }
  async listModels() {
    let res;
    try {
      res = await this.fetch(this.root + '/models', { headers: this.headers(), signal: AbortSignal.timeout(10000) });
    } catch (e) {
      throw unreachable(this.root, e);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`Local AI ${res.status}: ${data.error?.message || data.error || res.statusText}`, { status: res.status });
    // Les modèles d'embedding ne savent pas rédiger.
    return (data.data || data.models || [])
      .map((m) => (typeof m === 'string' ? m : m?.id || m?.name))
      .filter((id) => typeof id === 'string' && id && !/embed/i.test(id))
      .map((id) => ({ id, label: id }));
  }
}

export const stripThinking = (t) => String(t).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim();

function unreachable(root, e) {
  const code = e?.cause?.code || e?.name || 'Error';
  return new AIError(`Local AI server unreachable at ${root} (${code}). Is LM Studio / Ollama running with its server started?`, { code: 'unreachable' });
}
