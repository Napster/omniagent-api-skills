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

Pick by **the tool you're using**, not by command. There are a lot of surfaces and it's easy to get lost; what matters is which tool runs your coding agent.

### Using Claude Code

Claude Code ships in several form factors — the **terminal CLI**, the **Claude desktop app** (Mac/Windows), the **VS Code** and **JetBrains** extensions, and the **claude.ai/code** web app. The install steps are the **same in all of them**, because plugins are a Claude Code feature regardless of where you run it. In any of those surfaces, run:

```
/plugin marketplace add napster/omniagent-api-skills
/plugin install napster-omniagent-api
```

After install, you'll have the guided wizard `/omniagent-quickstart` and all 12 skills will auto-trigger on natural language.

### Using Cursor, Codex, OpenCode, or another Agent Skills–compatible tool

These tools follow the open [Agent Skills spec](https://agentskills.io/specification). In your project root, run:

```bash
npx skills add napster/omniagent-api-skills
```

The skills will be dropped into your project and the bundled docs MCP server is auto-configured. The 12 skills work identically to how they do in Claude Code. The `/omniagent-quickstart` **slash command does not work here** — slash commands are a Claude Code feature. Use the natural-language path instead (just say "create a persona", "embed the agent in my React app", etc.).

### Manual install (any tool, or if neither command above fits)

```bash
git clone https://github.com/napster/omniagent-api-skills
```

Then point your tool at the cloned folder — e.g. for the Claude Code CLI: `claude --plugin-dir ./omniagent-api-skills`. For other tools, check their docs for "load skills from a local folder."

### Not sure which one you have?

If your coding agent supports a **`/plugin`** command — that's Claude Code, use the first path. If you install skills with **`npx skills add`** (Cursor, Codex, OpenCode, the Vercel Labs skills CLI) — use the second. When in doubt, the manual path always works.

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
