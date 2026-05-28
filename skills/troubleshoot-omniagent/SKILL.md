---
name: troubleshoot-omniagent
description: Diagnose and fix problems with the Napster Omniagent API across every channel. Use when the developer reports something broken — "401 / unauthorized", "no audio", "mic not working", "the avatar won't load", "the agent won't call my function", "persona stuck pending", "SIP won't register", "session won't connect", "iframe blocks the mic", or "it works locally but not in production". Organized by area so you can jump to the symptom. Cross-links to the skill that prevents each problem.
---

# troubleshoot-omniagent

The pitfall index for the Omniagent API, organized by area. Find the area, scan the symptom-to-fix table, then follow the cross-link to the skill that gets it right the first time.

When this skill and the live docs disagree, **the docs win** — re-check with the docs MCP server (`fetch-page`, `get-api-spec`) and the Swagger at `https://companion-api.napster.com`.

## Authentication and API keys

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` on every call | Key missing/expired/invalid | Re-check `NAPSTER_API_KEY`; regenerate in the dashboard |
| `401` despite a correct key | Wrong header | Use `X-Api-Key: <key>`, not `Authorization: Bearer` |
| Works locally, 401 in CI/prod | Env var not set in that environment | Add `NAPSTER_API_KEY` to the secret store |
| Resource "not found" that you created | Key scoped to a different project | Use the key for the project the resource lives in |
| Key visible in browser network tab | API key used client-side | Move issuance server-side; browser gets a token only |

Prevention: [[setup-api-key]], [[deploy-webrtc]] (token pattern).

## Persona creation and status lifecycle

| Symptom | Likely cause | Fix |
|---|---|---|
| `400` creating a persona | Missing `description` | `description` is required |
| `400` on `ethnicity` | Unsupported value | Use a value from `/public/companions/ethnicities` |
| Avatar looks wrong/distorted | Low-quality source image | Use a 16:9, well-lit image; person looking into the camera, waist up |
| Can't attach a new custom persona yet | Still `pending` / `generationCompleted` | Wait for `readyToUse` before using it in an agent |
| Editing the persona is rejected | Persona only `readyToUse` | Edits require `completed`; `readyToUse` allows use but not edits |

Prevention: [[create-persona]].

## Audio and microphone (WebRTC)

| Symptom | Likely cause | Fix |
|---|---|---|
| Avatar mounts but never speaks | Mic permission denied | Grant mic access; do the `getUserMedia` preflight first |
| Mic prompt never appears | Insecure context | Serve over `https` or `http://localhost`, not `file://` |
| No prompt in VS Code preview | Simple Browser blocks media | Open in Chrome/Edge/Firefox/Safari |
| `NotAllowedError` / "Failed to access user media" | Permission blocked or no preflight | Preflight `getUserMedia`, surface a clear error UI |
| Avatar overflows / misaligned | Mount container not bounded | Use the `.omniagent-mount` box; don't fight the SDK with `!important` |
| `sendCommand is not a function` | `init()` not awaited | `await NapsterCompanionApiSdk.init(...)` |
| Session errors at connect (e.g. on the data channel) but agent creation succeeded | Invalid `voiceId` — not validated at create time | Set a supported voice from the docs and update the agent ([[create-agent]]) |
| Green-screen ghost / halo / color showing through | Server and SDK out of sync | Set BOTH `useGreenVideo: true` on the webrtc channel config AND `avatarStyle.view: "silhouette"` in the SDK init — they have to match |

Prevention: [[deploy-webrtc]], [[session-runtime]].

## Audio (WebSocket)

| Symptom | Likely cause | Fix |
|---|---|---|
| Socket refused / `401` | Auth not sent | Header `Authorization: Bearer <authToken>` (server) or `?token=` (browser) |
| Decode/`atob` throws | Used token raw | Base64-decode to `{ url, authToken }` first |
| Silence or garbled audio | Wrong audio format | PCM16, 16 kHz, mono, base64 in both directions |
| Agent interrupts itself constantly | No echo cancellation | `getUserMedia({ audio: { echoCancellation: true } })` |
| Agent won't stop on barge-in | Buffered audio not cleared | Flush playback on `speech_started` |
| Can't set socket headers in browser | Browser WebSocket limitation | Pass auth as `?token=` query param |

Prevention: [[deploy-websocket]].

## Phone channel (VoIP and SIP)

| Symptom | Likely cause | Fix |
|---|---|---|
| (VoIP) Calls ring, agent never answers | Webhook not set / set on wrong number | Set `voipEndpoint` as the incoming-call webhook for that number at your provider |
| (SIP) `sipStatus` stuck `registering` | Bad credentials / wrong transport | Check `/errors`; `401` = creds; verify server/domain/transport |
| (SIP) `lifecycleStatus: Failed` | Listener couldn't start | Read `status.message`; recheck `settings` |
| (SIP) Calls ring, agent never answers | Number not routed to the trunk | Fix provider-side routing to the SIP endpoint |
| (SIP) Agent answers but won't transfer | Handoff off or vague description | Enable handoff on the SIP channel config; write a specific `transferDescription` |
| (VoIP) Need human handoff | Not supported on VoIP today | SIP-only for now; switch the agent to the SIP path |
| Agent talks over the caller | Phone-side VAD too sensitive | Raise `silence_duration_ms` via the channel `providerSettings` override |

Prevention: [[deploy-phone]].

## Function calling

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent never calls a tool | Tool not attached to the agent | Add the ID to the agent's `functions` ([[create-agent]]) |
| Tool fires at the wrong time | Weak tool `prompt` | Add explicit "Use when" / "Do NOT use when" ([[create-tool]]) |
| Side effects happen twice | Same `call_id` handled twice | Dedupe by `call_id` in a `Set` |
| `JSON.parse(arguments)` throws | `arguments` already an object | Use it directly, don't parse |
| Tool result ignored / odd reasoning | `output` stringified | Send a plain object, not a JSON string |
| `function_call_timeout` fires | Handler slower than the 10s window | Return an interim ack immediately, then push the real answer via `send_message` (`role: system`) when ready — see [[create-tool]] § Long-running work |
| Explicit tool never reached | Bad `url` / unreachable server | Verify the endpoint and any auth `headers` |

Prevention: [[create-tool]], [[session-runtime]].

## Knowledge base and FAQ

| Symptom | Likely cause | Fix |
|---|---|---|
| File never processes | URL not publicly reachable | Host on public HTTPS |
| Upload rejected | Unsupported type / over size limit | Check supported formats and limits |
| FAQ answer not returned | User's wording too far from the FAQ question | Matching is semantic, not exact — phrase the FAQ question the way users actually ask, add variants for distinct intents |

Prevention: [[add-knowledge]].

## Session and runtime

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent doesn't greet | No auto-greeting | Send the greeting nudge on ready ([[session-runtime]]) |
| Memory not recalled | Missing/changing `externalClientId` | Stable ID matching `^[A-Za-z0-9_-]{1,32}$` |
| `externalClientId` rejected | Doesn't match the regex | Hash UUIDs/emails to ≤32 allowed chars |
| Session closes unexpectedly | Idle timeout | Set `disableIdleTimeout` or keep traffic flowing |
| Events look empty | Reading the wrong field | Log the whole message; key is `event` or `type` |
| `set_settings.instructions` wiped the persona | It replaces the full prompt | For context use `send_message role:system` instead |

Prevention: [[session-runtime]].

## Browser, secure context, iframe

| Symptom | Likely cause | Fix |
|---|---|---|
| Mic blocked only inside an iframe | Missing permissions | `<iframe allow="microphone; camera; autoplay">` |
| Nothing works on `file://` | Not a secure context | Serve over `http://localhost` or `https` |
| CORS error calling your token endpoint | Cross-origin without headers | Serve token endpoint same-origin or set CORS |
| Mixed-content warning | `http` resource on an `https` page | Serve all resources over `https` |
| CSP blocks the SDK | Strict `script-src`/`connect-src` | Allow the SDK origin and the API/WS origins |

Prevention: [[deploy-webrtc]].

## Production deployment

| Symptom | Likely cause | Fix |
|---|---|---|
| API key leaked to the browser | Key used client-side | Issue tokens server-side; never ship the key |
| Token endpoint abused | No auth / rate limit | Authenticate callers and rate-limit `/token` |
| Stale SDK in production | Served `node_modules` | Re-copy the standalone bundle on each bump (no-bundler path) |
| Works in dev, fails deployed | Env vars / origins differ | Set `NAPSTER_API_KEY` and allow prod origins |
| Wrong agent answering | Wrong `AGENT_ID` in env | Point the token endpoint at the right agent |

Prevention: [[deploy-webrtc]] § Production, [[setup-api-key]].

## Browser console hygiene

When something is wrong and the table didn't pin it down, log every SDK event at the top of your handler and reproduce:

```js
function handleData(msg) {
  console.log("[omniagent]", msg.event ?? msg.type, msg);
  // … your handling
}
```

Most "silent" failures (denied mic, unbound function, empty transcription) are obvious once every event is visible. Check the Network tab too: the token request should be `200` with a `token`, and there should be no CORS/CSP/mixed-content errors.

## When the docs disagree with this skill

This skill is a fast index, not the contract. The authority is the live documentation (docs MCP server: `get-overview`, `list-pages`, `search-docs`, `fetch-page`, `get-api-spec`) and the Swagger at `https://companion-api.napster.com`. If a field name, endpoint, or value here differs from the docs, follow the docs and treat this skill as out of date.
