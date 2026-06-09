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

## AI coding agent support

Napster provides three layers of support for AI coding agents — an **MCP server** for documentation access, **agent skills** for architectural guidance, and a **Claude plugin** that bundles everything together. Use one or all three depending on your tool.

| Layer | What it is | Best for |
|---|---|---|
| [Quick start prompt](#quick-start-prompt) | One prompt you paste into your AI tool to build your first Omniagent end to end | Trying it out fast in any AI coding tool |
| [MCP server](#mcp-server) | Free docs server for any MCP-compatible tool | Giving your agent live access to the docs |
| [Agent skills](#agent-skills) | Architectural guidance and best practices | Letting your agent generate Omniagent code that follows best practices |
| [Claude plugin](#claude-plugin) | All-in-one plugin with quickstart wizard | The fullest experience in Claude Code or Claude chat |

### Quick start prompt

Copy [`omniagent-quickstart-prompt.md`](omniagent-quickstart-prompt.md) and paste it into your AI coding tool. It walks you through building and deploying your first Omniagent end to end — API key setup, persona creation, agent configuration, tools, knowledge, and channel deployment. Works in any tool whether or not you've installed anything else from this repo.

### MCP server

For coding agents that support the Model Context Protocol, Napster provides a free MCP server with tools for browsing and searching the documentation site. This gives your coding agent direct access to API references, guides, and examples without leaving the editor.

The MCP endpoint is `https://developers.napster.com/mcp`. Add it to your tool:

#### Claude Code

```
claude mcp add napster-docs --transport http https://developers.napster.com/mcp
```

#### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects):

```json
{
  "mcpServers": {
    "napster-docs": {
      "url": "https://developers.napster.com/mcp"
    }
  }
}
```

#### VS Code / Copilot (agent mode)

Add to `.vscode/mcp.json` in your workspace (or in your user settings):

```json
{
  "servers": {
    "napster-docs": {
      "type": "http",
      "url": "https://developers.napster.com/mcp"
    }
  }
}
```

#### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.napster-docs]
url = "https://developers.napster.com/mcp"
```

#### Any other MCP-capable tool

Use your tool's standard MCP HTTP server configuration with:

| Field | Value |
|---|---|
| Name | `napster-docs` |
| Transport | `http` |
| URL | `https://developers.napster.com/mcp` |

### Agent skills

Napster publishes open-source skills for coding agents that provide architectural guidance and best practices for building Omniagents — covering workflow design, channel configuration, tool integration, and deployment patterns. Combined with the MCP server, skills give your coding agent deep expertise about building with the Omniagent API so it can look up the docs, understand the architecture, and generate code that follows best practices.

Works in any tool that follows the [open Agent Skills spec](https://agentskills.io/specification) — Claude Code, Cursor, Codex, OpenCode, and others. In your project root:

```bash
npx skills add napster/omniagent-api-skills
```

### Claude plugin

The Napster plugin bundles the MCP server and agent skills into a single package with an interactive `/omniagent-quickstart` wizard. Setup depends on which Claude environment you use.

#### Claude Code (CLI and IDE extensions)

Recommended. The CLI always pulls the latest skills and MCP server.

Step 1 — add the Napster marketplace:

```
/plugin marketplace add https://github.com/Napster/omniagent-api-skills.git
```

Step 2 — install the plugin:

```
/plugin install napster-omniagent-api@napster
```

To update to the latest version later:

```
/plugin marketplace update napster
```

Third-party marketplaces don't auto-update by default in Claude Code, so this manual refresh is how you'll get new skills, MCP changes, or bug fixes. (You can enable auto-update per marketplace via `/plugin → Marketplaces → Enable auto-update` if you prefer that workflow.)

After install you'll have `/omniagent-quickstart` and all 12 skills auto-triggering on natural language.

#### Claude (browser and desktop chat product)

For the browser version (claude.ai) and the Mac/Windows desktop app, you need to download the plugin manually first.

**Step 1 — Download the plugin.** Go to the [Napster Omniagent API Skills repo](https://github.com/Napster/omniagent-api-skills), click the green **Code** button, and select **Download ZIP**. Save the file to your machine.

Skills installed from a ZIP **won't update automatically**. If we publish new skills, you'll need to re-download and re-upload. The Claude Code CLI handles updates for you.

**Step 2 — Install the plugin.**

In Claude (browser, claude.ai):

1. In the left sidebar, click **Customize**.
2. Click the **+** button to add a plugin, then choose **Create plugin → Upload plugin**.
3. Select the ZIP file you downloaded in Step 1.
4. Once uploaded, click the plugin in the left sidebar — the skills install automatically.
5. Open the **Connectors** tab — you'll see **Napster Docs** (the MCP server). Click **Install**.

In Claude (desktop, Mac/Windows): same flow as above through the desktop app's **Customize** UI.

### What you get

Once installed, the plugin gives your coding agent:

- Access to the full Omniagent API documentation via MCP
- Architectural guidance for building Omniagents
- A quickstart wizard that walks you through creating your first agent

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
