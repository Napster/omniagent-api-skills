---
name: session-runtime
description: Handle everything that happens DURING a live Omniagent session — after the channel is connected, before it closes. Covers per-session configuration set at connection time (cross-session memory via `externalClientId`, user context, tags), the server events your client receives (`avatar_state_changed`, `talk_state_changed`, `message_received`), the client commands you send back (`send_message`, `set_settings`, `send_function_output`), the function-call loop for implicit tools, and the manual greeting nudge. Trigger this skill when the developer asks how to handle events, make the agent greet, handle tool calls in the client, update instructions / temperature / turn detection mid-session, send a system message, enable memory across calls, or pass user context (name, plan, etc.) into a session. Applies equally to WebRTC and WebSocket. For OPENING a session (token, SDK init, panel), use [[deploy-webrtc]] or [[deploy-websocket]] instead. For reading the transcript AFTER a session closes, use [[monitor-sessions]].
---

# session-runtime

## What this skill is

A **session** is one live conversation between an end user and an Omniagent. The other skills are bookends around it: [[deploy-webrtc]] and [[deploy-websocket]] get the session **opened**; [[monitor-sessions]] reads the transcript **after** it closes. This skill is everything **in between** — what the client and server exchange while the call is running.

The runtime is the same on WebRTC and WebSocket:

- The **server pushes events** ("user started speaking," "agent's response item completed," "this implicit tool was just called") that your client reacts to.
- The **client sends commands** back to inject text, change settings, or return tool results.
- **Tools round-trip** through that command channel.

## When to use this skill

Reach for it any time the question is about behavior *during* a live session, not how to start one. Common triggers:

- "How do I handle events?" / "What does the SDK emit?"
- "The agent isn't greeting — how do I make it greet?"
- "How do I handle tool calls in the client?"
- "How do I update instructions / temperature / turn detection mid-session?"
- "How do I send a system message to the agent without interrupting it?"
- "How do I enable memory across calls?" / "How do I pass user context (name, plan) into the session?"
- "What's the format of `arguments` in a function call?"

If the question is about getting a session **opened** (token, SDK init, panel), go to [[deploy-webrtc]] / [[deploy-websocket]] first; this skill assumes you already have a live session.

## How it fits with the deploy skills

```
[deploy-webrtc | deploy-websocket]   →   [session-runtime]   →   [monitor-sessions]
 open the session                       handle the live call    review afterward
 (token, SDK init, panel)               (events, commands,      (transcript, filters)
                                         tool loop, memory)
```

The rest of this skill covers, in order: per-session configuration set at connection time (memory, user context, tags), the server events you receive, the client commands you send, the greeting nudge, and the function-call loop.

## Per-session configuration

Set these on the connection call (`POST /public/agents/{agentId}/connections`), not on the agent:

```bash
curl -X POST https://companion-api.napster.com/public/agents/agent_abc123/connections \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelType": "webrtc",
    "externalClientId": "user_12345",
    "externalClientProfile": { "name": "Jane", "plan": "premium" },
    "tags": { "environment": "production" }
  }'
```

- **`externalClientId`** enables cross-session **memory**, scoped to persona + client ID. Same ID + same persona recalls past conversations. Must match `^[A-Za-z0-9_-]{1,32}$` — hash UUIDs/emails down to that format.
- **`externalClientProfile`** is free-form structured context the agent can use to personalize (name, plan, company, …).
- **`tags`** label the session for filtering in [[monitor-sessions]].

## Server events

Pass an `onData` callback (WebRTC) or read socket messages (WebSocket). The core events:

| Event | Meaning |
|---|---|
| `avatar_state_changed` | Readiness changed (`preparing` → `ready`). |
| `talk_state_changed` | Agent speech (`preparing` → `started` → `ended`). |
| `message_received` | Conversation lifecycle; a `data.action` field marks the stage. |

`message_received` carries `role` (`user`/`assistant`), `action`, `content`, `item_id`, `response_id`, `timestamp`, and more. Useful actions: user `completed` (final transcription in `content`), assistant `delta` (incremental text), assistant `completed` (full response), `cancelled` (with `reason`, e.g. `turn_detected` on barge-in), `failed` (with `error`).

```js
function handleData(msg) {
  switch (msg.event ?? msg.type) {
    case "talk_state_changed":
      // drive a speaking indicator
      break;
    case "message_received":
      if (msg.data.role === "assistant" && msg.data.action === "completed") {
        renderTranscript(msg.data.content);
      }
      break;
  }
}
```

<Callout type="warn">
User transcription `completed` can arrive **after** assistant events have started — don't assume the user's turn finalizes before the agent replies. If `content` is empty, recognition failed; show "[inaudible]".
</Callout>

## Client commands

`send_message` — inject text as the user or as a system context update:

```js
instance.sendCommand({
  type: "send_message",
  data: { role: "system", text: "The user just opened the billing page.", trigger_response: false, delay: true },
});
```

(WebSocket: `ws.send(JSON.stringify({ type: "send_message", data: { … } }))`.)

- `role`: `user` (treated as typed input) or `system` (silent context update).
- `trigger_response`: `true` = respond now; `false` = absorb silently.
- `delay`: `true` = wait until the agent finishes speaking before delivering; `false` (default) = deliver immediately, interrupting.

`set_settings` — change instructions, temperature, or turn detection mid-session (fields optional; included ones replace current values):

```js
instance.sendCommand({
  type: "set_settings",
  data: { turn_detection: { silence_duration_ms: 800 } }, // calm a noisy environment
});
```

`instructions` here **fully replaces** the system prompt — use it to switch the agent's whole role. For a context nudge that keeps the prompt, use `send_message` with `role: system` instead.

## The greeting nudge

The agent doesn't always auto-greet on connect. Force a clean opening once it's ready (WebRTC, in `onAvatarReady` or after `avatar_state_changed: ready`):

```js
instance.sendCommand({
  type: "send_message",
  data: {
    role: "system",
    text: "The session just started and the user is present. Greet them per your instructions.",
    trigger_response: true,
  },
});
```

## The function-call loop (implicit tools)

When the agent calls an implicit tool ([[create-tool]]), the server sends `function_implicitly_called`; you run the logic and reply with `send_function_output` using the same `call_id`.

```js
const seen = new Set();
const handlers = { /* name: async (args) => ({ … }) */ };

async function handleData(msg) {
  const ev = msg.event ?? msg.type;
  if (ev === "function_call_timeout") { console.warn("timeout", msg.data); return; }
  if (ev !== "function_implicitly_called") return;

  const { call_id, name, arguments: args } = msg.data || {};
  if (!call_id || !name || seen.has(call_id)) return; // dedupe — calls may emit twice
  seen.add(call_id);

  const result = handlers[name] ? await handlers[name](args || {}) : { ok: false, error: "unknown_function" };
  instance.sendCommand({ type: "send_function_output", data: { call_id, output: result, delay: false } });
}
```

- `arguments` is already a parsed object — don't `JSON.parse` it.
- `output` should be a plain object, not a stringified one.
- **Dedupe by `call_id`** — the same call can arrive twice (streaming + final).
- Default tool timeout is **10s**; miss it and the model gets "Failed to fetch information" plus a `function_call_timeout` event.
- If the agent never calls a tool the prompt asks for: the tool isn't attached to the agent ([[create-agent]]) — creating it isn't enough.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `sendCommand is not a function` | init not awaited | `await NapsterCompanionApiSdk.init(...)` ([[deploy-webrtc]]) |
| No greeting | Agent didn't auto-open | Send the greeting nudge on ready |
| Tool runs twice | No dedupe | Track `call_id` in a `Set` |
| `JSON.parse(arguments)` throws | `arguments` already an object | Use it directly |
| Memory not recalled | Missing/changing `externalClientId` | Use a stable ID matching the regex |
| Events look empty | Reading wrong field | Log the whole message; key is `event` or `type` |

## Next steps

- Set up the connection: [[deploy-webrtc]] / [[deploy-websocket]].
- Define tools the loop handles: [[create-tool]].
- Inspect finished sessions: [[monitor-sessions]].
