# MCP client contract

## 3. MCP client contract (implement as `zapier/lib/mcp.js` and as Make module communication)

**Verified server facts:**
- Endpoint `https://mcp.linkedcamp.com/mcp`, transport `streamable-http`. ([server.json](https://github.com/LinkedCamp/linkedcamp-mcp/blob/main/server.json))
- **Auth header `X-Api-Key: <API key>`.** This is the documented header for clients that send a key. ([quickstart](https://docs.linkedcamp.com/mcp/quickstart), [repo README](https://github.com/LinkedCamp/linkedcamp-mcp))
  - The server's 401 text also accepts `Authorization: Bearer <key>`, but the docs don't show it. Use `X-Api-Key`.
  - The key is under Settings → Integrations → API (`https://app.linkedcamp.com/settings/integrations?type=api`). It needs a Pro-features plan (Pro or Agency) and the **Integrations** permission.
- Unauthenticated calls get JSON-RPC error **-32001**.
- Blocked operations return **HTTP 403 FORBIDDEN**. ([scope and safety](https://docs.linkedcamp.com/mcp/scope-and-safety))
- Tools outside the access tier or the account's permissions are hidden from `tools/list` and refused on call.
- Don't add `?toolsets=`. Leaving it off gives everything.

**Sequence** ([MCP transport spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)):
```
headers (every POST): Content-Type: application/json
                      Accept: application/json, text/event-stream
                      X-Api-Key: <key>
1. POST {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},
         "clientInfo":{"name":"linkedcamp-<zapier|make>","version":"<app version>"}}}
   keep sessionId = response header mcp-session-id (may be absent); version = result.protocolVersion
2. POST {"jsonrpc":"2.0","method":"notifications/initialized"} (+ Mcp-Session-Id if any, + MCP-Protocol-Version)
3. POST {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}} (+ same headers)
4. Parse: application/json → object; text/event-stream → JSON.parse each "data:" line, take the message with id 2.
5. Errors: HTTP 401 / error.code -32001 → auth error ("Reconnect Linkedcamp: the API key was rejected").
           HTTP 403 → "Not allowed for this Linkedcamp key (plan, permission, access tier or server-side block)".
           HTTP 404 with a session → re-initialize once and retry once.
           other msg.error → error with code + message.
           msg.result.isError === true → error with result.content[*].text (tool-level failure, e.g. not found).
6. Output: result.structuredContent, else JSON.parse(result.content[0].text) if valid, else {text}.
7. Optional DELETE with Mcp-Session-Id. Timeout 60 s. Never auto-retry write tools. Never log headers.
```
**"success:false" vs `isError`:** REST endpoints (§5) report errors as HTTP 200 with `"success": false` and a `message`; throw on `success !== true`. MCP reports tool failures as `result.isError: true`, and auth or protocol failures as a JSON-RPC `error`. Searches return an empty list when a tool returns an empty result, not an error.

