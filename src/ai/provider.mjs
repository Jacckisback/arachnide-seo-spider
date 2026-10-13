// Interface commune des fournisseurs d'IA : generateFix(issue, context) → Fix.
// Chaque fournisseur implémente seulement complete({ system, user, maxTokens }) → texte ; la consigne, la validation
// Zod et la nouvelle tentative unique sont communes. Ajouter un fournisseur = une classe avec complete().
import { AIAnswerSchema, makeFix } from '../fix/schema.mjs';
import { TARGETS } from '../fix/catalog.mjs';

export class AIError extends Error {
  constructor(message, { status = 0, retryAfter = null, code = 'ai' } = {}) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

const KIND_LABEL = {
  seo_title: 'the SEO <title> tag',
  meta_description: 'the meta description',
  h1: 'the H1 heading',
  image_alt: 'the alt text of one image',
  json_ld: 'a JSON-LD structured data block (Article, Organization, FAQPage or Product — whichever fits the page; FAQPage only if the page really contains questions and answers)',
};

export function buildPrompt(issue, ctx) {
  const t = TARGETS[ctx.kind];
  const system = [
    'You are a senior SEO copywriter. You write one replacement value for a web page element.',
    `Write in the language of the page (${ctx.lang || 'detect it from the content'}). Never invent facts, prices, dates or claims that are not in the page.`,
    'Answer with ONLY a JSON object: {"newValue": string, "rationale": string (one short sentence, in the page language), "confidence": number between 0 and 1}.',
  ].join('\n');
  const lines = [
    `Task: write ${KIND_LABEL[ctx.kind]} for ${ctx.url}.`,
    `Detected problem: ${issue.id}${ctx.detail ? ` (${ctx.detail})` : ''}.`,
    t ? `Length: ${t.min}-${t.max} characters.` : '',
    ctx.kind === 'json_ld' ? 'newValue must be the raw JSON-LD object as a JSON string (with "@context": "https://schema.org"), using only facts present on the page.' : '',
    ctx.kind === 'image_alt' ? `Image: ${ctx.target}. Describe what the image shows in context; do not start with "image of".` : '',
    `Current value: ${ctx.oldValue == null || ctx.oldValue === '' ? '(none)' : JSON.stringify(ctx.oldValue)}`,
    `Page title: ${ctx.title || '(none)'}`,
    `Page H1: ${ctx.h1 || '(none)'}`,
    ctx.siblings?.length ? `Values already used on other pages of the site (yours must be different):\n- ${ctx.siblings.join('\n- ')}` : '',
    `Page content (excerpt):\n"""\n${ctx.excerpt || ''}\n"""`,
  ];
  return { system, user: lines.filter(Boolean).join('\n') };
}

// Extrait le premier objet JSON d'une réponse (tolère un bloc ```json).
export function extractJson(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('no JSON object in the answer');
  return JSON.parse(s.slice(i, j + 1));
}

export class AIProvider {
  static id = 'base';
  constructor({ apiKey, model, fetch = globalThis.fetch, baseUrl } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetch;
    this.baseUrl = baseUrl;
  }
  get id() {
    return this.constructor.id;
  }
  async complete() {
    throw new Error('not implemented');
  }
  async listModels() {
    return [];
  }

  // Une réponse invalide (JSON ou schéma) déclenche UNE nouvelle tentative, puis un Fix « failed ».
  async generateFix(issue, ctx) {
    const { system, user } = buildPrompt(issue, ctx);
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.complete({ system, user: attempt ? `${user}\n\nYour previous answer was invalid (${lastError}). Reply with the JSON object only.` : user, maxTokens: ctx.kind === 'json_ld' ? 1500 : 400 });
      try {
        const a = AIAnswerSchema.parse(extractJson(text));
        if (ctx.kind === 'json_ld') JSON.parse(a.newValue);
        return makeFix({ issueType: issue.id, url: ctx.url, kind: ctx.kind, selector: ctx.target || null, oldValue: ctx.oldValue ?? null, newValue: a.newValue.trim(), method: 'ai', provider: this.id, confidence: a.confidence, rationale: a.rationale.slice(0, 600) });
      } catch (e) {
        lastError = (e.issues ? e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') : e.message).slice(0, 200);
      }
    }
    return makeFix({ issueType: issue.id, url: ctx.url, kind: ctx.kind, selector: ctx.target || null, oldValue: ctx.oldValue ?? null, newValue: null, method: 'ai', provider: this.id, confidence: 0, rationale: '', status: 'failed', error: `Invalid AI answer after 2 attempts: ${lastError}` });
  }

  // Plan d'action en texte pour un problème non automatisable (aucune application possible).
  async generatePlan(issue, ctx) {
    const system = `You are a senior technical SEO consultant. Write a short, concrete action plan (max 8 bullet points) in ${ctx.lang || 'English'}. No preamble.`;
    const user = `Problem "${issue.id}" on ${issue.count} URL(s) of ${ctx.site}. Examples:\n${ctx.examples.join('\n')}\nExplanation: ${ctx.desc || ''}`;
    return (await this.complete({ system, user, maxTokens: 700 })).trim();
  }
}
