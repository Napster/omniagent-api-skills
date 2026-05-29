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

> To use the SDK in the browser you need a small server-side endpoint that calls the Omniagent API for a short-lived connection token. Your API key stays on the server; the browser only sees the token. How do you want to handle that?
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

For any project with a bundler (React, Next, Vue, Nuxt, Svelte, Remix, Vite, Webpack, …), install and import directly:

```bash
npm install @touchcastllc/napster-companion-api @reduxjs/toolkit
```

```js
import { NapsterCompanionApiSdk } from "@touchcastllc/napster-companion-api";
import "@touchcastllc/napster-companion-api/lib/index.css";
```

`@reduxjs/toolkit` is a peer dependency — install it alongside.

For a plain HTML project with **no** bundler, copy the standalone bundle and CSS out of `node_modules` into a served folder and load via tags (fallback path, not the default):

```bash
npm install @touchcastllc/napster-companion-api
mkdir -p sdk
cp node_modules/@touchcastllc/napster-companion-api/lib/index.standalone.js sdk/napster-companion-api.js
cp node_modules/@touchcastllc/napster-companion-api/lib/index.css           sdk/napster-companion-api.css
```

```html
<link rel="stylesheet" href="/sdk/napster-companion-api.css" />
<script src="/sdk/napster-companion-api.js"></script>
<!-- global available as window.napsterCompanionApiSDK -->
```

<Callout type="warn">
Before writing SDK code, check the current init signature and option set against the docs — there's no single "SDK reference" page. Verify init/mount/options at `fetch-page` slug `deploying-your-omniagent/channels/webrtc` (and its framework examples), event shapes at `deploying-your-omniagent/messaging/server-events`, and the full options list in the `@touchcastllc/napster-companion-api` npm README. Don't invent methods from memory.
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

## 4. Wire the SDK to the mount

The init call returns a **Promise** that resolves to the instance — you must `await` it, or `instance.sendCommand` is undefined. Do a mic preflight first so a denied permission surfaces a clear error instead of failing silently inside the SDK.

React example (bundler import path):

```tsx
import { useEffect, useRef } from "react";
import { NapsterCompanionApiSdk } from "@touchcastllc/napster-companion-api";
import "@touchcastllc/napster-companion-api/lib/index.css";

export function OmniagentPanel() {
  const mountRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Mic preflight — surface the prompt and a clear error path.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.error("[mic] denied", e);
        return;
      }
      // 2. Get a short-lived token from your server endpoint.
      const res = await fetch("/api/token", { method: "POST" });
      if (!res.ok) return console.error("[token]", res.status, await res.text());
      const { token } = await res.json();
      if (cancelled || !mountRef.current) return;
      // 3. Init — AWAIT it.
      instanceRef.current = await NapsterCompanionApiSdk.init(token, {
        mountContainer: mountRef.current,
        onData: handleData,
      });
    })();
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
    };
  }, []);

  return (
    <div className="omniagent-panel">
      <header className="omniagent-header">
        <h2 className="omniagent-title">Support Agent</h2>
        <span className="omniagent-status">Live</span>
      </header>
      <div className="omniagent-mount" ref={mountRef}>
        <div className="omniagent-loading">Connecting</div>
      </div>
      <a className="omniagent-footer" href="https://developers.napster.com" target="_blank" rel="noopener noreferrer">
        <span>Powered by</span><span className="omniagent-footer__brand">Napster</span>
      </a>
    </div>
  );
}
```

Plain HTML / standalone global:

```html
<script type="module">
  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      document.querySelector(".omniagent-loading").textContent = "Microphone access required";
      return;
    }
    const res = await fetch("/token", { method: "POST" }); // local-token-server endpoint
    const { token } = await res.json();
    const instance = await window.napsterCompanionApiSDK.init(token, {
      mountContainer: "#omniagent-mount",
      onData: handleData,
    });
    window.__omniagent = instance; // debugging only — remove in production
  }
  start();
</script>
```

Key points the docs call out:

- **`await` init.** Without it you hold a Promise, not the instance; every method throws.
- **`mountContainer`** accepts a DOM element or a selector string.
- Pass **`onData`** to receive every server event (see [[session-runtime]] for the event names, the greeting nudge, and the function-call loop).
- **Fitting the SDK into your own layout.** When the mount container is a `div` with its own visual layout (rounded corners, fixed dimensions, panel chrome) and you want the SDK to fill that space cleanly without overflow or alignment issues, you need two things together:

  1. Pass the **`className`** option to `init()` — it gets attached to the SDK as a stable, public styling hook so you don't have to target anything internal:

     ```js
     await NapsterCompanionApiSdk.init(token, {
       mountContainer: mountRef.current,
       className: "my-omniagent-skin",
       onData: handleData,
     });
     ```

  2. Style that class to fill its parent:

     ```css
     .my-omniagent-skin {
       position: absolute !important;
       inset: 0 !important;
       width: 100% !important;
       height: 100% !important;
     }
     ```

  Both are required — `className` alone gives you the hook, the CSS rule makes the SDK fill the container properly. Use the same class for any further styling you need on top (borders, rounded corners, custom backgrounds).

### Inside an iframe

The iframe must grant the permissions the SDK uses, or the mic preflight fails even when the top-level page works:

```html
<iframe src="…" allow="microphone; camera; autoplay"></iframe>
```

## 5. (Optional) Green-screen background for compositing

If you want to composite the agent's avatar over your own UI (no backdrop, the person floating on the page), you have to set this in **two places** — server-side and SDK-side — and they have to match.

**Server side — WebRTC channel config.** Tell the server to emit a chroma-keyed (green) stream:

```bash
curl -X PUT https://companion-api.napster.com/public/agents/agent_abc123/channels/webrtc \
  -H "X-Api-Key: $NAPSTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "useGreenVideo": true }'
```

**SDK side — `avatarStyle.view: 'silhouette'`.** Tell the Web SDK to consume that stream by keying out the green and rendering only the person:

```js
await NapsterCompanionApiSdk.init(token, {
  mountContainer: mountRef.current,
  avatarStyle: { view: "silhouette" },
  onData: handleData,
});
```

The two settings have to be in sync. If the server sends a green-screened stream but the SDK isn't using `silhouette`, the chroma color shows through; if the SDK is in `silhouette` but the server isn't sending the green stream, there's nothing to key out.

## 6. Production

The local token server is a prototype. Before shipping, port `/token` into your backend with: per-user **authentication**, **rate limiting**, and per-session context (`externalClientId` / `externalClientProfile`) resolved from the signed-in user. The browser's `fetch('/token')` line doesn't change. The API key never reaches the browser.

## Hand back to the developer

- Where the panel component/markup lives and how it's mounted.
- The token endpoint (real backend route, or `local-token-server/` on `:5173`).
- Voice and turn-detection settings in effect (from the agent).
- A reminder to gitignore the env file and port `/token` to production.
- Pointers to [[session-runtime]] (events, commands, tool loop) and [[troubleshoot-omniagent]].
