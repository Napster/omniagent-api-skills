---
name: edge-mcp-plan
description: Plan what an AI agent should be able to DO and SEE on your website before agentifying it — a curated set of your app's operations to expose as agent tools, state slices to expose as live resources, and deliberate withholds. Vendor-neutral — the plan targets any WebMCP-compatible agent, a Napster Omniagent included. Use when the developer asks "what should the agent be able to do on my site?", "what should the omniagent be able to do on my site?", "which actions should I expose to the agent?", "what can my app do that the agent should know about?", or before running [[edge-mcp-setup]] on a new app. Produces a plan the developer reviews and approves — conversational for small plans, a lightweight written artifact for large ones. [[edge-mcp-setup]] invokes this automatically if no plan has been agreed yet.
---

# edge-mcp-plan

Plan what an AI agent operating the developer's website should be able to do and see: read the existing web app and propose a starter plan for which operations should be exposed as **capabilities** the agent can invoke, which state slices should be exposed as **live-state resources** the agent can observe, and what should be deliberately **withheld**.

The output is a reviewed, approved plan. For a typical plan (up to ~8–10 items) it lives in the conversation — no file. For larger plans, write a lightweight plan artifact and approve in batches (see §5). Either way the developer reviews each item, edits or rejects freely, and approves the final list; the approved plan flows directly into the `edge-mcp-implement` skill (invoked by the `edge-mcp-setup` orchestrator), which turns it into code.

**Why this skill exists.** Without it, a developer setting up WebMCP starts from a blank canvas — they have to invent the capability list while also reasoning about safety annotations, the live-state resource gate, and what to deliberately withhold. That's high cognitive load. This skill does the inventory work first, so the developer reviews a structured proposal instead of brainstorming from scratch.

## 0. Confirm you're reading the real target app

Before any analysis: study the actual source until you understand how the app really works — components, the store, the service calls the UI makes, the route structure. This is not a quick glance; the whole plan depends on knowing what operations genuinely exist and how they're invoked, so read deeply enough to answer that from the code itself. Don't trust ambient context files (`CLAUDE.md`, READMEs, project docs) if they describe a different project or contradict the code; the running code is the source of truth, and a stale context file has sent past runs down the wrong path.

If the codebase doesn't match the developer's description, stop and verify before proceeding.

## 1. Identify the domain and the high-value workflows

Before listing individual capabilities, frame the bigger picture:

- **What is this app?** One sentence summarizing the domain. Apps that WebMCP fits include, but are not limited to:
  - Commerce: *"Electronics e-commerce for logged-in customers"*
  - Documentation / developer relations: *"API docs site with search, code samples, and a live-agent escape hatch"*
  - Content / marketing: *"Marketing site with product pages, a blog, and a contact form"*
  - Healthcare: *"Patient portal for appointment management"*
  - Internal tools: *"CRM for sales reps"*, *"Read-mostly admin dashboard with a few destructive actions"*
  - Productivity: *"Project management tool with tasks, comments, and a sidebar"*
  
  Any of these is a valid target. Don't assume WebMCP only fits transactional apps — a docs site whose only "operations" are search, page-open, and copy-to-clipboard is just as legitimate as an e-commerce checkout.

- **Who is the user the agent will act on behalf of?** Often the signed-in user; for public or content-heavy sites it's the anonymous visitor. The agent runs scoped to that user's existing rights either way.

- **What are the two or three high-value workflows the agent should be good at?** Workflows look different per domain — match the *actual* shape of the app, not a transactional template:
  - Commerce: *find and compare products, reorder a past purchase, start a return*
  - Docs / dev rel: *find the right docs page, walk the user through API setup, copy snippets to clipboard, hand off to a live agent when needed*
  - Content / marketing: *find a relevant article, jump to a specific section, submit a contact form*
  - Healthcare: *schedule a follow-up, show upcoming visits*
  - Internal tools: *look up a record, trigger a known recovery flow*
  
  The capability list flows from these. A docs site with three workflows and five capabilities is a perfectly normal output of this skill — not a small or "weak" plan.

If you can't answer these from the codebase alone, ask the developer in plain language before going further.

## 2. Propose candidate capabilities

For each high-value workflow, identify the real operations in the codebase that fulfill it. **The plan is the contract the whole build hangs on and the artifact the human actually reviews and approves — it has to stand on its own.** Spell each capability's purpose, arguments, and behavior out *in the plan itself*; don't leave them implicit until code exists. For each candidate, propose:

- **Name** — in the app's own domain terms, as `domain.verb`. Make cardinality obvious (`products.viewDetails` for one, `products.search` for many).
- **One-line purpose** — what the agent uses it for.
- **Arguments** — the input shape, in plain language drawn from the real function signature. List each argument with its type and whether it's required, or write "(no arguments)" if there are none. Example: "query (string, required), maxPrice (number, optional)". You are not writing JSON Schema yet — that's `edge-mcp-implement`'s job — but every capability's arguments must surface here, because the agent cannot use a capability whose input shape is unknown.
- **Safety level** — read / reversible / needs-confirmation, using the table below. This becomes the tool's standard annotation combo at setup time.
- **Navigates to** — the single most important column to get right, and the one most easily missed. For **every** candidate — reads *and* writes — answer explicitly: **should invoking this move the screen so the change is visible, and to where?** Record the destination in the app's own terms (a page, a drawer, a route by name) or `no` with a one-line reason. Never leave it blank. A blank here is exactly how past plans silently shipped state-mutating tools that never moved the screen. See "the navigation question is per-tool and mandatory" below.
- **Idempotency** — only relevant for needs-confirmation (`destructiveHint`) capabilities; mark `true` only if the underlying operation tolerates safe retry (e.g. via an idempotency key). It maps to `idempotentHint: true` at setup time.
- **Evidence** — the file and function in the codebase that backs it (e.g. `src/api/products.ts:searchProducts`). The developer should be able to grep-verify in seconds.
- **Confidence** — high / medium / low. Reserve low for cases where you're unsure the operation is technically exposable or appropriate.

Present the candidates as a **table**, not prose — the fixed, scannable shape below makes the safety tiers and (critically) the navigation column impossible to skip. Prose buries them:

| Tool | Safety level | Annotation | Navigates to | Real function |
|---|---|---|---|---|
| `products.search` | reversible | `{}` | product list (renders results on screen) | `src/api/products.ts:searchProducts` |
| `cart.add` | reversible | `{}` | cart drawer | `src/features/cart/store.ts:addLine` |
| `checkout.placeOrder` | needs-confirmation | `{ destructiveHint: true }` | order-confirmation page | `src/api/checkout.ts:placeOrder` |
| `products.getPrice` | read | `{ readOnlyHint: true }` | no — background lookup mid-flow | `src/api/products.ts:getPrice` |

Keep arguments, evidence detail, and confidence alongside the table (a notes column or a short line under each row); the table's job is to make the safety level and the `Navigates to` answer visible at a glance.

### Safety levels

Three levels, each expressed at setup time as a standard MCP annotation combo on the tool:

| Level | Annotations | Returns | Examples | Default when ambiguous |
|---|---|---|---|---|
| read | `{ readOnlyHint: true }` | Information; changes no durable state | search, look up, compare | — |
| reversible | `{}` (or `{ readOnlyHint: false }`) | A change that's easy to undo | add to cart, save draft, apply filter | escalate from read to here if any doubt |
| needs-confirmation | `{ destructiveHint: true }` | A change that can't be cleanly undone, or is additive-but-final | place order, charge card, cancel, send email | escalate from reversible to here if any doubt |

**Default to the safer level when ambiguous.** The needs-confirmation level (`destructiveHint: true`) triggers explicit verbal confirmation at runtime; classifying down loses that protection. By team convention, `destructiveHint: true` means "the consumer must confirm with the user before calling" — use it for additive-but-final actions (submit, send, place order) too, not only strict non-additive updates.

### Rules for the capability list

- **One real operation = one capability.** No invented operations, no wrappers around capabilities that don't reflect real app behavior.
- **Composition is fine.** A `checkout.placeOrder` capability may chain several of the app's real operations (`startCheckout → updateCheckout → placeOrder → refresh`). That's orchestrating the app's own calls. Re-deriving business logic (recomputing prices, re-validating rules the app already owns) is what's forbidden.
- **Named navigation IS a capability.** `docs.openPage({ slug })`, `account.openSettings()`, `cart.viewDrawer()` are legitimate first-class capabilities — especially for docs sites, content-heavy apps, and anything where "take me to X" is a real user intent. The pattern to **strongly avoid** is a *generic* `navigate({ url })` or `goto({ path })` tool that hands raw routes to the agent. The bridge won't reject it, but it forces the agent to reason in routes instead of domain terms — the agent invents URLs that don't exist, calls break when you refactor a route, and the curation that's the whole point of WebMCP gets sidestepped. The distinguishing test: does the capability require the agent to know the *route system*, or just the *domain*? If domain (a page slug, a product id, a section name), it's fine — that's still a named intent with a parameter. If route system (a raw URL), prefer a named alternative. Routes stay an implementation detail of `execute`.
- **The navigation question is per-tool and mandatory — writes most of all.** For **every** capability in the plan, answer one question explicitly and record it in the `Navigates to` column: *should invoking this move the screen so the change is visible, and to where?* This is not a browse-tool-only concern. The classic failure mode: a planner applies "return + navigate" to the browse/explore tools and silently skips every write — the cart mutations, the checkout writes, the address save, the order actions all change state but never move the screen, which directly contradicts the principle that a person watching should *see the site actually move*. **Writes are where navigation matters most**, because a mutation the screen doesn't reflect looks broken to the person watching. Default a write to navigating to wherever its result becomes visible (add-to-cart → cart drawer; place-order → confirmation page; save-address → the saved-addresses view) unless there's a real reason not to. The only capabilities that legitimately answer `no` are background lookups the agent makes mid-flow (a price check, a validation read) where moving the screen would be noise.
- **A browse read that also shows what it found is a first-class default, not an exception.** For apps where the point is *watching the agent operate the site* — commerce, docs, anything customer-facing — plan the primary browse/search capabilities as **return + navigate**: the tool returns its data to the agent AND drives the UI to the matching page. A `products.search` that answers silently while the screen stays put reads as broken to the person watching ("the website didn't navigate"), and retrofitting the navigation later means re-touching every browse tool. Propose the hybrid up front for the browse flows a user would follow along on screen; keep silent pure reads for background lookups the agent makes mid-flow (validation checks, price lookups) where moving the screen would be noise. Two consequences to record in the plan: this does NOT relax the generic-`navigate({ url })` prohibition above (the hybrid is still a *named* domain capability whose routing lives inside `execute`), and a read that moves the screen has a visible side effect, so classify it **reversible** (`{}`), not read (see the safety table — `edge-mcp-implement` applies the same rule at annotation time).
- **"Read-only" surfaces still have capabilities.** Even an app that doesn't mutate data has things the agent can DO: search, open a specific page, copy a snippet, open a modal, start a session, submit a form. If you find yourself thinking "this app has no real operations," look again — the operations are everything the user can trigger via a click.
- **Start small. The plan can also be very small, or zero.** Default to a high-value subset, not an inventory of everything. The plan should be the smallest set that supports the workflows from §1. Three to five capabilities is a normal-sized plan for a focused app. One or two is fine. **Zero is also a valid outcome:** if, after honestly reading the codebase, the app has no real operations worth exposing to the agent (a pure marketing page with one contact form, a static doc browser whose only "operation" is the user reading), say so. Recommend that the developer keep their existing MCP server (if any), use a non-Edge agent (a chatbot reading the docs), or skip the bridge entirely. Padding the plan with speculative capabilities (`copyPrompt` for a single hardcoded prompt, `openSomething` wrapping a button click that the user can already perform) is a worse outcome than an honest "WebMCP isn't the right fit here."

## 3. Propose candidate live-state resources

For each candidate live-state resource, propose:

- **Name** — a noun identifying the slice (`cart`, `currentOrder`, `orderStatus`).
- **Why it cleared the gate** — see below.
- **Evidence** — where the underlying state lives (store, signal, query-cache key).
- **Confidence** — high / medium / low.

### `currentPage` is a default resource — include it unless there's a strong reason not to

"Where is the user right now" is needed to resolve almost any contextual action ("add *this* to the cart", "buy the one I'm looking at"), and a change of location is a first-class state event — it changes out-of-band every time the user navigates by hand, and again every time an agent navigation lands. So `currentPage` (the current route / location, in the app's own terms) is a resource the plan **always includes by default** — not something the planner might forget to add. Drop it only with an explicit, documented reason (e.g. a single-screen app with no routing at all). It passes the gate below on the user-changes-it-by-hand clause; cite the app's router/location source as its evidence.

**Caveat — don't verify a nav with `currentPage`.** A navigation tool's own **return is the confirmation** that the nav happened. The agent must NOT navigate and then read `currentPage` to verify the nav it just performed — the resource can still read the previous location until the router re-renders (a real runtime race). `currentPage` is for observing where the user went *on their own*, not for double-checking a nav the agent just issued. `edge-mcp-implement` §7 spells out the convention.

### The gate (mechanical test)

Add a live-state resource **only for state that changes out-of-band** — state the agent needs to see that changes *without the agent acting*:

- The **user** changes it by hand (edits a cart quantity, toggles a filter, navigates somewhere), or
- It changes **server-side over time** (an order moves from `processing` to `shipped` while the conversation is open).

That's the whole test. **If a capability already returns the answer, do NOT add a resource that mirrors it.** A search that returns its results inline needs no `searchResults` resource; a `products.viewDetails` that returns the product needs no `currentProduct` resource. Resources are for the state the return *can't* give you, not a shadow copy of the state it can.

Common **candidates to verify against the code** — not defaults to copy into the plan:
- `cart` → often clears the gate (the user can edit it directly in the UI) — confirm the app actually lets them
- `orderStatus` → clears the gate ONLY if the status genuinely updates server-side while a session is open. In many apps it doesn't — the status is written once at creation and never touched again, and only code inspection reveals that. Find the writer before proposing it.
- `searchResults` → usually NOT a resource (the search capability returns the results)
- `currentProduct` → usually NOT a resource (the `viewDetails` capability returns the product)

**Confirm the out-of-band change exists in THIS codebase.** For every candidate, locate the code that changes the state without the agent acting — a user-editable UI control, a websocket/SSE handler, a poller, a background refetch — and cite it as the resource's evidence. If you can't point at the out-of-band writer, the candidate fails the gate no matter how canonical it looks on this list.

Apply the gate to each candidate and drop anything that fails it. The live-state resource list is the **exception, not the rule** — most apps need only a handful, and **many apps need zero**. Content sites, docs sites, marketing pages, and read-mostly admin tools often have no state that changes out-of-band: the user reads, the agent searches and navigates, nothing mutates behind anyone's back. An empty resources list is the correct outcome for those apps, not a sign that something is wrong.

## 4. List the deliberate withholds

The negative space matters as much as the positive list. Identify and call out:

- **Capabilities deliberately withheld.** Destructive admin actions, billing internals, anything sensitive or rarely needed. Name them and explain why each is excluded. Common examples: `admin.deleteUser`, `account.changePassword`, raw payment-method management, refund disputes.
- **State the agent should NOT see.** Other users' data, sensitive auth state, private payment information, transient UI state that would confuse rather than help.
- **Deflections** — workflows the agent should redirect the user to handle themselves rather than attempt programmatically. Common examples: multi-factor confirmation flows, support disputes, anything requiring human review.

The framing here is important: **exposing a capability is an approval, not an inventory.** The agent runs as the signed-in user, but that doesn't mean every operation the user can do should flow through the agent. Curation is the point.

## 5. Present the plan to the developer

**Speak the app's language, not WebMCP's.** Frame every question in the app's own terms. Ask "should the agent be able to see the cart after the user edits it by hand?", not "should we lift the cart's component state into an observable store and add a resource subscriber?" Translate the mechanics yourself; the developer shouldn't have to learn WebMCP to answer.

**Ask the per-tool judgment calls *while building the plan*, not only at the end.** The failure mode to avoid is "build the whole plan → present it → approve at the end": the decisions that actually determine correctness are per-tool judgment calls — *does this tool navigate? where to? is it destructive? do we withhold it?* — and those need to be surfaced as **clear, structured questions during planning**, so gaps get caught before anything is built. Don't bury them in a wall of prose; present the tool as a table row and ask the open questions against it ("`cart.add` — I've got it navigating to the cart drawer and marked reversible; right?"). The navigation question in particular (§2) must be asked for every tool, writes included — that's where past plans silently missed the mark.

Present the capabilities as the **table from §2** (Tool / Safety level / Annotation / Navigates to / Real function) so the safety tiers and the navigation column are scannable at a glance, then walk the plan in this structure:

1. **Domain summary + high-value workflows** — confirm framing.
2. **Candidate capabilities as the table**, grouped or sorted by safety level (read / reversible / needs-confirmation), with arguments and confidence noted alongside. Flag low-confidence items for closer review, and stop on any row whose `Navigates to` you're unsure about.
3. **Candidate live-state resources**, each with one-line why-it-cleared-the-gate (confirm `currentPage` is included — see §3).
4. **Deliberate withholds and deflections**, with reasoning.

Force an explicit per-item review for high-confidence items rather than passive accept-by-default. The developer should *approve* each capability, not silently accept the whole list.

**Large plans (more than ~8–10 items): write it down and approve in batches.** Item-by-item conversation doesn't scale to a 20-tool app, and a plan that exists only in chat history leaves nothing to hand to `edge-mcp-implement`. For large plans:

- Write the plan as a lightweight markdown artifact (e.g. `edge-mcp/PLAN.md`, or wherever the developer keeps working docs) with the same structure as the conversational walkthrough: workflows, the capabilities **table** (Tool / Safety level / Annotation / Navigates to / Real function) with arguments/evidence/confidence alongside, resources with gate justifications (including `currentPage`), withholds.
- Review in **groups**, not per item: the developer approves a whole batch at once (a safety-level group or a workflow's tools), with per-item stops only for needs-confirmation capabilities, low-confidence items, and anything you flagged.
- The approved artifact is the handoff to `edge-mcp-implement`; update it as the review changes things so it reflects the approved state, not the first draft.

For each item, the developer can:
- **Approve** as proposed.
- **Edit** name, safety level, or scope.
- **Reject** with a reason (which adds it to the withhold list with a justification).
- **Add** a capability or resource you missed.

End the review with an open prompt: "Anything missing?" — the developer almost always thinks of one or two workflows the analysis didn't surface.

## 6. Iterate until approved

The first pass is a draft. Be prepared to revise:
- Re-classify safety levels if the developer pushes back ("`cancelOrder` is actually idempotent — we have an idempotency-key server-side, so mark `idempotentHint`").
- Drop resources that turn out to mirror returns once the capability shape is clear.
- Add capabilities you missed.
- Move items between the expose list and the withhold list as the conversation refines them.

Don't move on until the developer explicitly says the plan is good to go. The whole point is that they own the decision; rushing approval defeats the purpose.

## 7. Hand off

Once the plan is approved, summarize the final state:

- N capabilities approved (M read, K reversible, J needs-confirmation, with idempotency hints)
- P live-state resources approved
- Q items deliberately withheld
- R deflections noted

Then prompt to continue with `edge-mcp-setup` (or remind the developer that's the natural next step if they invoked this skill directly). The orchestrator hands the approved plan to `edge-mcp-implement`, which turns it into registered code.

### If the plan came out at zero

If the honest answer was "this app has no real operations worth exposing," don't run `edge-mcp-setup`. Tell the developer plainly:

> Based on the codebase, WebMCP isn't the right fit for this app right now. The agent has nothing real to DO here — only what the user is already doing by reading the page. Options: (a) keep using your existing chatbot / MCP server / docs-aware assistant if you have one; (b) revisit this if you add interactive features later (forms, dynamic content, multi-step flows). WebMCP earns its weight when the agent can act on the user's behalf; without that, it's scaffolding for no payoff.

Skip the setup. A zero-plan is a sign that this skill did its job — not a failure to find capabilities.

## What you will NOT do in this skill

- Write any code. This skill plans; code happens in `edge-mcp-implement`.
- Produce a plan file for a small plan. Up to ~8–10 items the plan lives in the conversation and the code is the record; the written artifact is reserved for large plans (§5), where it's the handoff.
- Skip the gate for live-state resources. Every resource must have a one-line justification that maps to user-edit or server-side change.
- Approve items the developer hasn't reviewed. "Looks good?" with no explicit approval doesn't count.
- Suggest capabilities the codebase doesn't actually support. Every candidate must have evidence; if you can't cite a file and function, don't propose it.
- Plan vendor-specific integration (the Napster Web SDK auto-attach, Function configuration, voice/avatar persona). That's downstream of WebMCP and belongs to the agent vendor's skills.
