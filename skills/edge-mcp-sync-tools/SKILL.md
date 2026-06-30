---
name: edge-mcp-sync-tools
description: Keep your website's Omniagent tools in sync with your app's code — analyze the app, reconcile the tools/ folder (add / update / remove one descriptor file per tool, keep the registrar in sync), editing only files in that folder. This is the exact task the `edge-mcp generate` automation runs (post-commit hook or CI), and it can also be followed directly in chat. Defers layout, safety annotations, and methodology to [[edge-mcp-setup]] and [[edge-mcp-plan-capabilities]].
---

# edge-mcp-sync-tools

Keep your website's Napster Omniagent tool registrations in sync with the app's code. You are running inside the app's repository — your working directory is the app root.

This task is **universal**: it is identical whether it runs from the post-commit console (`edge-mcp generate`) or is followed as a skill in chat. It names no fixed path — where the `tools/` folder lives is decided by the methodology skills and the app's own conventions, not by this instruction.

Follow the **`edge-mcp-plan-capabilities`** and **`edge-mcp-setup`** skills EXACTLY. They are your source of truth for the analysis approach, the safety annotations, naming, what to deliberately withhold, and the layout (conventional: a `src/edge-mcp/tools/` folder where **each tool is its own file that `export const tool = { … }`** and `tools/index.ts` registers them all via `document.modelContext.registerTool(...)` — but adapt to the app's actual structure). When this task is run by the automation, those two skills are inlined below the instruction; in chat, load them as skills.

## Steps

1. **Read the app's real code** — service/API modules, stores, routes, components — to understand what operations actually exist. The running code is the source of truth; ignore stale docs that contradict it.
2. **Locate the WebMCP `tools/` folder** per the skills' layout, or wherever the app already registers tools. If none exists yet, create it at the conventional location the skills describe (`src/edge-mcp/tools/`).
3. **Read the existing tool files and the registrar** (`tools/index.ts`) to see what's already registered.
4. **Reconcile, one tool per file:**
   - **Add** a real operation worth exposing → create `tools/<tool-name>.ts` (kebab-cased after the tool name) exporting `const tool` with its `annotations`, AND add its import + entry to `tools/index.ts`.
   - **Update** a tool whose signature or safety annotations changed → edit its file in place.
   - **Remove** a tool whose underlying code no longer exists → delete its file AND remove its line from `tools/index.ts`.
   Each tool's `execute` must call the app's real function — do not invent endpoints. Register every tool through `document.modelContext.registerTool(...)` in the registrar; the standard `annotations` carry the read/write distinction (read ⇒ `readOnlyHint: true`, needs-confirmation ⇒ `destructiveHint: true`, retry-safe ⇒ `idempotentHint: true`).
5. **Edit ONLY files inside the `tools/` folder** (the per-tool files and `tools/index.ts`). Do not touch `index.ts`, `resources.ts`, `handles.ts`, or anything outside the folder. Match the existing style and imports.

## Constraints

- Edit only files inside the `tools/` folder (per-tool descriptor files + `tools/index.ts`) and nothing else. Adding or removing a tool means BOTH its file and its registrar line change together — never leave the registrar out of sync with the files.
- Do not run shell commands, install packages, or touch git.
- When done, output a short summary: tools ADDED / UPDATED / REMOVED, each with the `file:function` evidence behind it.
