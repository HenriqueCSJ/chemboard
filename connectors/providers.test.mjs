import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listProviders, runAssistant } from './providers.mjs';

const env = {
  OPENAI_API_KEY: 'test-openai-secret', OPENAI_MODEL: 'test-openai',
  ANTHROPIC_API_KEY: 'test-anthropic-secret', ANTHROPIC_MODEL: 'test-anthropic',
  CHEMBOARD_COMPAT_URL: 'http://127.0.0.1:12345/v1', CHEMBOARD_COMPAT_MODEL: 'test-compatible'
};
const toolList = count => Array.from({ length: count }, (_, index) => ({
  name: `board_tool_${index}`, description: `Board operation ${index}`,
  inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
}));

test('advertised providers preserve all 128 tools through a tool-result replay', async t => {
  const tools = toolList(128);
  assert.deepEqual(listProviders(env).map(({ id }) => id), ['openai', 'anthropic', 'compatible']);
  for (const { id: provider } of listProviders(env)) await t.test(provider, async () => {
    const requests = [];
    const executed = [];
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      const names = body.tools.map(tool => provider === 'compatible' ? tool.function.name : tool.name);
      assert.deepEqual(names, tools.map(tool => tool.name));
      const first = requests.length === 1;
      let response;
      if (provider === 'openai') response = { output: first ? [
        { type: 'reasoning', id: 'reasoning-1', encrypted_content: 'retained-reasoning' },
        { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'board_tool_127', arguments: '{"id":"object-1"}' }
      ] : [{ type: 'message', content: [{ type: 'output_text', text: 'Board updated.' }] }] };
      else if (provider === 'anthropic') response = { content: first ? [
        { type: 'tool_use', id: 'call-1', name: 'board_tool_127', input: { id: 'object-1' } }
      ] : [{ type: 'text', text: 'Board updated.' }], stop_reason: first ? 'tool_use' : 'end_turn' };
      else response = { choices: [{ finish_reason: first ? 'tool_calls' : 'stop', message: first ? {
        role: 'assistant', content: null, reasoning_content: 'retained-reasoning',
        tool_calls: [{ type: 'function', id: 'call-1', function: { name: 'board_tool_127', arguments: '{"id":"object-1"}' } }]
      } : { role: 'assistant', content: 'Board updated.' } }] };
      return Response.json(response);
    };
    const text = await runAssistant({ provider, env, tools, prompt: 'Update the object.', system: 'Inspect before editing.', fetchImpl,
      callTool: async (name, args) => { executed.push({ name, args }); return { content: [{ type: 'text', text: 'updated object-1' }] }; }
    });
    assert.equal(text, 'Board updated.');
    assert.equal(requests.length, 2);
    assert.deepEqual(executed, [{ name: 'board_tool_127', args: { id: 'object-1' } }]);
    const replay = requests[1].body;
    if (provider === 'openai') {
      assert.equal(replay.input[1].encrypted_content, 'retained-reasoning');
      assert.equal(replay.input[2].call_id, 'call-1');
      assert.equal(replay.input[3].type, 'function_call_output');
      assert.match(replay.input[3].output, /updated object-1/);
    } else if (provider === 'anthropic') {
      assert.equal(replay.messages[1].content[0].id, 'call-1');
      assert.equal(replay.messages[2].content[0].tool_use_id, 'call-1');
      assert.match(replay.messages[2].content[0].content, /updated object-1/);
    } else {
      assert.equal(requests[0].url, 'http://127.0.0.1:12345/v1/chat/completions');
      assert.equal(replay.messages[2].reasoning_content, 'retained-reasoning');
      assert.equal(replay.messages[3].tool_call_id, 'call-1');
      assert.match(replay.messages[3].content, /updated object-1/);
    }
  });
});

test('providers reject tool lists above 128 before a provider request', async () => {
  let requested = false;
  for (const { id: provider } of listProviders(env)) await assert.rejects(
    runAssistant({ provider, env, tools: toolList(129), prompt: 'Inspect the board.', callTool: async () => ({}),
      fetchImpl: async () => { requested = true; return Response.json({}); } }), /maximum 128/
  );
  assert.equal(requested, false);
});
