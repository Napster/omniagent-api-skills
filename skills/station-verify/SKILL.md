---
name: station-verify
description: Prove a station conversion actually works — first locally in the SDK's `examples/harness.html` fake host (fire every tool, watch the decoded outbound commands), then on a real device via the native station app (open the `.napster` file, tap start, run the per-tool spoken test script, test restart and cold boot). This is the VERIFY phase of station conversion, checklist-driven with what-good-looks-like transcripts. Use when the developer says "test my station integration", "verify it on the kiosk", "does it work on the station", or after [[station-provision]] completes.
---

# station-verify

A green build proves nothing about a kiosk. Verification here is two passes with two different rigs: the **local harness** (a fake host that lets you fire every tool and read every command the page sends) and the **real device** (the only place the actual agent, audio, and provisioning exist). Run both; report exactly what each proved.

## 0. What each rig proves

| Rig | Proves | Cannot prove |
|---|---|---|
| `examples/harness.html` — local fake host | bridge detection, dispatch tolerance, per-tool behavior, output shaping, outbound command encoding | the real agent's behavior, speech, provisioning, device hardware |
| Native station app + `.napster` file | the whole loop — guest speech → tool call → screen movement → avatar reply — plus restart and cold boot | — |

The local pass is fast and repeatable — run it after every change. The device pass is the sign-off.

## 1. Local pass — the harness

`examples/harness.html` in the station-sdk repo is a single self-contained page, no build, no dependencies: the left pane iframes the target site, the right pane is a host console.

1. Start the site's own dev server, open the harness, and point the left pane at the site's URL (it defaults to the bundled `demo-shop.html`).
2. Click **Become host**. This rewrites the iframe with the same `appBridge` shim the native host injects, prepended ahead of the page's own scripts, so the page's SDK detects a station and every outbound command is captured and decoded in the console. If commands aren't appearing, click **Become host** again — it re-fetches the target and reloads it with the shim in place — and check the iframe's console for init errors. (Never reload the left pane directly; that discards the shimmed document.)
3. The harness lists the iframe's tools from its `document.modelContext`. **If the list is empty, stop** — registration didn't run; nothing downstream can pass.
4. Fire each tool by name with JSON args — the harness calls `handleFunctionCall` in the iframe exactly the way the host would.

Per-tool checklist — every registered tool, one by one:

- [ ] Exactly **one** `send-function-output` appears, carrying the fired `call_id`.
- [ ] The output text matches the output rules — envelope text joined with newlines; `isError` → `UI_error: ` prefix; a null return → `UI_done: <toolName> completed`.
- [ ] A `speak` with `trigger_response: true` follows the output — unless the site set `speakToolResults: false`, in which case verify its **absence**.
- [ ] The iframe UI visibly reacts where the plan said it should (drawer opens, page navigates).

Then the tolerance checks, once:

- [ ] Fire a made-up tool name → the reply is `UI_error: unknown tool <name>` (the avatar must never hang on a bad call).
- [ ] Fire the same `call_id` twice → the second delivery is ignored (dedupe), still exactly one output total.

And the session commands from the page itself: tap the start control → `start-host` appears; trigger the restart path → `start-over`; hold push-to-talk → `force-unmute/true` then `force-unmute/false`.

Init with `debug: true` while verifying — the `[StationSdk:{appKey}]` console prefix narrates detection, dispatch, and replies alongside the harness log.

## 2. On-device pass — the native station app

Prerequisite: `station-provision` is complete (functions registered, kiosk channel URL live, `.napster` file in hand).

**Before walking to the device, write the spoken test script**: one utterance per registered tool, phrased so the agent will actually call it — work the tool's own description language into the sentence ("show me diving watches under a thousand dollars" for a search tool; "add that one to my cart" for a cart tool). A tool you can't phrase a natural utterance for is a tool whose description needs work — flag it back.

1. **Open the `.napster` file** (double-click). The native app launches as the provisioned agent and navigates the kiosk channel URL verbatim.
2. **Tap start.** The page's gesture calls `startExperience()`; the host dials the agent — avatar and microphone go live. If nothing happens, the gate isn't wired to a real tap or the channel URL is stale.
3. **Run the spoken script**, tool by tool. For each utterance confirm **both** halves: the screen moves where the plan said, and the avatar's spoken reply reflects the tool's real output. One without the other is a finding, not a pass.
4. **Restart test.** Trigger the page's start-over path — the call ends, the page reloads, the start screen returns, and a fresh session starts clean with no residue from the previous one.
5. **Cold boot.** Power-cycle the device — the app relaunches, the page loads, and the attract/start state greets. No stale session, no leftover guest state.

## 3. What good looks like

A passing tool interaction reads like this:

```
Guest    taps "Tap to begin"
Avatar   greets
Guest    "Show me diving watches under a thousand dollars."
Avatar   "Let me pull those up…"
Screen   navigates to the filtered product list
Avatar   "I found six under a thousand — the closest match to what
          you asked is the first one on screen."
```

And a manual interaction the page relayed:

```
Guest    taps into a product page by hand
Avatar   (says nothing — the relay is context, not a turn)
Guest    "Is this one water resistant?"
Avatar   answers about the product on screen — it knows where the guest is
```

The failure shapes to recognize: the avatar **goes silent** after a call (a reply never went back); the guest **hears everything twice** (`speakToolResults` doubling the platform's own narration); the avatar **answers but the screen never moves** (a tool that should navigate answered silently); the avatar **talks about the wrong screen** (manual interactions not relayed).

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Harness tool list is empty | registry never populated in the iframe | fix the site's edge-mcp import order; widen `attachTimeoutMs` if registration lands late |
| No outbound commands after Become host | the target failed to fetch, or its init crashed before the SDK installed handlers | click Become host again (it reloads the target with the shim ahead of its scripts); check the iframe console |
| Avatar hangs after a call | an accepted call produced no output | find the missing reply — claimed calls (`onFunctionCall` → `false`) must be answered via `sendFunctionOutput` |
| Avatar silent about results on device | `speakToolResults: false` without the platform narrating | restore the default `true` |
| Guest hears results twice | both the platform and `speakToolResults` narrating | set `speakToolResults: false` (see `station-integrate`) |
| Tap on start does nothing on device | gate not wired to a real gesture, or stale channel URL | re-check `station-integrate` §2 and the provisioned URL |
| Second guest inherits the first guest's state | idle reset incomplete | `station-kiosk-ux` §4 — clear per-guest state, then `restart()` |

## Sign-off

Report facts, not vibes:

- Per tool: fired in the harness (output + speak observed), spoken on device (screen + reply observed).
- The tolerance checks (unknown tool, dedupe) and session commands (start, restart, push-to-talk).
- Restart and cold boot outcomes.
- Anything not run — no device on hand, a tool skipped — named explicitly as **unverified**. A local-only pass is not a verified conversion; say so rather than implying it.

## What you will NOT do in this skill

- Fix what you find — route integration faults to `station-integrate`, tool faults to `edge-mcp-implement`, registration drift to `station-provision`, then re-verify.
- Claim on-device behavior from the harness alone.
- Reach for browser automation to drive the harness — it is a paste-and-click rig by design, and the device pass needs a human voice anyway.
- Change provisioning artifacts mid-verification.
