'use strict';

// Saves each person's wishlist note in Azure Table Storage. Rows are keyed by a
// hash of the email, so the table holds notes but no names or email addresses.

const crypto = require('crypto');
const { ConfigError } = require('./config');

const TABLE_NAME = 'wishlists';
const PARTITION = 'wishlist';

function rowKeyFor(email) {
  return crypto.createHash('sha256').update(email).digest('hex');
}

function createMemoryStore() {
  const rows = new Map();
  return {
    async getWishlist(email) {
      return rows.has(rowKeyFor(email)) ? rows.get(rowKeyFor(email)) : null;
    },
    async setWishlist(email, text) {
      rows.set(rowKeyFor(email), text);
    },
  };
}

function createTableStore(connectionString) {
  // Loaded here so tests and local runs do not need the Azure SDK.
  const { TableClient } = require('@azure/data-tables');
  const client = TableClient.fromConnectionString(connectionString, TABLE_NAME);
  let ready = null;

  function ensureTable() {
    if (!ready) {
      ready = client.createTable().catch(err => {
        if (err && err.statusCode === 409) return;
        ready = null;
        throw err;
      });
    }
    return ready;
  }

  return {
    async getWishlist(email) {
      await ensureTable();
      try {
        const row = await client.getEntity(PARTITION, rowKeyFor(email));
        return typeof row.text === 'string' ? row.text : null;
      } catch (err) {
        if (err && err.statusCode === 404) return null;
        throw err;
      }
    },
    async setWishlist(email, text) {
      await ensureTable();
      await client.upsertEntity(
        { partitionKey: PARTITION, rowKey: rowKeyFor(email), text, updatedAt: new Date().toISOString() },
        'Replace'
      );
    },
  };
}

function createStore(env) {
  if (env.WISHLIST_STORE === 'memory') return createMemoryStore();
  const connectionString = String(env.STORAGE_CONNECTION_STRING || '').trim();
  if (!connectionString) {
    throw new ConfigError('STORAGE_CONNECTION_STRING must be set (or WISHLIST_STORE=memory for local testing)');
  }
  return createTableStore(connectionString);
}

module.exports = { createMemoryStore, createStore, rowKeyFor };
