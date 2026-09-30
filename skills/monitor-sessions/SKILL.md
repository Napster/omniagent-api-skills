---
name: monitor-sessions
description: List Omniagent sessions and retrieve full conversation transcripts. Use when the developer says "list sessions", "get the transcript", "what did the agent say", "filter sessions by user", "audit conversations", "delete a session", "delete a user's data", "webhook", "notify my server when a session ends", "know when a companion finishes generating", or wants analytics/QA on past calls. Covers the list endpoint with filters, the single-session endpoint with the transcript, the delete endpoint, how session IDs come from the connection response, and webhooks (session and companion events, signature verification, retries).
---

# monitor-sessions

Every connection creates a **session** that captures the configuration used (persona, tools, knowledge, FAQs), timing, and the full transcript. The Sessions API has three endpoints: list (with filters), get-one (with the transcript), and delete (permanently removes a finished session, its transcript, and the memory stored from it).

## Where the session ID comes from

When you create a connection ([[deploy-webrtc]] / [[deploy-websocket]]), the response includes `connection.id` — that's the session ID. Store it on your backend to look the session up later.

## List sessions

```bash
curl "https://companion-api.napster.com/public/sessions?pageSize=10" \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Each item includes `id`, `companionId` (+ `companion`), `functions`, `knowledgeBaseId`, `faqIds`, `externalClientId`, `tags`, `sessionType` (`webrtc`/`websocket`/`voip`/`sip`/`kiosk`), `modality` (`audio`/`text`/`video`), `status`, `closeReason`, `cost`, `agent` (`{ id, name }`, `null` for per-session connections), `mode` (`conversation`/`puppeteer`), for SIP calls `direction` (`inbound`/`outbound`) and `sipConnection` (`{ id, name }`), and timestamps (`createdAt`, `startedAt`, `closedAt`). The envelope has `items`, `filteredCount`, `totalCount`, `pageIndex`, `pageSize`.

`status` is `pending`, `started`, `closed`, or `failed` — a session moves `pending → started → closed`, or straight to `failed` if the connection is never established. Failed sessions appear in the list like any other (they are deliberately kept in analytics); there is **no status filter parameter** — separate them client-side by the field. `closeReason` (present once `closed` or `failed`) says why: `connection_closed`, `idle_timeout`, `connection_aborted` (your backend called `DELETE /public/connections/{id}`), `connection_timeout` (the client didn't connect in time), `not_started`, `session_expired`, `no_credits_left`, `provider_connection_aborted` (the provider rejected the voice, credentials or instructions), `function_connection_failed` / `function_connection_lost` (a WebSocket tool with `abortOnFailure: true`), `avatar_allocation_failed`, `initialization_failed` / `session_initialization_failed`, `application_shutdown`, outbound SIP `no_answer` / `rejected` / `failed`, and `unknown`.

`cost` is the billed cost of the session in **USD** — computed from the minutes the agent was active and your API key's model configuration. It is `null` while the session is `pending` or `started`, and is populated once the session closes. Sum `cost` across a filtered list (by `companionId` or `externalClientId`) to attribute spend per persona or per end user.

### Filters

| Parameter | Description |
|---|---|
| `companionId` | Filter by persona |
| `externalClientId` | Filter by your end-user/client identifier |
| `search` | Free-text across sessions |
| `tags` | Filter by tag key-value pairs |
| `pageIndex` / `pageSize` | Pagination (zero-based) |

```bash
curl "https://companion-api.napster.com/public/sessions?companionId=comp_abc123&pageSize=20" \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

```ts
const res = await fetch(
  "https://companion-api.napster.com/public/sessions?" +
    new URLSearchParams({ externalClientId: "user_12345", pageSize: "20" }),
  { headers: { "X-Api-Key": process.env.NAPSTER_API_KEY! } },
);
const { items, totalCount } = await res.json();
```

```python
import os, requests
res = requests.get(
    "https://companion-api.napster.com/public/sessions",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
    params={"externalClientId": "user_12345", "pageSize": 20},
)
print(res.json()["totalCount"])
```

## Get a session with its transcript

```bash
curl https://companion-api.napster.com/public/sessions/sess_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Adds `conversation.items` — each message in chronological order with `role` (`agent`/`user`), `text`, and `timestamp`:

```json
{
  "id": "sess_abc123",
  "sessionType": "webrtc",
  "modality": "audio",
  "status": "closed",
  "closeReason": "idle_timeout",
  "cost": 0.42,
  "conversation": {
    "items": [
      { "role": "agent", "text": "Hi there! How can I help?", "timestamp": 1710000006 },
      { "role": "user",  "text": "Check my order status.",     "timestamp": 1710000010 }
    ]
  }
}
```

```python
import os, requests
s = requests.get(
    "https://companion-api.napster.com/public/sessions/sess_abc123",
    headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
).json()
for m in s["conversation"]["items"]:
    print(f'{m["role"]}: {m["text"]}')
```

### Tool connection states (`functionStates`)

Session details also include `functionStates` — the connection lifecycle of each **WebSocket-based** tool (HTTP/implicit tools never appear; they hold no session-long connection). Use it to answer "did my tool connect, when, and why not":

```json
"functionStates": [
  { "name": "get_order_status", "state": "connected", "startedAt": "2026-08-14T10:15:02Z", "connectedAt": "2026-08-14T10:15:03Z" },
  { "name": "check_inventory", "state": "failed", "startedAt": "2026-08-14T10:15:02Z", "failedAt": "2026-08-14T10:15:07Z", "error": { "code": "connection_failed", "message": "WebSocket handshake timed out" } }
]
```

Per tool: `state`, `startedAt` / `connectedAt` / `failedAt` (with `error {code, message}`) / `canceledAt` — canceled means the user dropped the session (closed the tab) before the tool finished connecting. Only the timestamps that occurred are present. What the *session* does about a slow or failed tool socket is the tool's `connectionBehavior` setting — see [[create-tool]].

`functionStates` is returned only by `GET /public/sessions/{sessionId}`, not on list items. It replaced `functionMetrics`, which was an object keyed by function library ID with an array under each ID. The entries (`name`, `state`, `startedAt`, `connectedAt`, `failedAt`, `canceledAt`, `error`) are unchanged but now come in one flat array.

## Delete a session

```bash
curl -X DELETE https://companion-api.napster.com/public/sessions/sess_abc123 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Returns `200`. Permanent — also deletes the session's transcript and the memory stored from it, so the agent no longer recalls that conversation for that `externalClientId`. Use it for end-user data-deletion requests (filter by `externalClientId`, delete each session). Only `closed` or `failed` sessions can be deleted — end a live one first with `DELETE /public/connections/{connectionId}` ([[session-runtime]]).

| Error | Status | When |
|---|---|---|
| `SessionNotFound` | `404` | No session with this ID in your project |
| `SessionNotClosed` | `400` | Session is still `pending` or `started` |
| `SessionDeleteFailed` | `400` | Nothing was removed — retry |

## Webhooks — get pushed instead of polling

A webhook `POST`s to the developer's server when a session starts or ends, or when a companion is created, updated, or deleted. Use it to record usage as sessions close, or to learn when a new companion finishes generating, instead of polling.

**Setup is dashboard-only.** There is no API endpoint for webhooks, so you can't create one with an API key. Hand this step to the developer: in the dashboard, **Project → Webhooks → New webhook**, then set the endpoint URL (`https://` only, reachable from the internet), the events, and the status. It needs the organization **Admin** role. A project can have **one enabled webhook** at a time. The confirmation page shows the **signing secret once**; it can't be rotated, so if it's lost, delete the webhook and create a new one. Store it as `NAPSTER_WEBHOOK_SECRET`.

| Event | Sent when |
|---|---|
| `session.started` | A session connected and started |
| `session.closed` | A started session ended (sessions that fail before starting send nothing) |
| `companion.created` | A companion was created (`status: "pending"` while the avatar generates) |
| `companion.updated` | A companion changed, including every generation `status` change: `generationCompleted` → `readyToUse` → `completed` |
| `companion.deleted` | A companion was deleted (payload = the companion before deletion) |

Companion events cover only companions the project owns, not the stock catalog.

Every body shares one envelope; the event is in `data.session` or `data.companion`:

```json
{
  "eventId": "9f1c2e7a-4b3d-4f6e-8a1b-2c3d4e5f6a7b",
  "eventType": "session.closed",
  "timestamp": 1790690142,
  "organizationId": "org_abc123",
  "projectId": "proj_abc123",
  "data": {
    "session": {
      "id": "sess_xyz789", "type": "webrtc", "companionId": "comp_abc123",
      "externalClientId": "user_42", "createdAt": 1790689801, "startedAt": 1790689803,
      "closedAt": 1790690142, "reason": "connection_closed"
    }
  }
}
```

- **Session fields:** `id`, `type` (`webrtc`/`websocket`/`voip`/`sip`; kiosk reports `websocket`), `companionId`, `externalClientId`, `createdAt`, `startedAt`, plus `closedAt` and `reason` (a `closeReason` value) on `session.closed`.
- **No `cost` on the event.** Billing finalizes as the session closes, so fetch `GET /public/sessions/{id}` for `cost` and the transcript.
- **Companion fields:** `id`, `firstName`, `lastName`, `previewUrl`, `videoLoopUrl` (`null` until generated), `ethnicity`, `gender`, `headline`, `tags`, `status`, `createdAt`, `externalClientId`, and `versions` (`[]` until generated).

### Verify the signature

Each request has `X-Webhook-Signature`: the **hex HMAC-SHA256 of the raw request body**, keyed with the signing secret. There is no timestamp header. Two pitfalls, both of which make every request fail verification:

- Sign the **raw bytes**. Never `JSON.parse` and re-serialize the body before hashing.
- Use the secret **as-is**. It looks like base64, and the base64 *string* is the key. Don't decode it.

```ts
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();

app.post("/webhooks/napster", express.raw({ type: "application/json" }), (req, res) => {
  const expected = createHmac("sha256", process.env.NAPSTER_WEBHOOK_SECRET!)
    .update(req.body)
    .digest("hex");
  const received = req.get("X-Webhook-Signature") ?? "";
  if (received.length !== expected.length ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(req.body.toString("utf8"));
  res.sendStatus(200);
  // handle event.eventType after responding
});
```

```python
import hashlib, hmac, os
from flask import Flask, abort, request

app = Flask(__name__)

@app.post("/webhooks/napster")
def napster_webhook():
    expected = hmac.new(os.environ["NAPSTER_WEBHOOK_SECRET"].encode(),
                        request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Webhook-Signature", "")):
        abort(401)
    event = request.get_json()
    return "", 200
```

### Delivery rules

- **Success = any `2xx` within 10 seconds.** Anything else, a network error, or a timeout is a failed attempt, retried up to 3 more times with exponential backoff (~1 s, 2 s, 4 s). After that the delivery is marked failed and **never resent**.
- **Respond first, work after.** Slow handlers cause timeouts, which cause retries.
- **Dedupe on `eventId`.** A request your server handled but answered too late is delivered again.
- **Don't rely on order.** Order by `timestamp` per session or companion.
- **Debugging:** the dashboard keeps each webhook's delivery history: the request sent, and every attempt with the status, body (first 4 KB), and latency your endpoint returned.

You can't trigger a real delivery yourself. To test, have the developer point the webhook at the endpoint (or a tunnel) and start and end a session, then check the delivery history.

## Patterns

- **Per-user history:** filter by `externalClientId` to pull every session for one end user.
- **QA / analytics:** tag sessions at connection time ([[session-runtime]]), then filter by `tags`.
- **Pagination:** loop `pageIndex` until you've read `totalCount` items.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `404 SessionNotFound` | Wrong ID | Use `connection.id` from the connect response |
| `400 SessionNotClosed` on delete | Session still live | End it with `DELETE /public/connections/{id}`, then delete |
| `functionMetrics` is undefined | Renamed | Read `functionStates` |
| Empty `conversation.items` | Session very short or just started | Transcript fills as the session runs/closes |
| Can't find a user's sessions | Filtering on the wrong field | Use `externalClientId`, the value you passed at connect |
| Missing the session you expected | No `externalClientId`/`tags` set | Set them at connect time to make sessions findable |
| Webhook signature never matches | Hashing a re-serialized body, or base64-decoding the secret | HMAC the raw body bytes with the secret string as-is |
| No `session.closed` for a session | It failed before starting | Only started sessions send it; list sessions to see `failed` ones |
| Webhook deliveries keep failing | Endpoint slow, non-`2xx`, or not public `https://` | Respond `2xx` within 10 s, work after; check the dashboard delivery history |

## Next steps

- Set `externalClientId` / `tags` so sessions are findable: [[session-runtime]].
- Review what tools fired and adjust: [[create-tool]], [[manage-agents]].
- React to companion generation finishing: [[create-persona]], [[create-digital-twin]].
