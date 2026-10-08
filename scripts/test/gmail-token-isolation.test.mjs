import test from 'node:test';
import assert from 'node:assert/strict';
import { getGmailAccessToken, clearGmailOAuthCache } from '../../server/providers/gmailOAuth.js';
test('Gmail access token cache isolates mailbox credentials and secret rotation', async t => {
 const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;clearGmailOAuthCache();});
 clearGmailOAuthCache(); let calls=0;
 globalThis.fetch=async (_url, options)=>{calls++;return {ok:true,json:async()=>({access_token:`synthetic-${options.body.get('refresh_token')}-${options.body.get('client_secret')}`,expires_in:3600})};};
 const first={clientId:'client',clientSecret:'secret-one',refreshToken:'refresh-one'};
 const second={...first,refreshToken:'refresh-two'};
 assert.notEqual(await getGmailAccessToken(first),await getGmailAccessToken(second));
 assert.notEqual(await getGmailAccessToken(first),await getGmailAccessToken({...first,clientSecret:'secret-two'}));
 await getGmailAccessToken(first); assert.equal(calls,3);
});
