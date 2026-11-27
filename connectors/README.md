# Connect an AI assistant to ChemBoard

The ChemBoard companion connects the open board to MCP clients and to the in-board assistant. Use your chat client to read and draw on the board, or press **J** in ChemBoard and choose a model configured on the companion.

| What you want to use | Connection |
| --- | --- |
| ChatGPT on the web | [Secure MCP Tunnel](#chatgpt-on-the-web) with custom MCP and write permissions in your workspace |
| Claude Desktop, Claude Code, Codex, VS Code or Cursor | [Local MCP over stdio](#local-mcp-clients) |
| An MCP client that accepts a URL and bearer token | [Loopback Streamable HTTP](#loopback-mcp-over-http) |
| OpenAI, Claude, Gemini, Ollama or a compatible model inside ChemBoard | [Optional model APIs](#use-a-model-inside-the-board) |

## Prepare the companion

1. Clone or download the ChemBoard repository and open a terminal in its `connectors/` directory. Use Node.js 20.19 or later.
2. Run `npm ci`.
3. Copy `.env.example` to `.env`. Generate a pairing token with the command below and set `CHEMBOARD_PAIR_TOKEN` in `.env` to the output. The file is gitignored. Keep it on the computer running the companion.

~~~sh
node -p "require('node:crypto').randomBytes(24).toString('base64url')"
~~~

To run the companion yourself for the in-board assistant or an HTTP client, use this command.

~~~sh
node --env-file=.env chemboard-bridge.mjs
~~~

For a stdio client or tunnel, let that client launch the companion as shown below. Run one companion per port.

## Pair the board

1. Open `http://127.0.0.1:8765/` on the computer running the companion. Use your configured port if you changed `CHEMBOARD_PORT`.
2. Press **J** and select **Set up connection**, or open **Preferences → AI agents**. Enter the token from `.env` and choose **Connect**.
3. Keep the paired board open. Choose **Disconnect** before pairing another tab. Pair again after a page refresh.

You can also pair the [GitHub Pages board](https://henriquecsj.github.io/chemboard/) if your browser permits local-network access. If the browser blocks it, select **Open local board** in the connector settings. The loopback page and the published site each have their own browser storage. Export and reopen the board JSON to move a lecture between them.

## Local MCP clients

Configure a **stdio** MCP server with the command `node` and the three arguments below. Replace the two paths with absolute paths on your computer. Forward slashes also work in Windows JSON.

~~~json
{
  "mcpServers": {
    "chemboard": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/chemboard/connectors/.env",
        "/absolute/path/chemboard/connectors/chemboard-bridge.mjs",
        "--stdio"
      ]
    }
  }
}
~~~

- **Claude Desktop and Claude Code.** Use the local MCP configuration. Claude Code supports a project `.mcp.json`. Restart or reconnect the client and pair the board. [Claude Desktop guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) · [Claude Code guide](https://code.claude.com/docs/en/mcp)
- **Codex.** Run the command below with your paths, then open or restart the local Codex session and pair the board. [Codex MCP guide](https://developers.openai.com/codex/mcp)
- **VS Code or Cursor.** Add a local stdio server in your client’s MCP settings using the same command and arguments. [VS Code MCP guide](https://code.visualstudio.com/docs/agents/run/manage-mcp-servers)

~~~sh
codex mcp add chemboard -- node "--env-file=/absolute/path/chemboard/connectors/.env" "/absolute/path/chemboard/connectors/chemboard-bridge.mjs" --stdio
~~~

If the client reports an empty tool list, pair the board and refresh its tools. Try asking “Use ChemBoard to tell me the name of the current page,” followed by “Add a text label that says ‘MCP connected’.”

## ChatGPT on the web

Use OpenAI’s **Secure MCP Tunnel** to reach the companion on your machine. In the tunnel client, use the same `node` command and arguments as the local stdio example, including `--stdio`. Run the tunnel, open and pair the board, then in ChatGPT choose **Plugins → Add custom MCP server → Tunnel** and select the tunnel. Pairing before tool discovery lets ChatGPT see the board tools. Custom MCP access and write actions depend on your account and workspace permissions. [Secure MCP Tunnel setup](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) · [ChatGPT custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server)

Claude’s hosted custom connectors use a remotely reachable HTTPS server. For the loopback companion, use a local Claude client over stdio or a Claude model within ChemBoard. [Claude remote connector requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Loopback MCP over HTTP

Run the companion yourself, pair the board, and configure your client for **Streamable HTTP** at `http://127.0.0.1:8765/mcp`. Set the `Authorization` header to `Bearer YOUR_PAIRING_TOKEN`. The endpoint is accessible on the same machine and is stateless. Refresh the tool list after pairing or disconnecting.

## Board capabilities

Start with `get_board` for object IDs, the current selection, lock owners, and drawing defaults. The paired board advertises 74 tools through MCP. The in-board assistant uses the same catalog for drawing and reading text.

| Task | Tools |
| --- | --- |
| Add or edit formatted labels and equations | `add_text`, `update_text` |
| Draw exact shapes and freehand strokes | `add_shape` with `circle`, `square` or `equilateral_triangle`. `add_ink` accepts optional smoothing, pressure samples, and shape recognition. |
| Rotate or lock objects | `rotate_objects` takes a signed angle in degrees. `set_object_lock` reports the owner of an inherited lock. |
| Change Pen and Shapes defaults | `set_board` takes `pen_smoothing`, `shape_recognition`, and `constrain_shapes`. Use `add_ink` options to control a single tool-generated stroke. |
| Open a sample lecture | `list_lectures`, `insert_lecture`. Insertion reuses an existing copy unless `another_copy` is true. |
| Inspect or navigate a presentation | `get_presentation`, `add_camera_stop`, `go_to_camera_stop`. Stop indices are zero-based. |

Object edits such as drawing, rotation, or locking support **Undo**. Inserting lecture pages and saving camera stops use the page controls and their separate persistence.

After updating ChemBoard, reload and pair the board again. Refresh the tool list if your MCP client holds a snapshot from an earlier connection.

## Use a model inside the board

The companion reads API keys and model IDs from `.env` or its server environment. **OpenAI**, **Anthropic**, and one compatible profile can be configured at the same time. Restart the companion after editing `.env`. Pair the board, press **J**, pick a provider, and ask for a drawing.

| Provider | Environment variables |
| --- | --- |
| OpenAI Responses API | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Anthropic Messages API | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| OpenAI-compatible Chat Completions | `CHEMBOARD_COMPAT_URL`, `CHEMBOARD_COMPAT_MODEL`, and `CHEMBOARD_COMPAT_KEY` if required |

For **Gemini**, use `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. For **Ollama**, use `http://127.0.0.1:11434/v1` and an installed model with tool support. Compatible URLs accept a `/v1` base or a full `/chat/completions` endpoint. Use HTTPS for remote endpoints. [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai) · [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility)

On a Claude-hosted page that offers sampling, **Claude (hosted page)** also appears. Configure API access separately from ChatGPT or Claude account subscriptions. When you choose **Draw**, the selected model receives your request and a summary of the active board. **Stop** cancels the remaining work. You can undo completed drawing edits on the board.

## Resumo em português

1. Na pasta `connectors/`, rode `npm ci` e copie `.env.example` para `.env`. Gere o código com o comando no início deste guia e preencha `CHEMBOARD_PAIR_TOKEN`.
2. Para usar um modelo na própria lousa ou MCP por HTTP, rode `node --env-file=.env chemboard-bridge.mjs`. Para Claude Desktop, Claude Code ou Codex, configure o cliente com o comando e os argumentos do exemplo stdio e deixe o cliente iniciar o processo.
3. Abra `http://127.0.0.1:8765/`, pressione **J**, selecione **Configurar conexão**, cole o código e clique em **Conectar**.
4. Para ChatGPT na web, use **Secure MCP Tunnel** com o mesmo comando stdio. A disponibilidade das ferramentas de edição depende da sua conta e do workspace.
5. Para usar OpenAI, Claude, Gemini ou Ollama no painel **Assistente de IA**, configure as variáveis do provedor no `.env`, reinicie o conector e escolha o modelo.
