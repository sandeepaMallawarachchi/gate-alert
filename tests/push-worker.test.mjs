import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the legacy worker still used by existing installations, without
// subscribing a device, contacting Firebase or notifying team members.
function worker(active = false) {
  let background;
  const listeners = {};
  const calls = [];
  const display = Promise.resolve();
  const source = fs.readFileSync(new URL(active ? '../src/sw.ts' : '../public/firebase-messaging-sw.js', import.meta.url), 'utf8');
  const script = active ? ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText : source;
  vm.runInNewContext(script, {
    URL, console: { info() {} }, importScripts() {},
    precacheAndRoute() {}, cleanupOutdatedCaches() {}, clientsClaim() {}, registerRoute() {},
    NetworkFirst: class {}, ExpirationPlugin: class {},
    initializeApp() {}, getMessaging() {}, onBackgroundMessage: (_messaging, fn) => { background = fn; },
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage(fn) { background = fn; } }) },
    self: {
      skipWaiting() {}, __WB_MANIFEST: [],
      location: { origin: 'https://gate.example' },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      registration: { showNotification: (...args) => { calls.push(args); return display; } },
      clients: {
        matchAll: async () => [],
        openWindow: async (url) => { calls.push(url); },
      },
    },
  });
  return { background, listeners, calls, display };
}

test('automatic-display payloads do not produce a second notification', () => {
  const w = worker();
  w.background({ notification: { title: 'Gate' }, data: { alert_id: '123' } });
  assert.equal(w.calls.length, 0);
});

test('active PWA worker awaits data-only display and skips already displayed notifications', async () => {
  const w = worker(true);
  w.background({ notification: { title: 'Automatic' }, data: {} });
  assert.equal(w.calls.length, 0);
  assert.equal(w.background({ data: { title: 'Legacy', tag: '123' } }), w.display);
  await w.display;
  assert.equal(w.calls.length, 1);
});

test('data-only messages return the display promise to keep the worker alive', async () => {
  const w = worker();
  assert.equal(w.background({ data: { title: 'Gate', tag: 'request-123', url: '/alerts' } }), w.display);
  await w.display;
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0][1].tag, 'request-123');
  assert.equal(w.calls[0][1].data.url, '/alerts');
});

test('notification clicks honor Firebase-wrapped internal destinations', async () => {
  const w = worker();
  let work;
  w.listeners.notificationclick({
    stopImmediatePropagation() {},
    notification: { close() {}, data: { FCM_MSG: { data: { url: '/attendance' } } } },
    waitUntil: (promise) => { work = promise; },
  });
  await work;
  assert.equal(w.calls[0], 'https://gate.example/attendance');
});

test('notification clicks reject external destinations', async () => {
  const w = worker();
  let work;
  w.listeners.notificationclick({
    stopImmediatePropagation() {}, notification: { close() {}, data: { url: 'https://other.example/' } },
    waitUntil: (promise) => { work = promise; },
  });
  await work;
  assert.equal(w.calls[0], 'https://gate.example/');
});
