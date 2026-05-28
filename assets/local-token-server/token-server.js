#!/usr/bin/env node
/*
 * Napster Omniagent — local token server (prototyping only).
 *
 * This is for local prototyping. Do NOT ship it to production. Before you go
 * live, port the POST /token handler into your real backend, behind your own
 * authentication and rate limiting. See README.md in this folder.
 *
 * Two responsibilities:
 *   1. Serve the project's static files on http://localhost:5173.
 *   2. Expose POST /token, which calls the Omniagent API with NAPSTER_API_KEY
 *      and returns a short-lived connection token to the browser. The API key
 *      stays on the server; the browser only ever sees the token.
 *
 * Preferred path: connect through an Omniagent. Set AGENT_ID and the agent's
 * companion, voice, tools, knowledge, and provider settings are all inherited
 * from the agent configuration — call POST /public/agents/{AGENT_ID}/connections.
 *
 * Fallback path: assemble a session per request from a persona. If AGENT_ID is
 * not set but COMPANION_ID is, call POST /public/connections with an explicit
 * providerConfig. Use the agent path unless you have a reason not to.
 *
 * Why localhost matters: getUserMedia (the WebRTC mic prompt) only works on
 * secure contexts — https://… and http://localhost. file:// is blocked, and so
 * is VS Code's Simple Browser. Open the page in a real browser.
 *
 * Requirements: Node 18+ (native fetch). No npm dependencies.
 * Usage: `node local-token-server/token-server.js` from your project root.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5173;
const ENV_PATH = path.join(__dirname, '.env');

// --- .env loader (zero-dep) -------------------------------------------------
function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnv(ENV_PATH), ...process.env };
const NAPSTER_API_KEY = env.NAPSTER_API_KEY;
const API_BASE        = env.COMPANION_API_BASE || 'https://companion-api.napster.com';
const AGENT_ID        = env.AGENT_ID;
const CHANNEL_TYPE    = env.CHANNEL_TYPE || 'webrtc';
const EXTERNAL_CLIENT = env.EXTERNAL_CLIENT_ID || undefined;

// Fallback (per-session) path inputs — only used when AGENT_ID is not set.
const COMPANION_ID = env.COMPANION_ID;
const VOICE_ID     = env.COMPANION_VOICE || 'alloy';
const FUNCTIONS    = (env.COMPANION_FUNCTIONS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!NAPSTER_API_KEY) {
  console.error('[token-server] Missing NAPSTER_API_KEY in local-token-server/.env');
  process.exit(1);
}
if (!AGENT_ID && !COMPANION_ID) {
  console.error('[token-server] Set AGENT_ID (preferred) or COMPANION_ID (fallback) in local-token-server/.env');
  process.exit(1);
}

const MODE = AGENT_ID ? 'agent' : 'companion';

// --- mime -------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

// --- token ------------------------------------------------------------------
async function issueToken() {
  let url, body;

  if (MODE === 'agent') {
    // Preferred: the agent owns voice, tools, knowledge, and provider settings.
    url = `${API_BASE}/public/agents/${AGENT_ID}/connections`;
    body = { channelType: CHANNEL_TYPE };
    if (EXTERNAL_CLIENT) body.externalClientId = EXTERNAL_CLIENT;
  } else {
    // Fallback: assemble the session from a persona on every request.
    url = `${API_BASE}/public/connections`;
    body = {
      companionId: COMPANION_ID,
      functions: FUNCTIONS,
      providerConfig: {
        voiceId: VOICE_ID,
        settings: {
          temperature: 0.7,
          turnDetection: { threshold: 0.9, prefix_padding_ms: 400, silence_duration_ms: 500 },
          noiseReduction: { type: 'nearField' },
        },
      },
    };
    if (EXTERNAL_CLIENT) body.externalClientId = EXTERNAL_CLIENT;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Api-Key': NAPSTER_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`token request failed ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// --- server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/token') {
      const data = await issueToken();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); res.end('Not found'); return; }

    const type = MIME[path.extname(p)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(p).pipe(res);
  } catch (err) {
    console.error('[token-server]', err);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Napster Omniagent prototype server on http://localhost:${PORT}`);
  console.log(`Token endpoint: POST http://localhost:${PORT}/token  (mode: ${MODE})`);
});
