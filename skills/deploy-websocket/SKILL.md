---
name: deploy-websocket
description: Deploy an Omniagent to an audio-only WebSocket channel — for server-side integrations, headless clients, or apps that don't need video. Use when the developer says "connect over WebSocket", "audio-only session", "headless agent", "stream audio to the agent", or wants a lightweight non-browser connection. Covers creating the connection, decoding the token, opening the socket, the PCM16 audio protocol, and barge-in handling. For browser audio + video use [[deploy-webrtc]]; for phone use [[deploy-phone]].
---

# deploy-websocket

WebSocket is the **audio-only** channel: a lightweight, video-free connection ideal for server-side integrations, headless clients, or custom apps. Like WebRTC, you deploy by creating a per-session connection and connecting — the agent owns persona, voice, tools, and knowledge.

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

Returns `{ token, connection: { id, … } }`. Store `connection.id` to fetch the transcript later ([[monitor-sessions]]). You can pass `externalClientId` for cross-session memory.

The fallback for assembling a session without an agent is `POST /public/ws-connections` (companionId + functions + knowledge). Prefer the agent path.

## 2. Decode the token

The token is base64-encoded JSON with the WebSocket URL and an auth token:

```js
const decoded = JSON.parse(Buffer.from(token, "base64").toString());
const { url, authToken } = decoded;
```

```python
import base64, json
decoded = json.loads(base64.b64decode(token))
url, auth_token = decoded["url"], decoded["authToken"]
```

```js
// Browser
const { url, authToken } = JSON.parse(atob(token));
```

## 3. Open the connection

Server runtimes (Node `ws`, Python `websocket-client`) support custom headers:

```js
import WebSocket from "ws";
const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${authToken}` } });
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
    header={"Authorization": f"Bearer {auth_token}"},
    on_open=lambda ws: print("connected"),
    on_message=lambda ws, msg: handle(json.loads(msg)),
)
ws.run_forever()
```

The **browser** `WebSocket` API can't set headers — pass the auth token as a query param instead:

```js
const ws = new WebSocket(`${url}?token=${authToken}`);
ws.addEventListener("message", (e) => handle(JSON.parse(e.data)));
```

## 4. Audio protocol

Audio is **16-bit PCM, 16 kHz, mono, base64-encoded** in both directions.

Send mic audio:

```js
ws.send(JSON.stringify({ type: "send_audio", data: { audio: base64Pcm16 } }));
```

Receive agent audio via `audio_received` events:

```js
function handle(event) {
  if (event.type === "audio_received") {
    playPcm16(base64ToBytes(event.data.audio)); // your playback
  }
}
```

Events (`avatar_state_changed`, `talk_state_changed`, `message_received`) and client commands (`send_message`, `set_settings`, `send_function_output`) are identical to WebRTC — see [[session-runtime]].

## 5. Barge-in (interruption)

Turn detection is always on. When the user speaks over the agent, the server sends `speech_started` and cancels the current response. Your client must:

1. **Stop queued playback immediately.** The server cancels generation, but audio already buffered on your side keeps playing unless you clear it.
2. **Never mute the mic during agent speech.** If the mic is muted, the server can't detect the interruption.
3. **Enable echo cancellation** in browser environments — `getUserMedia({ audio: { echoCancellation: true } })`. Without it, the agent hears itself and interrupts in a loop.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Connection refused / 401 on socket | Auth not sent | Header `Authorization: Bearer <authToken>` (server) or `?token=` (browser) |
| `atob`/decode throws | Token used raw | Base64-decode the token to get `{ url, authToken }` first |
| No audio / garbled | Wrong audio format | Must be PCM16, 16 kHz, mono, base64 |
| Agent talks over itself | Mic muted during playback or no echo cancellation | Keep mic open; enable `echoCancellation` |
| Agent won't stop on interruption | Buffered audio not cleared | Flush playback on `speech_started` |

## Next steps

- Events, commands, and the tool-call loop: [[session-runtime]].
- Pull the transcript afterward: [[monitor-sessions]].
- Audio/WebSocket pitfalls: [[troubleshoot-omniagent]] § Audio (WebSocket).
