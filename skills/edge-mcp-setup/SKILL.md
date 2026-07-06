---
name: edge-mcp-setup
description: Agentify your website — prepare your app so an AI agent can operate it the way a person does today, by exposing your app's real operations as tools the agent can call (what it can DO) and live state it can observe (what it can SEE), via the WebMCP standard (`document.modelContext`), wired against your app's real code. Vendor-neutral: this makes the site operable by ANY WebMCP-compatible agent — a Napster Omniagent is one such agent, not a requirement. Use when the developer says "agentify this app", "set up Edge MCP", "add Edge MCP", "let an agent operate my site", "add agent actions to my website", "expose my app to the agent", or "set up WebMCP". This is the ORCHESTRATOR — it owns the journey and hands each phase to a specialist skill: [[edge-mcp-plan]] (decide), [[edge-mcp-implement]] (build), [[edge-mcp-dev-panel]] (test by hand, optional), [[edge-mcp-sync]] (maintain). Embedding the actual agent that then uses the tools is a separate step — for a Napster Omniagent that's [[deploy-webrtc]]. Stops once the tools are registered and verified and a keep-in-sync mechanism has been offered; connecting the agent SDK at runtime is the deploy step.
---

# edge-mcp-setup

Agentify your website: give an AI agent the ability to operate your app the way a person does today. Setting this up adds a tiny in-browser layer that declares which of the app's real operations an agent may invoke and which state slices it may perceive, on the standard `document.modelContext` surface. The result is vendor-neutral: any agent that speaks WebMCP can drive the site. A Napster Omniagent is one such agent, not a requirement.

This skill is the **orchestrator**. It owns the journey and the conversation with the developer; each phase of the work is done by a specialist skill. Connecting an actual agent (Napster's Omniagent, or any other vendor that supports WebMCP) is a separate step handled by that vendor's own skills or SDK.

**Two phases.** Phase one, one-time: set up Edge MCP in the app (steps 1–4 below). Phase two, ongoing: keep the tools in sync as the app changes (step 5). Both are required — step 5 is part of the setup, not optional.

## The flow

| Step | What | Who does it |
|---|---|---|
| 1 | DECIDE what the agent may do, see, and never touch | `edge-mcp-plan` |
| 2 | BUILD the approved plan into the app | `edge-mcp-implement` |
| 3 | TEST by hand (optional, persona-gated) | `edge-mcp-dev-panel` |
| 4 | SIGN OFF with the developer | this skill (conversation) |
| 5 | KEEP IN SYNC (ongoing, persona-routed) | rule, hook, or chat → `edge-mcp-sync` |
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

## 5. Offer to keep the tools in sync

The tool list is hand-curated and drifts as the app changes. There are three ways to keep it current — the agent rule, the git hook, or chat-driven re-sync — and the right one depends on **how this person works** and **which tool they're in**. Don't offer everything as equal options.

**Check the prerequisite FIRST, before installing anything.** Both automated mechanisms (rule and hook) run `edge-mcp generate`, which needs an **`ANTHROPIC_API_KEY`** and `@anthropic-ai/claude-agent-sdk` available at generation time — a Napster API key does not work for this. Ask up front:

> "One thing first: the automated sync runs a background coding agent, which needs an Anthropic API key. Do you have one? If not, no problem — skip the automation and just ask me to re-check the tools whenever the app changes."

**No key → chat-driven sync.** Nothing to install, nothing to configure: whenever the app's operations change, run the reconcile (the `edge-mcp-sync` skill) in conversation. Make that promise explicit and move on — don't install a mechanism that will fail on every run.

If they have a key, ask one routing question:

> "How do you usually work in this repo — do you commit with git yourself, or do you have me (the agent) make the changes and handle commits for you?"

Route on the answer. Don't offer both as equal options — pick the mechanism that matches their workflow.

**If they do everything through the agent (never commit by hand) → install the agent rule (Claude Code only).**

A git post-commit hook is useless here — it fires on manual `git commit`, which never happens. The agent is the only thing that touches the code, so the trigger has to be a rule the agent obeys:

> "I'll install a standing rule so that whenever we change the app together, I re-check the exposed tools against the code and reconcile them for you — no git setup, nothing for you to run."

Run `npx edge-mcp install-rule` — it writes `.claude/rules/edge-mcp-sync.md` and adds a pointer to the repo's `CLAUDE.md`, which Claude Code reads on every session. **The rule is Claude-Code-specific** — other tools (Cursor, Codex, OpenCode) never read those files, so installing it there gives the developer false confidence that sync is handled. In a non-Claude-Code tool, use chat-driven sync instead (or the hook, if they also commit by hand). And don't mention git hooks, commit markers, or CI to an agent-only person — none of it applies.

**If they commit with git by hand (a developer working manually) → offer the git hook.** It works in any tool — git is universal.

Their manual `git commit` is the natural trigger:

> "Want a post-commit hook that keeps the exposed tools in sync? After each commit, it reruns `edge-mcp generate` to reconcile the app's edge-mcp `tools/` folder against the current code and reports what changed — leaving it uncommitted for you to review. Gated on an `[edge-mcp]` marker so it only fires when you want it."

Run `npx edge-mcp install-hook` for the marker-gated `[edge-mcp]` post-commit hook. If they *also* drive changes through the agent, `npx edge-mcp install-rule` complements it (the rule covers agent-made changes, the hook covers hand-made commits) — offer it as a belt-and-suspenders, not a requirement.

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
