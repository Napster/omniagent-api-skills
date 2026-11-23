---
name: session-runtime
description: Handle everything that happens DURING a live Omniagent session — after the channel is connected, before it closes. Covers per-session configuration set at connection time (cross-session memory via `externalClientId`, user context, tags), the server events your client receives (`avatar_state_changed`, `talk_state_changed`, `message_received`), the client commands you send back (`send_message`, `set_settings`, `send_function_output`), the function-call loop for implicit tools, and the manual greeting nudge. Trigger this skill when the developer asks how to handle events, make the agent greet, handle tool calls in the client, update instructions / temperature / turn detection mid-session, send a system message, use puppeteer mode / make the agent say exact lines (`talk`), end a live session from the backend, refresh MCP tokens mid-session, handle session warnings and shutdown events, enable memory across calls, or pass user context (name, plan, etc.) into a session. Applies equally to WebRTC and WebSocket. For OPENING a session (token, SDK init, panel), use [[deploy-webrtc]] or [[deploy-websocket]] instead. For reading the transcript AFTER a session closes, use [[monitor-sessions]].
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

The rest of this skill covers, in order: per-session configuration set at connection time (memory, user context, tags), the server events you receive, the client commands you send, the greeting nudge, the function-call loop, and ending a session from your backend.

## Per-session configuration

Set these on the connection call (`POST /public/agents/{agentId}/connections`), not on the agent:

```bash
curl -X POST https://napster-api.napster.com/public/agents/agent_abc123/connections \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelType": "webrtc",
    "externalClientId": "user_12345",
    "externalClientProfile": { "name": "Jane", "plan": "premium" },
    "initialSpeech": "Greet the user warmly, introduce yourself, and ask what they need help with.",
    "tags": { "environment": "production" }
  }'
```

- **`externalClientId`** enables cross-session **memory**, scoped to persona + client ID. Same ID + same persona recalls past conversations. Must match `^[A-Za-z0-9_-]{1,32}$` — hash UUIDs/emails down to that format. On SIP and VoIP calls you don't set it: the platform uses the caller's number, so callers get memory across calls automatically. Callers who hide their number share one memory.
- **`externalClientProfile`** is free-form structured context the agent can use to personalize (name, plan, company, …).
- **`initialSpeech`** tells the agent how to open the session before the user speaks — an *instruction* it follows in its own voice, not a verbatim line to read. This is the server-side alternative to the greeting nudge below. It's also settable on the channel config (`PUT /public/agents/{id}/channels/{type}`) to default it for every session on a channel.
- **`tags`** label the session for filtering in [[monitor-sessions]].

## Server events

Pass an `onData` callback (WebRTC) or read socket messages (WebSocket). The core events:

| Event | Meaning |
|---|---|
| `avatar_state_changed` | Readiness changed (`preparing` → `ready`). `ready` can REPEAT: on WebRTC with `videoPolicy: "deferred"` it fires at audio-ready (`data.details.mode: "audio_only"`) and again at video-ready (`"audio_video"`). Latch it — run session-start logic once. `failed` means the avatar couldn't start, and the session closes with `avatar_allocation_failed`. `video_failed` means the deferred video couldn't load, and the session continues on audio. Both carry `data.error_details` (`code`: `video_unavailable` or `initialization_failed`, plus `message`). |
| `talk_state_changed` | Agent speech: `preparing` → `started` → `ended`, or `canceled` if the user barges in. `data.talk_id` identifies the line (in puppeteer mode it's your `talkId`). Only a digital twin on a Realtime key speaks sentence by sentence: it fills in `data.sentence_index` (from `0`) and sends `in_progress` for each new sentence. Everywhere else, including all Cascade and puppeteer sessions, `sentence_index` is `null` and there's no `in_progress`. |
| `message_received` | Conversation lifecycle, tool calls and MCP activity; fields nest under `data.message`, `data.message.type` says which kind of frame it is, and `data.message.action` marks the stage. |
| `ui_update` | Arbitrary JSON the developer's OWN functions server pushed (via a WebSocket explicit tool — see [[create-tool]]). Relayed verbatim; `data` is whatever shape that server sent, so dispatch on a developer-defined discriminator. One-way, no ack, not stored (late-joining clients miss past updates). |
| `avatar_connection_warning` | Idle session closing soon: `data.disconnect_after` is `60`, `30`, then `10` seconds. After 3 minutes idle the session closes with `closeReason: "idle_timeout"`, unless the agent sets `disableIdleTimeout` (then there are no warnings). Phone calls always close after 3 minutes without anyone speaking. The Web SDK shows its **Still there?** card for this warning, but `onInactivityStatusChange` doesn't fire, so watch for the event in `onData`. |
| `session_expired` / `no_credits_left` | Session is closing (`data` is `null`); `closeReason` matches the event name. |
| `provider_connection_aborted` | The provider rejected the config after the client connected: `data.error.code` is `invalid_voice`, `invalid_model`, `invalid_credentials`, `instructions_too_long` or `connection_failed` (`data` can be `null`). The session closes — fix the agent or key and reconnect. |
| `reaching_rate_limits` | Warning only: `{ name, remaining_rate, reset_seconds }`. |
| `error` | `{ message }`. Sent when the platform rejects a `set_settings` command (nothing is applied, and the session continues), when a WebSocket tool with `waitBeforeStart` and `abortOnFailure` both `true` can't connect (the session closes with `function_connection_failed`), or when a WebSocket session can't start (the session closes). `message` is for logs; don't match on its text. |

**Web SDK 2.0 also routes some of these to `onError`.** `session_expired`, `no_credits_left` and `provider_connection_aborted` reach `onError`, and the SDK ends the session; `onData` gets them only after teardown, so handle them in `onError` or `onDestroy`. `avatar_state_changed` with `failed` or `video_failed` also reaches `onError` (`video_failed` doesn't end the session). `error` reaches `onError` as `Received "error" event`, with the server's text in `error.context.serverMessage.data.message`. To tell errors apart, check `error.name`, then `error.context.reason` (`ConnectionError`) or `error.context.event` (`WebRTCError`).

`message_received` fields are nested under **`data.message`**. This holds on **both** transports; over WebRTC the Web SDK delivers the event as-is. `data.message` carries `role` (`user`/`assistant`), `action`, `content`, `item_id`, `response_id`, `timestamp`, a `type`, and more (`tokens`, `is_forced`, `content_index`). `type` is one of seven frame kinds: `message` (a user or assistant message), `session`, `function_call`, `function_call_output`, `mcp_tools`, `mcp_call` and `mcp_approval_request`. The **first** frame is a session marker (`type: "session"`, no `role`/`content`), and another one arrives if the connection to the AI provider is restored — skip any frame where `data.message.type === "session"`. Tool and MCP frames have no `role`, so a transcript built by filtering on role or action must check `type === "message"` first. Useful actions: user `completed` (final transcription in `content`), assistant `delta` (incremental text), assistant `completed` (full response), `cancelled` (with `reason`, e.g. `turn_detected` on barge-in), `failed` (with `error`).

On a Cascade key, user speech events (`speech_started` and the related events) arrive together after the transcript, and barge-in cancellations report `reason: "interrupted"`, not `"turn_detected"`.

```js
function handleData(msg) {
  switch (msg.event ?? msg.type) {
    case "talk_state_changed":
      // drive a speaking indicator
      break;
    case "message_received": {
      const m = msg.data.message;              // fields are nested under data.message
      if (!m) break;
      if (m.type === "message" && m.role === "assistant" && m.action === "completed") {
        renderTranscript(m.content);
      } else if (m.type?.startsWith("mcp_")) {
        handleMcp(m);                          // see MCP events below
      }                                        // skip "session" and function_call frames
      break;
    }
  }
}
```

<Callout type="warn">
User transcription `completed` can arrive **after** assistant events have started — don't assume the user's turn finalizes before the agent replies. If `content` is empty, recognition failed; show "[inaudible]".
</Callout>

### Tool call frames

When the agent calls one of its tools, `message_received` frames report it, with no `role`. A `function_call` frame arrives with `action: "created"`, then another with `action: "completed"` carrying the tool's name in `tool` and the arguments in `content` as a JSON string. When the tool returns, a `function_call_output` frame arrives with `action: "created"` and the output in `content`. All three share a `call_id`. These are for display and logging; implicit tools still need the function-call loop below.

### MCP events

MCP activity arrives as `message_received` frames like everything else, with the kind in **`data.message.type`** (`msg.event` is `"message_received"`, so a switch on `msg.event ?? msg.type` never sees `mcp_call`):

- `mcp_tools`: one per server at session start. `completed` includes `tool_names`; `failed` includes `error` as a string.
- `mcp_call`: `created` (arguments as a JSON string in `content`), then `completed` or `failed`, paired by `item_id`.
- `mcp_approval_request`: `created`, then answer with `send_mcp_approval` within 15 s. It ends with `completed` (`result`: `approved` or `rejected`; `source`: `client` if your app answered, `voice` if the user answered the agent out loud) or `cancelled` (timed out). `server` and `tool` are on every action. Clear the prompt on `completed` even if your app never sent `send_mcp_approval`, since the user may have answered by voice.

See [[add-mcp-servers]].

## Client commands

`send_message` — inject text as the user or as a system context update:

```js
instance.sendCommand({
  type: "send_message",
  data: { role: "system", text: "The user just opened the billing page.", trigger_response: false },
});
```

(WebSocket: `ws.send(JSON.stringify({ type: "send_message", data: { … } }))`. The developer's FUNCTIONS server can inject context the same way from its side — `context_update` on the tool socket, with `content` instead of `text`; see [[create-tool]]. Use that for backend-driven context like deferred tool results.)

- `role`: `user` (treated as typed input) or `system` (silent context update).
- `trigger_response`: `true` = respond now; `false` = absorb silently.
- `delay`: only applies with `trigger_response: true`. `true` = wait until the agent's current reply finishes, then respond; `false` (default) = interrupt the current reply. A `trigger_response: false` message is added right away and never interrupts, whatever `delay` says.

`set_settings` — change session settings mid-session. All fields are optional; omitted fields keep their current values. Which fields work depends on the API key's architecture:

| Field | Architecture | Effect |
|---|---|---|
| `instructions` | Realtime, Cascade | Fully replaces the system prompt |
| `temperature` | Realtime | 0–1 |
| `turn_detection` | Realtime | `{ threshold, prefix_padding_ms, silence_duration_ms }` |
| `modality` | Realtime | WebSocket only. `audio` ↔ `text`; switching to `audio` fails if the session has no voice. On WebRTC it's rejected with an `error` event |
| `inline_functions` | Realtime, Cascade | Register tools for the rest of the session (tool-definition shape plus `id`). Only implicit tools or explicit tools on an `http(s)` URL. Names can't collide with the agent's own tools. Each send replaces the previous inline set |
| `mcp.authorizations` | Realtime | `[{ "mcp_server_id", "token" }]` — refresh per-user MCP tokens ([[add-mcp-servers]]) |

`set_settings` isn't supported on Microsoft Foundry keys. If the platform rejects a `set_settings` command (an invalid value, or one not supported on the channel), it applies none of the settings and sends an `error` event; the session continues.

In TypeScript, the Web SDK's typed `set_settings` payload covers only `modality` and `inline_functions`. For `instructions`, `temperature` or `turn_detection`, cast the command, as in the `talk` example below.

```js
instance.sendCommand({
  type: "set_settings",
  data: { turn_detection: { silence_duration_ms: 800 } }, // calm a noisy environment
});
```

`instructions` here **fully replaces** the system prompt — use it to switch the agent's whole role. For a context nudge that keeps the prompt, use `send_message` with `role: system` instead.

`talk` — puppeteer mode only. Set `mode: "puppeteer"` on the agent, or per session on `POST /public/connections` or `POST /public/ws-connections`. It requires a Cascade API key; a Cascade key with only text-to-speech is enough, and other keys return `400 UnsupportedSessionMode`. The agent speaks exactly your text:

```js
instance.sendCommand({ type: "talk", data: { talkId: "intro-1", text: "Welcome to Acme.", split: true } });
```

`talk` isn't in the Web SDK's typed command union, so TypeScript needs a cast: `type Command = Parameters<NapsterCompanionApiInstance["sendCommand"]>[0];` then `instance.sendCommand({ … } as unknown as Command)`.

`split` (default `true`) speaks the text sentence by sentence. Track each line with `talk_state_changed` where `talk_id === talkId`. Puppeteer agents can't use SIP or VoIP.

## The greeting nudge

The agent doesn't always auto-greet on connect. Two ways to get a clean opening: set `initialSpeech` on the connection (above) so the server opens the conversation, or — for full client-side control of timing — force it once the session is ready. On WebRTC, do this in `onAvatarReady` when `isReady` is `true`: it fires once per session, as soon as the session is live (under deferred video, that's on the audio, before the video appears). With the Web SDK's launcher, each session the visitor starts fires it again. Commands sent before it are dropped. If you key off `avatar_state_changed: ready` instead, LATCH it — with `videoPolicy: "deferred"` the session emits `ready` twice (audio first, then video), and an unlatched handler greets twice:

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
- Default tool timeout is **10s**; miss it and the model gets "Failed to fetch information" plus a `function_call_timeout` event (`data: { call_id, function_name }`). A `send_function_output` sent after the timeout is dropped. Slow handler? Reply with an interim `send_function_output` NOW ("working on it"), then inject the real outcome later with `send_message` (`role: "system"`, `trigger_response: true`) — see [[create-tool]] § Long-running work.
- If the agent never calls a tool the prompt asks for: the tool isn't attached to the agent ([[create-agent]]) — creating it isn't enough.

## Ending a session from your backend

```bash
curl -X DELETE https://napster-api.napster.com/public/connections/sess_xyz789 \
  -H "X-Api-Key: $NAPSTER_API_KEY"
```

Closes a live `webrtc` / `websocket` / `kiosk` session immediately; it's recorded as `closed` with `closeReason: "connection_aborted"`. Errors: `400 ConnectionNotFound` (unknown ID or already closed), `400 ConnectionAbortNotSupported` (`sip`/`voip`), `400 ConnectionAbortFailed` (retry). Counts against the shared connection rate limit (1 request/second per API key).

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `sendCommand is not a function` | init not awaited, or `button.enabled` is on | `await NapsterCompanionApiSdk.init(...)`. With the launcher, `init` resolves to a controller: use the instance `start()` returns, or `getInstance()` ([[deploy-webrtc]]) |
| First command ignored | Sent before the session was live | `init` resolves before the session connects; send it from `onAvatarReady(true)` |
| MCP handler never fires | Switching on `msg.event ?? msg.type` | MCP frames are `message_received`; dispatch on `msg.data.message.type` |
| No greeting | Agent didn't auto-open | Send the greeting nudge on ready |
| Tool runs twice | No dedupe | Track `call_id` in a `Set` |
| `JSON.parse(arguments)` throws | `arguments` already an object | Use it directly |
| Memory not recalled | Missing/changing `externalClientId` | Use a stable ID matching the regex |
| Events look empty | Reading wrong field | Log the whole message; the event name is in `event`, and `message_received` fields are under `data.message` |

## Next steps

- Set up the connection: [[deploy-webrtc]] / [[deploy-websocket]].
- Define tools the loop handles: [[create-tool]].
- Inspect finished sessions: [[monitor-sessions]].
