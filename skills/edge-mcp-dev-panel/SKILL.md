---
name: edge-mcp-dev-panel
description: Add a small, opt-in, dev-only panel for testing the website tools you've exposed to AI agents via WebMCP by hand — every registered tool with a form for its arguments (rendered from the tool's `inputSchema`), every live-state resource with a live JSON view, and an event log of tool calls and state updates. Use when the developer says "add a dev panel", "I want to test my website's agent tools", "test the omniagent's website tools", "add a UI for testing the agent bridge", "build my own/custom panel", "read getTools()/subscribeResource myself", or accepts the offer at the end of [[edge-mcp-setup]]. Also covers building a CUSTOM panel against `document.modelContext` when the packaged one isn't enough. Dev-only and excluded from production bundles. Opt-in — skip it if the developer prefers the browser console or their own tests.
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

**TypeScript may not know `import.meta.env`.** If `import.meta.env.DEV` errors under `tsc` ("Property 'env' does not exist on type 'ImportMeta'"), the project is missing Vite's client types. Check `src/vite-env.d.ts` exists with `/// <reference types="vite/client" />` (Vite scaffolds it, but hand-rolled or migrated projects often lack it) — add the file if it's absent.

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

`installDevPanel({ shortcut?, startOpen?, font?, height? })` accepts options-only settings (no instance argument); edit `src/edge-mcp/dev-panel.ts` to pass them through if the customer wants non-default behavior:

- **`shortcut`** — the keyboard combo (default `'Cmd+Shift+E'`, `Ctrl+Shift+E` on non-Mac). Accepts `Cmd`, `Ctrl`, `Shift`, `Alt`, `Meta` modifiers plus a single key.
- **`startOpen`** — `true` to mount the panel open instead of hidden (default `false`). Useful for the first run-through so the developer sees it immediately.
- **`font`** — panel UI font. Defaults to the app's own font (read from `document.body`) so the panel matches the app's typography instead of the OS system font; pass a CSS `font-family` to override. Code/JSON always render mono.
- **`height`** — panel height in px (default `600`, clamped to the viewport). The panel holds this height and scrolls its content internally, so it never resizes as content changes.

The panel never auto-opens unless `startOpen: true` is passed — the developer chooses when to look at it. This keeps the rest of the dev experience unchanged.

The defaults already reflect the good UX (fixed height, app-matched font, collapsible JSON, searchable tool dropdown, deduped log — see below), so most installs pass no options at all.

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

A **single searchable dropdown** picks the tool to test — click it, type to filter by name, choose one, and only that tool's form renders below. One tool on screen at a time; nothing is selected until the developer picks. The dropdown shows each tool's derived safety level inline. The panel **derives** each label from the tool's standard annotations rather than from any recorded field: `readOnlyHint: true` → read, `destructiveHint: true` → irreversible, neither → reversible. The selected tool shows:

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
- `STATE <name>` with the new value — emitted on `resourceupdated`, **deduped by value**: a resource that re-emits an unchanged value (an echo — common when `subscribe` is wired to a whole store that fires several times per operation) does not add a repeat entry, and the initial hydration burst is suppressed via a per-URI baseline seeded at mount.

Each entry timestamps to the millisecond, and object/array payloads render as collapsible JSON trees. The log holds the last 200 entries by default; older entries roll off.

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

## Build your own panel

The packaged `installDevPanel` is the default and covers most needs — fixed height, app-matched font, collapsible JSON, a searchable tool dropdown, a deduped log. Reach for a custom panel only when you need UX it can't give you: your own layout or framework components, a panel embedded in an existing dev surface, app-native styling beyond the `font` option. When you do, you consume the same standard surface the packaged panel reads — `document.modelContext` — directly. There's no bridge object and nothing to hand it.

The packaged panel's source (`src/dev-panel.ts` in `@napster-corp/edge-mcp`) is the worked reference for everything below; when in doubt, read how it does it.

**The surface you consume:**

- `await mc.getTools()` → tool list. `await mc.executeTool(toolInfo, argsJson)` → run one.
- `mc.getResources()` / `await mc.readResource(uri)` → live-state values (the resource extension). `mc.subscribeResource(uri, handler)` → push updates. (`mc.addEventListener('resourceupdated', …)` is the lower-level equivalent the packaged panel uses.)

Four gotchas will bite a hand-rolled consumer. Each is already handled inside the packaged panel; bake them into yours too.

### 1. `inputSchema` comes back as a JSON string — parse it

`getTools()` returns each tool's `inputSchema` as a JSON **string** (Chromium's native contract, matched by the polyfill), not an object. Parse before you render a form from it, and tolerate both shapes (a foreign surface may hand back an object):

```ts
function coerceSchema(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { /* fall through */ } }
  return { type: 'object', properties: {} };
}
const schema = coerceSchema(tool.inputSchema);
```

See `coerceInputSchema` in `dev-panel.ts`.

### 2. `executeTool` resolves with the envelope — unwrap it

`executeTool(toolInfo, JSON.stringify(args))` resolves with `JSON.stringify(<ToolResult>)` — a JSON string of the standard envelope `{"content":[{"type":"text","text":"…"}]}` — or `null` when the tool's `execute` returned `undefined`, and **rejects** on unknown tool / validation failure / abort. Don't render the raw envelope; unwrap to the text (which may itself be JSON the tool stringified in):

```ts
const raw = await mc.executeTool(toolInfo, JSON.stringify(args)); // may throw
const text = raw == null ? '(no output)' : JSON.parse(raw).content?.[0]?.text ?? raw;
```

Pass `toolInfo` — the exact object `getTools()` returned — never a hand-built `{ name }`: Chromium's native `executeTool` requires the original handle. See `invokeTool` / `unwrapToolOutput` in `dev-panel.ts`.

### 3. Dedupe chatty resource echoes with a per-URI baseline

`resourceupdated` fires on **every** producer signal — the extension re-reads `get()` and emits without diffing. A store that fires several `set()`s per operation (`setPending → setError → setCart → setPending`) emits the same value repeatedly, and the initial hydration fires too. If you log every emission verbatim, your panel fills with echoes. Seed a per-URI baseline from the initial `readResource`, then in the handler skip anything that matches the baseline (echo) or that arrives before a baseline exists (hydration):

```ts
const stableKey = (v: unknown) => { try { return JSON.stringify(v) ?? 'null'; } catch { return String(v); } };
const lastSeen: Record<string, string> = {};

// seed baselines up front (see gotcha 4 for the ordering)
for (const r of mc.getResources()) lastSeen[r.uri] = stableKey(await mc.readResource(r.uri));

function onUpdate(u: { uri: string; value: unknown }) {
  const key = stableKey(u.value);
  const prev = lastSeen[u.uri];
  lastSeen[u.uri] = key;
  if (prev === undefined || prev === 'null' || prev === key) return; // hydration / echo → update UI silently, skip logging
  logStateChange(u);
}
```

The better fix is upstream — a producer that subscribes to its slice, not the whole store, emits far fewer echoes ([[edge-mcp-implement]] §3, "Keep the signal clean at the source"). But a consumer should never assume that; always dedupe. See the `lastSeen` baseline in `dev-panel.ts`.

### 4. Subscribe synchronously — never after an `await`

`subscribeResource` returns an unsubscribe function. Capture it **before** any async work, so a teardown-able lifecycle (React effect cleanup, Vue `onBeforeUnmount`, Svelte, etc.) can always call it. If you subscribe *after* an `await` inside an effect, a fast unmount/remount can run cleanup before the subscription exists — the unsub is never captured, the listener leaks, and every emission double-fires. Subscribe first, then do the initial reads in a separate async pass:

```ts
useEffect(() => {
  const infos = mc.getResources();
  // ✅ subscribe first (synchronous) — cleanup always has the unsub
  const unsubs = infos.map((info) => mc.subscribeResource(info.uri, onUpdate));
  // then seed initial values asynchronously
  (async () => { for (const info of infos) seed(info.uri, await mc.readResource(info.uri)); })();
  return () => unsubs.forEach((u) => u());
}, []);
```

The packaged panel sidesteps this by subscribing synchronously at mount (no effect re-runs) and seeding baselines in a fire-and-forget pass — same principle.

## Failure modes worth flagging

If the developer reports any of these, here's the diagnosis:

- **"The panel doesn't appear when I press the shortcut."** `setupDevPanel()` probably didn't run. Confirm the call line is present in the entry point and that the dev-mode flag (`import.meta.env.DEV` or equivalent) actually evaluates true in the customer's bundler. Look for the panel's own `console.info('[edge-mcp dev panel] mounted')` message — if it's missing, the dynamic import never resolved.

- **"The tool list is empty."** `setupDevPanel()` ran before the toolkit's tool registrations completed. The order matters: import the toolkit setup module (which installs `document.modelContext` and registers tools) first, mount the dev panel last. Fix the order.

- **"My form field shows a JSON textarea instead of a real input."** The schema for that field uses a JSON Schema construct the panel doesn't render natively (anyOf, allOf, $ref, complex conditionals). Either simplify the schema, or accept the JSON textarea as the fallback.

- **"The panel rendered in my production build."** Either the dev-mode flag is wrong (it evaluates true in production), or the `import()` in `src/edge-mcp/dev-panel.ts` was changed from dynamic to static at some point. Static imports get included in the bundle even when the call site is dead code; the dynamic form is required for tree-shaking.

## What's next

The dev panel is a tool, not a permanent fixture. Once the bridge is stable and the app has CI tests covering the tools, the developer can leave it installed (it costs nothing in production) or remove the bootstrap entirely. There's no follow-up skill — the next interesting step is connecting an actual agent vendor (Napster's Omniagent or any other WebMCP-compatible SDK), and that's handled by that vendor's own skills.
