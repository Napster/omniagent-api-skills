# Local token server — prototyping only

**This is for local prototyping only. Do not ship it to production.** It has no
authentication, no rate limiting, and serves your whole project directory over
plain HTTP. Use it to get an Omniagent running on your machine in minutes; then
port the `POST /token` handler into your real backend before you go live.

## Why this exists

The browser must never hold your API key. To start a session, a server-side
endpoint calls the Omniagent API with the key and hands the browser a
short-lived **connection token**. This script is that endpoint, plus a static
file server so you can open your page over `http://localhost` (the WebRTC mic
prompt only works on secure contexts — `file://` is blocked).

## Setup

1. Copy this folder into your project root (your deploy skill does this for you).
2. Copy `.env.example` to `.env` and fill it in:
   - `NAPSTER_API_KEY` — your key (server-side only).
   - `AGENT_ID` — **preferred.** The token server connects through your
     Omniagent via `POST /public/agents/{AGENT_ID}/connections`, inheriting the
     agent's persona, voice, tools, knowledge, and provider settings.
   - `CHANNEL_TYPE` — `webrtc` (default) or `websocket`.
   - If you don't have an agent yet, set `COMPANION_ID` instead and the server
     falls back to `POST /public/connections` with an explicit `providerConfig`.
3. Append `gitignore.template` to your project `.gitignore`. **`.env` must be
   gitignored.**

## Run

```bash
node local-token-server/token-server.js
# Napster Omniagent prototype server on http://localhost:5173
# Token endpoint: POST http://localhost:5173/token  (mode: agent)
```

The startup log echoes the mode (agent vs. companion) so you can confirm your
`.env` loaded. Your browser code fetches a token from `POST /token` and passes it to the Web
SDK. See the [`deploy-webrtc`](../../skills/deploy-webrtc/SKILL.md) skill.

## Going to production

Port the `/token` handler into your own backend and bring three things forward:

- **Authentication.** `/token` must authenticate the caller. This script does not.
- **Rate limiting.** Cap how often a client can mint tokens.
- **Per-session context.** Resolve `externalClientId` / `externalClientProfile`
  from the signed-in user, not from a static env var.

The API key lives only on the server. An `X-Api-Key` header must never reach the
browser.
