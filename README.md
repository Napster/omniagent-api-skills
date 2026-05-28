# Napster Omniagent API — Skills

The official Claude Code plugin for the [Napster Omniagent API](https://developers.napster.com). It gives an AI coding agent a focused skill for every API concept — personas, agents, tools, knowledge, and every deployment channel (web, audio, phone) — plus a guided quickstart wizard, a framework-agnostic default panel the skill adapts to your stack, and an optional local token server for prototyping. The skills are grounded in the live documentation through the bundled Napster docs MCP server, so they stay current instead of drifting from training data.

## After install, start here

- **New to the API?** Run the wizard: `/napster-omniagent-api:omniagent-quickstart`. It walks you from API key to a deployed Omniagent on the channel(s) you pick.
- **Already know what you want?** Just say it in plain language — "create a persona", "embed the agent in my React app", "set up phone calls", "my mic isn't working" — and the matching skill fires automatically.

## Prerequisites

- A Napster developer account and an API key — see [`setup-api-key`](skills/setup-api-key/SKILL.md).
- Node 18+ (the optional local token server uses native `fetch` and has zero dependencies).
- A project to build into. The skills detect your framework or fall back to plain HTML.

## Install

Three paths, pick one:

**Open Agent Skills CLI** (works in Claude Code, Cursor, Codex, OpenCode, and other tools that follow the [Agent Skills spec](https://agentskills.io/specification)):

```bash
npx skills add napster/omniagent-api-skills
```

**Claude Code marketplace:**

```
/plugin marketplace add napster/omniagent-api-skills
/plugin install napster-omniagent-api
```

**Manual (local clone):**

```bash
git clone https://github.com/napster/omniagent-api-skills
claude --plugin-dir ./omniagent-api-skills
```

## What's inside

```
omniagent-api-skills/
├── .claude-plugin/plugin.json          Plugin manifest (only file in this folder)
├── .mcp.json                           Napster docs MCP server (source of truth for API details)
├── .cursor/ .vscode/                   MCP config for cross-tool use
├── commands/
│   └── omniagent-quickstart.md         The guided end-to-end wizard
├── skills/
│   ├── setup-api-key/                  Get an API key, store it as NAPSTER_API_KEY
│   ├── create-persona/                 Create the appearance + personality entity
│   ├── create-agent/                   Assemble a deployable Omniagent from a persona
│   ├── manage-agents/                  List, update, delete Omniagents
│   ├── create-tool/                    Define a function the agent can call mid-conversation
│   ├── add-knowledge/                  Upload files, define FAQs, attach to an agent
│   ├── deploy-webrtc/                  Web channel: browser audio + video via the Web SDK
│   ├── deploy-websocket/              Audio-only channel for headless/custom clients
│   ├── deploy-phone/                   Phone channel — a number the agent answers (VoIP or SIP)
│   ├── session-runtime/                Per-session config, server events, client commands
│   ├── monitor-sessions/               List sessions, pull transcripts
│   └── troubleshoot-omniagent/         The pitfall index, organized by area
└── assets/
    ├── omniagent-ui.css                Canonical panel styles (framework-agnostic)
    ├── omniagent-panel-reference.html  Canonical panel structure (header + mount + footer)
    ├── napster-mark.svg                Brand mark for the footer
    └── local-token-server/             Optional prototyping scaffold (not for production)
```

## Frameworks supported

The deploy skills detect **React, Next.js, Vue, Nuxt, Svelte, Remix, and plain HTML**, and fall back to plain HTML when the stack can't be determined. There are no per-framework component files to maintain: the default panel is one CSS file plus one structural HTML reference (`assets/omniagent-panel-reference.html`), and the skill replicates that structure into your framework's idiom (JSX, Vue template, Svelte markup, or inline HTML).

## Default UI and the "Powered by Napster" footer

The default panel includes a small `Powered by Napster` footer that links to the developer docs. It is **on by default** on every Omniagent surface. The skills will not remove it unless you explicitly ask — for example, when an enterprise deployment has its own brand chrome.

## Conceptual map

| Term | What it is | API resource |
|---|---|---|
| **Omniagent** | The deployed agent — one identity across every channel | `/public/agents` |
| **Persona** | Appearance + personality (voice is set on the agent) | `/public/companions` |
| **Function** | A callable tool the agent invokes mid-conversation | `/public/functions` |
| **Knowledge base / FAQ** | Documents and curated Q&A the agent grounds answers in | `/public/knowledge-bases`, `/public/faqs` |
| **Channel** | The surface a session runs on: WebRTC, WebSocket, Phone (VoIP or SIP) | per-session connections + `/channels/{type}` |
| **Session** | One conversation, with its transcript and config | `/public/sessions` |

> The API resource for a persona is still named `companion`. Customer-facing copy says **persona**; generated code calls the real `/public/companions` endpoint.

## Security posture

- The API key authenticates with the `X-Api-Key` header and is **server-side only**. It must never reach the browser.
- The browser receives a short-lived connection **token**, minted by a server-side endpoint that holds the key (see [`deploy-webrtc`](skills/deploy-webrtc/SKILL.md) and the optional [local token server](assets/local-token-server/README.md)).
- Store the key in `NAPSTER_API_KEY`, never hardcoded in committed source. The token server's `.env` must be gitignored.

## Non-negotiable rules

- **Voice IDs** must be a currently supported value — fetch the live list from the docs (`building-your-omniagent/configuration` or `get-overview`); don't hardcode it, the set changes. An unsupported value produces broken or silent audio.
- **Token issuance is server-side.** The browser never sees the API key.
- **Persona images** must be a publicly reachable URL when creating a custom persona with `pictureUrl`.
- **Functions are bound per agent (or per connection).** Creating a function does not auto-attach it — pass its ID in the agent's `functions` array.
- **Keep prompts and tool sets small.** Every tool and every instruction token competes for the model's attention in a realtime voice session.

## Maintainer and version

Maintained by Napster. Versioned with semver; see [`plugin.json`](.claude-plugin/plugin.json). The [Napster docs MCP server](https://docs.napster.com/_mcp/server) is the source of truth for API details — when a skill and the live docs disagree, the docs win.
