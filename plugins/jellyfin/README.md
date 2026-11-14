# Jellyfin

Sign in to Matinee with an existing Jellyfin username and password.
Matinee links the stable Jellyfin user ID to a local account. Jellyfin
roles do not grant Matinee access or administrator privileges.

## Permissions and settings

Set `url` to the Jellyfin server address, including any base path, for
example `https://media.example.com/jellyfin`. The network permission covers
that exact host and port, including private addresses. Use HTTPS unless
the connection stays on a trusted local network.

This plugin sees the passwords people type. That is what the sensitive
`auth-credentials` permission means. It sends those passwords only to the
configured Jellyfin server, never logs them, and does not store them.
It requests storage solely for a random stable device ID so Jellyfin
recognizes the Matinee server across sign-ins and restarts.

A successful authentication is followed by a logout of the temporary
Jellyfin session. Logout failures are logged without the token. Disabled
Jellyfin users and wrong passwords return no identity. Jellyfin outages
produce a sign-in error rather than a wrong-password response.

Enable the plugin, then link it from an existing Matinee account or turn
on the host's sign-up option for this provider. Keep a Matinee passkey or
OIDC sign-in available; this plugin cannot create the first administrator.
