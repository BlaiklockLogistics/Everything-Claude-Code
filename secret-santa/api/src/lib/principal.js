'use strict';

// Azure Static Web Apps signs people in with Microsoft 365 and passes who they
// are to the API in the x-ms-client-principal header. The platform sets this
// header itself, so a browser cannot fake it.

const { normaliseEmail } = require('./config');

const TENANT_CLAIMS = ['http://schemas.microsoft.com/identity/claims/tenantid', 'tid'];

class AuthError extends Error {}

function decodeHeader(header) {
  if (!header) throw new AuthError('not signed in');
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch (_err) {
    throw new AuthError('unreadable sign-in details');
  }
}

function claimValue(principal, types) {
  const claims = Array.isArray(principal.claims) ? principal.claims : [];
  const match = claims.find(c => c && types.includes(c.typ));
  return match ? String(match.val || '').toLowerCase() : '';
}

function readPrincipal(header, config) {
  const principal = decodeHeader(header);
  if (!principal || principal.identityProvider !== 'aad') {
    throw new AuthError('sign in with a Microsoft 365 account');
  }
  const email = normaliseEmail(principal.userDetails);
  if (!email.includes('@')) throw new AuthError('no email on the account');

  if (config.allowedDomains.length > 0) {
    const domain = email.split('@')[1];
    if (!config.allowedDomains.includes(domain)) {
      throw new AuthError('this account is not from an allowed company domain');
    }
  }
  if (config.allowedTenantId && claimValue(principal, TENANT_CLAIMS) !== config.allowedTenantId) {
    throw new AuthError('this account is not from the company Microsoft 365 tenant');
  }
  return { email };
}

module.exports = { AuthError, readPrincipal };
