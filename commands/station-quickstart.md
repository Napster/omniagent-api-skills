---
description: Guided end-to-end conversion of a website into a Napster station kiosk experience.
disable-model-invocation: true
argument-hint: [optional — the site or app to convert]
---

# Station Quickstart

You are guiding the developer through converting their website into the touch surface of a Napster station kiosk, end to end. This is the deliberate, full-walkthrough path. Drive it step by step, invoking the matching skill at each stage and confirming each step worked before moving on. Keep the developer oriented: say what you're about to do, do it, show the result.

If `$ARGUMENTS` names a site, repo, or URL, treat it as the conversion target. Otherwise ask which app to convert before doing anything else.

The journey, its gates, and its doctrine are owned by [[station-convert]] — this command sequences the stops; it never overrides a specialist skill's rules. Ground every Napster API detail in the napster-docs MCP server; never invent endpoints or fields.

## Step 1 — Frame it

Explain the shape of the work in plain terms, per [[station-convert]]'s roadmap: first we **decide together** what the avatar may do on the site and the developer approves the plan; then the tools get **built** (standard WebMCP — usable by any agent, not just the station); then the **station wiring**, **kiosk hardening**, **provisioning**, and **verification**. Make the approval gate explicit up front — nothing gets built until they've seen the plan and said go.

Also check for prior work: if the site is already agentified (`document.modelContext` has the expected tools), say so and jump to Step 4.

## Step 2 — Decide

Invoke [[edge-mcp-plan]]. It reads the app's real code and walks the developer through the tool plan — capabilities, safety levels, navigation, withholds. Carry in the station framing from [[station-convert]]: anonymous walk-up guest, the guest watches this screen, results feed a voice.

**Do not pass this step without the standalone approval** — a plain "yes, build it", not an answered design question.

## Step 3 — Build the tools

Invoke [[edge-mcp-implement]] with the approved plan. Same registry the station consumes — the tools are written once and runtime-verified there. Relay its report (what registered, what was invoked) before moving on.

## Step 4 — Wire the station

Invoke [[station-integrate]]. Confirm afterwards: SDK initialized at the app entry, session start gated behind a real tap, manual interactions relayed, restart wired to the guest boundary only, push-to-talk paired press/release if used.

## Step 5 — Harden for the kiosk

Invoke [[station-kiosk-ux]]. Walk its checklist against the real site: touch targets, hover-free UI, suppressed external links and downloads, self-hosted critical assets, page-owned idle reset, 1080×1920 portrait layout, per-guest state cleared on reset.

## Step 6 — Provision

Invoke [[station-provision]]. Export the manifest with `exportFunctionManifest()`, register the functions (hand the JSON to Napster provisioning, or `POST /public/functions` with `X-Api-Key` per the docs), set the kiosk channel URL (the device navigates it verbatim — bake in every param, include `?mode=station`), and produce the `.napster` device file. Remind the developer to re-register whenever tool names or schemas change.

## Step 7 — Verify

Invoke [[station-verify]]. Split it honestly:

**You can drive** — the local harness pass: fire every tool, check the output rules, the unknown-tool reply, the dedupe, and the session commands.

**Only the developer can drive** — the on-device pass: open the `.napster` file, tap start, speak the per-tool test script, test restart and cold boot. Hand them the script and the checklist; collect the results.

## Step 8 — Hand-off summary

Summarize what now exists:

- The tool list the avatar can call, and where each was verified (harness / device / both).
- The registered functions, the kiosk channel URL, and where the `.napster` file lives (out of the repo).
- Anything left unverified, named plainly.
- What to say when they come back: "the tools changed" → [[station-provision]] §5 after an `edge-mcp-sync` reconcile; "something's broken on the kiosk" → [[station-verify]].

Keep it tight. The developer should leave with a site any guest can walk up to and talk through.
