#!/usr/bin/env node
// The token is supplied only through the environment and the authenticated WS hello.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const MAX_BODY = 16 * 1024 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;
const TOOL_TIMEOUT = 60_000;
const ASSIST_TIMEOUT = 300_000;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const sameSecret = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const safeSend = (socket, value) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
const abortError = () => new Error('Operation cancelled.');

/** Create one loopback bridge. Providers can be injected for isolated tests. */
export async function startBridge({ env = process.env, stdio = false, providers, toolTimeout = TOOL_TIMEOUT, assistTimeout = ASSIST_TIMEOUT } = {}) {
  const token = env.CHEMBOARD_PAIR_TOKEN;
  if (!TOKEN_PATTERN.test(token || '')) throw new Error('CHEMBOARD_PAIR_TOKEN is required: 24–128 ASCII letters, digits, underscores or hyphens.');
  const portText = env.CHEMBOARD_PORT || '8765';
  if (!/^\d+$/.test(portText) || +portText < 1 || +portText > 65535) throw new Error('CHEMBOARD_PORT must be an integer from 1 to 65535.');
  const port = +portText;
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'https://henriquecsj.github.io']);
  const providerModule = providers || await import('./providers.mjs');
  const providerList = providerModule.listProviders(env).map(({ id, label, model }) => ({ id, label, model }));
  const peers = new Set();
  const mcps = new Set();
  let active = null;
  let closing = false;

  const publishTools = () => {
    for (const mcp of mcps) mcp.sendToolListChanged().catch(() => {});
  };

  function validateTools(raw) {
    if (!Array.isArray(raw) || raw.length > 512) throw new Error('Invalid tools.');
    const validator = new AjvJsonSchemaValidator();
    const names = new Set();
    return raw.map(def => {
      if (!object(def) || typeof def.name !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(def.name) || names.has(def.name) || typeof def.description !== 'string' || def.description.length > 16000 || !object(def.inputSchema) || def.inputSchema.type !== 'object') throw new Error('Invalid tools.');
      names.add(def.name);
      const annotations = {};
      for (const key of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        if (typeof def.annotations?.[key] === 'boolean') annotations[key] = def.annotations[key];
      }
      return {
        definition: { name: def.name, description: def.description, inputSchema: def.inputSchema, ...(Object.keys(annotations).length ? { annotations } : {}) },
        validate: validator.getValidator(def.inputSchema)
      };
    });
  }

  // A call always captures one authenticated socket. Reconnection never reroutes it.
  function callBoard(peer, name, args = {}, { signal, assistantId } = {}) {
    if (!peer || active !== peer || !peer.paired || peer.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('No authenticated ChemBoard is paired.'));
    if (signal?.aborted) return Promise.reject(abortError());
    const tool = peer.tools.find(t => t.definition.name === name);
    if (!tool) return Promise.reject(new Error('Unknown board tool.'));
    if (!object(args) || !tool.validate(args).valid) return Promise.reject(new Error('Tool arguments do not match the board schema.'));
    if (peer.pending.size >= 128) return Promise.reject(new Error('Too many pending board calls.'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const finish = (error, result) => {
        if (!peer.pending.delete(id)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(result);
      };
      const cancel = error => { safeSend(peer.socket, { type: 'cancel_call', id }); finish(error); };
      const onAbort = () => cancel(abortError());
      const timer = setTimeout(() => cancel(new Error('Board tool timed out.')), toolTimeout);
      peer.pending.set(id, { finish });
      signal?.addEventListener('abort', onAbort, { once: true });
      try { safeSend(peer.socket, { type: 'call', id, name, args, ...(assistantId ? { assistantId } : {}) }); }
      catch { finish(new Error('Board connection failed.')); }
    });
  }

  function createMcp() {
    const mcp = new Server({ name: 'chemboard', version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } });
    mcps.add(mcp);
    mcp.onclose = () => mcps.delete(mcp);
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: active?.tools.map(t => t.definition) || [] }));
    mcp.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const peer = active;
      try { return await callBoard(peer, request.params.name, request.params.arguments || {}, { signal: extra.signal }); }
      catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true }; }
    });
    return mcp;
  }

  function permitted(req, requireOrigin = false) {
    const remote = req.socket.remoteAddress;
    return (remote === '127.0.0.1' || remote === '::ffff:127.0.0.1') && allowedHosts.has(req.headers.host) &&
      (req.headers.origin === undefined ? !requireOrigin : allowedOrigins.has(req.headers.origin));
  }
  function reply(res, status, message) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(message);
  }
  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new Error('Request too large.');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const server = http.createServer(async (req, res) => {
    if (!permitted(req)) return reply(res, 403, 'Forbidden.');
    let pathname;
    try { pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname; }
    catch { return reply(res, 400, 'Invalid URL.'); }
    if (pathname === '/mcp') {
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version');
        return reply(res, 204, '');
      }
      if (!sameSecret(req.headers.authorization, `Bearer ${token}`)) return reply(res, 401, 'Authentication required.');
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return reply(res, 405, 'Method not allowed.'); }
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(res, 415, 'Expected application/json.');
      let body;
      try { body = await readJson(req); }
      catch { return reply(res, 400, 'Invalid JSON request.'); }
      const mcp = createMcp();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { mcps.delete(mcp); transport.close().catch(() => {}); mcp.close().catch(() => {}); });
      try { await mcp.connect(transport); await transport.handleRequest(req, res, body); }
      catch { if (!res.headersSent) reply(res, 500, 'MCP request failed.'); else res.end(); }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405, 'Method not allowed.');
    // Deliberately no general filesystem/static route: environment and provider files are private.
    const asset = pathname === '/' || pathname === '/index.html' ? ['../index.html', 'text/html; charset=utf-8'] : pathname === '/favicon.png' ? ['../favicon.png', 'image/png'] : null;
    if (!asset) return reply(res, 404, 'Not found.');
    try {
      const bytes = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { reply(res, 404, 'Not found.'); }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (!permitted(req, true) || req.url !== '/lousa' || closing || peers.size >= 8) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', socket => {
    const peer = { socket, paired: false, tools: [], pending: new Map(), assists: new Map() };
    peers.add(peer);
    const helloTimer = setTimeout(() => socket.close(1008, 'Pairing required.'), 5000);
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(helloTimer);
      peers.delete(peer);
      if (active === peer) { active = null; publishTools(); }
      for (const { finish } of peer.pending.values()) finish(new Error('Paired board disconnected.'));
      for (const assist of peer.assists.values()) assist.controller.abort();
    });
    socket.on('message', bytes => {
      let message;
      try { message = JSON.parse(bytes.toString()); if (!object(message)) throw new Error(); }
      catch { socket.close(1008, 'Invalid message.'); return; }
      if (!peer.paired) {
        if (message.type !== 'hello' || message.app !== 'lousa-quimica' || !sameSecret(message.token, token) || active) { socket.close(1008, 'Pairing rejected.'); return; }
        try { peer.tools = validateTools(message.tools); }
        catch { socket.close(1008, 'Pairing rejected.'); return; }
        clearTimeout(helloTimer);
        peer.paired = true;
        active = peer;
        safeSend(socket, { type: 'ready', providers: providerList });
        publishTools();
        return;
      }
      if (message.type === 'result') {
        const pending = peer.pending.get(message.id);
        if (!pending) return;
        if (message.ok !== true) pending.finish(new Error(typeof message.error === 'string' ? message.error.slice(0, 4000) : 'Board tool failed.'));
        else {
          const result = message.result;
          const parsed = CallToolResultSchema.safeParse(result);
          if (Array.isArray(result?.content) && parsed.success) pending.finish(null, parsed.data);
          else if (object(result) && typeof result.__image === 'string') {
            const { __image, ...rest } = result;
            pending.finish(null, { content: [{ type: 'image', data: __image, mimeType: 'image/png' }, { type: 'text', text: JSON.stringify(rest) }] });
          } else pending.finish(null, { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }) }] });
        }
        return;
      }
      if (message.type === 'cancel_assist') {
        peer.assists.get(message.id)?.controller.abort();
        return;
      }
      if (message.type !== 'assist') { socket.close(1008, 'Invalid message.'); return; }
      const id = message.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(id)) { socket.close(1008, 'Invalid request.'); return; }
      if (peer.assists.has(id)) return;
      if (peer.assists.size || !providerList.some(p => p.id === message.provider) || typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 100000 || typeof message.system !== 'string' || message.system.length > 100000) {
        safeSend(socket, { type: 'assist_result', id, ok: false, error: 'Assistant request unavailable or invalid.' }); return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), assistTimeout);
      const assist = { controller };
      peer.assists.set(id, assist);
      // Race cancellation so an adapter that stalls cannot leave the browser waiting.
      const abort = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(abortError()), { once: true }));
      Promise.race([abort, Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortError();
        return providerModule.runAssistant({
        provider: message.provider, system: message.system, prompt: message.prompt,
        tools: peer.tools.map(t => t.definition).filter(t => t.name !== 'get_board_image'),
        callTool: (name, args) => callBoard(peer, name, args, { signal: controller.signal, assistantId: id }),
        signal: controller.signal, env
        });
      })]).then(text => {
        if (typeof text !== 'string') throw new Error('Invalid assistant response.');
        safeSend(socket, { type: 'assist_result', id, ok: true, text });
      }).catch(error => {
        const status = /^Provider request failed \(HTTP (\d{3})\)\./.exec(error?.message)?.[1];
        const reason = status ? 'Provider request failed (HTTP ' + status + '). Check the companion provider configuration.'
          : 'Assistant failed. Check the companion provider configuration.';
        safeSend(socket, { type: 'assist_result', id, ok: false,
          error: controller.signal.aborted ? 'Assistant cancelled or timed out.' : reason });
      })
        .finally(() => { clearTimeout(timer); if (peer.assists.get(id) === assist) peer.assists.delete(id); });
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) { wss.close(); throw error; }
  let stdioMcp;
  if (stdio) {
    stdioMcp = createMcp();
    await stdioMcp.connect(new StdioServerTransport());
  }
  async function close() {
    if (closing) return;
    closing = true;
    for (const peer of peers) peer.socket.terminate();
    await Promise.allSettled([...mcps].map(mcp => mcp.close()));
    wss.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
  return { port, server, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--stdio')) { console.error('Usage: node chemboard-bridge.mjs [--stdio]'); process.exitCode = 1; }
  else startBridge({ stdio: args.includes('--stdio') }).then(bridge => {
    console.error(`ChemBoard companion listening on http://127.0.0.1:${bridge.port}/ (pairing required).`);
    const stop = () => bridge.close().then(() => process.exit(0));
    for (const name of ['SIGINT', 'SIGTERM']) process.once(name, stop);
    if (args.includes('--stdio')) process.stdin.once('end', stop);
  }).catch(error => {
    // Do not print arbitrary provider, request, or environment errors (possibly secret).
    const message = error.code === 'EADDRINUSE' ? 'Port already in use. Run only one companion per port.' : error.message.startsWith('CHEMBOARD_') ? error.message : 'Companion failed to start. Check dependencies and provider configuration.';
    console.error(message);
    process.exitCode = 1;
  });
}
