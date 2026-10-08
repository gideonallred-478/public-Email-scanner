import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

async function freePort() {
 const server = createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
 const port=server.address().port; await new Promise(resolve=>server.close(resolve)); return port;
}
async function waitFor(check, timeout=10000) {
 const end=Date.now()+timeout;
 while(Date.now()<end) { try { const result=await check(); if(result)return result; } catch {} await new Promise(r=>setTimeout(r,50)); }
 throw new Error('Synthetic demo did not become ready');
}
test('synthetic SMTP delivery is scanned, protected and persisted with outbound delivery disabled', async () => {
 const dir=await mkdtemp(join(tmpdir(),'scanner-synthetic-demo-'));
 const inbox=join(dir,'inbox'); await mkdir(inbox);
 const smtpPort=await freePort(), bridgePort=await freePort();
 const password=randomBytes(24).toString('base64url');
 const base=`http://127.0.0.1:${bridgePort}`;
 const alertsPath=join(dir,'alerts.json');
 const children=[];
 const env={...process.env, MAILBOX_PROVIDER:'local-smtp-inbox',MAILBOX_ADDRESS:'reviewer@example.invalid',MAILBOXES_JSON:'',
  SMTP_INBOX_PATH:inbox,SMTP_INBOX_STATE_PATH:join(dir,'delivered.json'),SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtpPort),
  MAIL_BRIDGE_HOST:'127.0.0.1',MAIL_BRIDGE_PORT:String(bridgePort),SHARED_DATA_ENABLED:'true',
  SHARED_AUTH_USERS_JSON:JSON.stringify([{username:'reviewer',password,role:'admin',displayName:'Synthetic Reviewer'},{username:'student',password,role:'student',displayName:'Synthetic Student'}]),
  ALERT_NOTIFY_ENABLED:'false',SUGGESTION_NOTIFY_ENABLED:'false',ALERTS_DATA_PATH:alertsPath,SCAN_REGISTRY_DATA_PATH:join(dir,'registry.json'),
  SITE_LISTS_DATA_PATH:join(dir,'lists.json'),SIGN_IN_LOG_PATH:join(dir,'audit.json'),MAIL_PROVENANCE_SECRET_PATH:join(dir,'provenance.key')};
 try {
  children.push(spawn(process.execPath,['scripts/smtp-harness.mjs','--host','127.0.0.1','--port',String(smtpPort),'--inbox',inbox],{env,stdio:'ignore'}));
  const transport=nodemailer.createTransport({host:'127.0.0.1',port:smtpPort,secure:false});
  await waitFor(()=>transport.verify());
  await transport.sendMail({from:'sender@example.invalid',to:'reviewer@example.invalid',subject:'Synthetic readiness test',text:'Synthetic test body. Please verify your password immediately at https://login-verify.example.invalid/reset',messageId:'<readiness-test@example.invalid>'});
  children.push(spawn(process.execPath,['server/index.js'],{env,stdio:'ignore'}));
  await waitFor(async()=> (await fetch(`${base}/api/shared-data/status`)).ok);
  assert.equal((await fetch(`${base}/api/alerts`)).status,401);
  assert.equal((await fetch(`${base}/api/mail/status`)).status,401);
  assert.equal((await fetch(`${base}/api/shared-data/status`,{headers:{Origin:'https://evil.example.invalid'}})).status,403);
  const login=async username=>{
   const response=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   assert.equal(response.status,200); return (await response.json()).token;
  };
  const student=await login('student');
  assert.equal((await fetch(`${base}/api/mail/status`,{headers:{Authorization:`Bearer ${student}`}})).status,403);
  const token=await login('reviewer');
  const state=await waitFor(async()=>{const s=JSON.parse(await readFile(alertsPath,'utf8'));return s.alerts?.length?s:null});
  assert.equal(state.alerts.length,1);
  assert.equal(state.alerts[0].email.subject,'Synthetic readiness test');
  assert.match(state.alerts[0].email.body,/Synthetic test body/);
  assert.ok(state.notificationJobs.every(job=>job.status==='pending' && job.sentAt===null));
  const headers={Authorization:`Bearer ${token}`};
  const response=await fetch(`${base}/api/alerts`,{headers}); assert.equal(response.status,200);
  assert.equal(JSON.stringify(await response.json()).includes(password),false);
  assert.equal((await fetch(`${base}/api/auth/logout`,{method:'POST',headers})).status,200);
  assert.equal((await fetch(`${base}/api/alerts`,{headers})).status,401);
 } finally {
  await Promise.all(children.map(async child=>{if(child.exitCode!==null)return;const stopped=once(child,'exit');child.kill();await stopped;}));
  await rm(dir,{recursive:true,force:true});
 }
});
