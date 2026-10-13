// Routes HTTP du module « Corriger en 1 clic » (paramètres IA, propositions, application, historique).
import { publicAiSettings, saveAiSettings, testAiConnection } from '../ai/settings.mjs';

// Renvoie true si la route a été traitée.
export async function handleFixRoutes(req, res, p, { send, readBody }) {
  if (p === '/api/ai/settings' && req.method === 'GET') return send(res, 200, await publicAiSettings()), true;
  if (p === '/api/ai/settings' && req.method === 'POST') return send(res, 200, await saveAiSettings(await readBody(req))), true;
  if (p === '/api/ai/test' && req.method === 'POST') {
    const { provider, apiKey } = await readBody(req);
    return send(res, 200, await testAiConnection({ provider, apiKey })), true;
  }
  return false;
}
