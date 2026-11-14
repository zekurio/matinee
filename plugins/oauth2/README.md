# OAuth 2.0

Authorization-code sign-in with a provider that returns JSON tokens and
has a bearer-token user-info endpoint. This is OAuth, not OIDC: it does not
read ID tokens or discovery documents. The host checks callback state.
PKCE uses S256 and defaults to on.

## Permissions and setup

The plugin provides redirect sign-in and may contact the exact hosts and
ports entered in `authorizeUrl`, `tokenUrl`, and `userInfoUrl`, including
private addresses. It asks for no static hosts, events, or storage.
Use HTTPS outside local development. Secrets and access tokens are never
logged. The host keeps the PKCE verifier in its short-lived auth session.

Register this redirect URI with the provider:

`<public URL>/api/auth/plugins/oauth2.oauth2/callback`

Set `clientId` and, for confidential clients, `clientSecret`. `scopes` is
a space-separated string. Field settings accept dotted paths such as
`data.id`. Defaults are `subjectField=id`, `usernameField=login`, and
`nameField=name`. Numeric subjects become strings. Use a stable provider
ID, not an email address, as the subject.

The button label is **OAuth 2.0**, from the manifest. A different label is
not configurable yet. Enable the plugin and separately decide whether
the host should allow sign-up; it is off by default.

## GitHub example

Create a GitHub OAuth App with the callback above.

| Setting                 | Value                                       |
| ----------------------- | ------------------------------------------- |
| authorizeUrl            | https://github.com/login/oauth/authorize    |
| tokenUrl                | https://github.com/login/oauth/access_token |
| userInfoUrl             | https://api.github.com/user                 |
| clientId / clientSecret | Your OAuth App's values                     |
| scopes                  | read:user                                   |
| subjectField            | id                                          |
| usernameField           | login                                       |
| nameField               | name                                        |
| pkce                    | true                                        |

## Discord example

Create an application in Discord's developer portal, add the callback
under OAuth2 redirects, and use its OAuth2 client credentials.

| Setting                 | Value                                |
| ----------------------- | ------------------------------------ |
| authorizeUrl            | https://discord.com/oauth2/authorize |
| tokenUrl                | https://discord.com/api/oauth2/token |
| userInfoUrl             | https://discord.com/api/users/@me    |
| clientId / clientSecret | Your application's values            |
| scopes                  | identify                             |
| subjectField            | id                                   |
| usernameField           | username                             |
| nameField               | global_name                          |
| pkce                    | true                                 |

For GitLab or Gitea, use that installation's OAuth endpoints and user API,
and set field paths to match its response. Providers requiring Basic
client authentication or non-JSON token responses are not supported.
