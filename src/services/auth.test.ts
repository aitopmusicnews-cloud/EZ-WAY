import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authConfigFrom,
  isPublicShareLocation,
  signInWithConfig,
} from './auth.ts';

test('auth config derives region from the Cognito user-pool id', () => {
  const config = authConfigFrom({
    VITE_COGNITO_USER_POOL_ID: 'us-west-2_AbCdEf123',
    VITE_COGNITO_USER_POOL_CLIENT_ID: 'client123',
  });
  assert.equal(config.region, 'us-west-2');
  assert.equal(config.clientId, 'client123');
  assert.equal(config.endpoint, 'https://cognito-idp.us-west-2.amazonaws.com/');
});

test('owner auth config fails clearly when required values are missing', () => {
  assert.throws(() => authConfigFrom({}), /Cognito.*configured/i);
});

test('only token/share query parameters bypass owner authentication', () => {
  assert.equal(isPublicShareLocation('https://example.com/?token=abc'), true);
  assert.equal(isPublicShareLocation('https://example.com/?share=abc'), true);
  assert.equal(isPublicShareLocation('https://example.com/?client_portal=abc'), false);
  assert.equal(isPublicShareLocation('https://example.com/?token='), false);
});

test('sign in reports the new-password challenge without logging or inventing tokens', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ChallengeParameters: { USER_ID_FOR_SRP: 'admin@example.com' },
    Session: 'x'.repeat(24),
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    const result = await signInWithConfig(
      { region: 'us-west-2', poolId: 'us-west-2_Test', clientId: 'client123', endpoint: 'https://cognito-idp.us-west-2.amazonaws.com/' },
      'admin@example.com',
      'TempPassword123!',
    );
    assert.equal(result.status, 'new_password_required');
    if (result.status === 'new_password_required') {
      assert.equal(result.challenge.username, 'admin@example.com');
      assert.equal(result.challenge.session.length, 24);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
