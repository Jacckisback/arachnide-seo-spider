// IA locale — tout serveur compatible avec l'API OpenAI (LM Studio, Ollama, llama.cpp server, vLLM, LocalAI, Jan…).
// Rien ne sort de la machine (ou du réseau local) : pas de clé obligatoire, coût nul. La consigne JSON est donnée dans
// le message, sans response_format (LM Studio refuse { type: "json_object" }).
// Modèles qui raisonnent (Qwen3, DeepSeek-R1, gpt-oss, Magistral…) : la réflexion arrive soit dans le texte entre
// <think>…</think> (retirée), soit à part (reasoning_content chez LM Studio / llama.cpp, reasoning chez Ollama). Elle
// consomme des jetons avant la réponse : le plafond est large, et si le texte final est vide, le JSON est cherché à la
// fin de la réflexion ; sinon une erreur explicite remplace la proposition vide.
import { AIError } from './provider.mjs';
import { makeFix } from '../fix/schema.mjs';
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
          // Les modèles qui raisonnent consomment des milliers de jetons avant de répondre : c'est gratuit, on laisse large.
          max_tokens: LOCAL_MAX_TOKENS,
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
    const choice = data.choices?.[0] || {};
    const msg = choice.message || {};
    const text = stripThinking(msg.content || '');
    if (text) return text;
    // Réponse vide : le JSON est peut-être à la fin de la réflexion (certains modèles y écrivent la réponse).
    const reasoning = String(msg.reasoning_content || msg.reasoning || msg.thinking || '');
    const json = lastJsonObject(reasoning);
    if (json) return json;
    if (choice.finish_reason === 'length') throw new AIError(`The local model "${model}" used all its ${LOCAL_MAX_TOKENS} tokens reasoning without answering: disable thinking for this model (LM Studio: model settings › Reasoning off; Ollama: a non-thinking variant) or use a bigger context.`, { code: 'reasoning_length' });
    throw new AIError(`The local model "${model}" returned an empty answer${reasoning ? ' (only reasoning)' : ''}.`, { code: 'empty' });
  }
  // Réponse vide ou réflexion sans fin : correction « échouée » avec la raison, visible sur la carte, au lieu d'une
  // erreur muette (serveur injoignable : erreur globale, comme avant).
  async generateFix(issue, ctx) {
    try {
      return await super.generateFix(issue, ctx);
    } catch (e) {
      if (e.code !== 'reasoning_length' && e.code !== 'empty') throw e;
      return makeFix({ issueType: issue.id, url: ctx.url, kind: ctx.kind, selector: ctx.target || null, oldValue: ctx.oldValue ?? null, newValue: null, method: 'ai', provider: this.id, confidence: 0, rationale: '', status: 'failed', error: e.message });
    }
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

const LOCAL_MAX_TOKENS = 16000;

// Dernier objet JSON équilibré d'un texte (accolades dans les chaînes ignorées), s'il contient une réponse attendue.
export function lastJsonObject(text) {
  const s = String(text || '');
  for (let end = s.lastIndexOf('}'); end >= 0; end = s.lastIndexOf('}', end - 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = end; i >= 0; i--) {
      const c = s[i];
      if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (inStr) continue;
      if (c === '}') depth++;
      else if (c === '{' && --depth === 0) {
        const cand = s.slice(i, end + 1);
        try {
          const o = JSON.parse(cand);
          if (o && typeof o === 'object' && 'newValue' in o) return cand;
        } catch {
          /* pas du JSON : on continue vers la gauche */
        }
        break;
      }
    }
  }
  return null;
}

export const stripThinking = (t) =>
  String(t)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*<\/think>/i, '') // balise ouvrante dans le gabarit de discussion, seule la fermante arrive
    .replace(/<think>[\s\S]*$/i, '') // réflexion coupée par la limite de jetons : rien d'exploitable
    .trim();

function unreachable(root, e) {
  const code = e?.cause?.code || e?.name || 'Error';
  return new AIError(`Local AI server unreachable at ${root} (${code}). Is LM Studio / Ollama running with its server started?`, { code: 'unreachable' });
}
