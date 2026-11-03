'use strict';

// The three things the page can ask the server. Each one only ever returns
// information about the signed-in person and the one person they are buying for.

const { findGiftee, trackingNumber } = require('./draw');

const MAX_WISHLIST_LENGTH = 300;
// Control characters other than ordinary spaces are removed from notes.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

function reply(status, body) {
  return { status, body };
}

function firstName(name) {
  return name.split(/\s+/)[0];
}

function findParticipant(config, email) {
  return config.participants.find(p => p.email === email) || null;
}

function isRevealOpen(config, now) {
  return !config.revealOpensAt || now.getTime() >= config.revealOpensAt.getTime();
}

function eventDetails(config, now) {
  return {
    name: config.eventName,
    exchangeDate: config.exchangeDate,
    minSpend: config.minSpend,
    participantCount: config.participants.length,
    revealOpensAt: config.revealOpensAt ? config.revealOpensAt.toISOString() : null,
    revealOpen: isRevealOpen(config, now),
  };
}

function notOnList(email) {
  return reply(403, { error: 'not_participant', email });
}

async function handleMe({ principal, config, store, now }) {
  const me = findParticipant(config, principal.email);
  if (!me) return notOnList(principal.email);
  const wishlist = await store.getWishlist(me.email);
  return reply(200, {
    name: me.name,
    firstName: firstName(me.name),
    email: me.email,
    wishlist: wishlist || '',
    event: eventDetails(config, now),
  });
}

function cleanWishlist(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return text.length <= MAX_WISHLIST_LENGTH ? text : null;
}

async function handleSaveWishlist({ principal, config, store, body }) {
  const me = findParticipant(config, principal.email);
  if (!me) return notOnList(principal.email);
  const text = cleanWishlist(body && body.wishlist);
  if (text === null) {
    return reply(400, { error: 'invalid_wishlist', maxLength: MAX_WISHLIST_LENGTH });
  }
  if (text.length === 0) {
    return reply(400, { error: 'empty_wishlist' });
  }
  await store.setWishlist(me.email, text);
  return reply(200, { wishlist: text });
}

async function handleReveal({ principal, config, store, now }) {
  const me = findParticipant(config, principal.email);
  if (!me) return notOnList(principal.email);
  if (!isRevealOpen(config, now)) {
    return reply(403, { error: 'not_yet', revealOpensAt: config.revealOpensAt.toISOString() });
  }
  if (!(await store.getWishlist(me.email))) {
    return reply(409, { error: 'wishlist_first' });
  }
  const giftee = findGiftee(config.participants, config.drawSecret, me.email);
  const gifteeWishlist = await store.getWishlist(giftee.email);
  return reply(200, {
    trackingNumber: trackingNumber(config.drawSecret, me.email),
    giftee: {
      name: giftee.name,
      firstName: firstName(giftee.name),
      wishlist: gifteeWishlist || '',
    },
    event: eventDetails(config, now),
  });
}

module.exports = {
  MAX_WISHLIST_LENGTH,
  cleanWishlist,
  handleMe,
  handleReveal,
  handleSaveWishlist,
};
