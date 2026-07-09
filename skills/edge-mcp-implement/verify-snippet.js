// edge-mcp — runtime verification snippet.
//
// Paste this whole file into your app's browser console (dev server running,
// app loaded). It confirms the WebMCP surface installed, buckets every
// registered tool by safety level, and fires ONE tool per level so you can see
// the app react.
//
// Safe by default: it only fires READ tools (they change no state). To also
// fire one reversible and one needs-confirmation tool, set RUN_WRITES = true
// below — do that only against test data, since a needs-confirmation tool is
// destructive-or-final by definition (it may place a real order, send a real
// email, etc.).
//
// It fires only tools whose inputSchema has NO required arguments (safe to call
// with `{}`). Tools that need arguments are listed for you to run by hand.
//
// Note: don't verify a navigation by re-reading a `currentPage`/location
// resource right after firing a nav tool — the tool's promise resolves before
// the router re-renders, so the read is stale. The tool's own returned
// `content` is the confirmation.

(async () => {
  const RUN_WRITES = false; // ← flip to true to also fire writes (test data only)

  const mc = document.modelContext;
  if (!mc || typeof mc.getTools !== 'function') {
    console.error('[verify] document.modelContext is not installed — the polyfill did not run. ' +
      'Check that the edge-mcp entry import runs in the browser (not SSR) before any registration.');
    return;
  }

  const tools = await mc.getTools();
  if (!tools || tools.length === 0) {
    console.error('[verify] Registry is empty — no tools registered. The import ran but ' +
      'tools/index.ts registrations did not. Investigate before going further.');
    return;
  }

  // getTools() returns inputSchema as a JSON string; parse defensively.
  const parseSchema = (s) => {
    if (!s) return {};
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch { return {}; }
  };
  const needsArgs = (t) => (parseSchema(t.inputSchema).required || []).length > 0;

  // Bucket by safety level via the (edge-mcp-preserved) annotations.
  const level = (t) => {
    const a = t.annotations || {};
    if (a.destructiveHint) return 'needs-confirmation';
    if (a.readOnlyHint) return 'read';
    return 'reversible';
  };
  const buckets = { read: [], reversible: [], 'needs-confirmation': [] };
  for (const t of tools) buckets[level(t)].push(t);

  console.log(`[verify] ${tools.length} tools registered — ` +
    `${buckets.read.length} read, ${buckets.reversible.length} reversible, ` +
    `${buckets['needs-confirmation'].length} needs-confirmation.`);

  const fireOne = async (bucketName) => {
    const list = buckets[bucketName];
    if (list.length === 0) { console.log(`[verify] ${bucketName}: none registered.`); return; }

    const willFire = bucketName === 'read' || RUN_WRITES;
    if (!willFire) {
      console.log(`[verify] ${bucketName}: ${list.length} tool(s) — not fired ` +
        `(set RUN_WRITES = true to fire one). Tools: ${list.map(t => t.name).join(', ')}`);
      return;
    }

    const target = list.find((t) => !needsArgs(t));
    if (!target) {
      console.log(`[verify] ${bucketName}: every tool needs arguments — run one by hand, e.g.\n` +
        `  await document.modelContext.executeTool(` +
        `(await document.modelContext.getTools()).find(t => t.name === '${list[0].name}'), ` +
        `JSON.stringify({ /* args */ }));`);
      return;
    }

    try {
      const result = await mc.executeTool(target, '{}');
      console.log(`[verify] ${bucketName}: fired '${target.name}' →`, result);
      console.log(`[verify]   confirm the UI reacted (drawer/page/modal). For a nav tool, ` +
        `trust this return — do not re-read currentPage to verify.`);
    } catch (err) {
      console.error(`[verify] ${bucketName}: '${target.name}' threw →`, err && err.message ? err.message : err);
    }
  };

  await fireOne('read');
  await fireOne('reversible');
  await fireOne('needs-confirmation');

  console.log('[verify] Done. If you registered resources, now trigger a real out-of-band ' +
    'change (click a UI control) and confirm the resource updates.');
})();
