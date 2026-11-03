'use strict';

// Reads the Secret Santa settings from environment variables (Azure "Environment
// variables" / app settings). Nothing about the people taking part is stored in
// the code or the repository.

const MIN_PARTICIPANTS = 3;
const MIN_SECRET_LENGTH = 16;
const DEFAULT_EVENT_NAME = 'Secret Santa 2026';
const DEFAULT_EXCHANGE_DATE = '2026-12-24';
const DEFAULT_MIN_SPEND = '£20';

const EMAIL_RE = /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/;
const NAMED_RE = /^(.*?)\s*<([^<>]+)>$/;

class ConfigError extends Error {}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function nameFromEmail(email) {
  const local = email.split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Turns "Smith, Jane <jane@x.com>" into "Jane Smith"; leaves "Jane Smith" alone.
function tidyName(raw) {
  const unquoted = raw.replace(/^["']+|["']+$/g, '').trim();
  const parts = unquoted.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : unquoted;
}

function parseEntry(entry) {
  const named = entry.match(NAMED_RE);
  const email = normaliseEmail(named ? named[2] : entry);
  if (!EMAIL_RE.test(email)) {
    throw new ConfigError(`PARTICIPANTS has an entry that is not an email address: "${entry}"`);
  }
  const name = named && named[1].trim() ? tidyName(named[1]) : nameFromEmail(email);
  return { name, email };
}

// Accepts the "To:" line copied from Outlook, e.g.
//   Jane Smith <jane@co.uk>; Smith, Dave <dave@co.uk>; sam@co.uk
// Entries may also be separated by new lines.
function parseParticipants(raw) {
  const entries = String(raw || '')
    .split(/[;\n\r]+/)
    .map(e => e.trim())
    .filter(Boolean);

  const participants = entries.map(parseEntry);
  const seen = new Set();
  for (const p of participants) {
    if (seen.has(p.email)) {
      throw new ConfigError(`PARTICIPANTS lists ${p.email} more than once`);
    }
    seen.add(p.email);
  }
  if (participants.length < MIN_PARTICIPANTS) {
    throw new ConfigError(`PARTICIPANTS needs at least ${MIN_PARTICIPANTS} people (found ${participants.length})`);
  }
  return participants;
}

function parseOptionalDate(value, label) {
  if (!value || !String(value).trim()) return null;
  const date = new Date(String(value).trim());
  if (Number.isNaN(date.getTime())) {
    throw new ConfigError(`${label} is not a valid date: "${value}" (use e.g. 2026-12-01T09:00:00Z)`);
  }
  return date;
}

function parseList(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

function loadConfig(env) {
  const drawSecret = String(env.DRAW_SECRET || '');
  if (drawSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`DRAW_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters`);
  }
  return Object.freeze({
    participants: Object.freeze(parseParticipants(env.PARTICIPANTS)),
    drawSecret,
    eventName: String(env.EVENT_NAME || DEFAULT_EVENT_NAME).trim(),
    exchangeDate: String(env.EXCHANGE_DATE || DEFAULT_EXCHANGE_DATE).trim(),
    minSpend: String(env.MIN_SPEND || DEFAULT_MIN_SPEND).trim(),
    revealOpensAt: parseOptionalDate(env.REVEAL_OPENS, 'REVEAL_OPENS'),
    allowedTenantId: String(env.ALLOWED_TENANT_ID || '').trim().toLowerCase(),
    allowedDomains: Object.freeze(parseList(env.ALLOWED_EMAIL_DOMAINS)),
  });
}

module.exports = {
  ConfigError,
  loadConfig,
  normaliseEmail,
  parseParticipants,
};
