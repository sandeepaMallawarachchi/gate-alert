import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildPushMessage, classifyFcmResponse } from '../supabase/functions/_shared/push-delivery.ts';

function server({ tokens = ['good', 'expired'], results = {}, senderActive = true } = {}) {
  let handler;
  const requests = [];
  const deleted = [];
  const histories = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'sender' } } }) },
    from(table) {
      let deleting = false;
      const query = {
        select() { return query; },
        eq() { return query; },
        neq() { return query; },
        in(key, values) { if (deleting) deleted.push(...values); return query; },
        insert(row) { if (table === 'gate_alert_history') histories.push(row); return query; },
        delete() { deleting = true; return query; },
        single: async () => ({ data: { full_name: 'Sender', avatar_url: '', is_active: senderActive } }),
        then(resolve, reject) {
          const data = table === 'profiles' ? [{ user_id: 'recipient' }] : table === 'fcm_tokens' ? tokens.map((token) => ({ token })) : null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const source = fs.readFileSync(new URL('../supabase/functions/send-push-notification/index.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, {
    exports: {},
    require(name) { return name.includes('push-delivery') ? { buildPushMessage, classifyFcmResponse } : { createClient: () => client }; },
    Deno: {
      serve(fn) { handler = fn; },
      env: { get(name) { return name === 'FIREBASE_SERVICE_ACCOUNT' ? JSON.stringify({ private_key: '', client_email: 'test@example.com', project_id: 'test' }) : 'test'; } },
    },
    crypto: { randomUUID: () => '6ec91cd2-364e-46c7-bda2-c7720a2fdc18', subtle: { importKey: async () => ({}), sign: async () => new Uint8Array([1, 2]).buffer } },
    console: { log() {}, warn() {}, error() {} },
    Request, Response, AbortSignal, TextEncoder, btoa, atob,
    fetch: async (url, options) => {
      if (url.includes('oauth2')) return Response.json({ access_token: 'access-token' });
      const message = JSON.parse(options.body).message;
      requests.push(message);
      if (results[message.token] === 'network') throw new Error('Network unavailable');
      if (results[message.token] === 'quota') return Response.json({ error: { status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
      if (message.token === 'expired') return Response.json({ error: { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }, { status: 404 });
      return Response.json({ name: 'projects/test/messages/' + message.token });
    },
  });
  return {
    requests, deleted, histories,
    send: () => handler(new Request('https://test.example', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: '{}' })),
  };
}

test('function reports actual partial acceptance and removes only confirmed expired tokens', async () => {
  const s = server();
  const response = await s.send();
  const data = await response.json();
  assert.equal(data.accepted, 1);
  assert.equal(data.sent, 1);
  assert.equal(data.failed, 1);
  assert.equal(data.attempted, 2);
  assert.deepEqual(s.deleted, ['expired']);
  assert.equal(s.histories[0].id, data.alert_id);
  assert.equal(s.requests[0].data.alert_id, data.alert_id);
});

test('all failed provider requests never return success or delete usable tokens', async () => {
  const s = server({ tokens: ['offline', 'limited'], results: { offline: 'network', limited: 'quota' } });
  const data = await (await s.send()).json();
  assert.equal(data.success, false);
  assert.equal(data.accepted, 0);
  assert.equal(data.failed, 2);
  assert.deepEqual(s.deleted, []);
  assert.equal(s.requests.length, 2);
});

test('no registered devices produces zero acceptance without calling FCM', async () => {
  const s = server({ tokens: [] });
  const data = await (await s.send()).json();
  assert.equal(data.accepted, 0);
  assert.equal(data.attempted, 0);
  assert.equal(data.success, false);
  assert.equal(s.requests.length, 0);
});

test('inactive sender is rejected before history or notifications are written', async () => {
  const s = server({ senderActive: false });
  assert.equal((await s.send()).status, 403);
  assert.equal(s.requests.length, 0);
  assert.equal(s.histories.length, 0);
});
