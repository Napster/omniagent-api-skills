---
name: deploy-phone
description: Put an Omniagent on the phone — give it a phone number and the agent answers when someone calls. Use when the developer says "put the agent on the phone", "answer phone calls", "set up a phone number", "VoIP", "SIP", "Twilio", or "telephony". Two paths — VoIP (Napster exposes a webhook your VoIP provider calls; the default) and SIP (bring your own trunk). Covers the channel config, human handoff, and routing a number to the agent. If the developer doesn't say which, default to VoIP. For web use [[deploy-webrtc]]; for audio-only use [[deploy-websocket]].
---

# deploy-phone

The phone channel lets an Omniagent answer inbound calls: you give it a phone number and the agent picks up when someone calls. The same agent you run on web and WebSocket answers the phone — one identity, every surface.

There are two ways to wire up the phone. **If the developer doesn't say which, default to VoIP** — it's the simpler path: Napster only exposes a webhook, the developer's VoIP provider does the rest, and there's no trunk of your own to register.

| Path | What it is | When |
|---|---|---|
| **VoIP** (default) | Napster exposes a **webhook endpoint** for the agent. You register it with a VoIP-capable provider for a phone number; on an incoming call the provider calls the webhook to connect the caller to the agent. The provider owns the number and the telephony — Napster only provides the webhook. No trunk credentials. **Human handoff is not yet supported on this path.** | Most cases — fastest way to get the agent on a number. |
| **SIP** | You bring your own SIP trunk (a PBX or any SIP trunk provider) and hand Napster credentials to register against it. Supports human handoff. | You already run a SIP trunk, need the agent on existing telephony, or need human handoff. |

Both attach to the **same agent** — create it once ([[create-agent]]); a clear persona and a set `language` help on voice-only calls. Unlike WebRTC/WebSocket (created per session), the phone channel is a **persistent** config: set it once and the agent answers until you remove it.

---

## Path A — VoIP (default; Napster exposes a webhook your provider calls)

### 1. Configure the VoIP channel

`PUT` the `voip` channel config on the agent. The body is optional — include it only to override the agent's defaults on calls; otherwise an empty body is fine.

```bash
curl -X PUT https://companion-api.napster.com/public/agents/agent_abc123/channels/voip \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "providerSettings": {
      "turnDetection": { "threshold": 0.9, "silence_duration_ms": 800 }
    }
  }'
```

The response is the channel config, including the provisioned **`voipEndpoint`** — this is the **webhook URL** your VoIP provider will call on an incoming call:

```json
{
  "id": "chanconfig_abc123",
  "channelType": "voip",
  "voipEndpoint": "https://…",
  "created": 1710000000
}
```

```ts
const res = await fetch(
  "https://companion-api.napster.com/public/agents/agent_abc123/channels/voip",
  {
    method: "PUT",
    headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  },
);
const { voipEndpoint } = await res.json();
```

```python
import os, requests
res = requests.put(
    "https://companion-api.napster.com/public/agents/agent_abc123/channels/voip",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={},
)
print(res.json()["voipEndpoint"])
```

You can also pass `functions`, `faqCollections`, `knowledgeBaseId`, and `providerSettings` to make the agent behave differently on calls than on web (for example a longer `silence_duration_ms` for phone-quality audio). Omit them to inherit the agent's defaults.

<Callout type="warn">
**Human handoff is not available on VoIP today** — it's a SIP-only capability for now (expected to come to VoIP later). If the developer needs the agent to transfer a caller to a human, use the SIP path below. Don't set `humanHandoff` on the `voip` channel config.
</Callout>

### 2. Register the webhook with your VoIP provider

Take the `voipEndpoint` URL and set it as the **incoming-call webhook** for a phone number at your VoIP provider (Twilio, Telnyx, Vonage, etc.). When someone calls that number, the provider invokes the webhook and connects the caller to the agent.

The exact place to paste the URL is provider-specific — look for your provider's **voice / incoming-call webhook** setting on the phone number's configuration. No SIP trunk credentials are needed for this path; the provider just needs the webhook URL.

<Callout type="warn">
The provider calls `voipEndpoint` on every inbound call, so treat the URL as sensitive and don't expose it publicly beyond the provider configuration. Re-fetch the channel config if you need it again rather than hardcoding it in client code.
</Callout>

### 3. Verify

You can't place a phone call yourself — hand this step to the developer: **place a real test call** to the number and confirm the agent answers and responds. Afterward, the call can be reviewed via [[monitor-sessions]] (`sessionType` will reflect the phone channel) — that part you can check.

---

## Path B — SIP (bring your own trunk)

Use this when you already run a SIP trunk. You manage three resources: the **agent**, a **SIP channel config**, and one or more **SIP connections** (your trunk credentials). One agent can back several connections (e.g. multiple numbers).

### 1. Register the SIP channel

Required even without human handoff — it registers the SIP channel for the agent. `PUT` creates or updates it.

```bash
curl -X PUT https://companion-api.napster.com/public/agents/agent_abc123/channels/sip \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "humanHandoff": {
      "enabled": true,
      "transferExtension": "200",
      "transferDescription": "Transfer the caller to a human operator when, in the current call, they explicitly ask to be connected to a person — for example by saying \"person,\" \"agent,\" \"operator,\" \"manager,\" \"supervisor,\" or \"representative.\" Do not transfer when the caller asks a question you can still answer. Before calling this function, briefly confirm the request (\"You'd like me to connect you with someone — is that right?\") and wait for a clear yes. Then tell the caller you are transferring them now and ask them to hold."
    }
  }'
```

Same optional overrides as VoIP (`functions`, `faqCollections`, `knowledgeBaseId`, `providerSettings`).

### 2. Create a SIP connection

Provide the SIP credentials from your provider. This deploys a listener that registers with your SIP server and starts accepting calls.

```bash
curl -X POST https://companion-api.napster.com/public/sip-connections \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_abc123",
    "name": "Main Support Line",
    "settings": {
      "server": "sip.your-provider.com",
      "port": 5060,
      "domain": "your-provider.com",
      "username": "your-sip-username",
      "password": "your-sip-password",
      "transport": "TCP",
      "callerId": "support-line-01"
    }
  }'
```

| Field | Required | Description |
|---|---|---|
| `agentId` | Yes | Agent that answers calls on this connection. |
| `settings.server` | Yes | Your SIP provider's server address. |
| `settings.port` | Yes | SIP port (typically `5060`). |
| `settings.domain` | Yes | SIP domain. |
| `settings.username` | Yes | SIP account username. |
| `settings.password` | Yes | SIP account password (write-only — never returned). |
| `settings.transport` | Yes | e.g. `TCP`. |
| `settings.callerId` | No | Identifier for this connection on your SIP server (not a caller-facing number). |

### 3. Poll registration status

Two independent states, both must be healthy:

```bash
curl -X POST https://companion-api.napster.com/public/sip-connections/sipconn_abc123/status \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

- **`lifecycleStatus`** — the listener: `Pending` → `Running` (also `Failed`, `Error`, `Unknown`).
- **`sipStatus`** — registration with your provider once running: `registering` → `online` (`calling` during a live call).

When `lifecycleStatus` is `Running` and `sipStatus` is `online`, calls to your number are answered. If it stays on `registering`, pull the error log:

```bash
curl https://companion-api.napster.com/public/sip-connections/sipconn_abc123/errors \
  -H "X-Api-Key: $NAPSTER_API_KEY"
# [{ "timestamp": "...", "message": "SIP registration failed: 401 Unauthorized", "code": 401 }]
```

### Managing SIP connections

```bash
curl https://companion-api.napster.com/public/sip-connections -H "X-Api-Key: $NAPSTER_API_KEY"          # list
curl -X PATCH https://companion-api.napster.com/public/sip-connections/sipconn_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY" -H "Content-Type: application/json" -d '{ "name": "Renamed" }'
curl -X DELETE https://companion-api.napster.com/public/sip-connections/sipconn_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"   # stops the listener and unregisters
```

---

## Human handoff (SIP only, for now)

Human handoff is available on the **SIP path only** today. VoIP support is expected later. Set it on the SIP channel config (`PUT /public/agents/{id}/channels/sip`). When `enabled` with a `transferExtension`, the agent can transfer the caller. `transferDescription` is not a label — the agent reads it to decide *when* to transfer and *what to say* first.

**Use this as your default `transferDescription`:**

> Transfer the caller to a human operator when, in the current call, they explicitly ask to be connected to a person — for example by saying "person," "agent," "operator," "manager," "supervisor," or "representative." Do not transfer when the caller asks a question you can still answer. Before calling this function, briefly confirm the request ("You'd like me to connect you with someone — is that right?") and wait for a clear yes. Then tell the caller you are transferring them now and ask them to hold.

Why this specific wording matters — **the trigger must require an explicit user ask**:

<Callout type="warn">
A vague `transferDescription` (e.g. "transfer when needed") can cause the agent to fire the handoff immediately at the start of a **new** call when cross-session memory is on (`externalClientId`). The agent recalls a prior session that ended in a handoff and interprets that recall as a trigger, transferring the caller before they've even said anything. Anchoring the trigger to an **explicit current-call request** ("when they explicitly ask to speak with a real person") prevents that — past memories alone are no longer enough to fire the function.
</Callout>

If a developer asks for human handoff on VoIP today, route them to the SIP path or note that VoIP support is coming later.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| (VoIP) Number rings but agent doesn't answer | Webhook not set, or set on the wrong number | Set `voipEndpoint` as the incoming-call webhook for that number at your provider |
| (SIP) `sipStatus` stuck on `registering` | Bad credentials / wrong transport | Check `/errors`; `401` = credentials; verify server/domain/transport |
| (SIP) `lifecycleStatus: Failed` | Listener couldn't start | Read `status.message`; recheck `settings` |
| (SIP) Calls ring but agent doesn't answer | Number not routed to the trunk | Fix provider-side routing to the SIP endpoint |
| (SIP) Agent never transfers | Handoff disabled or vague description | Enable handoff on the SIP channel config; write a specific `transferDescription` |
| (VoIP) Need human handoff | Not supported on VoIP today | Use the SIP path; VoIP handoff is expected later |
| Agent talks over the caller | Phone-side VAD too sensitive | Raise `silence_duration_ms` via the channel `providerSettings` override |

## Next steps

- Tune phone-specific behavior via channel overrides ([[manage-agents]]).
- Review call transcripts: [[monitor-sessions]].
- Phone pitfalls: [[troubleshoot-omniagent]] § Phone channel.
