# Omniagent Quickstart Prompt

Paste this whole prompt into your AI coding tool (Claude Code, Cursor, Codex, OpenCode, or any other Agent Skills–compatible tool). It walks the tool through building and deploying your first Napster Omniagent end to end.

Replace the `>>> ... <<<` block with what you want to build, then paste everything below it.

---

You are guiding me through building my first Napster Omniagent end to end. My goal is:

>>> {DESCRIBE WHAT YOU WANT TO BUILD — e.g. "a friendly customer-support agent for my dog-walking marketplace that talks to visitors on my website with voice and video, and also answers phone calls" — replace this line, leave the >>> marker out} <<<

Use that goal as your North Star. **At every step, infer the answer from my goal first.** Don't ask me a question whose answer is already there. Don't make me pick from a menu when the goal points to a clear choice. When you do ask, ask the smallest possible thing — usually a single yes/no to confirm your inference. Save questions for the things the goal genuinely doesn't cover (credentials, third-party accounts, irreversible decisions, content you can't make up).

Drive it step by step. Say what you're about to do, do it, show the result, confirm, move on.

# Preparation

Get everything ready before writing any code.

1. (Recommended) Install the official Napster Omniagent API skills:

       npx skills add napster/omniagent-api-skills

   If the skills install successfully, you'll have access to twelve focused recipes you can use whenever the steps below match them:

   - `setup-api-key` — getting and storing the API key
   - `create-persona` — creating the persona (appearance + personality)
   - `create-agent` — assembling the deployable Omniagent
   - `manage-agents` — listing, updating, deleting agents and channel configs
   - `create-tool` — defining tools the agent can call mid-conversation
   - `add-knowledge` — knowledge bases and FAQ collections
   - `deploy-webrtc` — web deployment (audio + video in browser)
   - `deploy-websocket` — audio-only deployment
   - `deploy-phone` — phone deployment (VoIP and SIP)
   - `session-runtime` — events, commands, and the function-call loop during a live session
   - `monitor-sessions` — listing sessions and pulling transcripts
   - `troubleshoot-omniagent` — pitfall index across every area

   If the `npx skills add` command fails or your tool doesn't support it, send me to https://developers.napster.com/ai-coding-tools — it has per-tool instructions for installing the skills manually. The skills are still **optional**, though: this prompt is self-contained and includes the operational details to proceed without them. If I tell you to skip the manual install, follow the inline instructions below.

2. Set up the Napster docs MCP server so you can ground every step in the live documentation.

   The MCP server exposes the entire Napster developer documentation — not just the API reference, but also the **conceptual guides, step-by-step tutorials, and worked examples** that make the platform clearer to use. Reach for it whenever you need to understand how something works, not only when you need to verify a field name.

   First, check whether the `napster-docs` MCP server is already available. If it is, use it.

   If not, install it now:
   - If the `claude` CLI is available in this shell (e.g. `command -v claude`):

         claude mcp add napster-docs --transport http https://developers.napster.com/mcp

   - Otherwise, stop. Tell me clearly that the docs MCP server is not installed and that you cannot reliably ground your work in the Napster documentation without it. Send me to https://developers.napster.com/ai-coding-tools — it has installation instructions for every supported coding tool. Wait for me to install it and confirm before proceeding.

   Last resort, only if I tell you to proceed without MCP:
   - Fetch https://developers.napster.com/llms.txt and treat it as the authoritative reference for the platform (API, guides, and concepts); use web search against developers.napster.com for anything missing.
   - State clearly when you cannot verify something ("I cannot verify this voice ID against the current docs", or "I'm not sure how this is meant to be used and the docs aren't available").

   Either way, never invent endpoints, fields, voice IDs, or behavior from training data.

# Implementation

## Step 1 — Where the agent lives (channel scope)

Decide which channel(s) the agent will use based on my goal, and **remember the answer for Step 7**. Map plain-language goals to channels — don't make me pick by protocol name:

- Website → **WebRTC** (visitors see and talk to the agent on the page, with voice and video).
- Voice-only app or backend → **WebSocket** (audio only, no video; wired into your own client or backend).
- Phone number people call → **VoIP** by default (Napster exposes a webhook your VoIP provider calls — no trunk credentials), or **SIP** only if I explicitly want to bring my own SIP trunk.
- More than one — handle each in Step 7.

If my goal makes the choice obvious, state your inference and just ask "is that right?". If it doesn't, ask me the plain-language question above. Capture the selection. Do not deploy any channel I didn't ask for.

## Step 2 — API key

If I don't already have a `NAPSTER_API_KEY`, walk me through getting one. The dashboard sits at `https://companion-api.napster.com/admin`. If my Azure subscription doesn't yet have a Napster Companion API resource, send me through https://developers.napster.com/docs/guides/azure-resource first.

In the dashboard: choose or create a project (API keys are scoped per project), navigate to **Keys**, click **New API Key**. Set Provider to Azure OpenAI and pick Deployment = Napster (managed) unless I have a reason to use Custom. Copy the key.

Store it as the `NAPSTER_API_KEY` env var, in a gitignored `.env` file. Never hardcode it. Authentication uses the `X-Api-Key` header — not `Authorization: Bearer`.

Verify: a cheap authenticated call (e.g. `GET /public/companions/napster-stock?pageSize=1`) returns 200. Don't continue until it does.

## Step 3 — Persona (the agent's appearance and personality)

A persona is the appearance + personality. Voice is set on the agent in Step 4, not here.

Draft a persona description from my goal (role, tone, communication style).

Decide for me whether a catalog persona or a custom one fits the goal better and proceed — only present the choice if the goal is genuinely ambiguous. Catalog is faster (usable immediately, no generation wait); custom gives me the exact persona I described.

- **Catalog:** `GET /public/companions/napster-stock` with filters inferred from the goal (gender, ethnicity, search). Pick the best match and tell me which you chose.
- **Custom:** `POST /public/companions` with the description you drafted, plus optional `firstName` / `lastName`, `gender`, and `ethnicity` (look up supported `ethnicity` values from `GET /public/companions/ethnicities`). For the avatar, omit `pictureUrl` and let the system generate one from the description unless I supplied a specific image. If I did, it must be a publicly reachable HTTPS URL — ideally 16:9 with the person looking into the camera, framed waist up, well-lit.

Capture the **persona ID** (the `id` returned, which we'll pass as `companionId` later).

For custom personas, the avatar is generated asynchronously. The status moves `pending → generationCompleted → readyToUse → completed`. You can attach the persona to an agent and run sessions once it's `readyToUse`; you can only edit it once it's `completed`. Don't block the flow waiting for `completed` unless I need to edit it.

## Step 4 — Create the Omniagent

`POST /public/agents` with:
- `companionId` from Step 3.
- `voiceId` — **look up the current supported list in the docs first**; don't hardcode. Pick the voice that fits the persona's tone (warmer voices for support, crisper voices for sales, etc.) — don't make me browse the list. Mention which you picked. Note: an invalid `voiceId` is NOT rejected at create time — it only fails later when a session starts (e.g. a WebRTC data-channel error). Get it right up front.
- `providerSettings` — start with `{ "temperature": 0.7, "turnDetection": { "threshold": 0.9, "prefix_padding_ms": 400, "silence_duration_ms": 500 }, "noiseReduction": { "type": "nearField" } }`. These VAD defaults work well for laptops/headsets; for phone use a longer `silence_duration_ms` (set it as a per-channel override in Step 7).
- Optional `name` (your label), `language` (plain name like `"English"` — locking it to one language; omit to allow the agent to switch).

Capture the **agent ID**. The agent is built but not yet live — no one can talk to it until you wire a channel in Step 7.

## Step 5 — Tools (skip if the goal needs no actions)

From my goal, propose the specific actions the agent needs — read-only lookups, bookings, backend calls. Don't ask me to list the tools; derive them. Only ask me about a tool if a key parameter or endpoint can't be inferred from the goal. For each tool:

- Pick the **execution flow**: `implicit` (delivered to the connected client — the browser SDK handles it) or `explicit` (delivered to a `url` on my server). Use explicit when the action needs my backend (database, internal API, third-party); implicit when the client can run it locally.
- Define the tool: `data.name` (snake_case), `data.description` (what it does), `data.parameters` (JSON Schema). For explicit, also pass `url` and optionally `headers`.
- Write the `prompt` field carefully — this controls *when* the agent fires the tool:
  - **When to use** — concrete user intents.
  - **When NOT to use** — similar-but-distinct intents (this matters more than it looks).
  - **How to behave** — for voice, use the **Preamble pattern** by default: say a short bridging phrase before calling ("Let me check that for you"). For write/high-stakes actions, use the **Confirmation pattern**: confirm with the user and wait for explicit yes before invoking.
  - For work that may exceed the 10s tool-call timeout: return an interim ack immediately, then deliver the real answer later as a `send_message` system message into the session.

`POST /public/functions` to create each tool. Capture the IDs. Then attach by `PATCH /public/agents/{agentId}` with `{ "functions": [ ...ids ] }`.

## Step 6 — Knowledge (skip if the goal is purely conversational)

Decide what's needed from my goal and pick the right shape — don't make me choose between knowledge bases and FAQs.

- **Knowledge base** (open-ended documents — manuals, specs, FAQs in paragraph form): `POST /public/knowledge-bases` with `{ "name", "provider": "azureOpenAI" }`. Upload each file via `POST /public/knowledge-bases/{kbId}/files` with `{ "url": "<public HTTPS URL>" }`. Supported: pdf/docx up to 50 MB; doc/txt/md/png/jpeg up to 10 MB. Note: a session uses exactly ONE knowledge collection, so merge files into a single collection rather than creating several. The platform auto-generates a per-file summary on upload — only override it (`PATCH .../files/{fileId}/summary`) if it's weak.
- **FAQ collection** (curated, high-stakes answers — pricing, policy, compliance): `POST /public/faqs` with `{ "name", "faqs": [...optional seed pairs] }`. Add items via `POST /public/faqs/{faqId}/items`. Matching is **semantic, not exact** — phrase questions the way users actually ask.

For FAQ pairs that the goal implies (e.g. obvious pricing or hours questions), draft them yourself and confirm. Ask me only for content you genuinely can't make up — typically file URLs.

Attach by `PATCH /public/agents/{agentId}` with `{ "knowledgeBaseId": "<id>", "faqCollections": ["<id>", ...] }`.

## Step 7 — Deploy to the channel(s) from Step 1

**Web (WebRTC).** Stand up a server-side token endpoint that calls `POST /public/agents/{agentId}/connections` with `{ "channelType": "webrtc" }` and returns the `{ token, connection }` response to the browser. The `NAPSTER_API_KEY` must never reach the browser. Ask me whether to add this endpoint to my existing backend (detect the stack — Express, FastAPI, Next.js route handler, etc.) or scaffold a local prototype token server.

For the prototype, fetch these files into a `local-token-server/` folder in the project root:

- `token-server.js` — https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/token-server.js
- `package.json` — https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/package.json
- `.env.example` — https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/.env.example
- `gitignore.template` — https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/gitignore.template
- `README.md` — https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/local-token-server/README.md

Copy `.env.example` to `.env`, fill in `NAPSTER_API_KEY` and `AGENT_ID`, append `gitignore.template` to the project's `.gitignore`, and run `node local-token-server/token-server.js`.

Install the Web SDK: `npm install @touchcastllc/napster-companion-api @reduxjs/toolkit` (Redux Toolkit is a peer dep). In bundler projects (React/Next/Vue/Nuxt/Svelte/Remix/Vite), import directly:

```
import { NapsterCompanionApiSdk } from "@touchcastllc/napster-companion-api";
import "@touchcastllc/napster-companion-api/lib/index.css";
```

In plain HTML, copy `lib/index.standalone.js` and `lib/index.css` from `node_modules` into a served folder and use `window.napsterCompanionApiSDK`.

Mount it: **`await NapsterCompanionApiSdk.init(token, { mountContainer, onData })`** — the await is required, otherwise `instance.sendCommand` is undefined. Wire `onData` for session events. The agent does not auto-greet — to force a greeting on ready, send a `send_message` with `role: "system"`, `trigger_response: true`.

When the mount container is a `div` with its own visual layout (rounded corners, fixed dimensions, panel chrome) and you want the SDK to fill that space cleanly without overflow or alignment issues, do both of these together:

1. Pass a `className` option to `init()` — e.g. `className: "my-omniagent-skin"`. This attaches a stable, public styling hook to the SDK so you don't have to target anything internal.
2. Style that class to fill its parent:

   ```css
   .my-omniagent-skin {
     position: absolute !important;
     inset: 0 !important;
     width: 100% !important;
     height: 100% !important;
   }
   ```

Both are required — `className` alone gives you the hook, the CSS rule makes the SDK fill the container. Use the same class for any further styling on top (borders, rounded corners, custom backgrounds).

For the panel UI, fetch these two files and adapt the structure to my detected framework (React / Vue / Svelte / plain HTML) — don't inline panel markup from memory. Detect the framework from `package.json`. Keep the "Powered by Napster" footer unless I explicitly ask to remove it.

- Panel reference (HTML structure): https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/omniagent-panel-reference.html
- Stylesheet (CSS): https://raw.githubusercontent.com/Napster/omniagent-api-skills/main/assets/omniagent-ui.css

For a green-screen background (composite the avatar over my UI), set BOTH: `useGreenVideo: true` on the webrtc channel config (`PUT .../channels/webrtc`) AND `avatarStyle.view: "silhouette"` in the SDK init. They must match.

**Audio-only (WebSocket).** `POST /public/agents/{agentId}/connections` with `{ "channelType": "websocket" }`. The returned token is base64-encoded JSON — decode it to get `{ url, authToken }`. Server-side clients pass `Authorization: Bearer <authToken>` as a header; browsers can't set custom WebSocket headers, so pass `?token=<authToken>` as a query param instead. Audio is **PCM16, 16 kHz, mono, base64** in both directions. Send: `{ "type": "send_audio", "data": { "audio": <base64Pcm16> } }`. Receive `audio_received` events. For barge-in, clear queued playback when you see `speech_started`, keep the mic open, and enable `echoCancellation` in browser `getUserMedia` to prevent feedback loops.

**Phone (VoIP — default).** `PUT /public/agents/{agentId}/channels/voip` with an empty body (or include `providerSettings` to override defaults for calls, e.g. a longer `silence_duration_ms` of 800 for phone-quality audio). The response includes a **`voipEndpoint`** webhook URL. Tell me to register that URL as the incoming-call webhook for a phone number at my VoIP provider (Twilio, Telnyx, Vonage, etc.) — look for the provider's voice / incoming-call webhook field on the number's configuration. Napster only exposes the webhook; the provider owns the number and routes calls. Note: **human handoff is not supported on VoIP today** — it's SIP-only for now.

**Phone (SIP — only if I explicitly asked).** Two resources:

- `PUT /public/agents/{agentId}/channels/sip` with optional `humanHandoff` (`enabled`, `transferExtension`, and a clear `transferDescription` that anchors the trigger to the caller's explicit current-call request to avoid accidental handoffs from memory).
- `POST /public/sip-connections` with `{ "agentId", "name", "settings": { "server", "port": 5060, "domain", "username", "password", "transport": "TCP", "callerId" } }` — credentials from my SIP trunk provider.

Poll `POST /public/sip-connections/{id}/status` until `lifecycleStatus: "Running"` AND `sipStatus: "online"`. If it gets stuck on `registering`, pull `GET /public/sip-connections/{id}/errors` — a 401 there means bad credentials.

For all channels, per-channel overrides of `functions` / `faqCollections` / `knowledgeBaseId` / `providerSettings` are supported via the channel config — useful when phone needs different VAD than web.

## Step 8 — Verify

Split what you can check from what only I can. Don't claim a channel is verified on automated checks alone.

**You (automated):**

- Token endpoint returns `200` with a `token`.
- Web: dev server builds, project compiles, SDK init is awaited, mount ref is present, CSS is loaded.
- Phone (VoIP): the `PUT .../channels/voip` response includes a `voipEndpoint`.
- Phone (SIP): poll status until `lifecycleStatus: "Running"` and `sipStatus: "online"`.

**Me (manual — you literally cannot do these):**

- Web: open the page in a real browser (Chrome / Edge / Firefox / Safari — not VS Code's Simple Browser, not `file://`, not a desktop webview, all of which block the mic). Grant the mic prompt, confirm the avatar renders, speak and confirm I **hear** the agent reply, check the browser console is clean.
- Phone (VoIP): set `voipEndpoint` as the incoming-call webhook at my provider, then place a real call and confirm the agent answers.
- Phone (SIP): once `sipStatus` is `online`, place a real call.
- Audio (WebSocket): confirm the socket connects and audio round-trips in my client.

Hand me a short ordered checklist for whichever channel I deployed.

## Step 9 — Hand-off summary

Tied back to my original goal, list:

- Persona ID, agent ID, and any tool / knowledge IDs created.
- The channel(s) deployed and exactly how to reach each (URLs, webhook configuration, phone numbers).
- The one or two next things that would make the agent better at the goal — for example: adding an FAQ collection if a knowledge base felt too loose; wiring a tool to a real backend; enabling cross-session memory via `externalClientId`; passing structured user context via `externalClientProfile`.
- Pointers for what to do next: how to handle events and commands mid-session (e.g. updating instructions live, sending system context); how to review session transcripts; what to check first if anything misbehaves.
