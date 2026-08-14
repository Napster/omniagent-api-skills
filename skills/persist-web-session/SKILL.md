---
name: persist-web-session
description: Keep one Omniagent session alive while the visitor navigates a multi-page website — the Web SDK's persistence mode wraps the site in a same-origin iframe so the page (and the conversation) survives full page loads. Use when the developer says "the session dies when I click a link", "keep the agent talking across pages", "persistence", "multi-page site", or the deploy conversation reveals full-page navigations. Covers the enable decision (MPA vs SPA), when the wrap happens (`iframeOnNavigate`), break-out rules and `exclude`, programmatic navigation via `PERSIST_NAVIGATE_EVENT`, and the pitfalls. For the initial embed (token endpoint, panel, init) use [[deploy-webrtc]] — this skill assumes the SDK is already wired.
---

# persist-web-session

## What this skill is

On a traditional multi-page website, every navigation is a full page load — and a full page load tears down the WebRTC session mid-sentence. Persistence keeps one conversation alive across those navigations: the SDK wraps the site in a **same-origin iframe** while the avatar stays in the top-level document, which never reloads. Navigation happens inside the frame; the session never notices.

```js
NapsterCompanionApiSdk.init(token, {
  persistence: { enabled: true },
});
```

Ground the details in the live docs: https://developers.napster.com/docs/sdks/web-sdk/persistence

## 1. Decide whether it's needed at all

Ask one question: **does navigating reload the page?**

- **SPA** (React Router, Next `<Link>`, Vue Router — client-side routing, no page load): persistence is NOT needed. The session survives on its own. Don't enable it "just in case" — it changes how the whole site is served.
- **MPA** (server-rendered pages, plain HTML links): enable persistence, or the session ends on the first click.
- **Mixed** (an SPA that hard-links into a separate checkout or docs area): enable it — the hard links are exactly where the session would die.

## 2. When the wrap happens — `iframeOnNavigate`

By default the wrap is **eager**: the site is wrapped as soon as the session connects, so every kind of navigation — clicks, redirects, code — happens safely inside the frame from the first moment.

Set `iframeOnNavigate: true` to **defer** the wrap: the page the visitor landed on stays completely native, and the iframe appears on the first allowed link click. The cost: until that click, only link clicks are intercepted — a programmatic navigation on the landing page ends the session unless it's routed through the event (§4). Offer this mode when the developer cares that the landing page render exactly as it does without persistence.

## 3. Break-out rules and `exclude`

Some destinations must leave the frame (a real top-level navigation that ends the session):

- **Cross-origin links always break out** — automatic, by design; another origin can't be framed.
- **Same-origin routes that shouldn't be framed** — auth/SSO, checkout, signout — go in `exclude`:

```js
persistence: {
  enabled: true,
  exclude: {
    domains: ["auth.example.com"],
    urls: ["/checkout", "/signout"],  // matches at path-segment boundaries
  },
}
```

`urls` entries match their exact path and everything under it at **path boundaries**, not by spelling: `"/check"` matches `/check` and `/check/out` but NOT `/checkout`. End with `/` for "everything under this directory".

## 4. Programmatic navigation — the one real integration task

The interceptor sees what the *visitor* does — clicks and form submissions. It cannot see what *code* does: `location.assign()`, `location.href = …`, `location.replace()`, `form.submit()`, server redirects. Those end the session while a page is unframed — which only happens under `iframeOnNavigate: true`, on the landing page before the first link click. Under the default eager wrap this section matters much less, but do the sweep anyway if the developer opts into deferred mode.

The fix is to announce the navigation instead of performing it:

```js
import { PERSIST_NAVIGATE_EVENT } from "@touchcastllc/napster-companion-api";

function navigate(url) {
  const e = new CustomEvent(PERSIST_NAVIGATE_EVENT, { detail: { url }, cancelable: true });
  window.dispatchEvent(e);
  if (!e.defaultPrevented) location.assign(url); // not handled (no session, or excluded) → navigate normally
}
```

For forms, prefer `form.requestSubmit()` over `form.submit()` — `requestSubmit` fires a real submit event the interceptor can route into the frame.

**Sweep the codebase for these** (`location.assign`, `location.href =`, `location.replace`, `form.submit()`) and route them through the helper. This is the step that gets skipped and then reported as "persistence randomly drops the session".

## 5. What to verify by hand

1. Start a session on the landing page, click an internal link — the conversation continues, the address bar follows (`syncHistory` is on by default).
2. Click a cross-origin or excluded link — the tab really navigates and the session ends (that's correct, say so).
3. Trigger any programmatic navigation the site has — the session survives it via the event.
4. Back/forward buttons — the frame follows while wrapped.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Session dies on the first navigation despite persistence | `iframeOnNavigate: true` + a programmatic navigation on the still-unframed landing page | §4 — dispatch `PERSIST_NAVIGATE_EVENT`, or drop back to the default eager wrap |
| Avatar renders in the wrong place / `mountContainer` ignored | Persistence requires the avatar in the top-level document | Expected — `mountContainer` is ignored when persistence is on |
| Auth or checkout page breaks inside the frame | Page that can't/shouldn't be framed | Add it to `exclude` — breaking out there is correct |
| Session ends on a link that looks internal | Different subdomain = cross-origin | Serve it same-origin or accept the break-out |
| "Excluding `/check` also excluded `/checkout`" | It doesn't — matching is at path-segment boundaries | Check the actual entry; `/check` does not match `/checkout` |

## Hand back to the developer

- Whether persistence is on and why (MPA vs SPA), and the `iframeOnNavigate` choice.
- The `exclude` list and the reasoning for each entry.
- Every programmatic navigation found in the sweep and how it was routed through the event.
- Pointer to the full rules: https://developers.napster.com/docs/sdks/web-sdk/persistence
