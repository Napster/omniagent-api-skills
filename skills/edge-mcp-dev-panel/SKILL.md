---
name: edge-mcp-dev-panel
description: Add a small, opt-in, dev-only panel for testing the website tools you've exposed to AI agents via WebMCP by hand — every registered tool with a form for its arguments (rendered from the tool's `inputSchema`), every live-state resource with a live JSON view, and an event log of tool calls and state updates. Use when the developer says "add a dev panel", "I want to test my website's agent tools", "test the omniagent's website tools", "add a UI for testing the agent bridge", or accepts the offer at the end of [[edge-mcp-setup]]. Dev-only and excluded from production bundles. Opt-in — skip it if the developer prefers the browser console or their own tests.
---

# edge-mcp-dev-panel

Add an opt-in, dev-only floating panel that mounts inside the app's own runtime and gives the developer a UI for testing the website tools exposed to AI agents via WebMCP by hand: pick a tool, fill in its arguments using fields rendered from the tool's `inputSchema`, click Run, watch the resource updates scroll by in an event log. The panel is a development convenience, not part of the bridge — the WebMCP surface works the same with or without it.

The panel reads `document.modelContext` itself — the standard surface the `@napster-corp/edge-mcp` polyfill installs on import. It does **not** take any instance; there is no bridge object to hand it.

## When to use this skill

Run this skill when **all** of these are true:

- The WebMCP toolkit is already set up in the target app (the toolkit is imported so its polyfill installs `document.modelContext`, and tools and live-state resources are registered).
- The developer wants a UI-driven way to exercise the bridge, instead of typing into DevTools or writing tests in their existing suite.
- The developer has accepted the panel — they were offered it at the end of `edge-mcp-setup`, or asked for it directly.

If the toolkit isn't set up yet, stop and route the developer to `edge-mcp-setup` first. If the developer hasn't been asked whether they want the panel, ask before installing — this is opt-in scaffolding, not a default.

## 0. Confirm prerequisites

Before any changes:

- Verify `@napster-corp/edge-mcp` is listed in the app's `package.json`. If not, the bridge isn't installed and `edge-mcp-setup` is the right place to start.
- Locate the `src/edge-mcp/` folder — `src/edge-mcp/index.ts` is where the toolkit is imported and tools are registered, with the `tools/` folder (one file per tool + `tools/index.ts` registrar) and `resources.ts` alongside it. If the app uses a different location (`src/lib/edge-mcp/`, `app/lib/edge-mcp/`, etc.), `grep -r '@napster-corp/edge-mcp' src/` confirms the path.
- Identify how the app expresses "dev mode" — `import.meta.env.DEV` (Vite/Astro), `process.env.NODE_ENV === 'development'` (Next.js/Webpack/CRA), `__DEV__` (some custom setups). Match the app's existing convention.

If any of these can't be found, stop and ask the developer in plain language. Don't guess.

The app's entry point (`src/main.ts` etc.) is where the panel is mounted, behind a dev-mode guard. It already imports the toolkit setup module from the setup step; this skill adds the dev-panel mount alongside it.

## 1. Install

The dev panel ships as a sub-path import of the same `@napster-corp/edge-mcp` package. Nothing new to install — the toolkit package is already in `package.json`. The skill makes two changes:

1. Adds a new file: `src/edge-mcp/dev-panel.ts`.
2. Adds one import and one call to the app's entry point, behind a dev-mode guard.

### Create `src/edge-mcp/dev-panel.ts`

A small wrapper that handles the dev-mode guard and the dynamic import. The dynamic `import()` is what keeps the panel's UI code out of the production bundle — a *static* import would pull the panel into the production chunk even if the if-guard skipped the call.

`installDevPanel` takes **no instance argument** — it reads `document.modelContext` itself (the toolkit's polyfill installs that surface on import). It accepts an options-only object and returns an `uninstall()` function.

**Pick the dev-mode flag that matches the app's bundler — this is not optional, the wrong flag silently fails:**

- **Vite, Astro, Nuxt, SvelteKit** → `import.meta.env.DEV`
- **Next.js, Webpack, Create React App, Remix** → `process.env.NODE_ENV === 'development'`
- **Some custom setups** → `__DEV__` (define-replaced at build)

How to tell: search the existing codebase for one of these patterns. Use whichever one already appears in the app's own code. If none appear and the framework isn't listed above, ask the developer.

**Vite-style (the most common):**

```ts
// src/edge-mcp/dev-panel.ts

/**
 * Mount the dev panel in dev mode. No-op in production.
 *
 * The dynamic import is required: it tree-shakes the panel's UI code from the
 * production bundle. A static `import` at the top of this file would ship that
 * code to production regardless of the dev-mode guard.
 *
 * `installDevPanel` takes no instance — it reads `document.modelContext`,
 * which the toolkit's polyfill installs on import.
 */
export function setupDevPanel(): void {
  if (!import.meta.env.DEV) return;
  void import('@napster-corp/edge-mcp/dev-panel').then(({ installDevPanel }) => {
    installDevPanel();
  });
}
```

**Next.js / Webpack / CRA-style (just swap the guard):**

```ts
// src/edge-mcp/dev-panel.ts

export function setupDevPanel(): void {
  if (process.env.NODE_ENV !== 'development') return;
  void import('@napster-corp/edge-mcp/dev-panel').then(({ installDevPanel }) => {
    installDevPanel();
  });
}
```

The rest of the file is identical. Pick one. Don't introduce a second convention into the codebase.

### Mount it from the app entry point

Add one import and one call to the app's entry point (`src/main.ts` etc.), after the toolkit setup module is imported so the polyfill and registrations are in place first. `setupDevPanel()` self-guards on dev mode, so the call is safe to leave in unconditionally.

```ts
// src/main.ts
import './edge-mcp';                                    // toolkit setup: installs the surface + registers tools
import { setupDevPanel } from './edge-mcp/dev-panel'; // ← added by this skill

setupDevPanel();                                       // ← added by this skill, no-op outside dev mode
```

That's the entire install. No new dependencies. The panel mounts on next dev-mode reload.

### What `installDevPanel` actually does

When the dev-mode dynamic import resolves and `installDevPanel()` runs, it:

- Reads `document.modelContext.getTools()` and (via the resource extension) `document.modelContext.getResources()` to render the initial UI.
- Subscribes to the `resourceupdated` event to keep the resource view and event log live.
- Attaches a keyboard shortcut listener so the panel can be toggled without clicking through DevTools.

It returns an `uninstall()` function. The developer doesn't need to call it normally; HMR re-runs the bootstrap and the panel re-mounts cleanly.

## 2. Where it mounts and how to open it

The panel is a fixed-position floating div in the bottom-right of the viewport, hidden by default to keep the dev experience uncluttered. **Toggle with `Cmd+Shift+E`** (or `Ctrl+Shift+E` on Windows/Linux). A small circular "E" toggle button also appears in the same corner when the panel is closed, so the developer doesn't need to remember the shortcut.

`installDevPanel({ shortcut?, startOpen? })` accepts two optional settings (options-only, no instance argument); edit `src/edge-mcp/dev-panel.ts` to pass them through if the customer wants non-default behavior:

- **`shortcut`** — the keyboard combo (default `'Cmd+Shift+E'`, `Ctrl+Shift+E` on non-Mac). Accepts `Cmd`, `Ctrl`, `Shift`, `Alt`, `Meta` modifiers plus a single key.
- **`startOpen`** — `true` to mount the panel open instead of hidden (default `false`). Useful for the first run-through so the developer sees it immediately.

The panel never auto-opens unless `startOpen: true` is passed — the developer chooses when to look at it. This keeps the rest of the dev experience unchanged.

## 3. What the panel shows

Three sections, top to bottom:

### State

A list of every registered live-state resource (read via the resource extension's `getResources()` / `readResource()`), each with:

- The resource's name (or URI).
- The current value, rendered as collapsible JSON. Updates live as the `resourceupdated` event fires.
- A timestamp of the most recent update.
- A "Refresh" button that calls `document.modelContext.readResource(uri)` and rerenders, in case the developer wants to force a pull.

If no resources are registered, the section shows an empty-state explaining that the gate ("out-of-band state only") may have excluded everything legitimately.

### Tools

A list of every registered tool, sorted alphabetically by name, grouped by safety level (read → reversible → irreversible). The panel **derives** each label from the tool's standard annotations rather than from any recorded field: `readOnlyHint: true` → read, `destructiveHint: true` → irreversible, neither → reversible. Each tool shows:

- Name, description, derived safety level (color-coded), and the `idempotentHint` flag.
- A form with one field per argument, **rendered from the tool's `inputSchema`**. The field types follow the schema:
  - `type: 'string'` → text input. With `enum`, becomes a select.
  - `type: 'integer'` / `'number'` → number input.
  - `type: 'boolean'` → checkbox.
  - `type: 'object'` → nested fieldset (recursive).
  - `type: 'array'` of primitives → repeating row.
  - Anything more exotic (anyOf, allOf, $ref) → falls back to a JSON textarea for that field, with a small note.
- Required fields are asterisked. JSON Schema `description` becomes hint text under the field.
- A "Run" button that calls `document.modelContext.executeTool(toolInfo, JSON.stringify(formArgs))` and shows the result inline.
- The most recent execution result, with success/error state and timing.

**Last-used args are remembered in `localStorage`**, keyed by tool name. The next time the developer opens the panel, the form is pre-filled with the last values they used. This is how the developer ends up with their own per-app sample args without any new API surface — they just use the panel.

### Event log

A chronological list (newest at top) of every event since the panel mounted:

- `CALL <name>` with the args object — emitted before `executeTool`.
- `RESULT <name>` with the return — emitted after.
- `STATE <name>` with the new value — emitted on every `resourceupdated` event.

Each entry timestamps to the millisecond. The log holds the last 200 entries by default; older entries roll off.

## 4. What this skill does NOT do

- **Run scripted scenarios.** The panel is interactive only. It doesn't know what a meaningful workflow looks like in any given app, so it doesn't guess. The developer drives.
- **Generate default argument values.** The first time the developer runs a tool, the form is empty; they fill it in. From then on, the panel remembers their last values. The skill never invents test data.
- **Mock the app's underlying state.** The panel is a thin UI over the live surface in the live app. If a tool requires a real product ID, the developer has to provide a real product ID. Mocking is the test suite's job, not the panel's.
- **Validate args before running.** Validation is governed by how the tool's `inputSchema` is enforced by the toolkit. If validation is enabled, the panel surfaces the validator's errors when `executeTool` returns an error result. If not, args pass through unchecked, same as for any other consumer.
- **Replace the app's existing test suite.** For ongoing regression coverage, write tests in Vitest/Jest as usual. The panel is for ad-hoc exploration during development.
- **Mount in production.** The dynamic `import('@napster-corp/edge-mcp/dev-panel')` is gated behind a dev-mode check. If the developer's bundler doesn't tree-shake conditionals correctly (rare), the panel still does nothing in production because the dev-mode check fails — but the safer path is to keep the dynamic import behind the same flag.

## 5. Sign off

Walk the developer through:

- The two changes involved: `src/edge-mcp/dev-panel.ts` (new) and the entry point (one import + one guarded call added).
- The keyboard shortcut for toggling the panel.
- That last-used args are remembered in `localStorage` (so closing/reopening doesn't lose state).
- That the panel only renders when the dev-mode flag is true; the production bundle is unchanged.
- A one-minute demo path: open the app in dev, press the shortcut, run one `read` tool, watch the resource view update if a related live-state resource is registered.

Then prompt them to keep going: "Anything missing? Wrong shortcut? The shortcut is configurable — let me know if you want to tweak it."

## Failure modes worth flagging

If the developer reports any of these, here's the diagnosis:

- **"The panel doesn't appear when I press the shortcut."** `setupDevPanel()` probably didn't run. Confirm the call line is present in the entry point and that the dev-mode flag (`import.meta.env.DEV` or equivalent) actually evaluates true in the customer's bundler. Look for the panel's own `console.info('[edge-mcp dev panel] mounted')` message — if it's missing, the dynamic import never resolved.

- **"The tool list is empty."** `setupDevPanel()` ran before the toolkit's tool registrations completed. The order matters: import the toolkit setup module (which installs `document.modelContext` and registers tools) first, mount the dev panel last. Fix the order.

- **"My form field shows a JSON textarea instead of a real input."** The schema for that field uses a JSON Schema construct the panel doesn't render natively (anyOf, allOf, $ref, complex conditionals). Either simplify the schema, or accept the JSON textarea as the fallback.

- **"The panel rendered in my production build."** Either the dev-mode flag is wrong (it evaluates true in production), or the `import()` in `src/edge-mcp/dev-panel.ts` was changed from dynamic to static at some point. Static imports get included in the bundle even when the call site is dead code; the dynamic form is required for tree-shaking.

## What's next

The dev panel is a tool, not a permanent fixture. Once the bridge is stable and the app has CI tests covering the tools, the developer can leave it installed (it costs nothing in production) or remove the bootstrap entirely. There's no follow-up skill — the next interesting step is connecting an actual agent vendor (Napster's Omniagent or any other WebMCP-compatible SDK), and that's handled by that vendor's own skills.
