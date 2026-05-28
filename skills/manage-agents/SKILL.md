---
name: manage-agents
description: List, inspect, update, and delete Omniagents and their channel configs. Use when the developer says "list my agents", "update the agent's voice/language/tools", "change provider settings", "delete an agent", or "remove a channel". Covers PATCH semantics (partial updates), and how deleting an agent vs. deleting a channel config differ.
---

# manage-agents

Once an agent exists ([[create-agent]]), you list, read, update, and delete it through `/public/agents`. Updates are partial — you send only what changes.

## List agents

```bash
curl https://companion-api.napster.com/public/agents \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

## Get one agent

```bash
curl https://companion-api.napster.com/public/agents/agent_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

## Update an agent

`PATCH` changes only the fields you include; everything else is untouched. You can update any creation field: `companionId`, `name`, `voiceId`, `language`, `functions`, `faqCollections`, `knowledgeBaseId`, `providerSettings`, `tags`, `disableIdleTimeout`. Changes apply to every channel using the agent.

```bash
curl -X PATCH https://companion-api.napster.com/public/agents/agent_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "Spanish",
    "voiceId": "shimmer"
  }'
```

```ts
await fetch("https://companion-api.napster.com/public/agents/agent_abc123", {
  method: "PATCH",
  headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
  body: JSON.stringify({ language: "Spanish", voiceId: "shimmer" }),
});
```

```python
import os, requests
requests.patch(
    "https://companion-api.napster.com/public/agents/agent_abc123",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={"language": "Spanish", "voiceId": "shimmer"},
)
```

<Callout type="warn">
Updating `functions`, `faqCollections`, or `knowledgeBaseId` replaces the value — it is not a merge. To add one tool, send the full intended array, not just the new ID.
</Callout>

## Delete an agent

```bash
curl -X DELETE https://companion-api.napster.com/public/agents/agent_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Deleting an agent removes it for **all** channels — WebRTC, WebSocket, and SIP.

## Channel configs vs. the agent

A channel config holds per-channel overrides and (for SIP) human-handoff settings. You can inspect or remove a channel config without touching the agent:

```bash
# Get a channel config (e.g. SIP)
curl https://companion-api.napster.com/public/agents/agent_abc123/channels/sip \
  -H "X-Api-Key: $NAPSTER_API_KEY"

# Delete only the channel config (keeps the agent, drops the overrides)
curl -X DELETE https://companion-api.napster.com/public/agents/agent_abc123/channels/sip \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Use this when you want to stop overriding behavior on one channel — or take the agent off the phone — while keeping the agent live elsewhere. Channel types: `webrtc`, `websocket`, `voip`, `sip`.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Update silently "lost" other tools | `functions` replaced, not merged | Send the complete array you want |
| `404` on a channel config | No config set for that channel | Channel configs are optional; create with PUT first ([[deploy-phone]]) |
| Deleted agent still answering calls | SIP connection still deployed | Delete the SIP connection too ([[deploy-phone]]) |

## Next steps

- Re-deploy after changes: [[deploy-webrtc]] / [[deploy-websocket]] / [[deploy-phone]].
- Inspect what ran: [[monitor-sessions]].
