/** Server-only, dependency-free model adapters. Credentials and endpoints come
 * exclusively from the supplied server environment, never a browser request.
 * Compatible endpoints accept an absolute /v1 base or /chat/completions URL.
 */
const LIMITS = Object.freeze({ steps: 8, calls: 24, perStep: 8, tools: 64,
  requestMs: 30_000, runMs: 120_000, resultChars: 24_576, responseBytes: 2_097_152,
  requestBytes: 1_048_576, argumentChars: 65_536 });
const OMITTED_IMAGE = '[Image omitted: assistant tool results are text-only.]';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const configured = value => typeof value === 'string' && value.trim().length > 0;

function compatibleEndpoint(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Compatible endpoint must use HTTPS (HTTP is allowed on loopback), with no URL credentials, query, or fragment.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) url.pathname = path;
  else if (path.endsWith('/v1')) url.pathname = `${path}/chat/completions`;
  else throw new Error('CHEMBOARD_COMPAT_URL must end in /v1 or /chat/completions.');
  return url.href;
}

/** Returns only configured provider IDs, labels and model names; never secrets. */
export function listProviders(env = process.env) {
  const result = [];
  if (configured(env.OPENAI_API_KEY) && configured(env.OPENAI_MODEL))
    result.push({ id: 'openai', label: 'OpenAI', model: env.OPENAI_MODEL.trim() });
  if (configured(env.ANTHROPIC_API_KEY) && configured(env.ANTHROPIC_MODEL))
    result.push({ id: 'anthropic', label: 'Anthropic', model: env.ANTHROPIC_MODEL.trim() });
  if (configured(env.CHEMBOARD_COMPAT_URL) && configured(env.CHEMBOARD_COMPAT_MODEL)) {
    try {
      compatibleEndpoint(env.CHEMBOARD_COMPAT_URL.trim());
      result.push({ id: 'compatible', label: 'OpenAI-compatible', model: env.CHEMBOARD_COMPAT_MODEL.trim() });
    } catch { /* Invalid server configuration is not advertised. */ }
  }
  return result;
}

function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Assistant cancelled.', 'AbortError');
}

// Also bounds injected fetch/tool implementations that ignore AbortSignal.
async function cancellable(operation, signal) {
  signal.throwIfAborted();
  let listener;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }),
      new Promise((_, reject) => {
        listener = () => reject(abortError(signal));
        signal.addEventListener('abort', listener, { once: true });
        if (signal.aborted) listener();
      }),
    ]);
  } finally { signal.removeEventListener('abort', listener); }
}

function prepareTools(tools) {
  if (!Array.isArray(tools) || tools.length > LIMITS.tools) throw new Error('Invalid assistant tool list (maximum 64).');
  const byName = new Map();
  const originals = new Set();
  const definitions = tools.map((tool, index) => {
    if (!object(tool) || !configured(tool.name) || !object(tool.inputSchema) || originals.has(tool.name))
      throw new Error('Assistant tools require unique names and object inputSchema values.');
    originals.add(tool.name);
    let name = tool.name;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || byName.has(name)) name = `tool_${index}_${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,45)}`;
    while (byName.has(name)) name = `tool_${index}_${name.slice(0,45)}`;
    byName.set(name, tool.name);
    return { name, description: String(tool.description || '').slice(0, 8_192), parameters: tool.inputSchema };
  });
  return { byName, definitions };
}

// Drop image content and embedded image data before either structured JSON or
// text MCP results are sent upstream. Keep board geometry and textual evidence.
function textOnly(value, state = { nodes: 0, seen: new WeakSet() }, depth = 0) {
  if (++state.nodes > 8_000 || depth > 18) return '[Result structure truncated]';
  if (typeof value === 'string') {
    if (/^\s*[\[{]/.test(value) && value.length <= LIMITS.responseBytes) {
      try { return JSON.stringify(textOnly(JSON.parse(value), state, depth + 1)); } catch { /* Ordinary text. */ }
    }
    return value.replace(/data:image\/[a-zA-Z0-9.+-]+[;,][^\s"'<>)]*/g, OMITTED_IMAGE).slice(0, LIMITS.resultChars);
  }
  if (!value || typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
  if (/^(image|input_image|output_image|image_url)$/i.test(value.type || '') || /^image\//i.test(value.mimeType || value.mime_type || '')) return OMITTED_IMAGE;
  if (state.seen.has(value)) return '[Repeated result object]';
  state.seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 256).map(item => textOnly(item, state, depth + 1));
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value).slice(0, 256)) {
    if (/^(images?|image_?url|image_?data|image_?base64|data_?url|screenshot|thumbnail|png|jpeg|base64)$/i.test(key)) result[key] = OMITTED_IMAGE;
    else result[key] = textOnly(item, state, depth + 1);
  }
  return result;
}

function toolResult(value, secrets) {
  let text;
  try {
    const clean = textOnly(value);
    text = typeof clean === 'string' ? clean : JSON.stringify(clean);
  } catch { text = '[Tool result could not be serialized]'; }
  text = text ?? 'null';
  for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]');
  return text.length > LIMITS.resultChars ? `${text.slice(0, LIMITS.resultChars)}\n[Tool result truncated]` : text;
}

async function readJson(response, signal) {
  if (!response.body?.getReader) throw new Error('Provider returned an unreadable response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await cancellable(() => reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.responseBytes) throw new Error('Provider response exceeded the size limit.');
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(data)); }
    catch { throw new Error('Provider returned invalid JSON.'); }
  } finally {
    try { await reader.cancel(); } catch { /* Already closed or cancelled. */ }
    reader.releaseLock();
  }
}

async function post(url, headers, body, signal, fetchImpl) {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(LIMITS.requestMs)]);
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded, 'utf8') > LIMITS.requestBytes) throw new Error('Assistant context exceeded the size limit.');
  let response;
  try {
    response = await cancellable(() => fetchImpl(url, { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', ...headers }, body: encoded, signal: requestSignal }), requestSignal);
  } catch {
    if (requestSignal.aborted) throw abortError(requestSignal);
    throw new Error('Provider request failed. Check the server endpoint and connection.');
  }
  if (!response.ok || response.redirected || (response.status >= 300 && response.status < 400)) {
    try { await response.body?.cancel(); } catch { /* Ignore cleanup failure. */ }
    throw new Error(`Provider request failed (HTTP ${response.status}). Check server configuration and account limits.`);
  }
  const result = await readJson(response, requestSignal);
  if (!object(result)) throw new Error('Provider returned an invalid response object.');
  return result;
}

function getText(content) {
  if (typeof content === 'string') return content.slice(0, LIMITS.resultChars);
  return (Array.isArray(content) ? content : []).filter(item => ['text', 'output_text', 'refusal'].includes(item?.type))
    .map(item => item.text || item.refusal || '').join('\n').slice(0, LIMITS.resultChars);
}

function validateCalls(calls, used) {
  if (calls.length > LIMITS.perStep || used + calls.length > LIMITS.calls) throw new Error('Assistant tool-call limit reached.');
  const ids = new Set();
  for (const call of calls) {
    if (!configured(call.id) || ids.has(call.id)) throw new Error('Provider returned missing or duplicate tool-call IDs.');
    ids.add(call.id);
  }
}

/** Run one bounded assistant turn. Tools are MCP-style definitions. callTool is
 * the authoritative executor/validator; its raw MCP result is returned as text.
 * Multiple calls are resolved in declared order to keep board edits deterministic.
 * Cancellation stops awaiting tools; an already-dispatched board operation may
 * still complete, so executors should also observe their session cancellation.
 */
export async function runAssistant({ provider, system = '', prompt, tools = [], callTool,
  signal, env = process.env, fetchImpl = fetch } = {}) {
  const config = listProviders(env).find(item => item.id === provider);
  if (!config) throw new Error('Assistant provider is not configured on this server.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 32_768 || typeof system !== 'string' || system.length > 16_384)
    throw new Error('Assistant prompt or system instructions are invalid or too long.');
  if (typeof fetchImpl !== 'function' || typeof callTool !== 'function') throw new Error('Assistant requires fetch and a tool executor.');
  const { definitions, byName } = prepareTools(tools);
  const runSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(LIMITS.runMs)]);
  runSignal.throwIfAborted();
  const secrets = [env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.CHEMBOARD_COMPAT_KEY].filter(configured);
  let usedCalls = 0;
  async function execute(call) {
    runSignal.throwIfAborted();
    try {
      const name = byName.get(call.name);
      if (!name) throw new Error('The requested tool is not available.');
      let args = call.args;
      if (typeof args === 'string') {
        if (args.length > LIMITS.argumentChars) throw new Error('Tool arguments exceeded the size limit.');
        try { args = JSON.parse(args); } catch { throw new Error('Tool arguments were not valid JSON.'); }
      }
      if (!object(args)) throw new Error('Tool arguments must be a JSON object.');
      if (JSON.stringify(args).length > LIMITS.argumentChars) throw new Error('Tool arguments exceeded the size limit.');
      const value = await cancellable(() => callTool(name, args), runSignal);
      return { text: toolResult(value, secrets), error: value?.isError === true };
    } catch (error) {
      if (runSignal.aborted) throw abortError(runSignal);
      return { text: toolResult({ error: String(error?.message || 'Tool execution failed.').slice(0, 2_048) }, secrets), error: true };
    }
  }

  if (provider === 'openai') {
    const history = [{ role: 'user', content: prompt }];
    for (let step = 0; step < LIMITS.steps; step++) {
      const response = await post('https://api.openai.com/v1/responses', { authorization: `Bearer ${env.OPENAI_API_KEY}` }, {
        model: config.model, instructions: system, input: history, store: false,
        include: ['reasoning.encrypted_content'], max_output_tokens: 4_096,
        ...(definitions.length ? { tools: definitions.map(tool => ({ type: 'function', ...tool, strict: false })) } : {}),
      }, runSignal, fetchImpl);
      if (response.error || response.status === 'failed' || response.status === 'incomplete') throw new Error('Provider did not complete the assistant response.');
      if (!Array.isArray(response.output)) throw new Error('Provider returned no response output.');
      const calls = response.output.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, name: item.name, args: item.arguments }));
      if (!calls.length) {
        const text = response.output.filter(item => item.type === 'message').map(item => getText(item.content)).filter(Boolean).join('\n');
        if (!text) throw new Error('Provider returned no assistant text.');
        return text.slice(0, LIMITS.resultChars);
      }
      validateCalls(calls, usedCalls); usedCalls += calls.length;
      if (step === LIMITS.steps - 1) break;
      // Replay every output item, including encrypted reasoning, in stateless mode.
      history.push(...response.output);
      for (const call of calls) history.push({ type: 'function_call_output', call_id: call.id, output: (await execute(call)).text });
    }
  } else if (provider === 'anthropic') {
    const messages = [{ role: 'user', content: prompt }];
    for (let step = 0; step < LIMITS.steps; step++) {
      const response = await post('https://api.anthropic.com/v1/messages', {
        'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
      }, { model: config.model, system, messages, max_tokens: 4_096,
        ...(definitions.length ? { tools: definitions.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}),
      }, runSignal, fetchImpl);
      if (response.error || !Array.isArray(response.content)) throw new Error('Provider returned no message content.');
      if (response.stop_reason === 'max_tokens') throw new Error('Provider response reached its output limit.');
      const calls = response.content.filter(item => item.type === 'tool_use').map(item => ({ id: item.id, name: item.name, args: item.input }));
      if (!calls.length) {
        const text = getText(response.content);
        if (!text) throw new Error('Provider returned no assistant text.');
        return text;
      }
      validateCalls(calls, usedCalls); usedCalls += calls.length;
      if (step === LIMITS.steps - 1) break;
      messages.push({ role: 'assistant', content: response.content });
      const content = [];
      for (const call of calls) {
        const result = await execute(call);
        content.push({ type: 'tool_result', tool_use_id: call.id, content: result.text, ...(result.error ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content });
    }
  } else {
    const url = compatibleEndpoint(env.CHEMBOARD_COMPAT_URL.trim());
    const headers = configured(env.CHEMBOARD_COMPAT_KEY) ? { authorization: `Bearer ${env.CHEMBOARD_COMPAT_KEY}` } : {};
    const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    for (let step = 0; step < LIMITS.steps; step++) {
      const response = await post(url, headers, { model: config.model, messages, max_tokens: 4_096, stream: false,
        ...(definitions.length ? { tools: definitions.map(tool => ({ type: 'function', function: tool })), tool_choice: 'auto' } : {}),
      }, runSignal, fetchImpl);
      const choice = response.choices?.[0];
      const message = choice?.message;
      if (response.error || !object(message)) throw new Error('Provider returned no assistant message.');
      if (choice.finish_reason === 'length') throw new Error('Provider response reached its output limit.');
      const toolCalls = message.tool_calls ?? [];
      if (!Array.isArray(toolCalls) || toolCalls.some(item => item?.type !== 'function')) throw new Error('Provider returned unsupported tool calls.');
      const calls = toolCalls.map(item => ({ id: item.id, name: item.function?.name, args: item.function?.arguments }));
      if (!calls.length) {
        const text = getText(message.content) || getText(message.refusal);
        if (!text) throw new Error('Provider returned no assistant text.');
        return text;
      }
      validateCalls(calls, usedCalls); usedCalls += calls.length;
      if (step === LIMITS.steps - 1) break;
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls,
        ...(typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}) });
      for (const call of calls) messages.push({ role: 'tool', tool_call_id: call.id, content: (await execute(call)).text });
    }
  }
  throw new Error('Assistant reached the step limit. Review the board before continuing.');
}
