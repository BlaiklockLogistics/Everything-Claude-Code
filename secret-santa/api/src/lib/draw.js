'use strict';

// The draw is worked out on the server each time it is needed, from the list of
// people and a secret only the server knows. No list of pairs is ever written
// down anywhere, so there is nothing for anyone to open and read.
//
// Everyone is sorted into a random order (an HMAC of their email with the
// secret), then each person buys for the next person in that order and the
// last person buys for the first. One big loop means:
//   - nobody ever draws themselves
//   - two people never just buy for each other
//   - the result is the same every time for the same list and secret

const crypto = require('crypto');

function keyFor(secret, label) {
  return crypto.createHmac('sha256', secret).update(label).digest('hex');
}

function orderParticipants(participants, secret) {
  return participants
    .map(p => ({ p, key: keyFor(secret, `order:${p.email}`) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(entry => entry.p);
}

function findGiftee(participants, secret, email) {
  const ordered = orderParticipants(participants, secret);
  const index = ordered.findIndex(p => p.email === email);
  if (index === -1) return null;
  return ordered[(index + 1) % ordered.length];
}

// A fun, stable "tracking number" for each person's parcel. It reveals nothing.
function trackingNumber(secret, email) {
  const hex = keyFor(secret, `track:${email}`).slice(0, 8).toUpperCase();
  return `NP-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

module.exports = { findGiftee, orderParticipants, trackingNumber };
