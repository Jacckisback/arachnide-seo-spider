#!/usr/bin/env node
// Serveur MCP d'Arachnide en stdio : Claude Code, Claude Desktop et tout client MCP local pilotent le crawl,
// l'analyse, la lecture des pages et les corrections sur le site via le connecteur du CMS.
// Les outils sont définis dans src/agent/tools.mjs, partagés avec la passerelle HTTP (/mcp, /api/agent) de l'app.
// Transport stdio : rien ne doit être écrit sur la sortie standard en dehors du protocole.
console.log = console.error;

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { VERSION } = await import('./crawler.mjs');
const { buildTools, registerOn, standaloneContext, INSTRUCTIONS } = await import('./agent/tools.mjs');
const { CONFIG_FILE, DEFAULT_POLICY } = await import('./sites.mjs');

const server = new McpServer({ name: 'arachnide-seo-mcp-server', version: VERSION }, { instructions: INSTRUCTIONS });
registerOn(server, await buildTools(standaloneContext()));
await server.connect(new StdioServerTransport());
console.error(`Arachnide SEO MCP server ${VERSION} ready (config: ${CONFIG_FILE}, default policy: ${DEFAULT_POLICY.maxChangesPerBatch} changes per batch).`);
