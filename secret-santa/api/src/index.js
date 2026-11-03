'use strict';

// Azure Functions entry point (Node.js v4 programming model).
// Routes: GET /api/me, PUT /api/wishlist, GET /api/reveal

const { app } = require('@azure/functions');
const { ConfigError, loadConfig } = require('./lib/config');
const { AuthError, readPrincipal } = require('./lib/principal');
const { createStore } = require('./lib/store');
const { handleMe, handleReveal, handleSaveWishlist } = require('./lib/handlers');

const MAX_BODY_BYTES = 4096;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

let cached = null;
function getContext() {
  if (!cached) {
    cached = { config: loadConfig(process.env), store: createStore(process.env) };
  }
  return cached;
}

function json(status, body) {
  return { status, headers: JSON_HEADERS, jsonBody: body };
}

async function readJsonBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) return null;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function route(handler, { needsBody = false } = {}) {
  return async (request, context) => {
    try {
      const { config, store } = getContext();
      const principal = readPrincipal(request.headers.get('x-ms-client-principal'), config);
      const body = needsBody ? await readJsonBody(request) : undefined;
      if (needsBody && body === null) return json(400, { error: 'bad_request' });
      const result = await handler({ principal, config, store, body, now: new Date() });
      return json(result.status, result.body);
    } catch (err) {
      if (err instanceof AuthError) return json(401, { error: 'not_signed_in', message: err.message });
      if (err instanceof ConfigError) {
        context.error(`[SecretSanta] settings problem: ${err.message}`);
        return json(500, { error: 'setup' });
      }
      context.error(`[SecretSanta] unexpected error: ${err && err.message}`);
      return json(500, { error: 'server' });
    }
  };
}

app.http('me', { methods: ['GET'], authLevel: 'anonymous', route: 'me', handler: route(handleMe) });
app.http('wishlist', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'wishlist',
  handler: route(handleSaveWishlist, { needsBody: true }),
});
app.http('reveal', { methods: ['GET'], authLevel: 'anonymous', route: 'reveal', handler: route(handleReveal) });
