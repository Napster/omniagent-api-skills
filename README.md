# Napster Omniagent API — Skills

The official Claude Code plugin **and** Agent Skills package for the [Napster Omniagent API](https://developers.napster.com). It gives an AI coding agent a focused skill for every API concept — personas, agents, tools, knowledge, and every deployment channel (web, audio, phone) — plus a framework-agnostic default panel the skill adapts to your stack, and an optional local token server for prototyping. The skills are grounded in the live documentation through the bundled Napster docs MCP server, so they stay current instead of drifting from training data.

**Where it runs:** the 12 skills (and the bundled MCP docs server) work in any tool that follows the [open Agent Skills spec](https://agentskills.io/specification) — Claude Code, Cursor, Codex, OpenCode, and others — installed via `npx skills add napster/omniagent-api-skills`. The guided **`/omniagent-quickstart`** wizard is a Claude Code slash command, so the wizard itself is Claude-Code-only; the skills it orchestrates run anywhere.

## After install, start here

- **In Claude Code, new to the API?** Run the wizard: `/napster-omniagent-api:omniagent-quickstart`. It walks you from API key to a deployed Omniagent on the channel(s) you pick. (Slash commands are a Claude Code feature — see the natural-language path below in other tools.)
- **In any tool, already know what you want?** Just say it in plain language — "create a persona", "embed the agent in my React app", "set up phone calls", "my mic isn't working" — and the matching skill fires automatically.

## Prerequisites

- A Napster developer account and an API key — see [`setup-api-key`](skills/setup-api-key/SKILL.md).
- Node 18+ (the optional local token server uses native `fetch` and has zero dependencies).
- A project to build into. The skills detect your framework or fall back to plain HTML.

## Install

Three ways to get this into your coding tool, ordered roughly by how much you get. Pick one — they don't compete with each other, you can mix and match.

### Option 1 — Just the docs MCP server

Smallest install. Adds the Napster developer docs as a queryable MCP server in your tool so your coding agent has live access to the API reference, guides, and examples without leaving your editor.

In Claude Code:

```
claude mcp add napster-docs --transport http https://developers.napster.com/mcp
```

For Cursor, VS Code / Copilot, Codex, or other MCP-capable tools, see the per-tool setup instructions at [developers.napster.com/ai-coding-tools](https://developers.napster.com/ai-coding-tools).

### Option 2 — The agent skills (cross-tool Agent Skills package)

Adds the 12 skills so your coding agent has architectural guidance and best practices for the Omniagent API. Works in any tool that follows the [open Agent Skills spec](https://agentskills.io/specification) — Claude Code, Cursor, Codex, OpenCode, and others.

In your project root:

```bash
npx skills add napster/omniagent-api-skills
```

The skills auto-trigger on natural language ("create a persona", "embed the agent in my React app", etc.). The `/omniagent-quickstart` slash command is Claude-Code-only — use the natural-language path in the other tools.

### Option 3 — The full Claude plugin (skills + MCP + quickstart wizard)

Bundles the docs MCP server, all 12 skills, and the interactive `/omniagent-quickstart` wizard into a single plugin. Setup depends on which Claude environment you use.

#### Claude Code (CLI and IDE extensions)

Recommended. The CLI always pulls the latest skills and MCP server.

Step 1 — add the Napster marketplace:

```
/plugin marketplace add napster/omniagent-api-skills
```

Step 2 — install the plugin:

```
/plugin install napster-omniagent-api@napster
```

To pull the latest version later, refresh the marketplace:

```
/plugin marketplace update napster
```

Third-party marketplaces don't auto-update by default in Claude Code, so this manual refresh is how you'll get new skills, MCP changes, or bug fixes. (You can enable auto-update per marketplace via `/plugin → Marketplaces → Enable auto-update` if you prefer that workflow.)

After install you'll have `/omniagent-quickstart` and all 12 skills auto-triggering on natural language.

#### Claude (browser or desktop chat product)

The chat product (claude.ai or the Claude Mac/Windows desktop app) uses a different install path — download the repo as a ZIP and upload it through the Customize UI:

1. Go to [github.com/Napster/omniagent-api-skills](https://github.com/Napster/omniagent-api-skills), click the green **Code** button, and select **Download ZIP**.
2. In claude.ai (browser) or the Claude desktop app, open the left sidebar and click **Customize**.
3. Click **+ → Create plugin → Upload plugin** and select the ZIP.
4. Click the new plugin in the sidebar to activate the skills, then open the **Connectors** tab and install the **Napster Docs** MCP server.

ZIP installs **don't auto-update**. When we publish new skills you'll need to re-download and re-upload. If you want updates handled for you, use the Claude Code CLI path above.

For step-by-step screenshots and per-tool setup details, see [developers.napster.com/ai-coding-tools](https://developers.napster.com/ai-coding-tools).

### Manual install (any tool, or if none of the above fits)

```bash
git clone https://github.com/Napster/omniagent-api-skills
```

Then point your tool at the cloned folder — for example, with the Claude Code CLI: `claude --plugin-dir ./omniagent-api-skills`. For other tools, check their docs for "load skills from a local folder."

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
    │                                   (brand mark is inlined as SVG in the panel HTML)
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
