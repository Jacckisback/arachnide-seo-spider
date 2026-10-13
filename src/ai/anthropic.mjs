// Claude — API Messages d'Anthropic.
import { AIProvider, AIError } from './provider.mjs';

export class AnthropicProvider extends AIProvider {
  static id = 'anthropic';
  get base() {
    return this.baseUrl || 'https://api.anthropic.com';
  }
  headers() {
    return { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  }
  async complete({ system, user, maxTokens = 400 }) {
    const res = await this.fetch(this.base + '/v1/messages', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`Anthropic ${res.status}: ${data.error?.message || res.statusText}`, { status: res.status, retryAfter: Number(res.headers.get('retry-after')) || null });
    return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
  async listModels() {
    const res = await this.fetch(this.base + '/v1/models?limit=100', { headers: this.headers(), signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AIError(`Anthropic ${res.status}: ${data.error?.message || res.statusText}`, { status: res.status });
    return (data.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
  }
}
