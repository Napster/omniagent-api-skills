---
name: edge-mcp-implement
description: Implement an approved Edge MCP plan — install `@napster-corp/edge-mcp`, lay out the integration, register the plan's tools (standard `registerTool` with standard annotations) and live-state resources against the app's real code, and verify it all at runtime. This is the BUILD phase of agentifying a website; [[edge-mcp-plan]] decides WHAT to expose, this skill builds it. Usually invoked by the [[edge-mcp-setup]] orchestrator; use directly when a plan is already approved and only the code work remains ("implement the plan", "wire up the approved tools", "the plan is approved — build it"). Requires an approved plan; if there is none, run [[edge-mcp-plan]] first.
---

# edge-mcp-implement

Turn an approved Edge MCP plan into working code: install `@napster-corp/edge-mcp`, lay out the integration, register the plan's tools and live-state resources against the app's real code, and verify it at runtime. The result is vendor-neutral WebMCP — any compatible agent can drive it.

**Prerequisite: an approved plan.** This skill implements decisions; it does not make them. If there is no approved plan from `edge-mcp-plan` (the tool list with safety levels, the resource list with gate justifications, the withholds), stop and run that skill first. Everything below assumes the plan exists — never add tools or resources beyond it, and if implementation reveals a problem with the plan, go back to the developer instead of silently deviating.

**Hard rule — do not write or modify a single file until the developer has explicitly approved the plan.** Not a green light inferred from them answering a design question ("yes, cart writes should navigate"), not "looks good?" going unchallenged — an actual, standalone "yes, build it" (or equivalent). If you cannot point to that explicit go-ahead, **stop here and get it** (that's `edge-mcp-plan`'s closing approval step). Answering the planning questions is not approval. This is the single most important gate in the whole flow; a past run skipped it by treating answered clarifying questions as consent and wrote 25 tool files before anyone said go. Do not repeat that.

**Sections 2–6 are the specification for what you build in section 1.** Read them before writing files, not after.

## 1. Install the package and wire the integration

```bash
npm install @napster-corp/edge-mcp
```

**If npm reports removing dozens of packages or flags vulnerabilities, that's the app's own tree, not edge-mcp.** Edge MCP itself is small — the package plus one runtime dependency (`@cfworker/json-schema`, its schema validator). It pulls in nothing else at install time. When `npm install` prints lines like "removed 66 packages" or "2 vulnerabilities (1 high)", that's npm reconciling and auditing the app's *existing* dependency tree while it rewrites the lockfile — it's not something Edge MCP added. (The one optional peer, `@anthropic-ai/claude-agent-sdk`, is only needed if the developer later opts into the git-hook automation, and is never installed by this step.) Say this plainly if the developer is alarmed, rather than letting the noise erode trust.

Importing the package is a browser-only side effect: it polyfills the WebMCP standard so `document.modelContext` exists, and installs a live-state resource extension on it.

**Apps differ — derive the shape from the app, not from a template.** Stacks, layouts, and build tools vary wildly; what the planning phase learned about the app decides how this integration is laid out. Only a handful of things must hold in ANY app — the invariants:

- The polyfill installs **before** any registration runs.
- Registration happens in **one auditable place** — a single registrar that lists every exposed tool.
- **One descriptor per tool** is the unit of review and diff (the sync automation depends on that granularity).
- Every `execute` calls the app's **real code**.
- All of it runs **only in the browser** — never during SSR or on a server.

Everything else — the folder's location and name, TypeScript vs JavaScript, file idiom, how the entry point pulls it in — is convention, adapted to the app. The **default convention** below fits most JS apps; use it when the app doesn't suggest otherwise, and adapt it without hesitation when it does (`src/lib/edge-mcp/`, `app/lib/edge-mcp/`, plain `.js` files, etc.).

**No package manager or build step?** (a server-rendered app with sprinkled scripts — WordPress, Rails/Django/PHP templates — or a static no-build site): skip `npm install` and use the package's pre-bundled script-tag build instead. Load it once, version-pinned, before any registrations:

```html
<script src="https://cdn.jsdelivr.net/npm/@napster-corp/edge-mcp@0.1/dist/edge-mcp.iife.min.js"></script>
```

It has the identical side effect as the import (polyfill + resource extension), and everything after it is the standard `document.modelContext` surface in plain scripts — zero imports (`registerResource` is installed on `document.modelContext` too). The invariants still hold: keep all registrations in one auditable place (e.g. a single `edge-mcp-tools.js` the pages include), one descriptor per tool, load order polyfill-first. Tell the developer you're using the script-tag path and why.

The default layout mirrors the two-sided distinction at the core of the integration (what the agent can DO vs what the agent can SEE):

```
src/edge-mcp/
├── index.ts                ← imports the toolkit (installs the polyfill), then ./tools and ./resources
├── tools/                  ← one file per tool; each EXPORTS a descriptor (no registration inside)
│   ├── index.ts            ← the registrar — imports every descriptor and registers it (the "level up")
│   ├── products-search.ts  ← export const tool = { name: 'products.search', annotations: { readOnlyHint: true }, … }
│   └── cart-add.ts         ← export const tool = { name: 'cart.add', annotations: {}, … }
└── resources.ts            ← every registerResource call
```

**One tool per file.** Each file in `tools/` exports a single descriptor and registers nothing; the actual `document.modelContext.registerTool(...)` calls all happen one level up in `tools/index.ts`. This keeps each tool small and reviewable in isolation, makes the automation's diff per-tool, and still keeps the full exposed surface auditable in one read (the registrar lists every tool). Name each file after its tool, kebab-cased: `products.search` → `products-search.ts`, `cart.add` → `cart-add.ts`.

Resources stay in a single `resources.ts` — they're the exception, not the rule (see section 3), and rarely number more than a few. A `handles.ts` file appears alongside only if a tool's `execute` needs framework context (see "the handle pattern" below), and a `dev-panel.ts` file appears later only if the developer opts into the optional `edge-mcp-dev-panel` skill. The setup itself never creates either unless needed.

### `src/edge-mcp/index.ts`

The orchestration file. Importing the toolkit installs the polyfill on `document.modelContext`; importing the two leaf files runs their registrations.

```ts
// src/edge-mcp/index.ts
import '@napster-corp/edge-mcp'; // installs the WebMCP polyfill + resource extension on document.modelContext
import './tools';                // runs tools/index.ts → registers every tool descriptor
import './resources';
```

Import the toolkit **first**, before `./tools` and `./resources`. The registrar (`tools/index.ts`) calls `document.modelContext.registerTool(...)` and `resources.ts` calls `registerResource(...)` at module load, so the polyfill must already be installed when they run. Listing the toolkit import above them in `index.ts` guarantees that order.

### `src/edge-mcp/tools/` — one descriptor per file, registered one level up

Each tool gets its own file that **exports a descriptor and registers nothing**. Every tool — read or write — has one uniform shape; the standard `annotations` carry the read/write distinction (`readOnlyHint: true` marks a pure read, so a read tool registers through the same path as every other).

```ts
// src/edge-mcp/tools/products-search.ts
import { searchProducts } from '../../api/products';

export const tool = {
  name: 'products.search',
  description: 'Search the catalog and return matching products.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },
  async execute({ query }) {
    const results = await searchProducts(query as string);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  },
};
```

```ts
// src/edge-mcp/tools/cart-add.ts
import { cartStore } from '../../features/cart/store';

export const tool = {
  name: 'cart.add',
  description: 'Add a product to the cart.',
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'string' },
      qty: { type: 'integer', minimum: 1 },
    },
    required: ['productId', 'qty'],
  },
  annotations: {}, // reversible: has effects but undoable — announce, then run
  async execute({ productId, qty }) {
    await cartStore.addLine(productId as string, qty as number);
    return { content: [{ type: 'text', text: 'Added to cart.' }] };
  },
};
```

### `src/edge-mcp/tools/index.ts` — the registrar (the "level up")

The single place registration happens. It imports every descriptor and registers it. Adding a tool = add its file **and** one import line here; removing a tool = delete its file and its line. This file is the auditable list of everything exposed.

```ts
// src/edge-mcp/tools/index.ts
import { tool as productsSearch } from './products-search';
import { tool as cartAdd } from './cart-add';

// Every exposed tool, registered in one place. Read tools (annotations.readOnlyHint)
// register through the same path — the annotation carries the read/write distinction.
for (const tool of [productsSearch, cartAdd]) {
  document.modelContext.registerTool(tool);
}
```

### `src/edge-mcp/resources.ts`

Every `registerResource` call. Resources are the exception, not the rule (see section 3) — this file is often short, sometimes empty. An empty file (just the toolkit's import side effect, no registrations) is the right outcome when the plan's gate excluded everything; leave a one-line comment explaining the absence.

```ts
// src/edge-mcp/resources.ts
import { registerResource } from '@napster-corp/edge-mcp';
import { cartStore } from '../features/cart/store';

registerResource({
  uri: 'state://cart',
  name: 'cart',
  get: () => cartStore.getCurrent(),
  subscribe: (onChange) => cartStore.subscribe(onChange),
});
```

### Wire the folder into the app's entry point

The app's entry point imports the folder once. That single import installs the polyfill and runs every registration at startup.

```ts
// src/main.ts (or whatever the app's entry file is)
import './edge-mcp';
```

That single import is the only change to anything outside `src/edge-mcp/`.

#### Framework-specific entry-point wiring

The plain `import './edge-mcp';` above works for any bundler whose entry file already runs in the browser (Vite, vanilla Webpack, plain HTML + ES modules). For frameworks that mix server-side rendering with client hydration, the import has to live somewhere that runs **in the browser** — `document` doesn't exist on the server, so importing the toolkit there throws or no-ops and nothing registers.

The examples below are patterns for the common stacks, **not a whitelist**. For a stack that isn't listed, construct the equivalent from the invariants: the import runs in the browser only, the polyfill installs before any registration, and one entry-point touch wires everything.

**Next.js (App Router)** — the default `app/layout.tsx` is a server component. Putting `import './edge-mcp';` there runs on the server where `document` is undefined. Use a thin client wrapper:

```tsx
// app/edge-mcp-loader.tsx
'use client';

import { useEffect } from 'react';

export function EdgeMcpLoader() {
  useEffect(() => {
    void import('@/edge-mcp');
  }, []);
  return null;
}

// app/layout.tsx — server component, unchanged otherwise
import { EdgeMcpLoader } from './edge-mcp-loader';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <EdgeMcpLoader />
        {children}
      </body>
    </html>
  );
}
```

The dynamic `import()` runs only on the client during hydration, so the polyfill installs and the tools register exactly where they should.

**Next.js (Pages Router)** — wrap the import in `useEffect` inside `pages/_app.tsx`:

```tsx
useEffect(() => { void import('@/edge-mcp'); }, []);
```

**Nuxt** — use a client plugin (the `.client` suffix gates it to the browser):

```ts
// plugins/edge-mcp.client.ts
import '~/edge-mcp';
```

**Remix / React Router** — same pattern as Next.js App Router: a small client component that `useEffect`s a dynamic import, mounted once at the top of the tree.

**Vite + React / Vue / Svelte / vanilla** — the plain `import './edge-mcp';` in `src/main.ts(x)` works as shown above with no wrapper needed.

**The polyfill installs once** — importing the toolkit a second time (under hot-module-reload, say) reuses the already-installed `document.modelContext` rather than replacing it. The standard registry lives on the document, so vendor SDKs discover it without a configuration step.

## 2. Tools — the hands

One tool per operation in the approved plan, no more. Every tool MUST declare a `description` (the agent reads it to decide WHEN to invoke) and an `inputSchema` (the agent reads it to decide WHAT arguments to send). A tool with no arguments still declares an explicit empty schema (`{ type: 'object', properties: {} }`); a registration missing either field is malformed.

> **Examples here show the API shape.** In actual code, each tool is its own file under `src/edge-mcp/tools/` that `export const tool = { … }`, and `tools/index.ts` registers them all via `document.modelContext.registerTool(...)`; every `registerResource(...)` lives in `src/edge-mcp/resources.ts`. The snippets below show the descriptor body — mentally place each in its own `tools/<name>.ts` file and add its import line to the registrar.

```ts
// src/edge-mcp/tools/products-search.ts
export const tool = {
  name: 'products.search',
  description: 'Search the catalog and return matching products.',  // the planner reads this
  inputSchema: {                                                    // REQUIRED — the contract
    type: 'object',
    properties: {
      query: { type: 'string' },
      maxPrice: { type: 'number' },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },                              // pure read — call freely (see section 4)
  async execute(params) {
    const results = await searchProducts(params);                  // the app's REAL search
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };  // standard result shape
  },
};
```

Rules:

- **The tool list, the names, and the safety levels come from the approved plan.** The curation doctrine — domain naming, cardinality, named navigation vs. a generic `navigate({ url })`, what to withhold — lives in `edge-mcp-plan` and was already applied. Implement exactly the approved list; don't invent tools, don't wrap everything, don't rename.
- **`execute` calls the app's own code** — the same function the UI's button/box calls. Composing several real operations into one tool is fine and often necessary (a `checkout.placeOrder` may need to chain `startCheckout → updateCheckout → placeOrder → refresh`). What's forbidden is **re-deriving business logic** — recomputing prices, re-validating rules the app already owns, or running a parallel fetch whose result goes only to the agent. If every step is a real call the app already exposes, you're composing, not re-implementing.
- **`description` and `inputSchema` are mandatory.** Description tells the agent WHEN to invoke; schema tells it WHAT to send. Derive the schema from the app's real types (TypeScript, Zod, OpenAPI) — see section 5.

### How a tool returns its result

A tool returns the standard WebMCP result shape: `{ content: [{ type: 'text', text: ... }] }`. **Return the answer whenever you can** — the agent gets it as `execute`'s return value and responds. If the operation needs a moment, `execute` can `await` and still return.

- `cart.add` → returns a short confirmation in its `content`. (The full cart isn't the result — it's available via the `cart` resource later if needed.)
- `products.search` → where it can, `await` the search and return the results as JSON text in `content`.

**When the result can't be returned inline** — the operation redirects or renders asynchronously and the data arrives out-of-band — return a short status in `content` that tells the agent what's happening and where the result will appear, so it narrates ("let me pull those up…") and waits, instead of reading the ack as "nothing found":

```ts
async execute(params) {
  showSearchResults(params);   // navigates / renders asynchronously
  return {
    content: [{
      type: 'text',
      text: 'Searching the catalog — the results will appear in the product list in a moment. Stand by; this is not the final list.',
    }],
  };
}
```

The result then reaches the agent through the matching **resource update** when its slice next changes. This is exactly the kind of out-of-band state that earns a resource under the plan's gate (see section 3).

> **Don't use a "pending" message for synchronous-from-the-user operations.** Client-side route changes, opening a modal, copying to clipboard, focusing a field — all of these complete *before* the agent's response has even started speaking. Return a plain confirmation (or whatever the real result is) for those. If you return a "stand by" status, the agent will narrate *"let me open that, stand by…"* for navigation that already finished, and the user sees the result before they hear the narration. Save the pending-style message for operations whose result genuinely arrives over time (a search that renders asynchronously, an upload, a long-running server call).

### When `execute` needs framework context — the handle pattern

A tool's `execute` lives in a plain module: it can call functions, mutate stores, fetch from APIs — anything that doesn't require being *inside* the component tree. But some operations only exist inside the framework's runtime context: `useNavigate()`, `useRouter()`, `useQueryClient()`, toast / modal / dialog hooks, any `useContext`-based API. A plain `execute` can't call those directly.

The pattern: keep the module-level slots in one shared `src/edge-mcp/handles.ts`, have a tiny in-tree component set them on mount, and let each tool's `execute` call through them. The handles file is shared infra (it registers no tool), so it sits beside `tools/`, not inside it — the registrar never imports it.

```ts
// src/edge-mcp/handles.ts

// Module-level slots. Set by <EdgeMcpHandles /> at mount; called from tool execute().
let navHandle: ((slug: string) => void) | null = null;
export function setNavHandle(fn: (slug: string) => void): void {
  navHandle = fn;
}
export function navigate(slug: string): void {
  if (!navHandle) {
    throw new Error('Navigation handle not yet mounted — is <EdgeMcpHandles /> in the tree?');
  }
  navHandle(slug);
}
```

```ts
// src/edge-mcp/tools/docs-open-page.ts
import { navigate } from '../handles';

export const tool = {
  name: 'docs.openPage',
  description: 'Navigate to a documentation page by slug.',
  inputSchema: {
    type: 'object',
    properties: { slug: { type: 'string' } },
    required: ['slug'],
  },
  annotations: {}, // reversible: navigation is undoable — announce, then run
  async execute({ slug }) {
    navigate(slug as string);
    return { content: [{ type: 'text', text: 'Navigated.' }] };  // synchronous from the user; not pending.
  },
};
```

```tsx
// src/components/EdgeMcpHandles.tsx
'use client';   // ← required in Next.js App Router / Remix; omit elsewhere

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';   // or useNavigate() in React Router, etc.
import { setNavHandle } from '../edge-mcp/handles';

export function EdgeMcpHandles() {
  const router = useRouter();
  useEffect(() => {
    setNavHandle((slug) => router.push(`/docs/${slug}`));
  }, [router]);
  return null;
}
```

Mount `<EdgeMcpHandles />` once near the top of the tree (just inside the root layout / app shell). The tool is now callable from anywhere.

**Plain React Router + Vite variant.** The same pattern in the most common non-framework SPA stack (`react-router-dom` + Vite, no Next/Remix). Same `handles.ts` as above; the differences are all in where the component mounts:

```tsx
// src/components/EdgeMcpHandles.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setNavHandle } from '../edge-mcp/handles';

export function EdgeMcpHandles() {
  const navigate = useNavigate();
  useEffect(() => setNavHandle((path) => navigate(path)), [navigate]);
  return null;
}
```

```tsx
// src/App.tsx — mount INSIDE <BrowserRouter>, above <Routes>
<BrowserRouter>
  <EdgeMcpHandles />
  <Routes>…</Routes>
</BrowserRouter>
```

Two gotchas specific to this stack:

- **`useNavigate` only works inside `<BrowserRouter>`.** Mounting `<EdgeMcpHandles />` outside the router (next to it instead of inside it) throws at render. Keep the handles component *inside* the router, above the routes.
- **Post-mutation navigation should be best-effort.** When a mutating tool navigates *after* its real work succeeded (add to cart, then show the cart), call the handle through a variant that logs instead of throwing when unset — a not-yet-mounted handle must not turn a completed mutation into a reported failure. Add a `tryNavigate(path)` beside `navigate(path)` in `handles.ts` for exactly this call site; keep the throwing variant for tools whose *entire job* is the navigation. add `setToastHandle`, `setDialogHandle`, `setQueryClientHandle`, etc. to `handles.ts` and set them all from the same in-tree component. One handles file keeps the whole pattern visible in one place.
- **A nav tool's return resolves before the screen settles — the return IS the confirmation.** `navigate(slug)` triggers a route change, but the router re-renders and the `currentPage` resource updates *after* the tool's promise has already resolved. So a consumer that navigates and then immediately reads `currentPage` to confirm gets the *previous* location — a stale read, not a bug in the tool. Two consequences for how you build and describe these tools: (1) a nav tool's `execute` should return a plain, confident confirmation (`'Navigated to the cart.'`) — that return is the agent's signal the nav was issued; (2) tell the consumer (in the tool's `description` or the hand-back notes) not to verify a just-issued nav by re-reading `currentPage`. If a tool genuinely must not resolve until the location has settled, have its `execute` await the app's own router-ready signal before returning — but the default and simplest contract is "the return confirms it," matching `edge-mcp-plan`'s `currentPage` caveat and §7's verify step.

### Server endpoints are app code too

"Call the app's own code" doesn't require importing the function into the client bundle. If the app already exposes the operation as a server endpoint (`/api/search`, a Next.js Route Handler, a Remix loader, a SvelteKit form action), calling it from `execute` via `fetch` is fine — it's the same canonical implementation, just reached over a network boundary instead of a module boundary. This is often the *right* move when importing the function directly would pull a large server-only bundle (vector store clients, DB drivers, ORMs, Node-only file IO) into the client.

```ts
// src/edge-mcp/tools/docs-search.ts
export const tool = {
  name: 'docs.search',
  description: 'Search the documentation by query.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },
  async execute({ query }) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query as string)}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
};
```

The tool still calls the app's real implementation — it just travels through the same endpoint your existing search UI uses, so there's one search path, not two.

### Reuse schemas where it helps

If several tools share the same input shape, extract the schema as a constant and reuse it. The standard doesn't care; it makes maintenance easier and the contract more consistent.

```ts
// src/edge-mcp/tools/_schemas.ts — a leading underscore keeps it out of the tool list
export const SlugArgs = {
  type: 'object',
  properties: { slug: { type: 'string' } },
  required: ['slug'],
} as const satisfies Record<string, unknown>;

// then in each tool file:
// import { SlugArgs } from './_schemas';
// export const tool = { name: 'docs.openPage', inputSchema: SlugArgs, ... };
// export const tool = { name: 'docs.copyPrompt', inputSchema: SlugArgs, ... };
```

## 3. Resources — the eyes

Register exactly the live-state resources the approved plan calls for — no more. **Which slices earn a resource was decided at plan time** by the out-of-band gate (state the user changes by hand, or state that changes server-side over time — see `edge-mcp-plan`). If implementation reveals that a planned resource just mirrors what a tool already returns, flag it back to the developer instead of registering it. An empty `resources.ts` is a correct outcome for many apps, not a failure; leave a one-line comment explaining the absence.

```ts
registerResource({
  uri: 'state://cart',                // a stable resource URI
  name: 'cart',                       // a noun — the slice it returns
  get: () => store.getState().cart.lines.map(l => ({
    id: l.id, name: l.name, qty: l.qty, price: l.price,
  })),
  subscribe: (onChange) => store.subscribe(s => s.cart, onChange),  // optional: enables push
});
```

- **`uri`** — a stable identifier for the slice (modeled on MCP resource URIs), e.g. `state://cart`.
- **`name`** — a noun identifying the slice (`cart`, `currentOrder`, `orderStatus`).
- **`get`** — returns a current, serializable snapshot from the app's real reactive state. Cheap, side-effect-free.
- **`subscribe`** *(optional)* — wires the app's own change mechanism (store subscribe, signal, query-cache listener) to an `onChange` callback, returning an unsubscribe. Present ⇒ the slice participates in push; absent ⇒ pull-only.

`get` is the *value*; `subscribe` is the *when*. Don't pass the new value through `onChange` — on change, the extension re-reads `get()`.

### Keep the signal clean at the source

- **Publish only settled state — never transient.** Don't push loading spinners, empty placeholders, or `null` blips. Expose the value only once it's real.
- **Don't clear-on-unmount between related views.** If navigating from one order page to another briefly tears down and rebuilds the same slice, the agent sees a `null` flash in between. Keep the slice populated across related transitions instead of blinking through empty.
- **Remember most pushes during an agent action are echoes.** When the agent itself just acted, the resulting state change is something it already got in the return. The fewer resources you expose, the less echo the consumer has to suppress.

- **Subscribe to the narrowest real change signal, not the whole store.** On every call to your `subscribe` callback, the extension re-reads `get()` and emits `resourceupdated` — it does not diff. So if you wire `subscribe` to a whole store that fires several times per operation (e.g. `setPending → setError → setCart → setPending`), or that fires on state outside your slice (loading/error/pending flags), each fire becomes an *echo* carrying an unchanged value, and the consumer's log fills with duplicates. Prefer a **selector subscription** so `onChange` runs only when your slice actually changes — Zustand's `store.subscribe(selectSlice, onChange)` via `subscribeWithSelector`, an RxJS `distinctUntilChanged`, a signal/`computed`, or your framework's equivalent. The example above already does this (`store.subscribe(s => s.cart, onChange)` fires only on the `cart` slice) — a bare `store.subscribe(onChange)` would not. If the store only offers a broad subscribe you can't narrow, expect echoes and dedupe downstream (the consumer-side pattern is in `edge-mcp-dev-panel`).

## 4. Safety annotations — writing the plan's levels as code

**WebMCP never widens what's permitted.** Tools are allowlisted; the agent runs as the signed-in user; the app's existing auth, validation, and permissions all stay in the app. Annotations are how the connected vendor SDK commits each call carefully — not what makes the call permitted in the first place.

Each tool's safety level was classified in the approved plan (the doctrine — the three levels, the escalate-when-ambiguous rule, and the team convention that `destructiveHint: true` means "the consumer must confirm with the user before calling, including additive-but-final actions" — lives in `edge-mcp-plan`). Your job here is mechanical: write each level as its standard annotation combo.

| Plan level | Annotations to write |
|---|---|
| read | `{ readOnlyHint: true }` |
| reversible | `{}` (or `{ readOnlyHint: false }`) |
| needs-confirmation | `{ destructiveHint: true }` |

Two additional hints, set per the plan:

- **`idempotentHint: true`** on a needs-confirmation tool whose underlying operation tolerates safe retries (e.g. via an idempotency key on the server).
- **`untrustedContentHint: true`** on tools whose output may contain untrusted/third-party text the model should treat as untrusted.

**When a destructive tool is `idempotentHint: false`, offer to make it `true` — don't just flag it.** A tool tagged `idempotentHint: false` (e.g. a `placeOrder` with no server-side dedup) means a retry could double-charge or duplicate the action — but the annotation only *warns*; it doesn't fix anything. If the underlying endpoint accepts an idempotency key (many payment/order APIs do), thread a **client-generated key** through the tool so a retry dedups server-side, and then the tool honestly becomes `idempotentHint: true`. Generate the key once per intent (not once per call), so the automatic retry reuses it:

```ts
// src/edge-mcp/tools/checkout-place-order.ts
export const tool = {
  name: 'checkout.placeOrder',
  description: 'Place the order for the current cart.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { destructiveHint: true, idempotentHint: true }, // true BECAUSE of the key below
  async execute() {
    // One key per intent: same value across retries of this same placement, so
    // the server collapses duplicates instead of charging twice.
    const idempotencyKey = crypto.randomUUID();
    const order = await api.placeOrder({ idempotencyKey }); // the app's real call, now dedup-safe
    return { content: [{ type: 'text', text: `Order ${order.id} placed.` }] };
  },
};
```

If the endpoint has no such parameter, leave `idempotentHint: false` and say so in the hand-back — but check first; the fix is usually one argument. This is an implementation choice, so raise it with the developer rather than inventing a server contract that doesn't exist.

**A read tool that also drives the UI is reversible, not read-only.** When a browse/search tool navigates to what it found (the return + navigate hybrid the plan blesses), moving the screen is a visible side effect — the user's context changes even though no data mutates. Classify it **reversible** (`annotations: {}`), not read. Reserve `readOnlyHint: true` for tools that neither mutate data *nor* move the screen. If a formerly-silent read gains navigation during implementation, update its annotations in the same change — the level was assigned when the tool was silent.

```ts
// src/edge-mcp/tools/orders-cancel.ts
export const tool = {
  name: 'orders.cancel',
  description: 'Cancel an open order before it ships.',
  inputSchema: {
    type: 'object',
    properties: { orderId: { type: 'string' } },
    required: ['orderId'],
  },
  annotations: { destructiveHint: true, idempotentHint: true },
  async execute({ orderId }) {
    await api.cancelOrder(orderId as string);
    return { content: [{ type: 'text', text: 'Order cancelled.' }] };
  },
};
```

Every tool in the `tools/` folder carries its `annotations` inline and registers through `document.modelContext.registerTool` by the registrar — a pure-read tool just sets `annotations: { readOnlyHint: true }`. Don't re-litigate levels here; if one looks wrong during implementation, raise it with the developer.

## 5. Schemas: required for input, derived from real types

`inputSchema` is mandatory on every tool. **Derive schemas from the app's real types** (TypeScript types, JSDoc, Zod/Yup, OpenAPI) rather than hand-guessing them. Real types keep the schema honest — if the underlying type changes, the mismatch surfaces in development instead of confusing the agent at runtime. Hand-written schemas drift.

**`document.modelContext` types are ambient.** `@napster-corp/edge-mcp` ships a global `Document.modelContext` declaration, so tool files type-check as soon as the package is imported — do NOT write a local `declare global { interface Document { modelContext: … } }` shim. If the project has one from an earlier setup (a `webmcp.d.ts` or similar), delete it: it now conflicts with the shipped declaration.

Tighten what the type alone can't express (a `string` that's really an enum, numeric bounds, `format` for emails/UUIDs/URLs), and redact sensitive fields from what `execute` returns.

If the app uses a runtime schema library like Zod, make each tool **type-linked** so tool/code drift becomes a compile error, not a runtime surprise. Two moves: (1) define the input ONCE as a schema and derive the JSON Schema from it, and (2) import the real backend function directly (typed) — so a rename or a changed signature breaks THIS file at `tsc` time.

```ts
import { z } from 'zod';
import { searchProducts } from '@/lib/catalog'; // the REAL function, typed — a rename breaks this line

const SearchArgs = z.object({ query: z.string().min(1), maxPrice: z.number().optional() });

// src/edge-mcp/tools/products-search.ts — exported as data (unit-testable without a live modelContext)
export const tool = {
  name: 'products.search',
  description: 'Search the catalog and return matching products.',
  inputSchema: z.toJSONSchema(SearchArgs) as Record<string, unknown>, // zod 4 native; the agent's schema is DERIVED
  annotations: { readOnlyHint: true },
  async execute(args) {
    const { query, maxPrice } = SearchArgs.parse(args); // validated AND typed at the boundary
    const results = await searchProducts(query, maxPrice); // typed call into the app's real code
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  },
};
```

The schema is the single source of truth for the args (it derives both the JSON Schema the agent sees and the TS type `execute` gets), and the typed import means a refactor of `searchProducts` can't silently leave this tool behind. (On Zod 3, `z.toJSONSchema` isn't available — use the `zod-to-json-schema` package instead.)

### What about tools with no arguments?

They still need a schema — an explicit empty one:

```ts
// src/edge-mcp/tools/cart-clear.ts
export const tool = {
  name: 'cart.clear',
  description: 'Empty the cart.',
  inputSchema: { type: 'object', properties: {} },
  annotations: {}, // reversible: the cart can be refilled — announce, then run
  async execute() {
    await cartStore.clear();
    return { content: [{ type: 'text', text: 'Cart cleared.' }] };
  },
};
```

The empty schema tells the agent "call with `{}`" rather than leaving the input shape undefined.

### `inputSchema` is the contract, not the checker

Declaring `inputSchema` does not by itself validate arguments at runtime — it's the contract the agent reads, not a runtime guard. Validate at the boundary inside `execute` yourself (e.g. `SearchArgs.parse(args)` as above) when you want a hard runtime check; otherwise args pass through and the underlying function decides.

**The return is not the log line.** What a tool returns is the standard `content` payload the agent receives. Any one-line summary a dev tool prints in passing (`5 products · top: …`) is a *display* concern, not the return. Keep them visibly distinct so a reviewer is never misled about what the agent actually receives.

## 6. Hosting mechanics (things that bite in practice)

- **Imperative actions from outside the component tree need a registered handle.** A tool's `execute` lives in a plain module, but things like navigation often only exist *inside* the framework (e.g. React Router's `useNavigate` hook). Register a handle at mount — an in-tree component sets `navHandle = useNavigate()` (or your framework's equivalent) into a module-level slot — and have `execute` call through that. Without it, `execute` has no way to drive navigation.
- **`document.modelContext` is shared by the whole document.** The polyfill installs once and the registry lives on the document, so it survives HMR / fast-refresh without splitting state. Re-importing the toolkit reuses the installed context rather than replacing it. Under HMR, re-running `tools/index.ts` (or any tool file) re-registers tools onto the same context; if your bundler does a full page reload on edits instead (the common default without `import.meta.hot.accept()`), everything restarts cleanly — same end state via a different path.
- **HMR can leave `execute` holding a stale module-scope reference.** A tool like `async execute({ id }) { await cartStore.addLine(id, 1); }` captures `cartStore` at the moment its tool file evaluates. Most modern bundlers use ESM live bindings, so when `cartStore` is hot-reloaded, the binding updates and the captured reference tracks the new value. But this isn't universal — CommonJS interop, certain bundler configs, or non-Vite stacks can leave `execute` calling into the old, dead store while the rest of the app uses the new one. Symptom: the tool "runs" without errors but the UI never updates because nothing's listening to the store it touched. Mitigation, if you hit this: wrap the store access in a getter that re-resolves at call time (`getCartStore().addLine(id, 1)`) so each invocation looks up the current module export. Only reach for this if the symptom appears — most stacks handle live bindings correctly out of the box.
- **Server-side rendering (SSR) has no `document`.** Outside the browser — Next.js / Nuxt / Remix / SvelteKit SSR, workers, edge runtimes — `document` doesn't exist, so the toolkit can't install `document.modelContext` and registrations have nowhere to land. This is why the import must be gated to the browser (section 1's framework wiring): importing it server-side either throws or no-ops, and running it on the server would leak subscriptions across requests and bleed per-user state through the Node process's shared globals. The real context spins up the moment the bundle hydrates in the browser.

## 7. Verify at runtime — REQUIRED before handing back

A successful TypeScript compile means the code parses and types check. It does **not** mean the integration works. Tools can look correct in source and still fail at runtime because of:

- A missing handle (`<EdgeMcpHandles />` not mounted in the tree).
- A stale module reference under HMR.
- An SSR boundary (the toolkit import ran on the server, where `document` is undefined, so nothing installed).
- A `useRouter` hook returning `undefined` outside its provider.

The five-minute runtime check catches all of these. **Run it before declaring done.** The method is **one snippet pasted into the browser console** — nothing heavier. Do NOT reach for Playwright, a browser-automation MCP, or any other automation harness to verify a setup; it's disproportionate to the job and the paste-one-snippet path costs nothing and works everywhere. Paste the snippet yourself if you have console access; otherwise start the dev server and hand the developer the exact steps ("open localhost:3000, paste this into the console, tell me what it prints"). For someone new to Edge MCP this doubles as the first moment they *see* their app being operable — narrate what each result means.

- **If the developer explicitly wants to skip verification** — respect that, but say plainly what wasn't checked, and record the integration as **unverified** in your hand-back report. Never imply it was tested.

The checks:

1. Start the app the way the app itself starts (`npm run dev`, `yarn dev`, `pnpm dev`, or whatever its own scripts and README say) and load it in a browser.
2. Open the browser console. Confirm you see the `[edge-mcp dev panel] mounted` log line if the dev panel was installed, or run `await document.modelContext.getTools()` to confirm the polyfill installed and the registry is populated. If it's empty, the registrations didn't run — investigate before going further.
3. Invoke **at least one tool per safety level** you registered (read / reversible / needs-confirmation, if present). The fastest way is the **canned verifier snippet** — [`verify-snippet.js`](verify-snippet.js) in this skill folder — a ready-to-paste console script that reads `getTools()`, buckets tools by safety level, and fires one tool per tier, logging each result. Paste it as-is (it dry-runs by default; flip `RUN_WRITES` to also fire one reversible and one needs-confirmation tool). Or do it by hand from the dev panel (Cmd+Shift+E → expand the tool → fill its form → Run) or DevTools:

   ```js
   const tools = await document.modelContext.getTools();
   const tool = tools.find(t => t.name === 'cart.add');
   await document.modelContext.executeTool(tool, JSON.stringify({ productId: 'p1', qty: 1 }));
   ```

   **Two contract quirks bite every consumer that reads these results — use these canonical one-liners instead of re-inventing a parse each time.** `getTools()` returns each tool's `inputSchema` as a JSON **string** (Chromium's native contract, matched by the polyfill), and `executeTool` resolves with the standard envelope as a JSON string. Parse and unwrap defensively:

   ```js
   // inputSchema is a JSON string on the wire — parse before use; tolerate an object from foreign surfaces.
   const schema = typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : (tool.inputSchema ?? {});

   // executeTool resolves with JSON.stringify({ content: [{ type, text }] }), or null if execute returned undefined.
   const raw = await document.modelContext.executeTool(tool, JSON.stringify(args)); // may throw on unknown tool / validation
   const text = raw == null ? '(no output)' : JSON.parse(raw).content?.[0]?.text ?? raw;
   ```

   The `edge-mcp-dev-panel` skill (§"`inputSchema` comes back as a JSON string" and §"`executeTool` resolves with the envelope") is the canonical home for both — reach for the same shape anywhere you consume the surface by hand, rather than writing a fresh `JSON.parse` per call site.
4. Confirm for each: the returned `content` makes sense, the UI reacts appropriately (cart drawer slides open, page navigates, modal appears). **Verify a navigation by the tool's own return, not by re-reading `currentPage`/location** — a nav tool's promise resolves *before* the router re-renders, so reading the location right after returns the *previous* page (a real runtime race). The tool's return is the confirmation the nav was issued; trust it.
5. If you registered resources: trigger a real out-of-band change (click a UI button, wait for an auto-updating resource to tick) and confirm the resource updates (the dev panel's RESOURCE log fires, or re-reading the resource's `get()` shows the new value).

When all of these pass, report back — to the developer directly, or to the `edge-mcp-setup` sign-off when orchestrated — with: the path where the integration landed, the tool list with annotations, the resources registered (or "none, by design"), and **which tools you actually invoked at runtime and what reacted**. If verification was skipped, the report must say so explicitly ("runtime verification: skipped at the developer's request — recommend running it before connecting an agent") instead of claiming success.

## What you will NOT do in this skill

- Make plan decisions — the tool list, safety levels, resources, and withholds come from the approved plan (`edge-mcp-plan`). If something looks wrong, raise it; don't silently deviate.
- Expose more than the approved plan, or add a generic `navigate({ url })` tool.
- Re-derive business logic the app already owns.
- Add a resource that just mirrors what a tool already returns.
- Declare done without the runtime verification in section 7.
- Build the agent UI, install a specific vendor's SDK, or configure a vendor-side resource (that's the deploy step's job).
