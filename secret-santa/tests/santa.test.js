'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ConfigError, loadConfig, parseParticipants } = require('../api/src/lib/config');
const { findGiftee, orderParticipants, trackingNumber } = require('../api/src/lib/draw');
const { AuthError, readPrincipal } = require('../api/src/lib/principal');
const { createMemoryStore, createStore, rowKeyFor } = require('../api/src/lib/store');
const { cleanWishlist, handleMe, handleReveal, handleSaveWishlist } = require('../api/src/lib/handlers');

const SECRET = 'test-secret-that-is-long-enough';

function people(n) {
  return Array.from({ length: n }, (_, i) => `Person ${i + 1} <p${i + 1}@example.co.uk>`).join('; ');
}

function makeConfig(overrides = {}) {
  return loadConfig({ PARTICIPANTS: people(28), DRAW_SECRET: SECRET, ...overrides });
}

function header(principal) {
  return Buffer.from(JSON.stringify(principal)).toString('base64');
}

function ctx(email, config = makeConfig(), store = createMemoryStore(), now = new Date('2026-12-01T10:00:00Z')) {
  return { principal: { email }, config, store, now };
}

// ---------- Settings ----------

test('reads the Outlook To: line, including "Surname, First" names', () => {
  const list = parseParticipants('Jane Smith <Jane.Smith@Co.uk>; "Jones, Dave" <dave@co.uk>;\nsam.taylor@co.uk');
  assert.deepEqual(list, [
    { name: 'Jane Smith', email: 'jane.smith@co.uk' },
    { name: 'Dave Jones', email: 'dave@co.uk' },
    { name: 'Sam Taylor', email: 'sam.taylor@co.uk' },
  ]);
});

test('rejects duplicate people, bad addresses and lists that are too short', () => {
  assert.throws(() => parseParticipants('a@co.uk; b@co.uk; A@co.uk'), /more than once/);
  assert.throws(() => parseParticipants('a@co.uk; not-an-email; c@co.uk'), /not an email/);
  assert.throws(() => parseParticipants('a@co.uk; b@co.uk'), /at least 3/);
});

test('requires a long enough draw secret and a valid reveal date', () => {
  assert.throws(() => loadConfig({ PARTICIPANTS: people(5), DRAW_SECRET: 'short' }), ConfigError);
  assert.throws(() => makeConfig({ REVEAL_OPENS: 'next tuesday' }), /REVEAL_OPENS/);
  const config = makeConfig();
  assert.equal(config.minSpend, '£20');
  assert.equal(config.exchangeDate, '2026-12-24');
  assert.equal(config.revealOpensAt, null);
});

// ---------- The draw ----------

test('everyone buys for exactly one other person and nobody gets themselves', () => {
  const { participants } = makeConfig();
  const receivers = new Set();
  for (const p of participants) {
    const giftee = findGiftee(participants, SECRET, p.email);
    assert.notEqual(giftee.email, p.email);
    receivers.add(giftee.email);
  }
  assert.equal(receivers.size, participants.length);
});

test('nobody is paired both ways and the draw is one single loop', () => {
  const { participants } = makeConfig();
  let current = participants[0].email;
  const visited = new Set();
  while (!visited.has(current)) {
    visited.add(current);
    const next = findGiftee(participants, SECRET, current).email;
    assert.notEqual(findGiftee(participants, SECRET, next).email, current);
    current = next;
  }
  assert.equal(visited.size, participants.length);
});

test('the draw is stable for one secret and changes with a different secret', () => {
  const { participants } = makeConfig();
  const order = list => orderParticipants(list, SECRET).map(p => p.email).join(',');
  assert.equal(order(participants), order([...participants].reverse()));
  const other = orderParticipants(participants, 'a-completely-different-secret').map(p => p.email).join(',');
  assert.notEqual(order(participants), other);
  assert.match(trackingNumber(SECRET, 'p1@example.co.uk'), /^NP-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

// ---------- Sign-in ----------

test('accepts a Microsoft 365 sign-in and lower-cases the email', () => {
  const config = makeConfig();
  const who = readPrincipal(header({ identityProvider: 'aad', userDetails: 'P1@Example.co.uk' }), config);
  assert.deepEqual(who, { email: 'p1@example.co.uk' });
});

test('rejects missing, garbled and non-Microsoft sign-ins', () => {
  const config = makeConfig();
  assert.throws(() => readPrincipal(undefined, config), AuthError);
  assert.throws(() => readPrincipal('%%%not-base64-json', config), AuthError);
  assert.throws(() => readPrincipal(header({ identityProvider: 'github', userDetails: 'p1@example.co.uk' }), config), AuthError);
});

test('enforces the company domain and tenant when they are set', () => {
  const config = makeConfig({ ALLOWED_EMAIL_DOMAINS: 'example.co.uk', ALLOWED_TENANT_ID: 'ABC-123' });
  const good = { identityProvider: 'aad', userDetails: 'p1@example.co.uk', claims: [{ typ: 'tid', val: 'abc-123' }] };
  assert.equal(readPrincipal(header(good), config).email, 'p1@example.co.uk');
  assert.throws(() => readPrincipal(header({ ...good, userDetails: 'p1@gmail.com' }), config), /domain/);
  assert.throws(() => readPrincipal(header({ ...good, claims: [{ typ: 'tid', val: 'other' }] }), config), /tenant/);
  assert.throws(() => readPrincipal(header({ ...good, claims: [] }), config), /tenant/);
});

// ---------- Wishlist notes ----------

test('cleans notes: trims, removes hidden characters, enforces the length limit', () => {
  assert.equal(cleanWishlist('  I like\n\ntea \u200B and cake  '), 'I like tea and cake');
  assert.equal(cleanWishlist('x'.repeat(301)), null);
  assert.equal(cleanWishlist(42), null);
});

test('saves a note and shows it back on the person\'s own page', async () => {
  const c = ctx('p3@example.co.uk');
  const saved = await handleSaveWishlist({ ...c, body: { wishlist: 'Socks, please' } });
  assert.equal(saved.status, 200);
  const me = await handleMe(c);
  assert.equal(me.status, 200);
  assert.equal(me.body.wishlist, 'Socks, please');
  assert.equal(me.body.firstName, 'Person');
  assert.equal(me.body.event.participantCount, 28);
});

test('refuses empty notes and people who are not on the list', async () => {
  const c = ctx('p3@example.co.uk');
  assert.equal((await handleSaveWishlist({ ...c, body: { wishlist: '   ' } })).status, 400);
  const outsider = ctx('stranger@example.co.uk');
  const res = await handleMe(outsider);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'not_participant');
  assert.equal((await handleReveal(outsider)).status, 403);
});

// ---------- The reveal ----------

test('the reveal shows only your own giftee and their note', async () => {
  const config = makeConfig();
  const store = createMemoryStore();
  const me = 'p5@example.co.uk';
  const giftee = findGiftee(config.participants, SECRET, me);
  await store.setWishlist(me, 'Anything chocolate');
  await store.setWishlist(giftee.email, 'Books about trains');

  const res = await handleReveal(ctx(me, config, store));
  assert.equal(res.status, 200);
  assert.equal(res.body.giftee.name, giftee.name);
  assert.equal(res.body.giftee.wishlist, 'Books about trains');
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes('@'), 'no email addresses are sent to the page');
  assert.ok(!text.includes('Anything chocolate'), 'your own note is not repeated');
});

test('the reveal asks for your own note first', async () => {
  const res = await handleReveal(ctx('p5@example.co.uk'));
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'wishlist_first');
});

test('the reveal stays locked until REVEAL_OPENS', async () => {
  const config = makeConfig({ REVEAL_OPENS: '2026-12-01T09:00:00Z' });
  const store = createMemoryStore();
  await store.setWishlist('p5@example.co.uk', 'Anything');
  const early = await handleReveal(ctx('p5@example.co.uk', config, store, new Date('2026-11-30T09:00:00Z')));
  assert.equal(early.status, 403);
  assert.equal(early.body.error, 'not_yet');
  const onTime = await handleReveal(ctx('p5@example.co.uk', config, store, new Date('2026-12-01T09:00:00Z')));
  assert.equal(onTime.status, 200);
});

test('stored rows use a hash, not the email, and storage must be configured', async () => {
  assert.match(rowKeyFor('p1@example.co.uk'), /^[0-9a-f]{64}$/);
  assert.throws(() => createStore({}), /STORAGE_CONNECTION_STRING/);
  const memory = createStore({ WISHLIST_STORE: 'memory' });
  assert.equal(await memory.getWishlist('p1@example.co.uk'), null);
});
