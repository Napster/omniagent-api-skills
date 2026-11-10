---
name: deploy-webrtc
description: Deploy an Omniagent to the web — browser audio + video via the Napster Web SDK. Use when the developer says "embed the agent", "add the avatar to my page", "put it on my website", "wire up the Web SDK", or wants an in-browser voice/video experience. Detects the project framework (React, Next.js, Vue, Nuxt, Svelte, Remix, plain HTML), adapts the default panel structure, sets up a server-side token endpoint, and wires the SDK event loop. For audio-only use [[deploy-websocket]]; for phone use [[deploy-phone]].
---

# deploy-webrtc

This takes a developer from "I have an agent ID" to "the agent is live in my web app — greeting the user, speaking, and handling tool calls." WebRTC is the browser channel: real-time audio **and** video through the Web SDK (`@touchcastllc/napster-companion-api`).

There is no "deploy to web" API call. You deploy by (1) standing up a server-side endpoint that mints a connection token and (2) handing that token to the Web SDK in the browser. The agent owns the persona, voice, tools, and knowledge — the connection inherits them.

## Prerequisites

- An **agent ID** (`agent_…`). If you don't have one, route to [[create-agent]].

## 1. Set up the token endpoint (ask first)

The browser must never hold the API key. A server-side endpoint calls the API and returns a short-lived token. **Ask the developer how they want to handle it — don't assume:**

> To use the SDK in the browser you need a small server-side endpoint that calls the Napster API for a short-lived connection token. Your API key stays on the server; the browser only sees the token. How do you want to handle that?
>
> 1. **I already have a backend** — add the token endpoint to it.
> 2. **I don't have a backend yet** — drop in a local Node script to prototype, move it to production later.
> 3. **Skip for now.**

**Path 1 — existing backend.** Detect the stack from the project (Express, Fastify, Hono, Next.js route handlers, FastAPI, Flask, Django, Vercel/Cloudflare functions, …) or ask. Add a route that does this and nothing the browser can see:

```ts
// Example: an endpoint in the developer's own backend (Express shown).
app.post("/api/token", async (req, res) => {
  const r = await fetch(
    `https://companion-api.napster.com/public/agents/${process.env.AGENT_ID}/connections`,
    {
      method: "POST",
      headers: { "X-Api-Key": process.env.NAPSTER_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ channelType: "webrtc" }), // optionally externalClientId, externalClientProfile
    },
  );
  if (r.status === 429) return res.status(429).set("Retry-After", r.headers.get("Retry-After") ?? "1").end(); // 1 req/s per API key
  if (!r.ok) return res.status(502).json({ error: await r.text() });
  res.json(await r.json()); // { token, connection: { id, … } }
});
```

```python
# FastAPI shown.
@app.post("/api/token")
async def token():
    r = requests.post(
        f"https://companion-api.napster.com/public/agents/{os.environ['AGENT_ID']}/connections",
        headers={"X-Api-Key": os.environ["NAPSTER_API_KEY"]},
        json={"channelType": "webrtc"},
    )
    r.raise_for_status()
    return r.json()  # { token, connection: { id, … } }
```

**Path 2 — prototype scaffold.** Create a `local-token-server/` folder in the project root and fetch each file by raw URL from the public skills repo:

- `token-server.js` — `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/token-server.js`
- `package.json` — `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/package.json`
- `.env.example` — `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/.env.example`
- `gitignore.template` — `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/gitignore.template`
- `README.md` — `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/README.md`

Copy `.env.example` to `.env` and set `NAPSTER_API_KEY` and `AGENT_ID`. Append `gitignore.template` to the project's `.gitignore`. Run `node local-token-server/token-server.js` — its `POST /token` proxies the agent connection call above. Tell the developer: "When you're ready for production, I'll port `/token` into your real backend."

**Path 3 — skip.** Note the developer is responsible for token issuance and continue; the browser code below still calls `POST /token`.

The preferred connection call is always `POST /public/agents/{agentId}/connections` with `{ "channelType": "webrtc" }`. The per-session `POST /public/connections` (companionId + providerConfig) exists only as a fallback for assembling a session without an agent — see [[session-runtime]].

## 2. Install the Web SDK

This skill uses Web SDK 2. Code written for 1.x, which passes a token string to `init(token, …)`, throws `init() requires a getToken() function` on 2.0. If the project already has 1.x code, upgrade it with the migration guide (`fetch-page` slug `migrations/web-sdk-2`) instead of mixing the two.

For any project with a bundler (React, Next, Vue, Nuxt, Svelte, Remix, Vite, Webpack, …), install and import directly:

```bash
npm install @touchcastllc/napster-companion-api@2 @reduxjs/toolkit
```

```js
import { NapsterCompanionApiSdk } from "@touchcastllc/napster-companion-api";
import "@touchcastllc/napster-companion-api/styles";
```

`@reduxjs/toolkit` is a peer dependency, so install it alongside.

The SDK can also load two optional packages, `@tensorflow/tfjs` and `@tensorflow-models/face-landmarks-detection`. You don't need to install them. esbuild and Angular's builder fail the build when they can't resolve them, so mark both as external there. With esbuild, pass `--external:@tensorflow/tfjs --external:@tensorflow-models/face-landmarks-detection`. With Angular, list both under `externalDependencies` in the build options in `angular.json`.

For a plain HTML project with **no** bundler, load the standalone build from the CDN. The stylesheet is bundled in, so there's no separate CSS file:

```html
<script src="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@2/lib/index.standalone.js"></script>
<!-- global available as window.napsterCompanionApiSDK -->
```

`@2` loads the latest 2.x release. Pin an exact version, such as `@2.0.0`, to control every update. Named exports such as `Position` aren't on the global, so pass their string values instead, such as `"bottom-right"`.

<Callout type="warn">
Before writing SDK code, check the current init signature and option set against the docs — the Web SDK has its own docs section. Verify install/init/options at `fetch-page` slugs `sdks/web-sdk/installation`, `sdks/web-sdk/initialization`, and `sdks/web-sdk/configuration`, callbacks and errors at `sdks/web-sdk/events`, framework wiring at `sdks/web-sdk/framework-examples`, and event shapes at `deploying-your-omniagent/messaging/server-events`. Don't invent methods from memory.
</Callout>

## 3. Build the panel from the canonical reference

The skills ship **one** canonical panel structure and **one** stylesheet, both hosted in the public skills repo:

- Panel reference (header + mount + "Powered by Napster" footer): `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/omniagent-panel-reference.html`
- Stylesheet: `https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/omniagent-ui.css`

Don't inline panel markup from memory — fetch both URLs and adapt.

1. Read `package.json` (or equivalent) to detect the framework.
2. Fetch the panel reference (URL above) to learn the structure.
3. Reproduce that structure in the framework's idiom:
   - **React / Next / Remix** → a JSX component, mount = a `ref`'d `<div className="omniagent-mount">`.
   - **Vue / Nuxt** → a `<template>` with a `ref`'d mount div.
   - **Svelte** → markup with `bind:this` on the mount div.
   - **Plain HTML** → drop the reference contents straight into `<body>`.
4. Fetch the stylesheet (URL above) and copy it into the project unchanged, then load it (import in bundlers, `<link>` in plain HTML).
5. Set the agent's name in the header. Keep the footer (see [[troubleshoot-omniagent]] for the attribution policy) unless the developer explicitly asks to remove it.

The mount starts empty. The SDK shows its own loading state there while the session connects.

## 4. Wire the SDK to the mount

Pass `init` a function that fetches a token from your server, not the token itself. The SDK calls that function when it's ready to connect, after the visitor has answered the microphone prompt. Tokens expire within seconds, so this way the token is always fresh. The SDK calls it again for every new session, so return a fresh token each time and don't cache it. If the function throws or returns an empty value, the SDK removes the widget, releases the microphone, and passes the error to `onError`.

Don't ask for the microphone yourself before `init`. The SDK asks for it and shows its own cards: one while the browser's prompt is open, and one with a **Check again** button if the visitor blocks it. A `getUserMedia` call of your own that stops on a denial keeps `init` from running, so the visitor never sees those cards. To show your own message, watch `onSessionStatusChange` for `permissionBlocked`.

React example (bundler import path):

```tsx
import { useEffect, useRef } from "react";
import { NapsterCompanionApiSdk } from "@touchcastllc/napster-companion-api";
import type { NapsterCompanionApiInstance } from "@touchcastllc/napster-companion-api";
import "@touchcastllc/napster-companion-api/styles";

// Fetches a fresh token from your server endpoint. The SDK calls it right before it connects.
async function getToken() {
  const res = await fetch("/api/token", { method: "POST" });
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const { token } = await res.json();
  return token;
}

export function OmniagentPanel() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let instance: NapsterCompanionApiInstance | null = null;
    let cancelled = false;

    // Wait one microtask, so React StrictMode's development-only
    // mount → unmount → mount cancels the first run before it starts the SDK.
    queueMicrotask(() => {
      if (cancelled) return;
      NapsterCompanionApiSdk.init(getToken, {
        layout: { type: "inline", mountContainer: mount }, // render inside .omniagent-mount
        style: {
          view: "rectangle",               // matches the omniagent-panel-reference layout
          className: "omniagent-sdk-root", // styling hook — see "Fitting the SDK" below
        },
        onData: handleData,
        onAvatarReady: (isReady) => {
          if (isReady) {
            // The session is live. Send your first command here.
          }
        },
        onError: (error) => console.error("[omniagent]", error),
      }).then(
        (created) => {
          if (cancelled) created.destroy();
          else instance = created;
        },
        (error) => console.error("[omniagent] init failed", error),
      );
    });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, []);

  return (
    <div className="omniagent-panel">
      <header className="omniagent-header">
        <h2 className="omniagent-title">Support Agent</h2>
        <span className="omniagent-status">Live</span>
      </header>
      <div className="omniagent-mount" ref={mountRef} />
      <a className="omniagent-footer" href="https://developers.napster.com" target="_blank" rel="noopener noreferrer">
        <span>Powered by</span><span className="omniagent-footer__brand">Napster</span>
      </a>
    </div>
  );
}
```

Plain HTML / standalone global:

```html
<script src="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@2/lib/index.standalone.js"></script>
<script>
  async function getToken() {
    const res = await fetch("/token", { method: "POST" }); // local-token-server endpoint
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    const { token } = await res.json();
    return token;
  }

  window.napsterCompanionApiSDK.init(getToken, {
    layout: { type: "inline", mountContainer: "#omniagent-mount" }, // render inside .omniagent-mount
    style: {
      view: "rectangle",               // matches the omniagent-panel-reference layout
      className: "omniagent-sdk-root", // styling hook — see "Fitting the SDK" below
    },
    onData: handleData,
    onAvatarReady: (isReady) => {
      if (isReady) {
        // The session is live. Send your first command here.
      }
    },
    onError: (error) => console.error("[omniagent]", error),
  }).then((instance) => {
    window.__omniagent = instance; // debugging only — remove in production
  });
</script>
```

Key points the docs call out:

- **`init` resolves before the session is live.** It returns a Promise that resolves to the instance as soon as the widget is on the page, before the microphone prompt and before any connection exists. Keep the instance (you need it for `sendCommand` and `destroy`), but don't send commands yet: anything sent before the session is live is dropped. Send your first command, such as a greeting, from `onAvatarReady` when `isReady` is `true`.
- **One widget at a time.** A second `init` before `destroy()` rejects with `ALREADY_INITIALIZED`. Call `destroy()` when the component unmounts, as in the React example.
- **`layout.type: "inline"` is what puts the widget in the panel.** Without it, the SDK ignores `mountContainer` and floats the widget in the page corner. `mountContainer` accepts a DOM element or a selector string.
- Pass **`onData`** to receive every server event (see [[session-runtime]] for the event names, the greeting nudge, and the function-call loop).
- **A successful token call doesn't mean a valid session.** An unknown voice or model, bad provider credentials, or over-long instructions aren't a 400 at connection creation. They arrive after the SDK connects as `provider_connection_aborted` (`error.code` `invalid_voice` / `invalid_model` / `invalid_credentials` / `instructions_too_long` / `connection_failed`), and the session closes. In 2.0 that event, `session_expired` and `no_credits_left` reach **`onError`**, and the SDK ends the session. `onData` gets them only after teardown, so handle them in `onError` or `onDestroy`. `avatar_state_changed` with `failed` also reaches `onError` and ends the session. With `video_failed`, it reaches `onError` but the session continues on audio. Without your own handling, the panel goes dead with no explanation. To tell errors apart, check `error.name`, then `error.context.reason` for a `ConnectionError` or `error.context.event` for a `WebRTCError`. `avatar_connection_warning` (idle warning) stays in `onData`.
- **Brand color.** To match the site's brand, add `style.accentColor` (any CSS color). It colors the microphone button, the buttons on the SDK's cards, and the loading ring.
- **Fitting the SDK into your own layout.** The mount container (`.omniagent-mount`) has its own visual layout — bounded size, rounded corners, panel chrome. To make the SDK fill that space cleanly without overflow or alignment issues, you need **both** of these together (the init samples above already include them):

  ```js
  await NapsterCompanionApiSdk.init(getToken, {
    layout: { type: "inline", mountContainer: mountRef.current }, // fill .omniagent-mount
    style: {
      view: "rectangle",               // matches the panel layout
      className: "omniagent-sdk-root", // styling hook attached to the SDK's root
    },
    onData: handleData,
  });
  ```

  The fill rule for `.omniagent-sdk-root` is already in `omniagent-ui.css`, so you don't need to write your own CSS. Pass the two options above and the SDK fills the mount. To add your own styling on top (borders, backgrounds, rounded corners), scope it to the same `.omniagent-sdk-root` class. `style.view` is required whenever you pass `style`.

### Inside an iframe

The iframe must grant the microphone, or the SDK's microphone request fails even when the top-level page works:

```html
<iframe src="…" allow="microphone"></iframe>
```

If you use screen sharing, add `display-capture` as well: `allow="microphone; display-capture"`.

## 5. Multi-page site? Turn on persistence

Ask this early: **does navigation reload the page?** On a single-page app the session survives on its own — skip this. On a traditional multi-page site, every navigation is a full page load that tears the session down mid-conversation, so enable it:

```js
NapsterCompanionApiSdk.init(getToken, {
  persistence: { enabled: true },
});
```

With persistence on, the SDK ignores the inline layout and `mountContainer` and always floats the widget in the page corner, so the panel's mount stays empty. On a multi-page site, use the floating widget instead of the panel.

The full treatment — when the wrap happens, break-out rules and `exclude`, routing programmatic navigation through `PERSIST_NAVIGATE_EVENT`, and the verification pass — is its own skill: [[persist-web-session]]. Invoke it whenever this question answers "multi-page".

## 6. (Optional) Faster start with `videoPolicy: "deferred"`

By default (`videoPolicy: "required"`) the session becomes ready only when audio and video are both up — one `avatar_state_changed: ready`. Set `"deferred"` on the WebRTC channel config to let the conversation start on audio first, with the video avatar coming up moments later:

```bash
curl -X PUT https://companion-api.napster.com/public/agents/agent_abc123/channels/webrtc \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "videoPolicy": "deferred" }'
```

WebRTC-only (WebSocket sessions have no video). **Contract change:** under `"deferred"` the session emits `ready` TWICE — first with `details: { mode: "audio_only" }`, again with `details: { mode: "audio_video" }` when video is up. Any handler keyed on `avatar_state_changed: ready` must latch (run once). `onAvatarReady(true)` fires once, when the audio is live, before the video appears. To react to the video, wait for `onSessionStatusChange` to report `readyVideo`. If the video never arrives, `avatar_state_changed` reports `video_failed` and the session continues on audio. See [[session-runtime]] for the event handling.

## 7. (Optional) Green-screen background for compositing

Skip this unless you need to composite the agent over your own UI (no backdrop, the person "floating" on the page). The panel above uses `style.view: "rectangle"`, which works for the standard embedded panel. Only switch to silhouette if you need to cut the avatar out of its background yourself.

If you do, set it in **two places** — server-side and SDK-side — and they have to match.

**Server side — WebRTC channel config.** Tell the server to emit a chroma-keyed (green) stream:

```bash
curl -X PUT https://companion-api.napster.com/public/agents/agent_abc123/channels/webrtc \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "useGreenVideo": true }'
```

**SDK side — change `style.view` from `"rectangle"` to `"silhouette"`.** The Web SDK then removes the green and renders only the person:

```js
await NapsterCompanionApiSdk.init(getToken, {
  layout: { type: "inline", mountContainer: mountRef.current },
  style: { view: "silhouette", className: "omniagent-sdk-root" }, // instead of "rectangle"
  onData: handleData,
});
```

The two settings have to be in sync. If the server sends a green-screened stream but the SDK isn't using `silhouette`, the green shows through. If the SDK is in `silhouette` but the server isn't sending the green stream, you see the normal video background with no error.

## 8. Production

The local token server is a prototype. Before shipping, port `/token` into your backend with: per-user **authentication**, **rate limiting** (the Napster API allows 1 connection request per second per API key, shared by `POST /public/connections`, `/ws-connections`, `/agents/{id}/connections` and `DELETE /public/connections/{id}` — on `429`, honor `Retry-After`), and per-session context resolved from the signed-in user (`externalClientId` must match `^[A-Za-z0-9_-]{1,32}$` — hash UUIDs or emails — plus `externalClientProfile`). To end a live session from your backend (plan ran out, user signed out), call `DELETE /public/connections/{connection.id}`; it closes with `closeReason: "connection_aborted"`. The browser's `getToken` function doesn't change. The API key never reaches the browser.

## Hand back to the developer

- Where the panel component/markup lives and how it's mounted.
- The token endpoint (real backend route, or `local-token-server/` on `:5173`).
- Voice and turn-detection settings in effect (from the agent).
- Whether persistence is on and why (multi-page vs SPA), and any `exclude` routes configured.
- A reminder to gitignore the env file and port `/token` to production.
- Pointers to [[session-runtime]] (events, commands, tool loop) and [[troubleshoot-omniagent]].
