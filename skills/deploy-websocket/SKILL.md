---
name: deploy-websocket
description: Deploy an Omniagent to a WebSocket channel — audio or text — for server-side integrations, headless clients, chatbots, or apps that don't need video. Use when the developer says "connect over WebSocket", "audio-only session", "text-only chat", "text chatbot", "headless agent", "stream audio to the agent", or wants a lightweight non-browser connection. Covers creating the connection, choosing the modality (audio vs text), decoding the token, opening the socket, the PCM16 audio protocol, text sessions, and barge-in handling. For browser audio + video use [[deploy-webrtc]]; for phone use [[deploy-phone]].
---

# deploy-websocket

WebSocket is the **video-free** channel: a lightweight connection ideal for server-side integrations, headless clients, or custom apps. It runs in one of two modalities — **audio** (voice, the default) or **text** (a typed chat with no audio) — chosen per connection. Like WebRTC, you deploy by creating a per-session connection and connecting; the agent owns persona, voice, tools, and knowledge.

## Prerequisites

- An **agent ID** (`agent_…`). If you don't have one, route to [[create-agent]].
- A server-side place to hold the API key — the token request must not run in an untrusted client.

## 1. Create a session

```bash
curl -X POST https://companion-api.napster.com/public/agents/agent_abc123/connections \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "channelType": "websocket" }'
```

Returns `{ token, connection: { id, … } }`. Store `connection.id` to fetch the transcript later ([[monitor-sessions]]). You can pass `externalClientId` for cross-session memory, and `initialSpeech` to tell the agent how to open ([[session-runtime]]).

For a **text-only** session, add `modality: "text"` to the body (`{ "channelType": "websocket", "modality": "text" }`) — see [Text-only sessions](#text-only-sessions) below. Omit `modality` for audio (the default).

The fallback for assembling a session without an agent is `POST /public/ws-connections` (companionId + functions + knowledge; `modality` works there too). Prefer the agent path.

To end a live session from your server, call `DELETE /public/connections/{connection.id}` — it closes immediately with `closeReason: "connection_aborted"` (`400 ConnectionNotFound` if it already ended).

## 2. Decode the token

The token is base64-encoded JSON: `{ url, token, connection, expiresAt }`. You only need `url` — the WebSocket endpoint already has the token embedded as a `?token=…` query param, so don't append `token` yourself (a second `?token=` makes an invalid URL).

```js
const { url } = JSON.parse(Buffer.from(token, "base64").toString());
```

```python
import base64, json
url = json.loads(base64.b64decode(token))["url"]
```

```js
// Browser
const { url } = JSON.parse(atob(token));
```

Open the socket before `expiresAt` — if the client doesn't connect in time, the session closes with `closeReason: "connection_timeout"`.

## 3. Open the connection

Pass `url` straight to your WebSocket client — the token is already in the URL, so set no auth header or query param. The `https` URL upgrades to a secure WebSocket automatically; don't rewrite the scheme:

```js
import WebSocket from "ws";
const ws = new WebSocket(url);
ws.on("open", () => console.log("connected"));
ws.on("message", (data) => {
  const event = JSON.parse(data);
  // handle server events — see session-runtime
});
```

```python
import websocket
ws = websocket.WebSocketApp(
    url,
    on_open=lambda ws: print("connected"),
    on_message=lambda ws, msg: handle(json.loads(msg)),
)
ws.run_forever()
```

```js
// Browser — same url; no headers needed
const ws = new WebSocket(url);
ws.addEventListener("message", (e) => handle(JSON.parse(e.data)));
```

## 4. Audio protocol

Audio is **16-bit PCM, 16 kHz, mono, base64-encoded** in both directions.

Send mic audio:

```js
ws.send(JSON.stringify({ type: "send_audio", data: { data: base64Pcm16 } }));
```

Receive agent audio via `audio_received` events. Server events carry their name in the top-level `event` key (client commands use `type`):

```js
function handle(msg) {
  if (msg.event === "audio_received") {
    playPcm16(base64ToBytes(msg.data.data)); // your playback
  }
}
```

Events (`avatar_state_changed`, `talk_state_changed`, `message_received`) and client commands (`send_message`, `set_settings`, `send_function_output`) are identical to WebRTC — see [[session-runtime]]. Also handle the session errors and shutdown events — `avatar_connection_warning` (`disconnect_after` 60/30/10 s before an idle close; sessions close after 3 minutes idle unless the agent sets `disableIdleTimeout`), `session_expired`, `no_credits_left`, `provider_connection_aborted` (`{ error: { code, message } }`), and `reaching_rate_limits` — so a headless client can report why a session ended.

## 5. Barge-in (interruption)

Turn detection is always on. When the user speaks over the agent, the server sends `speech_started` and cancels the current response. With a Cascade API key, `speech_started` arrives after the user's speech is transcribed, so interruptions are detected later. Your client must:

1. **Stop queued playback immediately.** The server cancels generation, but audio already buffered on your side keeps playing unless you clear it.
2. **Never mute the mic during agent speech.** If the mic is muted, the server can't detect the interruption.
3. **Enable echo cancellation** in browser environments — `getUserMedia({ audio: { echoCancellation: true } })`. Without it, the agent hears itself and interrupts in a loop.

## Text-only sessions

Set `modality: "text"` on the connection to run a **typed, text-only** session — no audio in or out, no avatar. Everything else (token, socket) is the same; only the message protocol differs.

```bash
curl -X POST https://companion-api.napster.com/public/agents/agent_abc123/connections \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "channelType": "websocket", "modality": "text" }'
```

In a text session you **don't** use `send_audio` / `audio_received`. Send the user's message with the `send_message` command, and read the agent's reply from `message_received` events (fields nested under `data.message` — see [[session-runtime]]):

```json
// send — the user's message
{ "type": "send_message", "data": { "role": "user", "text": "Hello", "trigger_response": true } }
```

```json
// receive — the agent's reply (note the fields are nested under data.message, not data)
{ "event": "message_received", "data": { "message": { "role": "assistant", "action": "delta", "content": "Hi" } } }
```

A text session has no speech, so speaking-related events never fire — no turn detection or barge-in, and no `talk_state_changed`. You still receive `message_received`, `avatar_state_changed`, and the other non-speech events — including tool calls (`function_implicitly_called`) and the session errors and shutdown events (`avatar_connection_warning`, `session_expired`, `no_credits_left`, `provider_connection_aborted`). Text is a **modality**, not a separate channel: it always runs over WebSocket (WebRTC is for audio + video).

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Connection refused / 401 on socket | Dropped or duplicated the token | Connect to the decoded `url` as-is — the token is already embedded; don't strip the query string |
| Invalid URL / double `?token=` | Appended `?token=` to a URL that already has it | Connect to `url` as-is — the token is already in it |
| `atob`/decode throws | Token used raw | Base64-decode the token to get `{ url, token, connection, expiresAt }` first |
| No audio / garbled | Wrong audio format | Must be PCM16, 16 kHz, mono, base64 |
| Agent talks over itself | Mic muted during playback or no echo cancellation | Keep mic open; enable `echoCancellation` |
| Agent won't stop on interruption | Buffered audio not cleared | Flush playback on `speech_started` |
| Socket opens, then closes with `provider_connection_aborted` | Provider rejected the config (`invalid_voice`, `invalid_credentials`, `instructions_too_long`, `connection_failed`) — this is not a 400 at connection creation | Fix the agent or API key, then open a new session |
| Session closes with `connection_timeout` | Socket opened after `expiresAt` | Connect right after creating the connection |
| `avatar_connection_warning`, then close (`idle_timeout`) | 3 minutes with no audio or messages | Keep streaming, or set `disableIdleTimeout` on the agent |
| `429 RequestRateLimitExceeded` creating the session | Over 1 connection request/second per API key (shared across all connection endpoints) | Honor the `Retry-After` header |

## Next steps

- Events, commands, and the tool-call loop: [[session-runtime]].
- Pull the transcript afterward: [[monitor-sessions]].
- Audio/WebSocket pitfalls: [[troubleshoot-omniagent]] § Audio (WebSocket).
