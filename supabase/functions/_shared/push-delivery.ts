export interface PushContent {
  id: string;
  sentAt: string;
  title: string;
  body: string;
  tag: string;
  url: string;
  type: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
}

export function buildPushMessage(token: string, content: PushContent) {
  const gate = content.type === 'gate_alert';
  const tag = gate ? `gate-alert-${content.id}` : content.tag;
  return {
    token,
    // FCM displays this automatically in background; service workers skip
    // manual display when a notification payload is present.
    notification: { title: content.title, body: content.body },
    data: {
      alert_id: content.id,
      sent_at: content.sentAt,
      sender_id: content.senderId,
      sender_name: content.senderName,
      sender_avatar: content.senderAvatar,
      type: content.type,
      title: content.title,
      body: content.body,
      tag,
      url: content.url,
    },
    webpush: {
      headers: { Urgency: 'high', TTL: '300' },
      notification: {
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag,
        renotify: true,
        requireInteraction: gate,
        data: { url: content.url },
      },
    },
    android: { priority: 'high', ttl: '300s' },
    apns: {
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
      payload: { aps: { sound: 'default' } },
    },
  };
}

interface FcmResult {
  name?: string;
  error?: { status?: string; details?: Array<{ '@type'?: string; errorCode?: string }> };
}

export function classifyFcmResponse(ok: boolean, result: FcmResult) {
  const code = result.error?.details?.find((detail) =>
    detail['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode
    || result.error?.status || 'UNKNOWN';
  return {
    accepted: ok && typeof result.name === 'string' && !result.error,
    // Never delete tokens for payload errors, auth failures or rate limits.
    invalidToken: code === 'UNREGISTERED',
    code,
    messageId: result.name,
  };
}
