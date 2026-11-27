import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { startBridge } from './chemboard-bridge.mjs';

test('MCP publishes tools only for a paired board and validates calls before dispatch', async t => {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const { port } = reserve.address();
  await new Promise(resolve => reserve.close(resolve));
  const token = 'chemboard_test_pairing_secret_1234';
  const env = { CHEMBOARD_PORT: String(port), CHEMBOARD_PAIR_TOKEN: token };
  const bridge = await startBridge({ env, providers: { listProviders: () => [] } });
  t.after(() => bridge.close());

  const base = 'http://127.0.0.1:' + port;
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
  assert.deepEqual(await list(), []);

  const tools = [{
    name: 'add_text', description: 'Add an annotation', annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }
  }];
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

  const closed = once(board, 'close');
  board.close();
  await closed;
  assert.deepEqual(await list(), []);
});
