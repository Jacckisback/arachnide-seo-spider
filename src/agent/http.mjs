// Passerelle HTTP pour les agents IA, montée dans le serveur de l'application :
//   POST /mcp                 serveur MCP (Streamable HTTP, sans session : une requête = une réponse JSON)
//   GET  /openapi.json        description OpenAPI 3.1 de l'API REST (import direct dans une Action ChatGPT)
//   GET  /api/agent/tools     liste des outils (nom, description, schéma d'entrée)
//   POST /api/agent/<outil>   appel d'un outil en REST (corps JSON = arguments)
//   GET  /api/agent/settings  (interface locale seulement) jeton, URL, journal des appels
// Tout ce qui est appelé par un agent exige le jeton (Authorization: Bearer …). Les appels sont journalisés
// (50 derniers) et diffusés à l'interface, qui montre ce que l'agent fait sur l'audit ouvert.
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { VERSION } from '../crawler.mjs';
import { buildTools, registerOn, INSTRUCTIONS } from './tools.mjs';
import { isAuthorized, readAgentSettings, rotateToken, setAgentEnabled, setPublicUrl, effectiveToken } from './auth.mjs';
import { isTrustedRequest } from '../fix/routes.mjs';

const LOG_MAX = 50;
const RATE = { windowMs: 60_000, max: 240 };

export function createAgentGateway({ ctx, broadcast, lang }) {
  let registry = null;
  const log = [];
  const hits = new Map(); // ip → [timestamps]

  const ready = async () => (registry ||= await buildTools(ctx, { lang }));
  const byName = async (name) => (await ready()).tools.find((x) => x.name === name);

  const record = (entry) => {
    log.unshift({ at: new Date().toISOString(), ...entry });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    broadcast?.('agent', log[0]);
  };

  const limited = (req) => {
    const ip = req.socket?.remoteAddress || '?';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((x) => now - x < RATE.windowMs);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > RATE.max;
  };

  const cors = (res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-api-key, mcp-session-id, mcp-protocol-version');
    res.setHeader('access-control-expose-headers', 'mcp-session-id');
  };

  // URL de base annoncée aux agents : réglage de l'interface, sinon ARACHNIDE_PUBLIC_URL, sinon l'hôte de la requête
  // (un tunnel ou un proxy inverse transmet x-forwarded-proto / x-forwarded-host).
  const publicBase = async (req) => {
    const s = await readAgentSettings();
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return s.publicUrl || process.env.ARACHNIDE_PUBLIC_URL?.replace(/\/$/, '') || `${proto}://${host}`;
  };

  // OpenAPI 3.1 : un chemin POST par outil, schémas d'entrée tirés de Zod, sécurité par jeton.
  async function openapi(req) {
    const { tools } = await ready();
    const paths = {};
    for (const tool of tools) {
      const schema = z.toJSONSchema(tool.schema, { target: 'draft-2020-12', io: 'input' });
      delete schema.$schema;
      paths['/api/agent/' + tool.name] = {
        post: {
          operationId: tool.name,
          summary: tool.title,
          description: tool.description,
          'x-openai-isConsequential': !tool.annotations.readOnlyHint,
          requestBody: { required: Object.keys(tool.shape).length > 0, content: { 'application/json': { schema } } },
          responses: { 200: { description: 'Result (JSON)', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, 400: { description: 'Invalid arguments' }, 401: { description: 'Missing or invalid token' }, 404: { description: 'Not found' } },
        },
      };
    }
    return {
      openapi: '3.1.0',
      info: { title: 'Arachnide SEO Spider — agent API', version: VERSION, description: INSTRUCTIONS },
      servers: [{ url: await publicBase(req) }],
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
      security: [{ bearer: [] }, { apiKey: [] }],
      paths,
    };
  }

  // Serveur MCP sans état : une instance par requête (recommandé par le SDK pour le mode JSON), fermée avec la réponse.
  async function handleMcp(req, res, body) {
    const reg = await ready();
    const server = new McpServer({ name: 'arachnide-seo-mcp-server', version: VERSION }, { instructions: INSTRUCTIONS });
    registerOn(server, reg);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    if (body && body.method === 'tools/call') record({ via: 'mcp', tool: body.params?.name, args: compact(body.params?.arguments) });
    await transport.handleRequest(req, res, body);
  }

  // Renvoie true si la route a été traitée.
  async function handle(req, res, p, url, { send, readBody }) {
    const isAgentRoute = p === '/mcp' || p === '/openapi.json' || p.startsWith('/api/agent/');
    if (!isAgentRoute) return false;
    cors(res);
    if (req.method === 'OPTIONS') return res.writeHead(204).end(), true;

    // Réglages : interface locale uniquement (le jeton n'est jamais envoyé à un agent).
    if (p === '/api/agent/settings') {
      if (!isTrustedRequest(req)) return send(res, 403, { error: 'Forbidden' }), true;
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (b.rotate) await rotateToken();
        if (b.enabled !== undefined) await setAgentEnabled(b.enabled);
        if (b.public_url !== undefined) await setPublicUrl(b.public_url);
      }
      const s = await readAgentSettings();
      const { tools } = await ready();
      const base = await publicBase(req);
      const local = `http://${req.headers.host}`;
      return send(res, 200, { enabled: s.enabled, token: await effectiveToken(), from_env: !!process.env.ARACHNIDE_AGENT_TOKEN, created_at: s.createdAt, local_url: local, public_url: s.publicUrl || process.env.ARACHNIDE_PUBLIC_URL || null, base_url: base, mcp_url: base + '/mcp', openapi_url: base + '/openapi.json', tools: tools.length, log }), true;
    }
    if (p === '/openapi.json') return send(res, 200, await openapi(req)), true;

    if (limited(req)) return send(res, 429, { error: 'Too many requests' }), true;
    if (!(await isAuthorized(req, url))) {
      res.setHeader('www-authenticate', 'Bearer realm="arachnide"');
      return send(res, 401, { error: 'Missing or invalid token. Get it in Arachnide → Settings → AI agents, and send it as "Authorization: Bearer <token>".' }), true;
    }
    if (p === '/mcp') {
      if (req.method === 'GET' || req.method === 'DELETE') return send(res, 405, { error: 'Stateless MCP server: use POST.' }), true;
      await handleMcp(req, res, await readJsonRpc(req));
      return true;
    }
    if (p === '/api/agent/tools') {
      const { tools } = await ready();
      return send(res, 200, { tools: tools.map((x) => ({ name: x.name, title: x.title, description: x.description, read_only: !!x.annotations.readOnlyHint, input: z.toJSONSchema(x.schema, { target: 'draft-2020-12', io: 'input' }) })) }), true;
    }
    const tool = await byName(p.slice('/api/agent/'.length));
    if (!tool) return send(res, 404, { error: 'Unknown tool. See /api/agent/tools.' }), true;
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST with a JSON body.' }), true;
    const parsed = tool.schema.safeParse(await readBody(req));
    if (!parsed.success) return send(res, 400, { error: 'Invalid arguments', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }), true;
    record({ via: 'rest', tool: tool.name, args: compact(parsed.data) });
    try {
      return send(res, 200, await tool.handler(parsed.data, {})), true;
    } catch (e) {
      const status = e.code === 'not_found' ? 404 : e.code === 'config' || e.code === 'invalid' ? 400 : 500;
      return send(res, status, { error: e.message, code: e.code, hint: e.hint }), true;
    }
  }

  return { handle, log };
}

// Corps JSON-RPC brut (un objet ou un lot) : le SDK le valide lui-même.
async function readJsonRpc(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    return null;
  }
}

// Arguments journalisés : courts, sans secrets.
function compact(args) {
  if (!args || typeof args !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (/pass|token|secret|key/i.test(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 80) : Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '{…}' : v;
  }
  return out;
}
