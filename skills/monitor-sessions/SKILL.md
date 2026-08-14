---
name: monitor-sessions
description: List Omniagent sessions and retrieve full conversation transcripts. Use when the developer says "list sessions", "get the transcript", "what did the agent say", "filter sessions by user", "audit conversations", or wants analytics/QA on past calls. Covers the list endpoint with filters, the single-session endpoint with the transcript, and how session IDs come from the connection response.
---

# monitor-sessions

Every connection creates a **session** that captures the configuration used (persona, tools, knowledge, FAQs), timing, and the full transcript. The Sessions API is read-only and has two endpoints: list (with filters) and get-one (with the transcript).

## Where the session ID comes from

When you create a connection ([[deploy-webrtc]] / [[deploy-websocket]]), the response includes `connection.id` — that's the session ID. Store it on your backend to look the session up later.

## List sessions

```bash
curl "https://companion-api.napster.com/public/sessions?pageSize=10" \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Each item includes `id`, `companionId` (+ `companion`), `functions`, `knowledgeBaseId`, `faqIds`, `externalClientId`, `tags`, `sessionType` (`webrtc`/`websocket`/`voip`/`sip`/`kiosk`), `modality` (`audio`/`text`/`video`), `status`, `closeReason`, `cost`, and timestamps (`createdAt`, `startedAt`, `closedAt`). The envelope has `items`, `filteredCount`, `totalCount`, `pageIndex`, `pageSize`.

`status` is `pending`, `started`, `closed`, or `failed` — a session moves `pending → started → closed`, or straight to `failed` if the connection is never established. Failed sessions appear in the list like any other (they are deliberately kept in analytics); there is **no status filter parameter** — separate them client-side by the field. For `failed` sessions, `closeReason` may indicate the cause.

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

### Tool connection metrics (`functionMetrics`)

Session details also include `functionMetrics` — the connection lifecycle of each **WebSocket-based** tool (HTTP/implicit tools never appear; they hold no session-long connection). Use it to answer "did my tool connect, when, and why not":

```json
"functionMetrics": [
  { "name": "get_order_status", "state": "connected", "startedAt": "2026-08-14T10:15:02Z", "connectedAt": "2026-08-14T10:15:03Z" },
  { "name": "check_inventory", "state": "failed", "startedAt": "2026-08-14T10:15:02Z", "failedAt": "2026-08-14T10:15:07Z", "error": { "code": "connection_failed", "message": "WebSocket handshake timed out" } }
]
```

Per tool: `state`, `startedAt` / `connectedAt` / `failedAt` (with `error {code, message}`) / `canceledAt` — canceled means the user dropped the session (closed the tab) before the tool finished connecting. Only the timestamps that occurred are present. What the *session* does about a slow or failed tool socket is the tool's `connectionBehavior` setting — see [[create-tool]].

## Patterns

- **Per-user history:** filter by `externalClientId` to pull every session for one end user.
- **QA / analytics:** tag sessions at connection time ([[session-runtime]]), then filter by `tags`.
- **Pagination:** loop `pageIndex` until you've read `totalCount` items.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `404` on a session | Wrong ID | Use `connection.id` from the connect response |
| Empty `conversation.items` | Session very short or just started | Transcript fills as the session runs/closes |
| Can't find a user's sessions | Filtering on the wrong field | Use `externalClientId`, the value you passed at connect |
| Missing the session you expected | No `externalClientId`/`tags` set | Set them at connect time to make sessions findable |

## Next steps

- Set `externalClientId` / `tags` so sessions are findable: [[session-runtime]].
- Review what tools fired and adjust: [[create-tool]], [[manage-agents]].
