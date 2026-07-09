---
name: edge-mcp-setup
description: Agentify your website — prepare your app so an AI agent can operate it the way a person does today, by exposing your app's real operations as tools (what it can DO) and live state (what it can SEE) via the WebMCP standard (`document.modelContext`), wired against your app's real code. Vendor-neutral — any WebMCP-compatible agent can drive the result; a Napster Omniagent is one such agent, not a requirement. Use when the developer says "agentify this app", "set up Edge MCP", "add Edge MCP", "let an agent operate my site", "add agent actions to my website", or "set up WebMCP". This is the ORCHESTRATOR — it owns the journey and hands each phase to a specialist skill — [[edge-mcp-plan]] (decide), [[edge-mcp-implement]] (build), [[edge-mcp-dev-panel]] (test by hand, optional), [[edge-mcp-sync]] (maintain). Embedding the agent that uses the tools is a separate step — for a Napster Omniagent that's [[deploy-webrtc]]. Stops once tools are registered and verified and a keep-in-sync mechanism has been offered.
---

# edge-mcp-setup

Agentify your website: give an AI agent the ability to operate your app the way a person does today. Setting this up adds a tiny in-browser layer that declares which of the app's real operations an agent may invoke and which state slices it may perceive, on the standard `document.modelContext` surface. The result is vendor-neutral: any agent that speaks WebMCP can drive the site. A Napster Omniagent is one such agent, not a requirement.

This skill is the **orchestrator**. It owns the journey and the conversation with the developer; each phase of the work is done by a specialist skill. Connecting an actual agent (Napster's Omniagent, or any other vendor that supports WebMCP) is a separate step handled by that vendor's own skills or SDK.

**Two phases.** Phase one, one-time: set up Edge MCP in the app (steps 1–4 below). Phase two, ongoing: keep the surface in sync as the app changes (step 5). Both are required — step 5 is part of the setup, not optional. Step 5 always writes a sync note into the repo (no key needed); the keyed automation on top is an opt-in.

## The flow

| Step | What | Who does it |
|---|---|---|
| 1 | DECIDE what the agent may do, see, and never touch | `edge-mcp-plan` |
| 2 | BUILD the approved plan into the app | `edge-mcp-implement` |
| 3 | TEST by hand (optional, persona-gated) | `edge-mcp-dev-panel` |
| 4 | SIGN OFF with the developer | this skill (conversation) |
| 5 | KEEP IN SYNC — write the note (always); offer the hook (opt-in) | this skill → `edge-mcp-sync` |
| 6 | CLOSE THE LOOP — offer to deploy an agent | this skill (conversation) |

Run the steps in order. Don't start step 2 without an approved plan, and don't sign off without step 2's runtime verification.

## 1. Decide — invoke `edge-mcp-plan`

**Invoke the `edge-mcp-plan` skill before doing anything else.** It studies the app's real code deeply, proposes a starter plan — the high-value workflows, the tool list with safety levels, the resource list with out-of-band justifications, the deliberate withholds — and walks the developer through it until explicitly approved.

The initial setup happens once per app, but the surface it creates lives with the app from then on and is maintained as the app evolves (step 5). Planning is the first half of the initial act, not an optional preamble.

If the plan comes out at **zero** (the app has no real operations worth exposing), stop here — the planning skill explains that outcome to the developer; don't build scaffolding for no payoff.

## 2. Build — invoke `edge-mcp-implement`

With the approved plan in hand, **invoke the `edge-mcp-implement` skill.** It installs `@napster-corp/edge-mcp` (or the script-tag build for no-build sites), lays out the integration adapted to the app's actual stack, registers the plan's tools and live-state resources against the app's real code, and runs the **required runtime verification** — invoking real tools in a real browser, not just compiling.

Do not accept a green build as done. The implement skill hands back a report: where the integration landed, what's registered, and which tools it actually invoked at runtime. You'll relay that in the sign-off.

## 3. Offer the dev panel (to developers who'll actually use it)

The dev panel is **hand-testing scaffolding for developers** — a floating UI they open in the browser to poke tools by hand. For someone doing this for the first time it's also something more: no agent is connected yet at this point, so the panel is the one place they can *see* their app respond to tool calls today. Pitch it that way to a first-timer — "want to see your app respond to agent tool calls?" — not just as testing scaffolding.

It still only lands if the person works in the running app themselves. So gauge who you're talking to before offering it:

- **If they work in the app directly (open it in a browser, use DevTools, run it locally)** — offer the panel:

  > "Want me to install a dev-only panel for testing the integration? It mounts in dev mode, lists every registered tool with a form for its arguments (rendered from each tool's `inputSchema`), shows every resource with a live JSON view, and logs every invoke and resource update. Toggle with `Cmd+Shift+E`. Skip if you'd rather not — the tools work either way."

  If yes, run the `edge-mcp-dev-panel` skill — it handles the install and walks through usage.

- **If they do everything through you (the agent) and won't be opening a browser panel** — don't push it. A panel they never open is dead code. The runtime verification from step 2 already proved the tools work; just tell them it's done. Mention the panel exists in one line ("there's an optional dev panel if you ever want to poke the tools by hand — say the word") and move on.

Either way, if they decline, continue to sign-off; testing beyond step 2's verification is their call.

## 4. Sign off (in conversation, no separate file)

Walk the developer through:

- What's exposed (with safety annotations and idempotency hints).
- What's deliberately withheld.
- The resources, with a one-line reason each cleared the out-of-band gate (or: explicit acknowledgment that there are zero resources and why that's right for this app).
- Especially every `destructiveHint: true` tool — confirm whether it's `idempotentHint: true` and whether the underlying op has the right server-side dedup.
- **Confirmation that runtime verification passed** — list which tools were actually invoked successfully and what reacted.

When you finish, present:

- The path to the edge-mcp folder, wherever it landed in this app (with its orchestration `index.ts`, the `tools/` folder — one file per tool plus its registrar — and `resources.ts`, plus `handles.ts`, `dev-panel.ts` if applicable).
- The tool list with safety annotations and idempotency hints.
- The resources with their why-each-cleared-the-gate notes (or "none registered, by design").
- The withheld-by-choice list.
- Whether the dev panel was installed (and where to toggle it if so).
- The result of runtime verification.

## 5. Keep the surface in sync

The exposed surface — the tools the agent can DO and the live-state resources it can SEE — is hand-curated and drifts as the app changes. Keeping it in step is part of setup, not an afterthought. The **default** mechanism needs no key and no configuration: the agent that changes the app reconciles the surface as part of the same work (the `edge-mcp-sync` skill). What makes that survive across sessions is a short **note written into the repo**, so a future session — this one or another — knows sync is owed. The keyed automation is a narrow **opt-in** on top, for changes that never pass through an agent.

### 5a. Always write the sync note (no key, no question)

Write the note every time — it's just a file edit. No "do you have an API key?" gate; the note works without one.

**Where.** Write to whichever AI-instructions file(s) the project already uses — `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, `.github/copilot-instructions.md`. If none exist, create `AGENTS.md` (the neutral cross-tool default), plus `CLAUDE.md` when you're running as Claude Code.

**Idempotent.** Wrap the note in fences so it can be found and replaced, never duplicated:

```
<!-- >>> edge-mcp keep-in-sync >>> -->
…note…
<!-- <<< edge-mcp keep-in-sync <<< -->
```

Before writing, check whether that block already exists in the file — **replace it in place if present, append only if absent.** Re-running setup must never stack duplicate notes.

**The note** (substitute the real paths where THIS app's integration actually landed — the folder location varies per app, so don't hardcode `src/edge-mcp/`):

> **## Keep the edge-mcp agent surface in sync**
> This app exposes some of its real features to in-page AI agents via edge-mcp: things the agent can **DO** (tools, in `<tools folder>`) and things it can **SEE** (live state, in `<resources file>`). These must always match the app's real code.
>
> When you **add**, **change**, or **remove** a feature — a new operation, a renamed route, a removed action, new state the agent should see — reconcile the edge-mcp registration to match. Drift also creeps in from hand edits, teammates, and older commits, so don't assume the surface is current just because you didn't touch it this session: at natural points — while working on the app's features, or before wrapping up work here — give it a quick check and reconcile anything that's drifted. No need to re-check on every message.
>
> To sync: follow the `edge-mcp-sync` skill if you have it. Either way the task is the same — reconcile the edge-mcp registration against the app's real code, leave the changes uncommitted, and report what was added / updated / removed. (If the automated path is set up, `npx edge-mcp generate` does the same without a chat.)

Naming the skill **and** stating the plain-terms goal means a teammate or session without the skills plugin still knows what's owed and how. Once the note is written, chat-driven sync is live — nothing else is required.

### 5b. Offer the automation — only for changes that land outside the agent

Everything above covers every change that flows through an agent. The one gap it can't cover is a change that never goes through a chat — a hand edit, a teammate's push, a CI job. Offer the automation **only** if that's a real scenario for this person; if all their changes go through you, skip it — a hook they don't need is noise.

Make one short offer that names the gap, the trigger, and the cost:

> "Optional: if changes ever land here without me — you edit a file by hand, a teammate pushes, or CI runs — I won't see them. There's a git hook that regenerates the surface automatically on any commit you tag `[edge-mcp]`. It needs a paid AI credential (an Anthropic API key, or a GitHub Copilot subscription — not a Napster key). Want it? Skip it if your changes always go through me."

If they say yes, install it in the terminal:

1. **Confirm it's a git repo** — the hook install requires one.
2. **Put the chosen engine's credential + dependency in place:**
   - **anthropic (default):** `ANTHROPIC_API_KEY` in the gitignored `.env.local` (or a CI secret), and `npm i -D @anthropic-ai/claude-agent-sdk`.
   - **copilot:** `npm i -g @github/copilot`, sign in, and set `EDGE_MCP_ENGINE=copilot`.
3. **Run `npx edge-mcp install-hook`** — the marker-gated `[edge-mcp]` post-commit hook.
4. **Teach the trigger:** tag a commit `[edge-mcp]` to fire it; the regenerated files land **uncommitted** for review.

Scope the promise honestly: `edge-mcp generate` reconciles **tools** on its own, but only **flags** resource (live-state) changes for you to handle in chat — unattended edits to the resources file are riskier, so it leaves them to a human. The chat path handles resources fully.

The ongoing reconcile task itself is the `edge-mcp-sync` skill — the same task whether the automation runs it or you run it in chat.

## 6. Close the loop — offer the next step

The app is now operable, but nothing is operating it yet — the developer has no agent they can see or talk to. Don't end on "setup complete"; end with the bridge. The full skills hub was installed at the start, so the deployment skills are already available:

> "Your app is now operable by any WebMCP-compatible agent. Want to put one on it right now? I already have the skills to deploy a Napster Omniagent on this site (browser voice + video) — you'll need a Napster API key from developers.napster.com, and I can walk you through the rest."

- If yes → hand off to `setup-api-key` (if they have no key yet), then `deploy-webrtc`. The Web SDK reads the standard `document.modelContext` at init — no glue code needed in the app.
- If they use a **different WebMCP-compatible vendor** → point them to that vendor's SDK instructions; the standard `document.modelContext` registry is the same across vendors.
- If they're done for now → tell them what to say when they come back ("deploy the omniagent" / "embed the agent on my site").

## What you will NOT do in this skill

- Start building before the developer has explicitly approved the plan.
- Sign off without step 2's runtime verification having passed.
- Expose more than the agreed plan, or let the specialists deviate from it.
- Build the agent UI, install a specific vendor's SDK, or configure a vendor-side resource (that's the next step's job).
