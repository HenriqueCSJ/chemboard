import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';
import { startBridge } from './chemboard-bridge.mjs';
import { listProviders, runAssistant } from './providers.mjs';

test('MCP publishes tools only for a paired board and validates calls before dispatch', { timeout: 10_000 }, async t => {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const { port } = reserve.address();
  await new Promise(resolve => reserve.close(resolve));
  const token = 'chemboard_test_pairing_secret_1234';
  const env = { CHEMBOARD_PORT: String(port), CHEMBOARD_PAIR_TOKEN: token,
    OPENAI_API_KEY: 'test-openai-secret', OPENAI_MODEL: 'test-model' };
  const providerRequests = [];
  const bridge = await startBridge({ env, providers: { listProviders, runAssistant: args => runAssistant({ ...args,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      providerRequests.push(body);
      return Response.json({ output: providerRequests.length === 1 ? [
        { type: 'function_call', call_id: 'assistant-call', name: 'board_tool_71', arguments: '{"text":"assistant"}' }
      ] : [{ type: 'message', content: [{ type: 'output_text', text: 'Edited through the companion.' }] }] });
    }
  }) } });
  t.after(() => bridge.close());

  const base = 'http://127.0.0.1:' + port;
  const lecture = await fetch(base + '/examples/animation-examples.json');
  assert.equal(lecture.status, 200);
  assert.match(lecture.headers.get('content-type'), /^application\/json/);
  assert.equal((await fetch(base + '/connectors/.env')).status, 404);
  const rpc = async (method, params, authorization = 'Bearer ' + token) => {
    return fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        Authorization: authorization, 'MCP-Protocol-Version': '2025-03-26' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
  };
  const list = async () => (await (await rpc('tools/list')).json()).result.tools;
  assert.equal((await rpc('tools/list', {}, 'Bearer wrong-token')).status, 401);
  assert.equal((await fetch(base + '/mcp', { method: 'OPTIONS', headers: { Origin: 'https://other.invalid' } })).status, 403);
  const initialized = (await (await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'chemboard-test', version: '1.0.0' } })).json()).result;
  assert.equal(initialized.capabilities.tools.listChanged, true);
  assert.match(initialized.instructions, /get_board first/);
  assert.match(initialized.instructions, /only when explicitly requested/);
  assert.match(initialized.instructions, /empty tools\/list.*tools\/list again/);
  assert.deepEqual(await list(), []);

  const tools = [{
    name: 'add_text', description: 'Add an annotation', annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }
  }];
  for (const name of ['get_board_image', ...Array.from({ length: 72 }, (_, index) => `board_tool_${index}`)]) {
    tools.push({ ...tools[0], name });
  }
  const connect = async secret => {
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/lousa', { origin: base });
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'hello', app: 'lousa-quimica', token: secret, tools }));
    return socket;
  };
  const bad = await connect('chemboard_wrong_pairing_token_100');
  assert.equal((await once(bad, 'close'))[0], 1008);

  const board = await connect(token);
  assert.equal(JSON.parse((await once(board, 'message'))[0]).type, 'ready');
  let writes = 0;
  board.on('message', bytes => {
    const m = JSON.parse(bytes);
    if (m.type === 'call') {
      writes++;
      board.send(JSON.stringify({ type: 'result', id: m.id, ok: true, result: { text: m.args.text } }));
    }
  });
  assert.deepEqual(await list(), tools);
  const run = async args => (await (await rpc('tools/call', { name: 'add_text', arguments: args })).json()).result;
  assert.equal((await run({ text: 5 })).isError, true);
  assert.equal(writes, 0);
  assert.deepEqual(JSON.parse((await run({ text: 'paired' })).content[0].text), { text: 'paired' });
  assert.equal(writes, 1);

  const assisted = new Promise(resolve => {
    const onMessage = bytes => {
      const message = JSON.parse(bytes);
      if (message.type === 'assist_result' && message.id === 'assistant-test') {
        board.off('message', onMessage); resolve(message);
      }
    };
    board.on('message', onMessage);
  });
  board.send(JSON.stringify({ type: 'assist', id: 'assistant-test', provider: 'openai',
    system: 'Inspect before editing.', prompt: 'Update the final tool.' }));
  assert.deepEqual(await assisted, { type: 'assist_result', id: 'assistant-test', ok: true, text: 'Edited through the companion.' });
  assert.equal(writes, 2);
  assert.equal(providerRequests.length, 2);
  for (const request of providerRequests) {
    assert.deepEqual(request.tools.map(tool => tool.name), tools.filter(tool => tool.name !== 'get_board_image').map(tool => tool.name));
  }
  assert.match(providerRequests[1].input[2].output, /assistant/);

  const closed = once(board, 'close');
  board.close();
  await closed;
  // The client's close event can precede the bridge observing the close frame.
  const deadline = Date.now() + 1_000;
  let discovered = await list();
  while (discovered.length && Date.now() < deadline) { await delay(5); discovered = await list(); }
  assert.deepEqual(discovered, []);
});

test('stdio MCP rediscovers paired tools and clears discovery after disconnect', { timeout: 10_000 }, async t => {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const { port } = reserve.address();
  await new Promise(resolve => reserve.close(resolve));
  const token = 'chemboard_stdio_pairing_secret_1234';
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./chemboard-bridge.mjs', import.meta.url)), '--stdio'],
    env: { CHEMBOARD_PORT: String(port), CHEMBOARD_PAIR_TOKEN: token }, stderr: 'pipe' });
  const client = new Client({ name: 'chemboard-stdio-test', version: '1.0.0' });
  let board;
  t.after(async () => { board?.terminate(); await client.close(); });
  let onChange;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => { onChange?.(); });
  await client.connect(transport);
  assert.match(client.getInstructions(), /empty tools\/list/);
  assert.deepEqual((await client.listTools()).tools, []);

  const tools = Array.from({ length: 128 }, (_, index) => ({
    name: `board_tool_${index}`, description: `Board operation ${index}`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }));
  const pairedChange = new Promise(resolve => { onChange = resolve; });
  board = new WebSocket(`ws://127.0.0.1:${port}/lousa`, { origin: `http://127.0.0.1:${port}` });
  await once(board, 'open');
  const ready = once(board, 'message');
  board.send(JSON.stringify({ type: 'hello', app: 'lousa-quimica', token, tools }));
  assert.equal(JSON.parse((await ready)[0]).type, 'ready');
  await pairedChange;
  assert.deepEqual((await client.listTools()).tools, tools);
  board.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.type === 'call') board.send(JSON.stringify({ type: 'result', id: message.id, ok: true,
      result: { name: message.name } }));
  });
  const result = await client.callTool({ name: 'board_tool_127', arguments: {} });
  assert.deepEqual(JSON.parse(result.content[0].text), { name: 'board_tool_127' });

  const disconnectedChange = new Promise(resolve => { onChange = resolve; });
  const closed = once(board, 'close');
  board.close();
  await closed;
  await disconnectedChange;
  assert.deepEqual((await client.listTools()).tools, []);
});
