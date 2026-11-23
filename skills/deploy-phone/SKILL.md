---
name: deploy-phone
description: Put an Omniagent on the phone — it answers incoming calls, and on SIP it can also place outbound calls. Use when the developer says "put the agent on the phone", "answer phone calls", "set up a phone number", "VoIP", "SIP", "Twilio", or "telephony". Two paths — VoIP (Napster exposes a webhook Twilio calls — Twilio is the only supported VoIP provider; the default) and SIP (bring your own trunk). Covers the channel config, human handoff, and routing a number to the agent. If the developer doesn't say which, default to VoIP. For web use [[deploy-webrtc]]; for audio-only use [[deploy-websocket]].
---

# deploy-phone

The phone channel puts an Omniagent on a phone number: it answers when someone calls, and on the SIP path it can also [dial out](#outbound-calls-sip-only). The same agent you run on web and WebSocket answers the phone — one identity, every surface.

There are two ways to wire up the phone. **If the developer doesn't say which, default to VoIP** — it's the simpler path: Napster only exposes a webhook, the developer's Twilio account does the rest, and there's no trunk of your own to register.

| Path | What it is | When |
|---|---|---|
| **VoIP** (default) | Napster exposes a **webhook endpoint** for the agent. You register it with Twilio (the only supported VoIP provider) for a phone number; on an incoming call Twilio calls the webhook to connect the caller to the agent. Twilio owns the number and the telephony — Napster only provides the webhook. No trunk credentials. **Human handoff isn't supported on this path.** | Most cases — fastest way to get the agent on a number. |
| **SIP** | You bring your own SIP trunk (a PBX or any SIP trunk provider) and hand Napster credentials to register against it. Supports human handoff. | You already run a SIP trunk, need the agent on existing telephony, or need human handoff. |

Both attach to the **same agent** — create it once ([[create-agent]]); a clear persona and a set `language` help on voice-only calls. Unlike WebRTC/WebSocket (created per session), the phone channel is a **persistent** config: set it once and the agent answers until you remove it. Agents in `mode: "puppeteer"` can't use phone channels — adding a SIP or VoIP channel config returns `400 TelephonyChannelNotAllowed`. Phone channels also don't work with agents on a **Microsoft Foundry** API key.

Two things apply to both paths:

- **Calls hang up after 3 minutes of silence.** A call closes with `closeReason: "idle_timeout"` after 3 minutes without anyone speaking. The agent's `disableIdleTimeout` setting doesn't apply to phone calls.
- **The caller's number identifies the caller.** You don't create phone sessions yourself, so the platform uses the number on the other end of the call as the session's `externalClientId` and as `metadata.external_client_id` in every tool call. On VoIP it's the caller's number in E.164 format (for example `+15551234567`). On inbound SIP it's the part of the caller's SIP URI before the `@`, exactly as your SIP server sends it, which can be an extension; on outbound SIP it's the `destination`. The agent remembers callers across calls from the same number. Callers who hide their number all arrive with the same placeholder, so they share one memory. To find a caller's sessions, filter by `externalClientId` and encode a leading `+` as `%2B` ([[monitor-sessions]]).

---

## Path A — VoIP (default; Napster exposes a webhook Twilio calls)

### 1. Configure the VoIP channel

`PUT` the `voip` channel config on the agent. The body is optional — include it only to override the agent's defaults on calls; otherwise an empty body is fine.

```bash
curl -X PUT https://napster-api.napster.com/public/agents/agent_abc123/channels/voip \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "providerSettings": {
      "turnDetection": { "threshold": 0.9, "silence_duration_ms": 800 }
    }
  }'
```

The response is the channel config, including the provisioned **`voipEndpoint`** — this is the **webhook URL** Twilio will call on an incoming call:

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
  "https://napster-api.napster.com/public/agents/agent_abc123/channels/voip",
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
    "https://napster-api.napster.com/public/agents/agent_abc123/channels/voip",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    json={},
)
print(res.json()["voipEndpoint"])
```

You can also pass `functions`, `faqCollections` (at most one collection ID), `knowledgeBaseId`, `useWebSearch`, and `providerSettings` to make the agent behave differently on calls than on web (for example a longer `silence_duration_ms` for phone-quality audio). Omit them to inherit the agent's defaults. MCP servers don't apply on phone calls — the agent has no MCP tools on VoIP or SIP.

<Callout type="warn">
**Human handoff is not available on VoIP** — it's a SIP-only capability. If the developer needs the agent to transfer a caller to a human, use the SIP path below. Don't set `humanHandoff` on the `voip` channel config.
</Callout>

### 2. Register the webhook with Twilio

Take the `voipEndpoint` URL and set it as the **incoming-call webhook** for a phone number in Twilio — currently the only supported VoIP provider. When someone calls that number, Twilio invokes the webhook and connects the caller to the agent.

In the Twilio Console: **Phone Numbers → Manage → Active Numbers → select the number → Voice Configuration**, then set the `voipEndpoint` as the **"A call comes in"** webhook. No SIP trunk credentials are needed for this path; Twilio just needs the webhook URL.

<Callout type="warn">
Twilio calls `voipEndpoint` on every inbound call, so treat the URL as sensitive and don't expose it publicly beyond the Twilio configuration. Re-fetch the channel config if you need it again rather than hardcoding it in client code.
</Callout>

### 3. Verify

You can't place a phone call yourself — hand this step to the developer: **place a real test call** to the number and confirm the agent answers and responds. Afterward, the call can be reviewed via [[monitor-sessions]] (`sessionType` will reflect the phone channel) — that part you can check. SIP calls also carry `direction` (`inbound`/`outbound`), `sipConnection` (`{ id, name }`), and `humanHandoff` (`{ destination, reason, startedAt }`) when the agent transferred the call. Phone-specific close reasons include `idle_timeout` (3 minutes of silence) and, on SIP, `transfer_failed`, `call_gone` (the call ended without a normal hang-up) and `media_timeout` (no audio for 30 seconds). Phone calls can't be ended through `DELETE /public/connections/{id}` (`400 ConnectionAbortNotSupported`).

---

## Path B — SIP (bring your own trunk)

Use this when you already run a SIP trunk. You manage three resources: the **agent**, a **SIP channel config**, and one or more **SIP connections** (your trunk credentials). One agent can back several connections (e.g. multiple numbers).

### 0. Request SIP quota (once per organization)

SIP connections require dedicated capacity and the default quota is **0** — creating a connection with no quota fails. Request capacity first and wait for approval:

```bash
curl -X POST https://napster-api.napster.com/public/quota-requests \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "quotaType": "sipPods",
    "requestedValue": 2,
    "reason": "Production SIP deployment for customer support line"
  }'
```

### 1. Register the SIP channel

Required even without human handoff — it registers the SIP channel for the agent. `PUT` creates or updates it.

```bash
curl -X PUT https://napster-api.napster.com/public/agents/agent_abc123/channels/sip \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "humanHandoff": {
      "enabled": true,
      "transferExtension": "200"
    }
  }'
```

Same optional overrides as VoIP (`functions`, `faqCollections` — at most one ID, `knowledgeBaseId`, `useWebSearch`, `providerSettings`); MCP servers don't apply on SIP either.

### 2. Create a SIP connection

Provide the SIP credentials from your provider. This deploys a listener that registers with your SIP server and starts accepting calls.

```bash
curl -X POST https://napster-api.napster.com/public/sip-connections \
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
curl -X POST https://napster-api.napster.com/public/sip-connections/sipconn_abc123/status \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

- **`lifecycleStatus`** — the listener: `Pending` → `Running` (also `Failed`, `Error`, `Unknown`).
- **`sipStatus`** — registration with your provider once running: `registering` → `online` (`calling` during a live call).

When `lifecycleStatus` is `Running` and `sipStatus` is `online`, calls to your number are answered. If it stays on `registering`, pull the error log:

```bash
curl https://napster-api.napster.com/public/sip-connections/sipconn_abc123/errors \
  -H "X-Api-Key: $NAPSTER_API_KEY"
# [{ "timestamp": "...", "message": "SIP registration failed: 401 Unauthorized", "code": 401 }]
```

### Outbound calls (SIP only)

Once a SIP connection is registered (`sipStatus: online`), the agent can dial out:

```bash
curl -X POST https://napster-api.napster.com/public/sip-connections/sipconn_abc123/call \
  -H "X-Api-Key: $NAPSTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "destination": "15551234567", "initialSpeech": "Hi, this is Ava from Acme — calling about your order." }'
# { "status": "dialing" }
```

`destination` is required — `+` followed by 7–15 digits, or up to 15 digits; digits only (no spaces, `*`/`#` codes, or SIP URIs). `initialSpeech` (optional) is what the agent says the moment the call is answered — without it, the agent opens with its default greeting behavior. The call lands in sessions ([[monitor-sessions]]) with `direction: "outbound"`; an unanswered call is `failed` with `closeReason` `no_answer` or `rejected`. VoIP remains inbound-only.

### Managing SIP connections

```bash
curl https://napster-api.napster.com/public/sip-connections -H "X-Api-Key: $NAPSTER_API_KEY"          # list
curl -X PATCH https://napster-api.napster.com/public/sip-connections/sipconn_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY" -H "Content-Type: application/json" -d '{ "name": "Renamed" }'
curl -X DELETE https://napster-api.napster.com/public/sip-connections/sipconn_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"   # stops the listener and unregisters
```

---

## Human handoff (SIP only)

Human handoff is available on the **SIP path only**. Set it on the SIP channel config (`PUT /public/agents/{id}/channels/sip`). When `enabled`, the agent can hand the call to an extension. `transferExtension` is **required** when `enabled` is `true` or `routes` is set — it's the default destination. Extensions are digits only: `+` followed by 7–15 digits, or up to 15 digits.

To send callers to different teams, add up to 10 `routes`, each an `extension` (same format, unique across routes) plus a plain-language `purpose` (≤ 200 characters):

```json
{ "humanHandoff": { "enabled": true, "transferExtension": "200",
  "routes": [
    { "extension": "210", "purpose": "Billing questions, invoices, and refunds" },
    { "extension": "220", "purpose": "Technical support for devices and connectivity" }
  ] } }
```

The agent uses the route whose `purpose` clearly matches what the caller needs. If it isn't clear which line fits, it asks the caller once, then uses `transferExtension`. On other channels `humanHandoff` is ignored — if a developer asks for handoff on VoIP, route them to SIP.

### What happens during a transfer

If the caller hasn't asked for a person, the agent offers a transfer and waits for them to agree. Before transferring, it tells the caller it's transferring them and asks them to wait. What happens next depends on the developer's phone system:

| Result | What happens |
|---|---|
| The transfer succeeds | The agent leaves the call, and the session closes with `connection_closed`. |
| The phone system refuses the transfer | The call stays with the agent, and the conversation continues. If the extension starts with `+`, the agent first retries it once without the `+`. |
| The phone system accepts the transfer, then it fails | The call ends, and the session closes with `transfer_failed`. |

Either way, the session records the transfer in `humanHandoff` (`{ destination, reason, startedAt }`).

To pass the caller's context to the person who picks up, the developer can subscribe a webhook to `session.humanHandoff.started` (dashboard only). It's sent as the transfer starts, with the reason, the extension, and the conversation so far, so it also arrives for transfers that fail. See [[monitor-sessions]] § Webhooks.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| (VoIP) Number rings but agent doesn't answer | Webhook not set, or set on the wrong number | Set `voipEndpoint` as the "A call comes in" webhook for that number in Twilio |
| (SIP) Connection creation rejected | SIP quota is 0 (the default) | Request capacity: `POST /public/quota-requests` with `quotaType: "sipPods"` (step 0) |
| (SIP) `sipStatus` stuck on `registering` | Bad credentials / wrong transport | Check `/errors`; `401` = credentials; verify server/domain/transport |
| (SIP) `lifecycleStatus: Failed` | Listener couldn't start | Read `status.message`; recheck `settings` |
| (SIP) Calls ring but agent doesn't answer | Number not routed to the trunk | Fix provider-side routing to the SIP endpoint |
| (SIP) Agent never transfers | Handoff disabled or no `transferExtension` | Set `enabled: true` and `transferExtension` on the SIP channel config |
| (SIP) Calls land on the default extension, not a team | No route's `purpose` clearly matches | Make each `purpose` a specific description of the requests that line handles |
| (VoIP) Need human handoff | Not supported on VoIP | Use the SIP path |
| (SIP) Transfer refused, caller stays with the agent | The phone system rejected the extension | Check the extension and the phone system's dial plan |
| (SIP) Session closes with `transfer_failed` | The phone system accepted the transfer, then it failed | Check the destination on the phone system |
| (SIP) Session closes with `call_gone` or `media_timeout` | The call ended without a normal hang-up, or no audio arrived for 30 seconds | Check the SIP server and the network between it and the platform |
| Call drops after 3 minutes of silence (`idle_timeout`) | Phone calls always close after 3 minutes without anyone speaking | Expected; `disableIdleTimeout` doesn't apply to calls |
| (SIP) `403 InactiveSubscription` creating, changing, deleting or calling from a SIP connection | The organization is out of credits | Add credits. The key stays valid |
| Agent talks over the caller | Phone-side VAD too sensitive | Raise `silence_duration_ms` via the channel `providerSettings` override |

## Next steps

- Tune phone-specific behavior via channel overrides ([[manage-agents]]).
- Review call transcripts: [[monitor-sessions]].
- Phone pitfalls: [[troubleshoot-omniagent]] § Phone channel.
