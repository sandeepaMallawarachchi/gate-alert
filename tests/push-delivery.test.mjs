import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPushMessage, classifyFcmResponse } from '../supabase/functions/_shared/push-delivery.ts';

const content = {
  id: 'alert-123', sentAt: '2026-11-03T04:00:00Z', title: 'Gate Alert', body: 'Please open the gate',
  tag: 'gate-alert', url: '/', type: 'gate_alert', senderId: 'user-1', senderName: 'Member', senderAvatar: '',
};

test('background notification has automatic-display payload, high web urgency and five-minute expiry', () => {
  const message = buildPushMessage('device-token', content);
  assert.deepEqual(message.notification, { title: content.title, body: content.body });
  assert.deepEqual(message.webpush.headers, { Urgency: 'high', TTL: '300' });
  assert.equal(message.data.alert_id, content.id);
  assert.equal(message.data.sent_at, content.sentAt);
  assert.equal(message.webpush.notification.data.url, '/');
});

test('different gate requests do not replace each other; repeats retain their notification tag', () => {
  const first = buildPushMessage('token', content);
  const second = buildPushMessage('token', { ...content, id: 'alert-456' });
  assert.notEqual(first.webpush.notification.tag, second.webpush.notification.tag);
  assert.equal(first.webpush.notification.tag, buildPushMessage('token', content).webpush.notification.tag);
});

test('attendance notifications keep their existing deduplication tag and destination', () => {
  const result = buildPushMessage('token', { ...content, type: 'attendance', tag: 'daily-checkin', url: '/attendance' });
  assert.equal(result.webpush.notification.tag, 'daily-checkin');
  assert.equal(result.webpush.notification.requireInteraction, false);
  assert.equal(result.data.url, '/attendance');
});

test('only successful FCM responses with a message ID count as accepted', () => {
  assert.equal(classifyFcmResponse(true, { name: 'projects/test/messages/123' }).accepted, true);
  assert.equal(classifyFcmResponse(true, {}).accepted, false);
  assert.equal(classifyFcmResponse(false, { name: 'projects/test/messages/123' }).accepted, false);
});

test('confirmed unregistered tokens are eligible for removal', () => {
  const result = classifyFcmResponse(false, { error: { status: 'NOT_FOUND', details: [
    { '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' },
  ] } });
  assert.equal(result.accepted, false);
  assert.equal(result.invalidToken, true);
});

test('auth, malformed payload and transient errors never delete tokens', () => {
  for (const code of ['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'UNAVAILABLE', 'QUOTA_EXCEEDED']) {
    const result = classifyFcmResponse(false, { error: { status: code } });
    assert.equal(result.accepted, false);
    assert.equal(result.invalidToken, false);
  }
});
