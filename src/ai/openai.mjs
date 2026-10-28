// ChatGPT — API Chat Completions d'OpenAI (réponse JSON imposée).
import { AIProvider, AIError } from './provider.mjs';

export class OpenAIProvider extends AIProvider {
  static id = 'openai';
  get base() {
    return this.baseUrl || 'https://api.openai.com';
  }
  headers() {
    return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }
  async complete({ system, user, maxTokens = 400 }) {
    const res = await this.fetch(this.base + '/v1/chat/completions', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`OpenAI ${res.status}: ${data.error?.message || res.statusText}`, { status: res.status, retryAfter: Number(res.headers.get('retry-after')) || null });
    return data.choices?.[0]?.message?.content || '';
  }
  // Modèles de texte utilisables ici : pas les modèles audio, temps réel, image, recherche, code ou spécialisés, ni les
  // instantanés datés quand l'alias existe, ni les modèles déjà retirés (champ shutdown_date de l'API). Un modèle dont
  // le retrait est annoncé reste proposé, avec sa date, pour ne pas casser un réglage en cours. Les plus récents d'abord.
  async listModels() {
    const res = await this.fetch(this.base + '/v1/models', { headers: this.headers(), signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`OpenAI ${res.status}: ${data.error?.message || res.statusText}`, { status: res.status });
    const today = new Date().toISOString().slice(0, 10);
    const all = (data.data || []).filter((m) => typeof m?.id === 'string');
    const ids = new Set(all.map((m) => m.id));
    const text = all.filter((m) => /^(gpt-|o\d|chatgpt)/.test(m.id) && !/(audio|realtime|tts|transcribe|whisper|image|search|live|codex|cyber|rosalind|embedding|moderation|instruct|vision|preview)/.test(m.id));
    const kept = text.filter((m) => {
      const shutdown = shutdownOf(m);
      if (shutdown && shutdown <= today) return false;
      // gpt-5.4-2026-03-05 : instantané daté d'un alias présent → l'alias suffit.
      const dated = /^(.*)-\d{4}-\d{2}-\d{2}$/.exec(m.id);
      return !(dated && ids.has(dated[1]));
    });
    return kept.map((m) => ({ id: m.id, label: shutdownOf(m) ? `${m.id} · retires ${shutdownOf(m)}` : m.id, shutdown: shutdownOf(m) || undefined })).sort((a, b) => rank(b.id) - rank(a.id) || a.id.localeCompare(b.id));
  }
}

// Date de retrait annoncée par l'API (ISO « AAAA-MM-JJ » ou horodatage Unix), sinon null.
function shutdownOf(m) {
  const v = m.shutdown_date ?? m.deprecation?.shutdown_date ?? null;
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v * (v > 1e11 ? 1 : 1000)).toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
// Ordre d'affichage : génération décroissante (gpt-6.1 > gpt-6 > gpt-5.6 > … > o4 > o3 > gpt-4.1 > gpt-4o).
function rank(id) {
  const g = /^gpt-(\d+(?:\.\d+)?)/.exec(id);
  if (g) return 1000 + Number(g[1]) * 10;
  const o = /^o(\d+)/.exec(id);
  if (o) return 900 + Number(o[1]);
  return 0;
}
