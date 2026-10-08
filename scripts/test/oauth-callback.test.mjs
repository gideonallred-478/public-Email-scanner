import test from 'node:test';
import assert from 'node:assert/strict';
import { readOAuthCallbackCode } from '../oauth-callback.mjs';
test('OAuth callback rejects missing or mismatched state before exchanging a code', () => {
 assert.throws(()=>readOAuthCallbackCode(new URL('http://127.0.0.1/oauth2callback?code=test'), 'expected'), /state/);
 assert.throws(()=>readOAuthCallbackCode(new URL('http://127.0.0.1/oauth2callback?code=test&state=wrong'), 'expected'), /state/);
 assert.equal(readOAuthCallbackCode(new URL('http://127.0.0.1/oauth2callback?code=test&state=expected'), 'expected'),'test');
});
test('OAuth callback never reflects provider error content', () => {
 assert.throws(()=>readOAuthCallbackCode(new URL('http://127.0.0.1/oauth2callback?error=%3Cscript%3E&state=expected'), 'expected'), error => error.message==='OAuth authorization was declined or failed.');
});
