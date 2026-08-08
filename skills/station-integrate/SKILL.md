---
name: station-integrate
description: Wire a website to the Napster station kiosk with `@napster-corp/station-sdk` — init at the app entry, gate the session start behind a real tap, relay manual interactions so the avatar knows what the guest sees, wire restart and push-to-talk, and return tool results the way the station's output rules expect. This is the INTEGRATE phase of station conversion; the site's tools must already be registered on `document.modelContext` via [[edge-mcp-implement]] — this skill consumes that registry and never re-declares tools. Usually invoked by [[station-convert]]; use directly when the developer says "install the station sdk", "wire my site to the station", "hook up the kiosk bridge", or "the tools are registered — connect the station".
---

# station-integrate

Wire the site to the native station host. The SDK does four things for the page: detects whether it is running on a station, installs the inbound handlers the host injects calls into, dispatches the avatar's function calls against the site's existing `document.modelContext` tools, and encodes the page's outbound commands (start, speak, restart, mute, volume) to the host. The page never touches the bridge protocol directly — everything goes through the SDK's public API.

**Prerequisite: registered tools.** The tools come from `edge-mcp-implement` and live on `document.modelContext`. Confirm with `await document.modelContext.getTools()` before wiring anything; if it's empty or missing, stop and route back through `station-convert`. This skill adds zero tools.

## 0. Preconditions

- An approved, built tool surface on `document.modelContext` (verified at runtime by `edge-mcp-implement`).
- Knowledge of the app's entry point and stack (the same discovery the edge-mcp phase already did).
- Agreement with the developer on the start interaction — what the guest taps to begin.

## 1. Install and init at the app entry

```bash
npm install @napster-corp/station-sdk
```

Init once, at the app entry, after the edge-mcp import so the registry exists first (discovery re-syncs on `toolchange`, so late registration recovers — but don't rely on that):

```ts
// src/main.ts
import './edge-mcp';
import { init } from '@napster-corp/station-sdk';

void init({ appKey: 'acme' });
```

`init()` is an idempotent singleton and **never rejects on "not a station"** — in a regular browser it resolves with `transport: 'none'`, every send method returns `false`, and the site runs normally. There is no error path to handle; ship the same bundle everywhere. `getInstance()` returns the instance (or `null` before init) from anywhere in the app.

**No build step?** Load the IIFE build instead — global `window.NapsterStationSdk`, auto-init when `window.__stationSdkOptions` is set before the script loads:

```html
<script>
  window.__stationSdkOptions = { appKey: 'acme' };
</script>
<script src="https://cdn.jsdelivr.net/npm/@napster-corp/station-sdk@0.1.0-alpha.1/dist/station-sdk.iife.min.js"></script>
```

**React?** Use the subpath hooks — `useStation(options?)` inits the same singleton in an effect and never re-inits:

```tsx
import { useStation } from '@napster-corp/station-sdk/react';

function App() {
  const { station, isStation, ready } = useStation({ appKey: 'acme' });
  // isStation → render the kiosk start screen; otherwise the normal site
}
```

Options (all optional):

| Option | Default | What it does |
|---|---|---|
| `appKey` | `'station'` | namespaces localStorage and the log prefix |
| `attachTimeoutMs` | `1500` | `document.modelContext` discovery window; `toolchange` re-syncs after |
| `speakToolResults` | `true` | relay each tool output to the avatar as a system message (see §5) |
| `autoStart` | `false` | send the session start on init — attract-loop kiosks only (see `station-kiosk-ux`) |
| `debug` | `false` | console logging, prefix `[StationSdk:{appKey}]` |
| `onFunctionCall` | — | observer for every call; return `false` to claim it (see §8) |
| `onUiUpdate` | — | observer for host `ui_update` events |

Detection is automatic — the host injects its bridge shim before any page script, so `station.isStation` is trustworthy immediately after init. For dev in a plain browser, opening the page with `?mode=station` forces station mode for that page load only — nothing persists, and real kiosks never need the param.

## 2. Gate the session start behind a real tap

**The host never starts the session — the page does.** Nothing happens on the kiosk until the page sends the start command, and it must come from a user gesture:

```tsx
<button onClick={() => station.startExperience()}>Tap to begin</button>
```

`startExperience()` makes the host dial the agent — avatar and microphone go live. It returns `false` when there's no bridge, so the same button is harmless in a browser. Call it once per session; use `isStation` to decide whether to render the start screen at all. `autoStart: true` replaces the gate for attract-loop kiosks that start themselves — the idle-reset patterns in `station-kiosk-ux` decide which model fits.

## 3. Relay manual interactions — the avatar must know what the guest sees

The avatar only perceives the page through what the page tells it. When the guest acts **manually** — taps into a product, applies a filter, opens the cart — the avatar is blind to it unless the page relays it, and then it talks about a screen the guest left two taps ago. Relay every significant manual interaction:

```ts
station.relayManual('product_opened', 'Guest opened the Seastar 1000 product page');
```

This speaks a system message `UI_manual_product_opened: Guest opened the Seastar 1000 product page` to the agent. `triggerResponse` defaults to `false` — the relay is context, not a conversation turn. Pass `{ triggerResponse: true }` only when the avatar should react out loud (e.g. the guest reached a decision point and a prompt helps).

In React, `useManualRelay()` returns a stable `relayManual` function safe to use in effects and handlers.

Relay judgment: significant = anything the avatar would need to answer "what is the guest looking at?" (navigation, selection, cart changes). Not significant = scroll positions, hover, transient animation states. Over-relaying floods the agent's context; under-relaying makes it talk past the guest.

## 4. Restart semantics — UI reset vs ending the call

Two different resets; picking the wrong one either kills a live conversation or leaks one guest's session to the next:

| Situation | Do | Effect |
|---|---|---|
| Guest finished a flow, conversation continues | reset your own UI state | the call is untouched |
| Guest walked away / tapped "start over" | `station.restart()` | host disconnects the call and reloads the page — full reset |
| Page needs a hard recovery | `station.reloadStation()` | same full reset, via reload |

`restart()` and `reloadStation()` both end the call and reload the page. Never wire them to an in-conversation control ("clear filters" must not hang up on the guest); reserve them for the between-guests boundary, which the page owns (see `station-kiosk-ux` idle reset).

## 5. `speakToolResults` — one voice, not two

By default (`speakToolResults: true`) the SDK, after answering each function call, also relays the output to the agent as a system message with `trigger_response: true` — so the avatar responds to what just happened. This default matches proven first-party station behavior; leave it on.

The exception: if the guest hears every result **twice** — the agent platform is already narrating from the function output — set `speakToolResults: false`. Diagnose by listening on a real device or reading the harness command log (`station-verify`); don't turn it off preemptively.

## 6. Push-to-talk and audio controls

All audio is native — the page renders no mic UI (see `station-kiosk-ux`). What the page may do is drive the native pipeline through the SDK:

```ts
holdButton.addEventListener('pointerdown', () => station.pushToTalk(true));
holdButton.addEventListener('pointerup', () => station.pushToTalk(false));
holdButton.addEventListener('pointercancel', () => station.pushToTalk(false));
```

- `pushToTalk(pressed)` — hold-to-talk; always pair the press with a release, including `pointercancel`, or the mic sticks open.
- `setMuted(muted)` — persistent mute toggle.
- `setVolume(volume)` — clamped to 0..1.
- `stopTalking()` — interrupts the avatar mid-sentence (barge-in); wire it to a visible "stop" tap if the design calls for one.

For staff, mount the SDK's built-in operator panel instead of building these controls yourself: `settings: true` in `init()` (or `station.mountSettings({ corner })`) adds a low-opacity gear — station mode only, shadow-DOM isolated — with volume, mute, Start host, and Reload station. Volume and mute persist to `station_{appKey}_volume|muted` and re-apply on mount. Guests should never need it; it exists so venue staff can adjust the device without a keyboard.

## 7. The output rules, from the tool author's side

Tools built per `edge-mcp-implement` are already station-compatible — return the standard `{ content: [{ type: 'text', text }] }` envelope and the SDK handles the rest. What the avatar receives for each return shape:

| Tool `execute` returns | What the avatar gets |
|---|---|
| envelope with text parts | the text parts joined with newlines |
| envelope with `isError: true` | the joined text prefixed `UI_error: ` |
| a plain string | the string as-is |
| any other JSON value | it `JSON.stringify`'d |
| `null` / `undefined` | `UI_done: <toolName> completed` |
| a thrown error | `UI_error: <message>` |

Consequences worth telling the tool author:

- **The output feeds a voice.** With `speakToolResults` on, the output becomes the context the avatar responds from. A concise sentence ("Found 6 diving watches under $1,000; top match is the Seastar 1000") produces better speech than a 40-item JSON dump. Keep returns short where the data allows.
- **`isError: true` is the failure channel.** Use it (or throw) for failures; the `UI_error:` prefix is what tells the agent to recover instead of celebrating.
- **The avatar never hangs.** Every accepted call produces exactly one reply — a call naming an unknown tool is answered `UI_error: unknown tool <name>`, a crashing tool is answered `UI_error: <message>`, and duplicate deliveries of the same `call_id` are deduped. Tool authors don't need defensive plumbing for any of this.

## 8. Events, observers, and teardown

```ts
const off = station.on('toolResult', (r) => track(r));
station.on('error', (e) => report(e));
```

- `on(event, cb)` — `'functionCall'`, `'uiUpdate'`, `'toolResult'`, `'error'`; returns an unsubscribe.
- `onFunctionCall` (init option) — observes every call *before* dispatch; **return `false` to claim the call**, and the SDK skips its own dispatch. A claimed call is now your debt: answer it exactly once with `sendFunctionOutput(callId, output)`, or the avatar waits forever. `sendFunctionOutput` is an escape hatch for exactly this — never call it for calls the SDK dispatched itself.
- `destroy()` — restores whatever `window.handleFunctionCall` / `window.sendUIUpdate` existed before init (the SDK chains to prior handlers rather than clobbering them) and clears timers. Relevant for SPAs that unmount the integration; a kiosk page normally never calls it.

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Every send returns `false` in dev | no bridge and no override — that's a plain browser | open once with `?mode=station`, or test in the harness (`station-verify`) |
| Avatar calls a tool, nothing runs | registry empty at dispatch | check the edge-mcp import runs at entry; `await document.modelContext.getTools()` |
| Avatar replies "unknown tool" | provisioned names drifted from registered names | re-run `station-provision` after renames |
| Guest hears every result twice | platform narrates and `speakToolResults` is on | set `speakToolResults: false` |
| Avatar goes silent after one call | a claimed call never answered | every `onFunctionCall` returning `false` must be followed by one `sendFunctionOutput` |
| "Clear" button hangs up the call | `restart()` wired to an in-conversation control | plain UI reset there; `restart()` only at the guest boundary |
| Mic sticks open after push-to-talk | release never sent | pair `pushToTalk(true)` with `false` on `pointerup` and `pointercancel` |

## Next steps

- Harden the page for the kiosk's physical reality → `station-kiosk-ux`.
- Register the functions and provision a device → `station-provision`.
- Prove the wiring → `station-verify`.

## What you will NOT do in this skill

- Register, rename, or re-curate tools — the surface belongs to `edge-mcp-plan` / `edge-mcp-implement`.
- Speak the bridge protocol by hand — no raw `postMessage`, no hand-built command strings; the SDK's API is the whole surface.
- Render mic UI, avatar UI, or play page audio — that doctrine lives in `station-kiosk-ux`.
- Register functions with Napster or touch device files — that's `station-provision`.
- Declare the integration verified — that's `station-verify`.
