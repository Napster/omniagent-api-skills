---
description: Guided end-to-end setup for the Napster Omniagent API.
disable-model-invocation: true
argument-hint: [optional: describe what you want to build]
---

# Omniagent Quickstart

You are guiding the developer through building and deploying their first Napster Omniagent, end to end. This is the deliberate, full-walkthrough path. Drive it step by step, invoking the matching skill at each stage and confirming each step worked before moving on. Keep the developer oriented: say what you're about to do, do it, show the result.

If `$ARGUMENTS` is provided, treat it as what they want to build and use it to make concrete choices (persona personality, tools, channel) instead of asking generically.

Ground every API detail in the docs MCP server (`get-overview`, `fetch-page`, `get-api-spec`) — never invent endpoints, fields, or voice IDs. The source of truth is the live docs; this command orchestrates the skills, it doesn't replace them.

## Step 1 — Where do you want your agent?

Ask first, in plain terms, and **remember the answer for Step 7**:

> Where do you want people to talk to your agent?
> - **On my website** — visitors see and talk to the agent right on the page, with voice and video (this uses WebRTC).
> - **Voice only, in my own app** — just audio, no video, wired into your own client or backend (this uses WebSockets).
> - **Over the phone** — you give it a phone number, and the agent picks up when someone calls. This can run over VoIP or SIP; VoIP is usually the easier route (no trunk of your own to manage), but it depends on what you want — if you already run a SIP trunk, that path is open too.
> - **More than one** — tell me which.

Capture the selection. Match their plain-language answer to the right channel — don't make them know the protocol names. Do not set up channels they didn't ask for.

## Step 2 — API key

Use the [[setup-api-key]] skill. Confirm `NAPSTER_API_KEY` is set and a test call returns `200` before continuing. If they don't have a key, walk them through the dashboard.

## Step 3 — Persona

Use the [[create-persona]] skill. Offer the catalog (fast) or a custom persona. If `$ARGUMENTS` describes a character, draft the `description` from it. Capture the **persona ID** (`companionId`). For a custom persona, note the status lifecycle but don't block here if only the ID is needed.

## Step 4 — Create the Omniagent

Use the [[create-agent]] skill. Combine the persona ID with a `voiceId` and sensible `providerSettings`. Capture the **agent ID**. At this point the agent is only built, not yet live — nobody can talk to it until you connect a channel, which is Step 7.

## Step 5 — Tools (optional)

Ask whether the agent needs to take actions, not just talk — look something up, book something, call their backend. If yes, use the [[create-tool]] skill, then attach the tool IDs to the agent you built in Step 4 by updating its `functions` with a `PATCH` ([[manage-agents]]). If no, skip.

## Step 6 — Knowledge (optional)

Ask whether the agent should answer from their documents or curated FAQs. If yes, use the [[add-knowledge]] skill, then attach `knowledgeBaseId` / `faqCollections` to the agent from Step 4 with a `PATCH` ([[manage-agents]]). If no, skip.

## Step 7 — Deploy (use the Step 1 scope)

Deploy **only** to the channel(s) chosen in Step 1:

- Web → [[deploy-webrtc]]
- Audio-only → [[deploy-websocket]]
- Phone → [[deploy-phone]] — **default to VoIP**: configure the `voip` channel, take the `voipEndpoint` Napster returns, and register it as the incoming-call webhook at the developer's VoIP-capable provider. Napster only exposes the webhook; the provider owns the number and routes the call. Use SIP only if the developer explicitly wants to bring their own trunk.

If they chose multiple, run each matching skill in turn. **Do not deploy to channels they didn't choose.** If Step 1's answer is missing or unclear, ask now: "Where do you want people to talk to your agent?"

For web, follow the deploy-webrtc ask-first token flow (existing backend / local prototype server / skip) and the framework-detection + panel-adaptation steps. Don't assume the project is plain HTML — detect it.

## Step 8 — Verify

Split verification into what you (the coding agent) can check and what only the developer can. Don't claim a channel is verified based only on the automated checks — be explicit about which manual steps remain.

**Automated — do these yourself:**
- Confirm the token endpoint returns `200` with a `token` (curl the dev `/token`, or the equivalent in their backend).
- Phone (SIP): poll `POST /public/sip-connections/{id}/status` until `lifecycleStatus: Running` and `sipStatus: online`.
- Phone (VoIP): confirm the `PUT .../channels/voip` response includes a `voipEndpoint`.
- Confirm the dev server starts and the project builds/compiles without errors, and the wiring looks right (init awaited, mount ref present, CSS loaded).

**Manual — hand the developer an ordered checklist** (you can't grant a mic prompt, speak, hear audio, or place a call):
- Web: open the page in a **real browser**, grant the mic prompt, confirm the avatar renders, speak and confirm you **hear** the agent reply (it greets first only if the greeting nudge was wired), check the console is clean.
- Phone (VoIP): set `voipEndpoint` as the number's incoming-call webhook at the provider, then place a real call and confirm the agent answers.
- Phone (SIP): once status is `online`, place a real call and confirm the agent answers.
- Audio (WebSocket): confirm the socket connects and audio round-trips in your client.

## Step 9 — Hand-off summary

Summarize what now exists:

- Persona ID, agent ID, and any tool / knowledge IDs.
- The channel(s) deployed and how to reach each.
- Next steps: [[session-runtime]] for runtime behavior, [[monitor-sessions]] to review conversations, [[troubleshoot-omniagent]] if anything misbehaves.

Keep it tight. The developer should leave with IDs in hand and a working agent on the channel they asked for.
