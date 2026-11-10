---
name: persist-web-session
description: Keep one Omniagent session alive while the visitor navigates a multi-page website — the Web SDK's persistence mode wraps the site in a same-origin iframe so the page (and the conversation) survives full page loads. Use when the developer says "the session dies when I click a link", "keep the agent talking across pages", "persistence", "multi-page site", or the deploy conversation reveals full-page navigations. Covers the enable decision (MPA vs SPA), when the wrap happens (`iframeOnNavigate`), break-out rules and `exclude`, programmatic navigation via `PERSIST_NAVIGATE_EVENT`, and the pitfalls. For the initial embed (token endpoint, panel, init) use [[deploy-webrtc]] — this skill assumes the SDK is already wired.
---

# persist-web-session

## What this skill is

On a traditional multi-page website, every navigation is a full page load — and a full page load tears down the WebRTC session mid-sentence. Persistence keeps one conversation alive across those navigations: the SDK wraps the site in a **same-origin iframe** while the avatar stays in the top-level document, which never reloads. Navigation happens inside the frame; the session never notices.

```js
NapsterCompanionApiSdk.init(getToken, {
  persistence: { enabled: true },
});
```

`getToken` is the same token function the rest of the embed uses (Web SDK 2 — see [[deploy-webrtc]]). With persistence on, the avatar is always the floating widget: the SDK ignores `layout.type: "inline"` and `layout.mountContainer`, because the avatar has to live in the top-level document.

Ground the details in the live docs: https://developers.napster.com/docs/sdks/web-sdk/persistence

## 1. Decide whether it's needed at all

Ask one question: **does navigating reload the page?**

- **SPA** (React Router, Next `<Link>`, Vue Router — client-side routing, no page load): persistence is NOT needed. The session survives on its own. Don't enable it "just in case" — it changes how the whole site is served.
- **MPA** (server-rendered pages, plain HTML links): enable persistence, or the session ends on the first click.
- **Mixed** (an SPA that hard-links into a separate checkout or docs area): enable it — the hard links are exactly where the session would die.

**Check the site can be framed first.** The frame is same-origin, but the site's own headers decide whether it renders: `X-Frame-Options: SAMEORIGIN` is fine; `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'` blocks it (common on hardened sites). Include the same init snippet on every page — the copy running inside the frame detects it and exits, so it never starts a second session. SDK callbacks such as `onReady` don't fire in that copy, so page code that waits on them won't run inside the frame.

## 2. When the wrap happens — `iframeOnNavigate`

By default the wrap is **eager**: the site is wrapped as soon as `init()` runs, before the microphone prompt and the connection. With the launcher (`button.enabled`) it also happens at `init()`, not at the click, so visitors browse inside the frame whether or not they start a session. Once the framed copy has loaded, every kind of navigation — clicks, redirects, code — happens safely inside the frame. Until then the original page is still live: clicks and form submissions are guarded, but a script or a redirect can still end the session. The cost: the page loads a second time inside the frame, so its scripts (and analytics page views) run twice, and anything typed before the frame appears is lost.

Set `iframeOnNavigate: true` to **defer** the wrap: the page the visitor landed on stays completely native, and the iframe appears on the first navigation — a link click, a form submission, or a persist-navigate event. With the launcher, that can happen before a session starts. The cost: until then, a programmatic navigation or redirect on the landing page ends the session unless it's routed through the event (§4), and so does a link whose click handler calls `stopPropagation()`. Offer this mode when the developer cares that the landing page render exactly as it does without persistence.

**When the session ends.** A persisted session that ends normally reloads the page the visitor is on, without the frame. With the launcher, the launcher card appears again after that reload, and the SDK logs a console warning when both are on. If the session fails to connect, or you call the launcher controller's `destroy()`, the SDK removes the frame in place, without a reload.

**Navigation feedback — `navigationProgress`.** A navigation the engine takes over drives no browser chrome (no tab spinner), so a click can look dead for the whole load. Opt in to a thin progress bar over the page: `navigationProgress: true` (default styling: `#be369d`, `3px`) or `{ color, height }`; the CSS custom properties `--np-persist-progress-color` / `--np-persist-progress-height` override it from a stylesheet. Off by default — skip it if the site shows its own navigation indicator.

## 3. Break-out rules and `exclude`

Some destinations must leave the frame (a real top-level navigation that ends the session):

- **Links to other domains break out by default** — automatic, no configuration; that covers other sites and your own subdomains alike, and an `http://` link on an `https://` site counts as another domain. The exception list is `persistence.include.domains`: domains explicitly allowed to load inside the frame so the session survives (e.g. a docs site you also run). An entry matches the host and its subdomains. The included site must permit framing (`X-Frame-Options`/`frame-ancestors`) — a blank frame is undetectable, so test every domain you add, and only add domains you control or have agreed with.
- **Same-origin routes that shouldn't be framed** — auth pages, checkout, signout — go in `exclude.urls`:

```js
persistence: {
  enabled: true,
  exclude: {
    urls: ["/checkout", "/signout"],  // matches at path-segment boundaries
  },
}
```

`urls` entries match their exact path and everything under it at **path boundaries**, not by spelling: `"/check"` matches `/check` and `/check/out` but NOT `/checkout`. End with `/` for "everything under this directory".

**Only link clicks are checked inside the frame.** A form or a script that navigates to an excluded path or another domain loads inside the frame.

**Redirect trap:** exclusion is checked against the *clicked* URL only. A same-origin `/login` that redirects to an external identity provider passes the check — and the auth page loads *inside the frame*. Exclude the **starting path** (`/login`), not the redirect destination.

## 4. Programmatic navigation — the one real integration task

The interceptor sees what the *visitor* does — clicks and form submissions. It cannot see what *code* does: `location.assign()`, `location.href = …`, `location.replace()`, `form.submit()`, server redirects. Those end the session while a page is unframed — under `iframeOnNavigate: true`, that's the landing page until the first navigation; under the default eager wrap, it's only the short window before the framed copy loads. The sweep matters most in deferred mode, but do it either way.

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
4. Back/forward buttons — the frame follows while wrapped. `trapBackNavigation` (default `true`) stops Back from leaving the site while it's framed, since leaving would end the session; a long-press on Back can still leave. Set it to `false` if visitors should be able to leave with Back.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Session dies on the first navigation despite persistence | `iframeOnNavigate: true` + a programmatic navigation on the still-unframed landing page | §4 — dispatch `PERSIST_NAVIGATE_EVENT`, or drop back to the default eager wrap |
| Avatar floats in the corner instead of in your container | Persistence requires the avatar in the top-level document | Expected — with persistence on, the SDK ignores `layout.type: "inline"` and `layout.mountContainer`, and warns in the console if you pass `mountContainer` |
| Launcher reappears only after a page reload | A persisted session that ends reloads the page without the frame | Expected with launcher + persistence |
| Page scripts or analytics run twice | The default eager wrap loads the landing page again inside the frame | Count page views accordingly, or use `iframeOnNavigate: true` |
| Auth or checkout page breaks inside the frame | Page that can't/shouldn't be framed | Add it to `exclude` — breaking out there is correct |
| Session ends on a link that looks internal | Different subdomain = cross-origin | Serve it same-origin, add the host to `persistence.include.domains`, or accept the break-out |
| "Excluding `/check` also excluded `/checkout`" | It doesn't — matching is at path-segment boundaries | Check the actual entry; `/check` does not match `/checkout` |
| Camera/mic/geolocation/payment stop working on framed pages | The frame only grants `iframeAllowAttribute` (default `"autoplay; clipboard-write"`) | Add what the pages need, e.g. `iframeAllowAttribute: "autoplay; clipboard-write; camera; microphone"` |
| Page fights the frame / SSO, payment or consent widget won't render | Frame-busting code, or a third-party widget that refuses to run framed | Remove or scope frame-busting to cross-origin parents; put those pages in `exclude` |

## Hand back to the developer

- Whether persistence is on and why (MPA vs SPA), and the `iframeOnNavigate` choice.
- The `exclude` list and the reasoning for each entry.
- Every programmatic navigation found in the sweep and how it was routed through the event.
- Pointer to the full rules: https://developers.napster.com/docs/sdks/web-sdk/persistence
