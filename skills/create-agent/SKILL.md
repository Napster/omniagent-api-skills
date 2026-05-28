---
name: create-agent
description: Assemble a deployable Omniagent from a persona — attach voice, language, tools, knowledge, and provider settings via POST /public/agents. Use when the developer says "create an agent", "create an Omniagent", "turn my persona into an agent", "wire up tools and knowledge", or has a persona ID and wants something deployable. Produces an agent ID. The agent is NOT publicly reachable until a channel is configured — route to [[deploy-webrtc]], [[deploy-websocket]], or [[deploy-phone]] after this.
---

# create-agent

An **Omniagent** is the deployable unit: one persistent identity — persona, voice, knowledge, tools, memory — available across every channel. You define it once and deploy it to web, audio, or phone. This skill creates the agent from an existing persona ID; the output is an **agent ID**.

Creating the agent does not make it reachable. End users reach it only after you configure a channel ([[deploy-webrtc]], [[deploy-websocket]], or [[deploy-phone]]).

## Prerequisites

- A persona ID (`companionId`). If you don't have one, route to [[create-persona]].
- A voice ID. Required. **Don't hardcode or guess the list — it changes.** Fetch the current supported voices from the docs before choosing one: the docs MCP server `fetch-page` slug `building-your-omniagent/configuration` (the Voice section), or `get-overview`. The examples below use a placeholder value; substitute a voice from that list. Note: an invalid voice is **not** rejected when you create the agent — the call succeeds and the failure only surfaces when a session starts (e.g. an error on the WebRTC data channel), so get the voice right up front.
- Optionally: tool IDs ([[create-tool]]), a knowledge base ID and/or FAQ collection IDs ([[add-knowledge]]).

## Create the agent

```bash
curl -X POST https://companion-api.napster.com/public/agents \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "companionId": "comp_abc123",
    "name": "Support Agent",
    "voiceId": "alloy",
    "language": "English",
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
    language: "English",
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
        "language": "English",
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
| `voiceId` | string | Yes | Speech output voice. Use a current supported value from the docs (see Prerequisites) — don't hardcode the list. |
| `providerSettings` | object | Yes | Model and audio settings (below). Can be `{}` to accept defaults. |
| `name` | string | No | A label for the agent. |
| `language` | string | No | Plain name (`English`, `Spanish`, …). If set, the agent stays in that language. If omitted, defaults to English but can switch on request. |
| `functions` | string[] | No | Tool IDs to attach. See [[create-tool]]. |
| `faqCollections` | string[] | No | FAQ collection IDs. See [[add-knowledge]]. |
| `knowledgeBaseId` | string | No | Knowledge collection ID. See [[add-knowledge]]. |
| `disableIdleTimeout` | boolean | No | Keep sessions open indefinitely instead of auto-closing on idle. |
| `tags` | object | No | String key-value labels, returned on every session for filtering. |

### Provider settings

`providerSettings` controls model behavior and audio processing (OpenAI Realtime):

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

If the agent still interrupts itself, raise `threshold` toward `0.95` or `silence_duration_ms` toward `800`. See [[session-runtime]] for tuning these live with `set_settings`.

## After creating

The agent exists but isn't reachable. Pick a channel:

- **Web (audio + video in a browser):** [[deploy-webrtc]]
- **Audio-only (headless / custom client):** [[deploy-websocket]]
- **Phone (a number the agent answers, via VoIP or SIP):** [[deploy-phone]]

The same agent serves all channels at once — deploy to one now, add more later.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Session fails at connect (e.g. an error on the WebRTC data channel) though `POST /public/agents` succeeded | Invalid `voiceId` — it is **not** validated when the agent is created | Set a supported voice from the docs (`building-your-omniagent/configuration`) and update the agent; the bad value only fails at runtime |
| `400` missing `providerSettings` | Field omitted | Required — send `{}` to accept defaults |
| Agent ignores attached tool | Tool ID not in `functions` | Add the ID; creating a tool does not auto-attach it ([[create-tool]]) |
| Knowledge not used | Wrong/empty `knowledgeBaseId` or provider mismatch | One collection per session; provider must match ([[add-knowledge]]) |
| Agent won't switch language | `language` was set | Setting `language` locks it; omit to allow switching |

## Next steps

- Manage it later: [[manage-agents]].
- Deploy it: [[deploy-webrtc]] / [[deploy-websocket]] / [[deploy-phone]].
- Per-session behavior, events, and commands: [[session-runtime]].
