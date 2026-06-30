---
name: setup-edge-mcp
description: Let a Napster Omniagent operate your website — expose your app's real operations as tools the in-page agent can call (what it can DO) and live state it can observe (what it can SEE), via the WebMCP standard (`document.modelContext`), wired against your app's real code. Use when the developer says "let the omniagent do things on my site", "add agent actions to my website", "expose my app to the agent", "agentify this app", or "set up WebMCP", or wants the embedded avatar to operate the real app instead of just talking. Pairs with [[deploy-webrtc]], which embeds the avatar — this is what gives that avatar hands. Stops once the tools are registered and the optional dev panel has been offered; connecting the agent SDK at runtime is the deploy step.
---

# setup-edge-mcp

Give a Napster Omniagent embedded on your site the ability to operate your app: a tiny in-browser layer that declares which of the app's real operations the agent may invoke and which state slices it may perceive. It lives in the same JavaScript runtime as the app's UI. Importing `@napster-corp/edge-mcp` polyfills the WebMCP standard so `document.modelContext` exists and installs a live-state resource extension on it; when an agent SDK initializes in the same page, it reads `document.modelContext` directly — no glue code from the developer.

This skill stops once the tools are registered and verified. Connecting an actual agent (Napster's Omniagent, or any other vendor that supports WebMCP) is a separate step handled by that vendor's own skills or SDK.

## 0. Confirm you're reading the real target app

Before any code: skim the actual source — components, the store, the service calls the UI makes. Don't trust ambient context files (`CLAUDE.md`, READMEs, docs) if they describe a different project or contradict the code; the running code is the source of truth, and a stale context file has sent past runs down the wrong path.

## 1. Run the planning skill

Setting up WebMCP is a **one-time act per app**: you plan what to expose, then you register it. Planning is the first half of that act — not an optional preamble.

**Invoke the `plan-capabilities-and-state` skill before doing anything else.** It analyzes the codebase, proposes a starter plan, and walks the developer through it until approved. The plan covers:

- The high-value workflows the agent should support
- The tool list (each with its safety annotations and idempotency hint)
- The resource list (each with its out-of-band justification)
- The deliberate withholds

When the planning skill returns, control comes back here and continues at step 2 with an approved plan in hand.

**Speak the app's language, not WebMCP's.** Frame every question during planning in the app's own terms. Ask "should the agent be able to see the cart after the user edits it by hand?", not "should we lift the cart's component state into an observable store and add a resource subscriber?" Translate the mechanics yourself; the developer shouldn't have to learn WebMCP to answer.

## 2. Install the package and create the `src/edge-mcp/` folder

```bash
npm install @napster-corp/edge-mcp
```

Importing the package is a browser-only side effect: it polyfills the WebMCP standard so `document.modelContext` exists, and installs a live-state resource extension on it. Everything WebMCP-related lives in `src/edge-mcp/` (or wherever the app keeps app-wide modules — `src/lib/edge-mcp/`, `app/lib/edge-mcp/`, etc.). The folder mirrors the two-sided distinction at the core of the integration (what the agent can DO vs what the agent can SEE):

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

Resources stay in a single `resources.ts` — they're the exception, not the rule (see step 4), and rarely number more than a few. A `handles.ts` file appears alongside only if a tool's `execute` needs framework context (see "the handle pattern" below), and a `dev-panel.ts` file appears later only if the developer opts into the optional `add-edge-mcp-dev-panel` skill. The setup itself never creates either unless needed.

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

Every `registerResource` call. Resources are the exception, not the rule (see step 4) — this file is often short, sometimes empty. An empty file (just the toolkit's import side effect, no registrations) is the right outcome when the gate excludes everything; leave a one-line comment explaining the absence.

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

## 3. Tools — the hands

One tool per real operation the developer chose to expose. Named in the app's **own domain terms**, as `domain.verb`. Every tool MUST declare a `description` (the agent reads it to decide WHEN to invoke) and an `inputSchema` (the agent reads it to decide WHAT arguments to send). A tool with no arguments still declares an explicit empty schema (`{ type: 'object', properties: {} }`); a registration missing either field is malformed.

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
  annotations: { readOnlyHint: true },                              // pure read — call freely (see step 5)
  async execute(params) {
    const results = await searchProducts(params);                  // the app's REAL search
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };  // standard result shape
  },
};
```

Rules:

- **`execute` calls the app's own code** — the same function the UI's button/box calls. Composing several real operations into one tool is fine and often necessary (a `checkout.placeOrder` may need to chain `startCheckout → updateCheckout → placeOrder → refresh`). What's forbidden is **re-deriving business logic** — recomputing prices, re-validating rules the app already owns, or running a parallel fetch whose result goes only to the agent. If every step is a real call the app already exposes, you're composing, not re-implementing.
- **Domain-named, intent-first.** `products.search`, `cart.add`, `cart.checkout`. The name and description are how the agent decides when to use it.
- **`description` and `inputSchema` are mandatory.** Description tells the agent WHEN to invoke; schema tells it WHAT to send. Derive the schema from the app's real types (TypeScript, Zod, OpenAPI) — see step 6.
- **Make cardinality obvious in the name.** A single-item fetch and a list are different operations: prefer `viewDetails` / `get` / `open` for one (`products.viewDetails`), and `search` / `list` for many (`products.search`). `products.view` is ambiguous — avoid it.
- **Named navigation IS a tool.** `docs.openPage({ slug })`, `account.openSettings()`, `cart.viewDrawer()` are legitimate first-class tools — especially for docs sites and content-heavy apps. **Strongly avoid** a generic `navigate({ url })` or `goto({ path })` tool that hands raw routes to the agent. The standard accepts it but the agent reasons better in domain terms than in URL paths: refactor-safer, fewer broken calls. Parameterized navigation with a domain-level argument (`openPage({ slug })`, `viewDetails({ id })`) is the right shape; routes stay inside `execute`.
- **Expose only what the plan calls for.** Don't invent tools, don't wrap everything.

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

The result then reaches the agent through the matching **resource update** when its slice next changes. This is exactly the kind of out-of-band state that earns a resource under the gate in step 4.

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

Same pattern applies to other framework-context APIs: add `setToastHandle`, `setDialogHandle`, `setQueryClientHandle`, etc. to `handles.ts` and set them all from the same in-tree component. One handles file keeps the whole pattern visible in one place.

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

## 4. Resources — the eyes

Resources are the **exception, not the rule.** Most of what the agent needs to know comes back from the tool it just called. A resource only earns its place when the agent needs to see state it *didn't* get from a return. **Many apps — content sites, docs sites, marketing pages, read-mostly tools — need zero resources.** An empty `resources.ts` is a correct outcome, not a failure; leave a one-line comment explaining the absence (e.g. *"No out-of-band state in this app — search results and page content are returned inline by their tools."*).

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

### When to add a resource (the gate)

Add a resource **only for state that changes out-of-band** — state the agent needs to see that changes *without the agent acting*:

- The **user** changes it by hand (edits a cart quantity, toggles a filter, navigates somewhere), or
- It changes **server-side over time** (an order status moves from `processing` to `shipped` while the conversation is open).

That's the whole test. **If a tool already returns the answer, do NOT add a resource to mirror it.** A search that returns its results inline needs no `searchResults` resource; a `products.viewDetails` that returns the product needs no `currentProduct` resource. Resources are for the state the return *can't* give you, not a shadow copy of the state it can. **Pure pull state — a value the agent could just ask for — is a read-only tool, not a resource;** reserve resources for state that genuinely changes out of band.

So `cart` is a good resource (the user can edit it directly in the UI) and `orderStatus` is a good resource (it moves server-side); `searchResults` and `currentProduct` usually are **not**, because the tool that produces them hands them straight back.

### Keep the signal clean at the source

- **Publish only settled state — never transient.** Don't push loading spinners, empty placeholders, or `null` blips. Expose the value only once it's real.
- **Don't clear-on-unmount between related views.** If navigating from one order page to another briefly tears down and rebuilds the same slice, the agent sees a `null` flash in between. Keep the slice populated across related transitions instead of blinking through empty.
- **Remember most pushes during an agent action are echoes.** When the agent itself just acted, the resulting state change is something it already got in the return. The fewer resources you expose, the less echo the consumer has to suppress.

## 5. Safety annotations (the one bit of governance)

**WebMCP never widens what's permitted.** Tools are allowlisted; the agent runs as the signed-in user; the app's existing auth, validation, and permissions all stay in the app. Annotations are how the connected vendor SDK commits each call carefully — not what makes the call permitted in the first place.

Safety is expressed entirely with **standard MCP annotation hints** on the tool. `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `untrustedContentHint` are all standard MCP hints — set them in the tool's `annotations` and the consumer reads them straight off the registered tool.

Keep the same three-level mental model — read / reversible / irreversible — but express each level as a standard annotation combo:

| Level | Annotations | What it is | Example | Consumer behavior |
|---|---|---|---|---|
| read | `{ readOnlyHint: true }` | Returns information / shows something; changes no durable state | search, look up, compare | Runs freely, no confirmation |
| reversible | `{}` (or `{ readOnlyHint: false }`) | Changes state that's easy to undo | add to cart, save draft, apply filter | Brief announce |
| irreversible / needs-confirmation | `{ destructiveHint: true }` | Can't be cleanly undone, or is additive-but-final | place order, charge card, cancel, send | Requires explicit user confirmation before the call |

**Team convention:** treat `destructiveHint: true` as "the consumer must confirm with the user before calling." Use it for additive-but-final actions too (submit, send, place order), even though MCP's strict definition of `destructiveHint` is a non-additive update. If a final action has no clean undo, mark it `destructiveHint: true` and the consumer gates it behind confirmation.

Default ambiguous cases to the **safer** level — escalate from read to reversible, and from reversible to needs-confirmation, when in doubt.

Set `untrustedContentHint: true` for tools whose output may contain untrusted/third-party text the model should treat as untrusted.

Every tool in the `tools/` folder carries its `annotations` inline and registers through `document.modelContext.registerTool` by the registrar — a pure-read tool just sets `annotations: { readOnlyHint: true }`.

For irreversible tools, also set `idempotentHint: true` if your underlying operation tolerates safe retries (e.g. via an idempotency key on the server):

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

## 6. Schemas: required for input, derived from real types

`inputSchema` is mandatory on every tool. **Derive schemas from the app's real types** (TypeScript types, JSDoc, Zod/Yup, OpenAPI) rather than hand-guessing them. Real types keep the schema honest — if the underlying type changes, the mismatch surfaces in development instead of confusing the agent at runtime. Hand-written schemas drift.

Tighten what the type alone can't express (a `string` that's really an enum, numeric bounds, `format` for emails/UUIDs/URLs), and redact sensitive fields from what `execute` returns.

If the app uses a runtime schema library like Zod, derive JSON Schema from it and validate at the boundary:

```ts
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const SearchArgs = z.object({ query: z.string(), maxPrice: z.number().optional() });

// src/edge-mcp/tools/products-search.ts
export const tool = {
  name: 'products.search',
  description: 'Search the catalog and return matching products.',
  inputSchema: zodToJsonSchema(SearchArgs) as Record<string, unknown>,
  annotations: { readOnlyHint: true },
  async execute(args) {
    const results = await searchProducts(SearchArgs.parse(args));   // validate at the boundary
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  },
};
```

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

## 7. Hosting mechanics (things that bite in practice)

- **Imperative actions from outside the component tree need a registered handle.** A tool's `execute` lives in a plain module, but things like navigation often only exist *inside* the framework (e.g. React Router's `useNavigate` hook). Register a handle at mount — an in-tree component sets `navHandle = useNavigate()` (or your framework's equivalent) into a module-level slot — and have `execute` call through that. Without it, `execute` has no way to drive navigation.
- **`document.modelContext` is shared by the whole document.** The polyfill installs once and the registry lives on the document, so it survives HMR / fast-refresh without splitting state. Re-importing the toolkit reuses the installed context rather than replacing it. Under HMR, re-running `tools/index.ts` (or any tool file) re-registers tools onto the same context; if your bundler does a full page reload on edits instead (the common default without `import.meta.hot.accept()`), everything restarts cleanly — same end state via a different path.
- **HMR can leave `execute` holding a stale module-scope reference.** A tool like `async execute({ id }) { await cartStore.addLine(id, 1); }` captures `cartStore` at the moment its tool file evaluates. Most modern bundlers use ESM live bindings, so when `cartStore` is hot-reloaded, the binding updates and the captured reference tracks the new value. But this isn't universal — CommonJS interop, certain bundler configs, or non-Vite stacks can leave `execute` calling into the old, dead store while the rest of the app uses the new one. Symptom: the tool "runs" without errors but the UI never updates because nothing's listening to the store it touched. Mitigation, if you hit this: wrap the store access in a getter that re-resolves at call time (`getCartStore().addLine(id, 1)`) so each invocation looks up the current module export. Only reach for this if the symptom appears — most stacks handle live bindings correctly out of the box.
- **Server-side rendering (SSR) has no `document`.** Outside the browser — Next.js / Nuxt / Remix / SvelteKit SSR, workers, edge runtimes — `document` doesn't exist, so the toolkit can't install `document.modelContext` and registrations have nowhere to land. This is why the import must be gated to the browser (step 2's framework wiring): importing it server-side either throws or no-ops, and running it on the server would leak subscriptions across requests and bleed per-user state through the Node process's shared globals. The real context spins up the moment the bundle hydrates in the browser.

## 8. Offer the dev panel

The tools are wired but untested. Offer the developer the opt-in dev panel:

> "Want me to install a dev-only panel for testing the integration? It mounts in dev mode, lists every registered tool with a form for its arguments (rendered from each tool's `inputSchema`), shows every resource with a live JSON view, and logs every invoke and resource update. Toggle with `Cmd+Shift+E`. Skip if you'd rather not — the tools work either way."

If yes, run the `add-edge-mcp-dev-panel` skill — it handles the install and walks through usage. If no, the setup is done; testing is the developer's call.

## 9. Verify at runtime, then sign off

### Runtime verification is REQUIRED before sign-off — a green build is not enough.

A successful TypeScript compile means the code parses and types check. It does **not** mean the integration works. Tools can look correct in source and still fail at runtime because of:

- A missing handle (`<EdgeMcpHandles />` not mounted in the tree).
- A stale module reference under HMR.
- An SSR boundary (the toolkit import ran on the server, where `document` is undefined, so nothing installed).
- A `useRouter` hook returning `undefined` outside its provider.

The five-minute runtime check catches all of these. **Do it before declaring done.** Specifically:

1. `npm run dev` and load the app in a browser.
2. Open the browser console. Confirm you see the `[edge-mcp dev panel] mounted` log line if the dev panel was installed, or run `document.modelContext.listTools?.()` (or inspect `document.modelContext`) to confirm the polyfill installed and the registry is populated. If it's empty, the registrations didn't run — investigate before going further.
3. Invoke **at least one tool per safety level** you registered (read / reversible / needs-confirmation, if present). From the dev panel: open the panel (Cmd+Shift+E), expand the tool, fill its form, click Run. From DevTools: call the tool's `execute` through `document.modelContext` (e.g. `await document.modelContext.callTool?.('cart.add', { productId, qty: 1 })`, or whatever the standard invoke entry point is in your toolkit version).
4. Confirm for each: the returned `content` makes sense, the UI reacts appropriately (cart drawer slides open, page navigates, modal appears).
5. If you registered resources: trigger a real out-of-band change (click a UI button, wait for an auto-updating resource to tick) and confirm the dev panel's RESOURCE log fires (or re-reading the resource's `get()` shows the new value).

Only after these all pass — proceed to sign-off below.

### Sign-off (in conversation, no separate file)

Walk the developer through:

- What's exposed (with safety annotations and idempotency hints).
- What's deliberately withheld.
- The resources, with a one-line reason each cleared the out-of-band gate (or: explicit acknowledgment that there are zero resources and why that's right for this app).
- Especially every `destructiveHint: true` tool — confirm whether it's `idempotentHint: true` and whether the underlying op has the right server-side dedup.
- **Confirmation that runtime verification passed** — list which tools you actually invoked successfully and what reacted.

When you finish, present:

- The path to the `src/edge-mcp/` folder (with `index.ts`, the `tools/` folder — one file per tool plus its `index.ts` registrar — and `resources.ts`, plus `handles.ts`, `dev-panel.ts` if applicable).
- The tool list with safety annotations and idempotency hints.
- The resources with their why-each-cleared-the-gate notes (or "none registered, by design"). (Tool list above already carries the safety annotations and idempotency hints.)
- The withheld-by-choice list.
- Whether the dev panel was installed (and where to toggle it if so).
- The result of runtime verification.

## 10. Offer to keep the tools in sync

The tool list is hand-curated and drifts as the app changes. Offer the developer the standing **sync rule** so the tools are regenerated whenever they commit:

> "Want me to install a rule that keeps the exposed tools in sync? After every commit, Claude Code reruns `edge-mcp generate` to reconcile `src/edge-mcp/tools/` against the current code and reports what changed — leaving it uncommitted for you to review. Runs on every commit, not gated on any marker."

If yes, run `npx edge-mcp install-rule` — it writes `.claude/rules/edge-mcp-sync.md` and adds a pointer to the repo's `CLAUDE.md`. (For commits made outside Claude Code, `npx edge-mcp install-hook` adds the marker-gated `[edge-mcp]` post-commit hook instead.) Both need `ANTHROPIC_API_KEY` and `@anthropic-ai/claude-agent-sdk` available when generation runs.

## What's next (out of scope for this skill)

You've wired WebMCP into the app. The agent integration is a separate concern handled by whichever vendor SDK the developer chose:

- **Napster Omniagent** — see the skills in `napster/omniagent-api-skills` (`create-agent`, `deploy-webrtc`, etc.). The Web SDK reads the standard `document.modelContext` at init — no glue code in the customer's app.
- **Any other vendor that supports WebMCP** — follow that vendor's SDK install instructions. The standard `document.modelContext` registry is the same across vendors.

## What you will NOT do in this skill

- Expose more than the agreed plan.
- Expose the app's route structure or add a generic `navigate` tool.
- Re-derive business logic the app already owns.
- Add a resource that just mirrors what a tool already returns.
- Build the agent UI, install a specific vendor's SDK, or configure a vendor-side resource (that's the next step's job).
