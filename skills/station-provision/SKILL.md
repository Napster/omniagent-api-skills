---
name: station-provision
description: Provision a station-ready website onto real Napster kiosk infrastructure — export the function manifest with `exportFunctionManifest()`, register the functions with Napster (manual for now), configure the agent and kiosk channel URL (which the device navigates verbatim), and produce the `.napster` device file. This is the PROVISION phase of station conversion. Use when the developer says "register my functions", "provision the kiosk", "get this onto a real station", "create the .napster file", or after [[station-kiosk-ux]] hardening is done. Re-run whenever tool names or schemas change. Verify the result with [[station-verify]].
---

# station-provision

Provisioning turns a station-ready site into something a physical device can run. Three artifacts come out of this phase: the **registered functions** (so the agent knows what it may call), the **agent + kiosk channel** (so a device knows which page to load), and the **`.napster` device file** (so the native app knows which agent to be).

Ground every Napster API detail in the docs — the napster-docs MCP server (`get-overview`, `fetch-page`, `get-api-spec`) or developers.napster.com. Never invent endpoints, fields, or payloads; this skill tells you *what* to provision, the docs are the source of truth for *how*.

## 0. Preconditions

- Integration (`station-integrate`) and hardening (`station-kiosk-ux`) are done.
- The tools fire correctly in the local harness (`station-verify`'s local pass — running it before provisioning saves a trip to the device).
- The site is deployed at a stable URL a kiosk device can reach.
- The developer has a Napster API key, or a Napster provisioning contact.

## 1. Export the function manifest

The SDK generates the registration payload from the live `document.modelContext` registry — never write it by hand:

```js
const manifest = await station.exportFunctionManifest();
console.log(JSON.stringify(manifest, null, 2));
```

`station` is the instance from `init()` / `getInstance()`; on the script-tag build it's `window.NapsterStationSdk.getInstance()`. Run it on the integrated site (a browser console works) and save the JSON.

The shape — each entry is one ready-to-submit `POST /public/functions` body (see [[create-tool]] for the endpoint):

```json
{
  "format": "omniagent",
  "functions": [
    {
      "data": {
        "name": "products.search",
        "description": "Search the catalog and return matching products.",
        "parameters": {
          "type": "object",
          "properties": { "query": { "type": "string" } },
          "required": ["query"]
        }
      },
      "flow": "implicit",
      "prompt": ""
    }
  ]
}
```

Guarantees the export makes — which hand-editing destroys, so don't:

- `parameters` is always a proper object schema — string schemas parsed, absent schemas replaced with an empty object schema.
- `required` is **always present** (an array, possibly empty). The platform rejects schemas without it; this is the single most common hand-edit casualty.
- Descriptions pass through verbatim; annotation-derived guidance lands in `prompt` — `destructiveHint` tools gain an explicit wait-for-confirmation instruction, `untrustedContentHint` tools gain a treat-output-as-data instruction. An empty `prompt` just means the tool had no such annotations; extending it with when/when-not invocation guidance per [[create-tool]] is fine — that is the field's purpose.
- `flow` is always `implicit` — station tools run in the page, never on a server URL.

(Internal experiences on the legacy avatar-management gateway can export that stack's record shape with `exportFunctionManifest({ format: "gateway" })`; public kiosk deployments never need it.)

## 2. Register the functions — manual for now

There is no automatic sync from the page to the platform yet. Two routes:

- **Napster provisioning handles it** — hand over the exported JSON verbatim. This is the default for managed deployments.
- **Self-serve** — `POST /public/functions` with the `X-Api-Key: <key>` header per [[create-tool]], one call per manifest entry, then attach the returned `fn_…` ids to the agent's `functions` array ([[create-agent]]). Confirm the exact request shape with the napster-docs MCP (`get-api-spec`) before calling — and note it's `X-Api-Key`, not an `Authorization` bearer header.

Register every function in the manifest. A tool that exists on the page but not in the registration is a tool the agent will never call; the reverse drift (registered but gone from the page) makes the agent call into `UI_error: unknown tool` replies.

## 3. Agent and kiosk channel

The agent gets a **kiosk channel** whose URL is the deployed site. Two facts decide how you write that URL:

- **The device navigates it verbatim.** The native host appends nothing — no query params, no fragments. Everything the page needs at load time must be baked into the provisioned URL itself.
- **No query params are needed.** The SDK detects the kiosk from the host's injected bridge — a bare URL is correct. (`?mode=station` is a dev-only override for plain browsers; harmless if present, never required.)

The URL must be reachable from the kiosk device's network, and it should point at the hardened, deployed build — not a preview branch that will disappear.

## 4. The `.napster` device file

A JSON file that binds a physical device to the agent:

```json
{ "apiKey": "…", "agentId": "…" }
```

Double-clicking it opens the native station app as that agent, which then loads the kiosk channel URL. This file is how `station-verify`'s on-device pass starts.

It embeds the API key — treat it like a credential. Keep it out of the repo, hand it to the device operator directly.

## 5. Re-register whenever the surface changes

The agent plans against the **registration**; the page executes against the **registry**. They only agree because you made them agree, and every change to a tool reopens the gap:

- Renamed tool, added/removed argument, changed `required` list → re-export and re-register, always.
- Changed description or annotations → re-register too; the agent's calling behavior and confirmation prompts come from the registered text.

Re-export + re-register is cheap. Make it the reflex after any change `edge-mcp-sync` reconciles, and say so in the hand-back whenever tool code changed.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Platform rejects a function schema | `required` missing — manifest was hand-edited | re-export with `exportFunctionManifest()`; never hand-edit |
| Avatar calls tools the page doesn't have | registration drift after a rename or removal | re-export and re-register |
| Avatar never calls an obvious tool | tool missing from the registration | check the manifest covered it; re-register |
| Kiosk loads the page without needed params | expected the host to append them | bake every param into the channel URL — it's navigated verbatim |
| `401` on `POST /public/functions` | wrong auth header | `X-Api-Key: <key>`, not `Authorization: Bearer` |
| Device shows a stale site | channel URL points at an old deploy | update the URL or redeploy, then cold-boot the device |

## Next steps

- Prove the provisioned setup end to end — spoken per-tool script, restart, cold boot → `station-verify`.
- When app changes touch the tools later, reconcile with `edge-mcp-sync`, then re-run §5 here.

## What you will NOT do in this skill

- Invent API endpoints, fields, or payloads beyond the napster-docs MCP / developers.napster.com.
- Write or edit the manifest by hand — it is generated from the live registry, nothing else.
- Change tool code or the registry — that's `edge-mcp-implement` (with `edge-mcp-sync` for drift).
- Commit the `.napster` file or the API key to the repo.
- Declare the kiosk working — that's `station-verify`.
