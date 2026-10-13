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
  async listModels() {
    const res = await this.fetch(this.base + '/v1/models', { headers: this.headers(), signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`OpenAI ${res.status}: ${data.error?.message || res.statusText}`, { status: res.status });
    return (data.data || []).filter((m) => /^(gpt-|o\d|chatgpt)/.test(m.id) && !/(audio|realtime|tts|transcribe|image|search)/.test(m.id)).map((m) => ({ id: m.id, label: m.id })).sort((a, b) => a.id.localeCompare(b.id));
  }
}
