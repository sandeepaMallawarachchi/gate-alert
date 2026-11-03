# Push notification reliability update

## Deployment

1. Apply `supabase/migrations/20261103110000_push_token_refresh.sql` to the connected Supabase database. This lets existing device tokens refresh using owner-only RLS.
2. Ensure the earlier `20261103090000_gate_alert_history.sql` migration has been applied.
3. Deploy the frontend to update `/sw.js` and the legacy `/firebase-messaging-sw.js`. Open each installed app once online to let its worker and token refresh.
4. Deploy `send-push-notification`, including its imported `_shared/push-delivery.ts` file. Updating workers first prevents older workers from attempting manual display of the new automatic-display payloads.

The sender reports **accepted by Firebase**, never guaranteed delivery to all phones. Per-request logs include `alert_id`, `sent_at`, acceptance/failure counts, FCM message IDs and elapsed time. Invalid registrations are removed only for FCM's explicit `UNREGISTERED` error. Token values are not logged. Network timeouts are ambiguous and are not automatically retried.

The notification expires after five minutes. This allows brief disconnections but deliberately avoids delivering old gate requests much later. Higher TTL does not speed up delivery.

## Device checks

Test with an affected Android phone using the production app:

- App visible: one alert overlay, even if both Realtime and FCM arrive.
- App backgrounded and phone locked: one system notification.
- Several requests: each request has its own notification tag.
- Tap a notification: the app opens its intended page.
- Reopen the app: registration refreshes without requesting permission again.
- Disable notifications: registration status should no longer appear enabled.

Compare an alert's `sent_at` with the service worker's `received_at` console log using Chrome remote debugging. An FCM acceptance timestamp is not a phone delivery receipt. If send errors are absent but receipt is delayed, check Android/browser notification permission, battery restrictions, background data and network conditions. Browser push cannot guarantee immediate delivery under every OS state.

## Local checks (no real notifications)

With Node 22.18+ or Node 24:

```sh
node --test tests/push-*.test.mjs
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

References:
- https://firebase.google.com/docs/cloud-messaging/web/receive-messages
- https://firebase.google.com/docs/cloud-messaging/manage-tokens
- https://firebase.google.com/docs/cloud-messaging/error-codes
