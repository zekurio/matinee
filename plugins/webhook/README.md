# Webhook

POST selected server events as JSON to a service you control. The body is
`{ event, at, server, data }`, where `at` is an ISO timestamp and `server`
is Matinee's public URL. `x-matinee-event` also contains the event name.

## Permissions and settings

Set the required `url` to your receiver. Its host and port are the only
network destination approved, including a private address if you enter
one. Prefer HTTPS for remote receivers. No storage is used.

Approval covers all seven events: `library.scanned`, `title.added`,
`title.matched`, `playback.started`, `playback.stopped`, `playback.watched`,
and `user.created`. This includes private viewing activity and usernames,
even though playback and user delivery are off by default. The `library`,
`playback`, and `users` switches filter delivery after approval. Only
`library` defaults to on.

Set an optional `secret` to sign the exact UTF-8 body with HMAC-SHA256.
Verify `x-matinee-signature`, formatted as `sha256=<lowercase hex>`, using
a constant-time comparison. The receiver should also reject stale `at`
values and handle duplicate events. The signature alone does not prevent
replay.

Network errors, 429, and 5xx responses throw so Matinee retries the stored
event. Each handler call makes one HTTP attempt, with a 30-second host
timeout. Other 4xx responses are logged and dropped. The
`x-matinee-delivery` header holds the stable delivery id on every retry;
use it to recognize repeats. `at` is the event's recording time, not the
time of the HTTP attempt. A receiver should allow for retries up to
24 hours later. Matinee keeps delivery order per plugin, gives up after
24 hours or past 5000 waiting events, and logs a count when it does.
Events are not a durable audit trail.
