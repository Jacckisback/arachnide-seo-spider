// Objet Fix : format unique d'une correction, indépendant du modèle d'IA et du CMS.
// L'IA ne modifie jamais le site : elle propose un Fix, l'utilisateur le valide, un connecteur l'applique.
import crypto from 'node:crypto';
import { z } from 'zod';

export const TARGET_KINDS = ['seo_title', 'meta_description', 'h1', 'image_alt', 'json_ld', 'canonical', 'noindex', 'redirect', 'link', 'action_plan'];
export const STATUSES = ['proposed', 'edited', 'approved', 'applied', 'verified', 'failed', 'rolled_back', 'ignored'];

export const FixSchema = z.object({
  id: z.string().min(1),
  issueType: z.string().min(1),
  url: z.string().url(),
  target: z.object({
    kind: z.enum(TARGET_KINDS),
    selector: z.string().nullable().default(null),
    resourceId: z.string().nullable().default(null),
  }),
  oldValue: z.union([z.string(), z.boolean(), z.null()]),
  newValue: z.union([z.string(), z.boolean(), z.null()]),
  method: z.enum(['ai', 'deterministic', 'manual']),
  provider: z.enum(['anthropic', 'openai']).nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(600),
  status: z.enum(STATUSES),
  appliedAt: z.string().nullable(),
  connector: z.enum(['wordpress', 'github', 'export']).nullable().default(null),
  error: z.string().optional(),
  batch: z.string().optional(),
});

// Ce que le modèle doit renvoyer (le reste du Fix est rempli par le moteur).
export const AIAnswerSchema = z.object({
  newValue: z.string().min(1).max(5000),
  rationale: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
});

export function makeFix(fields) {
  return FixSchema.parse({
    id: crypto.randomUUID(),
    target: { kind: fields.kind, selector: fields.selector ?? null, resourceId: fields.resourceId ?? null },
    provider: null,
    confidence: 1,
    rationale: '',
    status: 'proposed',
    appliedAt: null,
    connector: null,
    ...Object.fromEntries(Object.entries(fields).filter(([k]) => !['kind', 'selector', 'resourceId'].includes(k))),
  });
}
