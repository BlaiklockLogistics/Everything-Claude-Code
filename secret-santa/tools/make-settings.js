#!/usr/bin/env node
'use strict';

// Builds the PARTICIPANTS and DRAW_SECRET values to paste into Azure.
//
//   node tools/make-settings.js people.txt
//
// people.txt can be the "To:" line copied from an Outlook email, e.g.
//   Jane Smith <jane.smith@company.co.uk>; Smith, Dave <dave.smith@company.co.uk>
// or one email address (or "Name <email>") per line.
//
// It checks the list and that the draw works, but it never prints who has who.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseParticipants } = require('../api/src/lib/config');
const { findGiftee } = require('../api/src/lib/draw');

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node tools/make-settings.js <file with the list of people>');
    process.exit(1);
  }
  let participants;
  try {
    participants = parseParticipants(fs.readFileSync(path.resolve(file), 'utf8'));
  } catch (err) {
    console.error(`[make-settings] ${err.message}`);
    process.exit(1);
  }

  const secret = crypto.randomBytes(24).toString('base64url');
  const allGood = participants.every(p => {
    const giftee = findGiftee(participants, secret, p.email);
    return giftee && giftee.email !== p.email;
  });
  if (!allGood) {
    console.error('[make-settings] The draw check failed. Run the script again.');
    process.exit(1);
  }

  console.log(`Found ${participants.length} people:`);
  participants.forEach(p => console.log(`  - ${p.name} (${p.email})`));
  console.log('\nCheck the names above, then add these two settings in Azure:\n');
  console.log('Name:  PARTICIPANTS');
  console.log(`Value: ${participants.map(p => `${p.name} <${p.email}>`).join('; ')}\n`);
  console.log('Name:  DRAW_SECRET');
  console.log(`Value: ${secret}\n`);
  console.log('Do not change either value once people have seen their match, or the draw will change.');
}

main();
