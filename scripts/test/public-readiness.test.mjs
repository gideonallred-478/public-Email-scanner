import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveMailboxProvider } from '../../src/mail/mailboxConfig.js';
import { isAuthRequired, getDemoPreviewUser } from '../../src/auth/authConfig.js';
test('live hosted mode requires auth and static demo gets an explicit synthetic reviewer', () => {
 assert.equal(isAuthRequired({PROD:true,VITE_MAILBOX_LIVE:'true'}), true);
 assert.equal(isAuthRequired({PROD:true}), false);
 assert.equal(getDemoPreviewUser({PROD:true}).role, 'admin');
 assert.equal(getDemoPreviewUser({DEV:true}), null);
 assert.equal(getDemoPreviewUser({PROD:true,VITE_MAILBOX_LIVE:'true'}), null);
});
test('hosted build ignores copied local provider unless live mode is explicitly enabled', () => {
  assert.equal(resolveMailboxProvider({PROD:true,VITE_MAILBOX_PROVIDER:'imap'}), 'demo');
  assert.equal(resolveMailboxProvider({PROD:true,VITE_MAILBOX_LIVE:'true',VITE_MAILBOX_PROVIDER:'imap'}), 'imap');
  assert.equal(resolveMailboxProvider({DEV:true,VITE_MAILBOX_PROVIDER:'local-smtp-inbox'}), 'local-smtp-inbox');
});
test('development UI defaults to loopback and current bridge port', async () => {
 const config = await readFile(new URL('../../vite.config.js',import.meta.url),'utf8');
 assert.match(config, /host: "127\.0\.0\.1"/);
 assert.match(config, /127\.0\.0\.1:8790/);
});
