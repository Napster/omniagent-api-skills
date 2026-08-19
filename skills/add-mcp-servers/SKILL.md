---
name: add-mcp-servers
description: Give an Omniagent tools from a remote MCP server — a vendor's server, a public one, or a ready-made connector for Gmail, Google Calendar, Drive, SharePoint and similar. Use when the developer says "add an MCP server", "connect the agent to Gmail/Calendar/Drive", "use MCP", "attach a connector", or points at a server URL and wants the agent to call its tools. Covers registration, the three server types, per-user OAuth tokens, and approval-gated calls. For a tool you define and execute yourself, use [[create-tool]] instead.
---

# add-mcp-servers

An MCP server is an external service exposing tools over the [Model Context Protocol](https://modelcontextprotocol.io). Register it with `POST /public/mcp-servers`, attach its ID to an agent's `mcp` field, and the agent can call its tools mid-conversation. You write no schemas and handle no tool calls — the provider connects, discovers the tools, and runs them.

**Not the same as [[create-tool]].** A custom tool is one function you define and execute. An MCP server is a whole tool set someone else runs.

| | [[create-tool]] | MCP server |
|---|---|---|
| You define the schema | Yes | No — discovered from the server |
| You execute the call | Yes, client- or server-side | No — executed provider-side |
| Attached via | `functions` | `mcp` |
| Tools added | One | Every tool the server exposes |

## Before you start

- **Provider.** MCP servers work on Azure OpenAI and OpenAI. Connectors (below) require **OpenAI only** — not Azure OpenAI, which is the default.
- **Channels.** MCP is unavailable on VoIP and SIP. A server attached to an agent does not apply on phone calls.
- Ask the developer for the server's **URL** and how it authenticates before writing anything.

## Step 1 — pick the type

What the server requires decides how you register it. The server's own docs say which; if it handed over an API key it is authenticated, if it sent you to a sign-in screen it is per-user.

| Type | Requires | Register with |
|---|---|---|
| **Public** | Nothing | `url` |
| **Authenticated** | A credential you hold | `url` + `headers` |
| **Per-user** | Each end user's own OAuth token | `url` + `authorizationRequired: true` |
| **Connector** | Each end user's own OAuth token | Nothing — attach by ID |

## Step 2 — register the server

```bash
curl -X POST https://companion-api.napster.com/public/mcp-servers \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "inventory",
    "url": "https://mcp.acme.com/sse",
    "headers": { "Authorization": "Bearer sk_live_abc123" },
    "allowedTools": ["check_stock", "get_price"],
    "requireApproval": "never",
    "description": "Live product inventory and pricing",
    "authorizationRequired": false,
    "tags": { "env": "prod" }
  }'
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | **You choose it** — not generated. `^[a-zA-Z0-9_-]+$`, max 48 chars, unique per project. Cannot be changed later |
| `url` | Yes | Must be `https://` |
| `headers` | No | Sent on every request. The static-credential channel |
| `allowedTools` | No | Allowlist. **Omit and the agent can call every tool the server exposes**, including writes and deletes |
| `requireApproval` | No | `never` (default) or `always` — see Step 5 |
| `description` | No | Stored for your reference only. **Not sent to the model**, so it does not influence tool choice |
| `authorizationRequired` | No | `true` = sessions must supply a per-user token |
| `tags` | No | Max 16 pairs, keys/values ≤64 chars |

Set `allowedTools` deliberately on any third-party server. It is the only limit on what the agent can reach through your credential.

## Step 3 — attach it to the agent

```bash
curl -X PATCH https://companion-api.napster.com/public/agents/$AGENT_ID \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "mcp": { "servers": ["inventory"] } }'
```

`mcp` also works on `POST /public/agents`, on a channel config (`PUT /public/agents/{id}/channels/{type}`), and on connection requests.

**`mcp` is replaced wholesale, never merged.** A `PATCH` with `mcp` overwrites the previous value, and a channel config's `mcp` overrides the agent's completely. To add one server, send the full list.

## Step 4 — per-user servers and connectors

When the data belongs to the end user, not to you.

**Connectors** are MCP servers the platform maintains — nothing to register. Attach by ID: `dropbox`, `gmail`, `googlecalendar`, `googledrive`, `microsoftteams`, `outlookcalendar`, `outlookemail`, `sharepoint`.

```bash
curl -X PATCH https://companion-api.napster.com/public/agents/$AGENT_ID \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "mcp": { "servers": ["inventory"], "connectors": ["googlecalendar"] } }'
```

Then pass that user's OAuth token when opening the session:

```bash
curl -X POST https://companion-api.napster.com/public/agents/$AGENT_ID/connections \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelType": "webrtc",
    "mcp": {
      "authorizations": [
        { "mcpServerId": "googlecalendar", "token": "ya29.a0AfH6..." }
      ]
    }
  }'
```

The token is used for that session only and never stored. **You run the OAuth flow** — register your own OAuth client with Google/Microsoft/Dropbox, take the user through consent, hold the refresh token, and mint a fresh access token per session. A stale token fails mid-conversation.

The token must carry the scopes the connector's tools need, or the session starts normally and the tools fail at call time. Scopes come from the service, not from Napster — check the provider's documentation, and read what a scope actually grants before requesting it.

**The rule is strict both ways:**

| Registered with | Session sends a token | Result |
|---|---|---|
| `authorizationRequired: true` | yes | works |
| `authorizationRequired: true` | no | `400` |
| `authorizationRequired: false` | yes | `400` — the server does not accept one |
| `authorizationRequired: false` | no | works, using `headers` |

On the agent connection endpoint, `servers` and `connectors` in the body are **ignored** — the agent decides what is attached, and the connection supplies only tokens.

## Step 5 — approval-gated calls (optional)

`requireApproval: "always"` pauses every call until your client decides. Use it for tools with consequences — sending mail, issuing refunds, changing records.

1. You receive an `mcp_approval_request` event (`action: "created"`) over the data channel with `item_id`, `server`, `tool` and the arguments.
2. Show the user the choice.
3. Reply with `send_mcp_approval`, passing `approval_request_id` (the `item_id`) and `approve`.

```js
instance.sendCommand({
  type: "send_mcp_approval",
  data: { approval_request_id: "mcpr_x9y8z7", approve: true },
});
```

**15-second limit.** Unanswered requests are auto-rejected and you get `action: "cancelled"`. Build the UI before setting `always` — the agent gives no spoken sign it is waiting. `send_mcp_approval` is not yet in the Web SDK's typed command union, so TypeScript needs a cast.

Two more event types report activity: `mcp_tools` lists each server's tools at session start (watch for `action: "failed"` — the earliest sign of a bad URL or credential), and `mcp_call` tracks each invocation. See [[session-runtime]].

## Managing servers

```bash
curl "https://companion-api.napster.com/public/mcp-servers?search=inventory" -H "X-Api-Key: $NAPSTER_API_KEY"
curl https://companion-api.napster.com/public/mcp-servers/inventory -H "X-Api-Key: $NAPSTER_API_KEY"
curl -X DELETE https://companion-api.napster.com/public/mcp-servers/inventory -H "X-Api-Key: $NAPSTER_API_KEY"
```

Updates use `PUT` and **replace the whole server** — omitted fields revert to defaults (`requireApproval` → `never`, `headers` cleared). Read it first, change what you need, send the whole object back.

Connectors never appear in `GET /public/mcp-servers`; that lists only servers you registered.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `409 McpServerAlreadyExists` | That `id` is taken in this project | Pick another, or `PUT` to update |
| `400 McpServerValidationFailed` | Missing or non-`https` `url` | Registration needs an absolute `https://` URL |
| `400 McpServerNotFound` on attach | ID does not exist | For `mcp.servers` it must be registered in your project; for `mcp.connectors` it must be one of the eight platform IDs |
| `400 McpServerInUse` on delete | Still attached somewhere | Detach from every agent and channel config first |
| `400 UnsupportedProvider` | Provider does not support MCP | Check the key's provider; connectors need OpenAI, not Azure OpenAI |
| `400` mentioning authorization | Token supplied for a server that takes none, or missing for one that requires it | Match the token to `authorizationRequired` |
| Session will not start | Two attached servers share a name, or a server name collides with a tool name | Rename one — MCP server IDs and tool names share a namespace |
| Agent has no tools on a phone call | MCP is unavailable on VoIP/SIP | Use a [[create-tool]] function instead for phone agents |
| Tools listed but every call fails | Token lacks the required scopes | Re-run consent with the scopes the tools need |

## Next steps

- Attach to an agent: [[create-agent]] or [[manage-agents]].
- Handle approvals and MCP events at runtime: [[session-runtime]].
- Define a tool yourself instead: [[create-tool]].
