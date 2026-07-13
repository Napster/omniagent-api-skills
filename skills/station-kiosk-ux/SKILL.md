---
name: station-kiosk-ux
description: Harden a station-integrated website for the kiosk's physical reality — a 1080×1920 portrait touchscreen in a public space, with no mouse, no keyboard, and a native avatar that owns all audio. This is the HARDEN phase of station conversion. Covers touch targets, hover-free UI, suppressing external links and downloads, offline-tolerant assets, page-owned idle reset and attract loops, portrait viewport and typography, and per-guest localStorage hygiene. Use when the developer says "make it kiosk friendly", "harden this for the station", "fix the layout for portrait", "guests keep getting stuck", or after [[station-integrate]] lands. Route provisioning to [[station-provision]] afterwards.
---

# station-kiosk-ux

The kiosk is not a browser tab. It is a 1080×1920 portrait touchscreen standing in a public space, operated by walk-up guests with their fingers, with an AI avatar rendered and voiced by the native host — not by the page. A site that behaves perfectly on a laptop can still strand a guest on the device. This skill hardens the page against the kiosk's physical reality; it changes UX and page behavior only — the tool surface and the SDK wiring are already done.

## 0. The surface you're designing for

| Physical reality | Consequence for the page |
|---|---|
| 1080×1920 portrait, fixed | design portrait-first; landscape layouts don't adapt their way out |
| Fingers, standing guests | large targets, generous spacing, readable at arm's length |
| No mouse | nothing may depend on hover |
| No keyboard | avoid free-text input — the guest talks to the avatar instead |
| Avatar and audio are native | the page renders no voice UI and plays no competing sound |
| Public and unattended | no external escape hatches; the page owns its own idle reset |

Work the sections below as a checklist against the actual site — each one is a way a real guest gets stuck.

## 1. Touch targets and hover

- Every interactive element at least **44px** in both dimensions, with spacing that keeps neighboring targets from stealing taps.
- **No hover-dependent UI.** Hover-opened menus, hover-revealed buttons, and tooltips carrying required information are all invisible on a touchscreen. Everything reachable by hover must be reachable by tap, or removed.
- Give taps a visible pressed/active state — a guest who gets no acknowledgment taps again, and double-fires the action.

## 2. Suppress escape hatches

A guest who lands on a third-party page has bricked the kiosk until someone resets it. Kiosk pages suppress external links entirely:

- Remove or intercept links to external origins; drop `target="_blank"` — there is no tab bar to come back from.
- Block `window.open` and file downloads.
- Audit third-party embeds (maps, social widgets, players) for links they smuggle in.

A capture-phase click listener that swallows external-origin anchors is a serviceable backstop, but prefer removing the links at the source — an intercepted dead link still reads as broken to the guest.

## 3. Offline-tolerant assets

Kiosk connectivity degrades — venues have flaky networks and the device keeps running anyway. The page should still paint and stay usable:

- Self-host the fonts, images, styles, and scripts the page needs to render. A CDN outage must not take the kiosk's UI down with it.
- Keep the critical render path free of third-party requests.
- Give imagery and data views graceful fallbacks so a failed fetch degrades a section, not the screen.

## 4. Idle reset — the page owns it

**The host never resets the page on idle.** A page that doesn't reset itself greets the next guest with the previous guest's cart, filters, and half-finished flow. Own an idle timer (measured from the last touch) and pick one of two models:

- **Gated start screen (default).** The page rests on a "Tap to begin" screen; the tap calls `startExperience()` (wired in `station-integrate`). On idle timeout, call `restart()` — it ends the call and reloads the page, which is exactly the full reset the guest boundary needs.
- **Attract loop.** The page cycles content and starts the session itself via `autoStart: true`. The idle timer still exists — it returns the page from deep states to the loop, and still ends any live call.

Either way, the reset clears **all** per-guest state: UI state, in-memory stores, and any localStorage keys the page owns (see §6 — a reload does not clear localStorage).

## 5. Portrait viewport and typography

- Design and test at **1080×1920**. Use browser device emulation at exactly that size during development; a desktop-width window hides every portrait problem.
- Pin the viewport (`width=1080` or `width=device-width` with scaling disabled as the design requires) — there is no pinch-zoom recovery for a broken layout on a kiosk.
- Scale typography for arm's length viewing — noticeably larger than desktop defaults. If a line of body text is comfortable on a laptop, it is too small on the kiosk.

## 6. localStorage persists across guests

localStorage survives `restart()` and `reloadStation()` (they reload the page, nothing more). Any per-guest data the page writes — carts, preferences, form drafts — outlives the guest unless the idle reset clears it explicitly. Never let one guest's data greet the next.

## 7. Never render your own mic or voice UI

The entire audio pipeline — microphone capture, speech recognition, the avatar's voice — lives in the native host. The page must not:

- Call `getUserMedia` or trigger mic-permission prompts (there is no page microphone).
- Render mic buttons, level meters, waveforms, or "listening…" indicators that pretend to reflect page audio.
- Play its own sound — TTS, notification chimes, video with audio — over the avatar's voice.

The only audio-adjacent surface the page may offer is the SDK's controls — `pushToTalk`, `setMuted`, `setVolume`, `stopTalking` — which drive the native pipeline (wired in `station-integrate`).

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| Guest stranded on a third-party page | external link or `target="_blank"` escaped | remove/intercept external anchors, block `window.open` |
| Next guest sees the last guest's session | no page-owned idle reset | idle timer → clear per-guest state, then `restart()` |
| Layout collapses on the device | designed and tested landscape-first | build and verify at 1080×1920 portrait |
| Menus unreachable, actions invisible | hover-dependent UI | replace every hover affordance with a tap |
| Taps miss or double-fire | sub-44px targets, no pressed state | enlarge targets, add active states |
| Two voices talking over each other | page plays its own audio | remove page audio — the host owns sound |
| Blank screen when venue network dips | critical assets on third-party CDNs | self-host render-critical assets |

## Next steps

- Register the functions and provision a device → `station-provision`.
- Prove the hardening on the real device (idle reset, restart, cold boot) → `station-verify`.

## What you will NOT do in this skill

- Change tools, schemas, or the `document.modelContext` registry — that's `edge-mcp-implement`.
- Add or rewire SDK calls beyond what the hardening itself needs — the wiring belongs to `station-integrate`.
- Redesign the site's brand or visual identity — harden, don't restyle.
- Register anything with Napster or touch device files — that's `station-provision`.
- Declare the kiosk experience verified — that's `station-verify`.
