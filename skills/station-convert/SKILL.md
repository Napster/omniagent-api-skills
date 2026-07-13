---
name: station-convert
description: Make an existing website station ready — turn it into the touch surface of a Napster station kiosk, where an AI avatar running on the device sees the site's WebMCP tools and operates the page while the guest watches and talks. Use when the developer says "make my site work on the kiosk", "make my site station ready", "convert this site for the Napster station", "put my website on a station", or "add the kiosk avatar to my app". This is the ORCHESTRATOR — it owns the journey and hands each phase to a specialist — [[edge-mcp-plan]] (decide the tools), [[edge-mcp-implement]] (build them — same WebMCP registry, tools written once), [[station-integrate]] (wire `@napster-corp/station-sdk`), [[station-kiosk-ux]] (harden for portrait touch), [[station-provision]] (functions, channel, device file), [[station-verify]] (prove it locally and on-device). Nothing gets built until the developer has explicitly approved the tool plan.
---

# station-convert

A Napster station is a kiosk: a 1080×1920 portrait touchscreen driven by a native host application, with an AI avatar rendered and voiced **on the device** — not in the page. The website is the touch surface the guest and the avatar share. The avatar operates the site through the same standard WebMCP registry (`document.modelContext`) that any agentified site exposes; `@napster-corp/station-sdk` bridges that registry to the native host.

Converting a site therefore has two halves. **Agentify it** — decide and build the tools, exactly the same work as any Edge MCP setup; the tools are written once and serve browser agents and the station alike. **Stationize it** — the SDK wiring, the kiosk hardening, the provisioning, and the verification that are station-specific.

This skill is the **orchestrator**. It owns the journey and the conversation with the developer; each phase is done by a specialist skill. Never duplicate a specialist's doctrine here — route to it.

## The flow

| Step | Phase | What | Who does it |
|---|---|---|---|
| 1 | DECIDE | what the avatar may do and see on this site | `edge-mcp-plan` |
| 2 | BUILD | register the approved tools on `document.modelContext` | `edge-mcp-implement` |
| 3 | INTEGRATE | wire `@napster-corp/station-sdk` to the native host | `station-integrate` |
| 4 | HARDEN | portrait touch, idle reset, kiosk pitfalls | `station-kiosk-ux` |
| 5 | PROVISION | function registration, agent + kiosk channel, `.napster` device file | `station-provision` |
| 6 | VERIFY | local harness, then the real device | `station-verify` |

Run the steps in order. Don't start step 2 without an approved plan, and don't call the conversion done without step 6.

## 0. Set expectations — show the roadmap first

Before invoking any specialist skill, tell the developer how this is going to go, in a few plain sentences, so no step — especially the approval gate — is a surprise:

> "Here's how this goes: **first we decide together** what the avatar should be able to do on your site, and I'll show you the plan for approval. **Once you approve it, I build the tools** — standard WebMCP tools any agent could use, not station-specific ones. **Then I wire the station SDK**, harden the site for the kiosk's portrait touchscreen, and walk you through registering the functions and provisioning a device. **Last we verify** — locally against a fake host, then on the real kiosk. Nothing gets built until you've seen the plan and said go."

Also establish two facts early, because they shape every later decision:

- **The avatar is native.** The page never renders the avatar, never touches the microphone, never plays speech. Everything voice lives in the host; the page talks to it only through the SDK.
- **One registry.** Whatever tools this journey produces live on `document.modelContext`. There is no second, station-only tool set — a site already agentified is already halfway done.

## 1. Decide — invoke `edge-mcp-plan`

**Check for prior work first.** If the site already has an edge-mcp integration (an edge-mcp folder, `await document.modelContext.getTools()` returning a real list), the DECIDE and BUILD phases are done — confirm the existing surface matches what the developer wants on the kiosk, then skip to step 3. Never plan or build a duplicate tool set for the station.

Otherwise, **invoke the `edge-mcp-plan` skill.** All curation doctrine — safety levels, the navigation question, resources, withholds — lives there. Carry in only the station framing as planning context:

- The user the agent acts for is an **anonymous walk-up guest**, not a signed-in account (unless the kiosk flow signs one in).
- The navigation column matters doubly — the guest is physically watching this screen while the avatar acts.
- Tool results are relayed into a **voice** conversation; tools whose returns are concise text make for better speech than raw data dumps.

If the plan comes out at zero, stop — a kiosk whose avatar can only chat needs no conversion.

## 2. Build — invoke `edge-mcp-implement`

**Do not start this step until the developer has explicitly approved the plan.** The approval is a distinct, standalone yes — answering the per-tool judgment questions during planning is *not* approval. If you can't point to a plain "yes, build it" (or equivalent), go back to `edge-mcp-plan` and get it. This is the gate the whole flow hangs on.

With the approved plan in hand, **invoke the `edge-mcp-implement` skill.** It registers the tools on `document.modelContext` against the app's real code and runs its own runtime verification. Everything it produces is exactly what the station consumes — the tool return shape it teaches (`{ content: [{ type: 'text', text }] }`, `isError: true` for failures) is the same shape the station's output rules expect.

## 3. Integrate — invoke `station-integrate`

**Invoke the `station-integrate` skill.** It installs `@napster-corp/station-sdk`, inits it at the app entry, gates the session start behind a real tap, wires manual-interaction relays, restart, and push-to-talk, and explains the output rules from the tool author's side.

## 4. Harden — invoke `station-kiosk-ux`

**Invoke the `station-kiosk-ux` skill.** The kiosk is a 1080×1920 portrait touchscreen in a public space: touch targets, hover-free UI, suppressed escape hatches, page-owned idle reset, and per-guest localStorage hygiene all get handled there. A site that works beautifully in a desktop browser can still strand a guest; this phase is not optional polish.

## 5. Provision — invoke `station-provision`

**Invoke the `station-provision` skill.** It exports the function manifest via `exportFunctionManifest()`, registers the functions with Napster (manual for now), sets up the agent and the kiosk channel URL (which the host navigates verbatim), and produces the `.napster` device file.

## 6. Verify — invoke `station-verify`, then sign off

**Invoke the `station-verify` skill.** Two passes: the local harness (fire every tool against a fake host, watch the decoded commands) and the real device (spoken per-tool script, restart, cold boot). When it reports back, walk the developer through:

- The tool list the avatar can call, and where each was verified (harness / device / both).
- The kiosk hardening that landed.
- The provisioning artifacts — registered functions, channel URL, `.napster` file location.
- Anything skipped (no device on hand yet, say) stated plainly as unverified.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Code written before anyone said go | planning answers treated as approval | stop; get the standalone "yes, build it" per `edge-mcp-plan` |
| Two tool sets — one for browsers, one for the station | the one-registry rule missed | delete the duplicate; the station consumes `document.modelContext` as-is |
| Works in a desktop browser, guests get stuck on the kiosk | hardening phase skipped | run `station-kiosk-ux` before provisioning |
| Avatar answers "unknown tool" on device | registration drifted from the registry | re-run `station-provision` after any rename or schema change |
| "Done" declared after the harness pass alone | on-device pass skipped silently | run `station-verify`'s device checklist, or state plainly it's pending |

## What you will NOT do in this skill

- Start building before the developer's explicit, standalone approval of the plan.
- Duplicate the specialists' doctrine — tool curation belongs to `edge-mcp-plan`, tool code to `edge-mcp-implement`, wiring to `station-integrate`.
- Create a station-specific tool registry beside the WebMCP one.
- Add any transport other than the native bridge — no socket relays, no proxy services; the station is bridge-only.
- Declare the conversion done without `station-verify`'s report.
