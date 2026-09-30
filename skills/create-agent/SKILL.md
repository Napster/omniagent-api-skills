---
name: create-agent
description: Assemble a deployable Omniagent from a persona — attach voice, language, tools, knowledge, and provider settings via POST /public/agents. Use when the developer says "create an agent", "create an Omniagent", "turn my persona into an agent", "wire up tools and knowledge", or has a persona ID and wants something deployable. Produces an agent ID. The agent is NOT publicly reachable until a channel is configured — route to [[deploy-webrtc]], [[deploy-websocket]], or [[deploy-phone]] after this.
---

# create-agent

An **Omniagent** is the deployable unit: one persistent identity — persona, voice, knowledge, tools, memory — available across every channel. You define it once and deploy it to web, audio, or phone. This skill creates the agent from an existing persona ID; the output is an **agent ID**.

The persona/agent split is deliberate: the persona holds the stable identity (face, personality — the avatar is generated once, there), while the agent holds the configuration around it. Reuse one persona across several agents when you want the same character with different tools or knowledge; reconfiguring an agent never touches the persona or its avatar.

Creating the agent does not make it reachable. End users reach it only after you configure a channel ([[deploy-webrtc]], [[deploy-websocket]], or [[deploy-phone]]).

## Prerequisites

- A persona ID (`companionId`). If you don't have one, route to [[create-persona]].
- A voice ID. Required. **Don't hardcode or guess the list — it changes.** Fetch the current supported voices from the docs before choosing one: the docs MCP server `fetch-page` slug `building-your-omniagent/configuration` (the Voice section), or `get-overview`. The examples below use a placeholder value; substitute a voice from that list. Note: an invalid voice is **not** rejected when you create the agent — `POST /public/agents` succeeds regardless. Problems surface later, at one of two points. **When you create the connection**, the API returns a `400` for what it can check itself: a missing `voiceId`, a digital twin whose cloned voice isn't ready, or a tool / FAQ collection / MCP server that doesn't exist. **After the client connects**, the AI provider checks the rest: an unrecognized voice, rejected credentials, or instructions that are too long. The connection request succeeds, then the client receives a `provider_connection_aborted` event (`error.code`: `invalid_voice`, `invalid_credentials`, `instructions_too_long`, `connection_failed`) and the session closes. Get the voice right up front, and handle that event in your client.
- Optionally: tool IDs ([[create-tool]]), a knowledge base ID and/or one FAQ collection ID ([[add-knowledge]]).

## Create the agent

```bash
curl -X POST https://companion-api.napster.com/public/agents \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "companionId": "comp_abc123",
    "name": "Support Agent",
    "voiceId": "alloy",
    "language": "en",
    "functions": ["fn_abc123"],
    "faqCollections": ["faq_abc123"],
    "knowledgeBaseId": "kb_abc123",
    "providerSettings": {
      "temperature": 0.7,
      "turnDetection": { "threshold": 0.9, "prefix_padding_ms": 400, "silence_duration_ms": 500 },
      "noiseReduction": { "type": "nearField" }
    }
  }'
```

```ts
const res = await fetch("https://companion-api.napster.com/public/agents", {
  method: "POST",
  headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
  body: JSON.stringify({
    companionId: "comp_abc123",
    name: "Support Agent",
    voiceId: "alloy",
    language: "en",
    functions: ["fn_abc123"],
    faqCollections: ["faq_abc123"],
    knowledgeBaseId: "kb_abc123",
    providerSettings: { temperature: 0.7 },
  }),
});
const agent = await res.json();
console.log(agent.id); // agent_…
```

```python
import os, requests

res = requests.post(
    "https://companion-api.napster.com/public/agents",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={
        "companionId": "comp_abc123",
        "name": "Support Agent",
        "voiceId": "alloy",
        "language": "en",
        "functions": ["fn_abc123"],
        "faqCollections": ["faq_abc123"],
        "knowledgeBaseId": "kb_abc123",
        "providerSettings": {"temperature": 0.7},
    },
)
print(res.json()["id"])  # agent_…
```

### Fields

| Parameter | Type | Required | Description |
|---|---|---|---|
| `companionId` | string | Yes | The persona that defines appearance and personality. |
| `voiceId` | string | Yes, for companions | Speech output voice. Use a current supported value from the docs (see Prerequisites) — don't hardcode the list. Digital twins carry their own cloned voice ([[create-digital-twin]]). |
| `providerSettings` | object | Yes | Model and audio settings (below). Can be `{}` to accept defaults. |
| `name` | string | Yes | A label for the agent. |
| `language` | string | No | ISO 639-1 code (e.g. `en`, `es`, `fr`). A plain name like `"English"` is rejected with a `400`. If set, the agent stays in that language. If omitted, defaults to English but can switch on request. |
| `functions` | string[] | No | Tool IDs to attach. See [[create-tool]]. |
| `mcp` | object | No | Tools from remote MCP servers: `{ "servers": [...], "connectors": [...] }`. See [[add-mcp-servers]]. |
| `faqCollections` | string[] | No | The ID of **one** FAQ collection — more than one returns `400` ("At most 1 FAQ collection can be attached."). See [[add-knowledge]]. |
| `knowledgeBaseId` | string | No | Knowledge collection ID. See [[add-knowledge]]. |
| `disableIdleTimeout` | boolean | No | By default a session closes after **3 minutes** without audio or messages (`closeReason: "idle_timeout"`, with `avatar_connection_warning` at 60/30/10 s). Set `true` to keep sessions open indefinitely. |
| `useWebSearch` | boolean | No | Let the agent search the web during conversations. Defaults to `true`; set `false` to keep it to its provided knowledge only. |
| `mode` | string | No | `conversation` (default) or `puppeteer` — the agent speaks only the lines your client sends with the `talk` command. Puppeteer needs a Cascade API key (`400 UnsupportedSessionMode` otherwise; a Cascade key with only text-to-speech is enough) and can't use SIP/VoIP (`400 TelephonyChannelNotAllowed`). Can also be set per session on `POST /public/connections` / `POST /public/ws-connections`. See [[session-runtime]]. |
| `tags` | object | No | String key-value labels, returned on every session for filtering. |

### Provider settings

`providerSettings` controls model behavior and audio processing. All fields apply on a **Realtime** key. On a **Cascade** key, `instructions` works, `turnDetection` applies only at session start, and `temperature` / `noiseReduction` are ignored.

| Field | Type | Notes |
|---|---|---|
| `temperature` | float | Lower (`0.3`) = focused, higher (`0.9`) = varied. |
| `instructions` | string | Overrides the persona's system prompt without changing the persona. |
| `turnDetection` | object | VAD: `threshold`, `prefix_padding_ms`, `silence_duration_ms`. |
| `noiseReduction` | object | `{ "type": "nearField" }` (laptops/headsets) or `"farField"` (rooms). |

Recommended turn-detection defaults for voice — the API defaults are too trigger-happy and cut the agent off on breaths and background noise:

```json
{ "threshold": 0.9, "prefix_padding_ms": 400, "silence_duration_ms": 500 }
```

If the agent still interrupts itself, raise `threshold` toward `0.95` or `silence_duration_ms` toward `800`. See [[session-runtime]] for tuning these live with `set_settings` (Realtime only — on Cascade, `set_settings` changes only `instructions` and inline tools).

## After creating

The agent exists but isn't reachable. Pick a channel:

- **Web (audio + video in a browser):** [[deploy-webrtc]]
- **Audio or text (headless / custom client, over WebSocket):** [[deploy-websocket]]
- **Phone (a number the agent answers, via VoIP or SIP):** [[deploy-phone]]
- **In-person on a Napster Station (gated):** [[deploy-kiosk]]

The same agent serves all channels at once — deploy to one now, add more later.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Session closes right after connecting with `provider_connection_aborted` (`invalid_voice` / `invalid_credentials` / `instructions_too_long`) | Voice, credentials, and instruction length aren't validated at agent creation or connection creation — the provider checks them when the session starts | Fix the voice (a supported value from `building-your-omniagent/configuration`) or the key's credentials, update the agent, and open a new session |
| `400` missing `providerSettings` | Field omitted | Required — send `{}` to accept defaults |
| `409` code `AgentLimitExceeded` | Organization at its agent cap (100 by default) | Delete unused agents ([[manage-agents]]) or ask Napster to raise the org's limit |
| Agent ignores attached tool | Tool ID not in `functions` | Add the ID; creating a tool does not auto-attach it ([[create-tool]]) |
| Knowledge not used | Wrong/empty `knowledgeBaseId` | One collection per session; create collections with `provider: "azureOpenAI"` — they work on Realtime and Cascade keys ([[add-knowledge]]) |
| `400` on `faqCollections` "At most 1 FAQ collection can be attached." | More than one FAQ collection ID | Merge the pairs into one collection (max 50 pairs) |
| Agent won't switch language | `language` was set | Setting `language` locks it; omit to allow switching |

## Next steps

- Give it tools from an existing service instead of writing your own: [[add-mcp-servers]].
- Manage it later: [[manage-agents]].
- Deploy it: [[deploy-webrtc]] / [[deploy-websocket]] / [[deploy-phone]].
- Per-session behavior, events, and commands: [[session-runtime]].
