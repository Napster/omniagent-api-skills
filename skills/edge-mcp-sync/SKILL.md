---
name: edge-mcp-sync
description: Keep your website's agent surface (the WebMCP registration) in sync with your app's code — analyze the app and reconcile the tools the agent can DO (the `tools/` folder) and the live state it can SEE (`resources.ts`). Run it two ways — in chat whenever you and the agent change the app together (reconciles tools AND resources; no git or tooling needed), or via the `edge-mcp generate` automation (the marker-gated post-commit hook / CI, which reconciles tools and only FLAGS resource drift). Defers layout, safety annotations, the resource gate, and methodology to [[edge-mcp-plan]] and [[edge-mcp-implement]].
---

# edge-mcp-sync

Keep your website's agent registration — the WebMCP surface any compatible agent operates through — in sync with the app's code. The surface has two halves: the tools the agent can **DO** (the `tools/` folder) and the live state it can **SEE** (`resources.ts`, the sibling of the `tools/` folder). You are running inside the app's repository — your working directory is the app root.

Two triggers, matched to how the person works. They run the same tool reconciliation and differ in exactly **one** way — how they treat resources:

- **Chat / agent-driven (attended — the default for anyone who works through the agent).** Whenever you and the person change the app's features together, run this reconciliation as part of that work — no git, no hook, no `edge-mcp generate` command. A human is present, so reconcile the **whole surface: tools AND resources.**
- **Automation (`edge-mcp generate`, unattended).** For changes that land outside a chat (hand commits, teammates, CI), the same task runs from the marker-gated `[edge-mcp]` post-commit hook or CI. Here, **reconcile tools but do NOT edit `resources.ts`** — resources are subtler to get right (transient state, subscriptions, echoes) and there's no human in the loop, so only **flag** resource drift for an in-chat pass. The methodology skills are inlined below the instruction in that context.

The tool work below is identical either way. It names no fixed path — where the `tools/` folder and `resources.ts` live is decided by the methodology skills and the app's own conventions, not by this instruction.

Follow the **`edge-mcp-plan`** and **`edge-mcp-implement`** skills EXACTLY. They are your source of truth for the analysis approach, the safety annotations, naming, the live-state resource gate, what to deliberately withhold, and the layout (conventional: a `src/edge-mcp/tools/` folder where **each tool is its own file that `export const tool = { … }`** and `tools/index.ts` registers them all via `document.modelContext.registerTool(...)`, with resources in a sibling `resources.ts` — but adapt to the app's actual structure). When this task is run by the automation, those two skills are inlined below the instruction; in chat, load them as skills.

## Steps

1. **Read the app's real code** — service/API modules, stores, routes, components — to understand what operations and out-of-band state actually exist. The running code is the source of truth; ignore stale docs that contradict it.
2. **Locate the WebMCP surface** per the skills' layout, or wherever the app already registers it: the `tools/` folder and its sibling `resources.ts`. If none exists yet, create it at the conventional location the skills describe (`src/edge-mcp/tools/`, `src/edge-mcp/resources.ts`).
3. **Read what's already registered** — the existing tool files, the registrar (`tools/index.ts`), and `resources.ts`.
4. **Reconcile the tools, one tool per file (add / change / remove):**
   - **Add** a real operation worth exposing → create `tools/<tool-name>.ts` (kebab-cased after the tool name) exporting `const tool` with its `annotations`, AND add its import + entry to `tools/index.ts`.
   - **Change** a tool whose signature, behavior, or safety annotations changed → edit its file in place.
   - **Remove** a tool whose underlying code no longer exists → delete its file AND remove its line from `tools/index.ts`.
   Each tool's `execute` must call the app's real function — do not invent endpoints. Register every tool through `document.modelContext.registerTool(...)` in the registrar; the standard `annotations` carry the read/write distinction (read ⇒ `readOnlyHint: true`, needs-confirmation ⇒ `destructiveHint: true`, retry-safe ⇒ `idempotentHint: true`).
5. **Reconcile the resources — attended only:**
   - *In chat (a human present):* reconcile `resources.ts` too. **Add** a resource when new out-of-band state clears `edge-mcp-plan`'s gate (state the user changes by hand, or that changes server-side over time — never a shadow copy of what a tool already returns); **change** one whose shape or source moved; **remove** one whose state no longer exists.
   - *In the automation (unattended):* do **NOT** edit `resources.ts`. Instead, record any resource drift you spotted as a **flag** in your summary (e.g. "`currentOrder` state looks unregistered — run `edge-mcp-sync` in chat to add it") and leave the file untouched.

## Constraints

- **Tools:** edit the per-tool descriptor files + `tools/index.ts` — adding or removing a tool means BOTH its file and its registrar line change together; never leave the registrar out of sync with the files.
- **Resources:** edit `resources.ts` ONLY when running attended (in chat). In the unattended automation, never edit it — **flag** instead.
- Do not touch `index.ts`, `handles.ts`, or anything outside the tool files / `resources.ts` boundary above. Match the existing style and imports.
- Do not run shell commands, install packages, or touch git.
- When done, output a short summary: tools ADDED / CHANGED / REMOVED (each with `file:function` evidence), plus resources ADDED / CHANGED / REMOVED (attended) or FLAGGED (unattended).
