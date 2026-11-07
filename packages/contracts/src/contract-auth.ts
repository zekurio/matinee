import { oc } from "@orpc/contract"

import { del, get, patch, post, put } from "./contract-routes"
import { PlaybackPreferences } from "./preferences"
import { t } from "./schema"
import {
  AppDevice,
  AppSession,
  AuthConfig,
  AuthenticationResponse,
  AvatarUpload,
  CodeVerifier,
  DeviceCode,
  DeviceRequest,
  DeviceSignIn,
  DisplayName,
  IdInput,
  OidcAccount,
  Passkey,
  PasskeyCreation,
  PasskeyName,
  PasskeyRequest,
  PendingOidcLink,
  ProfileSharing,
  RegistrationResponse,
  Session,
  User,
  UserCode,
  Username,
} from "./schemas"
import { SyncedThemePreferences, UserTheme, UserThemeId } from "./theme"

export const authContract = oc.tag("Auth").router({
  config: get("/auth/config").output(AuthConfig),
  session: get("/auth/session").output(t.object({ user: User.nullable() })),
  signOut: post("/auth/sign-out").output(t.void()),
  /** Prove the setup token once; the server remembers it in a cookie. */
  unlockSetup: post("/auth/setup/unlock")
    .input(t.object({ token: t.string().min(1) }))
    .output(t.void()),
  passkey: {
    signInOptions: post("/auth/passkey/sign-in/options").output(PasskeyRequest),
    signIn: post("/auth/passkey/sign-in")
      .input(
        t.object({ challengeId: t.uuid(), response: AuthenticationResponse }),
      )
      .output(User),
    signUpOptions: post("/auth/passkey/sign-up/options")
      .input(t.object({ username: Username }))
      .output(PasskeyCreation),
    signUp: post("/auth/passkey/sign-up")
      .input(
        t.object({ challengeId: t.uuid(), response: RegistrationResponse }),
      )
      .output(User),
  },
  /**
   * An OIDC sign-in whose username claim matched an existing account. The
   * callback keeps it for this browser for ten minutes, in an HttpOnly
   * cookie, and sends the browser to the login page with
   * `OIDC_LINK_QUERY_KEY` set. There the person signs in to that account and
   * links it, or creates a new account from it, without going back to the
   * provider.
   */
  oidc: {
    pending: {
      /** The sign-in this browser holds, or null. Doesn't use it up. */
      get: get("/auth/oidc/pending").output(PendingOidcLink.nullable()),
      /** Link it to the signed-in account. Returns where sign-in started. */
      link: post("/auth/oidc/pending/link").output(
        t.object({ redirect: t.string() }),
      ),
      /**
       * Create a new account from it instead, and sign in. Fails while
       * signed in, or when the provider doesn't allow sign-up.
       */
      signUp: post("/auth/oidc/pending/sign-up").output(
        t.object({ user: User, redirect: t.string() }),
      ),
      /** Drop it. It also expires on its own. */
      discard: del("/auth/oidc/pending").output(t.void()),
    },
  },
  /**
   * Sign-in for apps that can open a browser, as in OAuth for native apps
   * (RFC 8252) with PKCE. The app opens `appAuthorizePagePath()` in the
   * system browser. Once the person approves there, the browser goes to the
   * app's redirect URI with `code` and `state`, and the app trades the code
   * for a session here. A code works once, for two minutes.
   */
  app: {
    token: post("/auth/app/token")
      .input(t.object({ code: t.uuid(), codeVerifier: CodeVerifier }))
      .output(AppSession),
  },
  /**
   * Sign-in for apps without a browser, like TV apps, as in the OAuth device
   * grant (RFC 8628). The app calls `start` and shows the user code and the
   * page to enter it on. Someone signed in enters it there and approves,
   * and the app's next `poll` gets the session.
   */
  device: {
    start: post("/auth/device").input(AppDevice).output(DeviceCode),
    /**
     * Pending until someone approves. Fails with NOT_FOUND once the code
     * expired, so the app should start again.
     */
    poll: post("/auth/device/token")
      .input(t.object({ deviceCode: t.string().min(1).max(128) }))
      .output(DeviceSignIn),
    /** The device a code belongs to, for the person to check. */
    get: get("/auth/device/{userCode}")
      .input(t.object({ userCode: UserCode }))
      .output(DeviceRequest),
    /** Sign the device in as the user who calls this. */
    approve: post("/auth/device/{userCode}/approve")
      .input(t.object({ userCode: UserCode }))
      .output(t.void()),
  },
})

export const accountContract = oc.tag("Account").router({
  /** Change how the account shows to others. Returns the user. */
  profile: {
    /** Fields left out stay as they are. */
    update: patch("/account/profile")
      .input(
        t.object({
          displayName: DisplayName.optional(),
          sharing: ProfileSharing.partial().optional(),
        }),
      )
      .output(User),
  },
  avatar: {
    /** A multipart upload. Fails with BAD_REQUEST for unreadable images. */
    upload: put("/account/avatar")
      .input(t.object({ file: AvatarUpload }))
      .output(User),
    /**
     * Use the picture of a linked OIDC account, and follow it from now on.
     * Fails with BAD_REQUEST when no provider sent one or it won't load.
     */
    useProvider: post("/account/avatar/provider").output(User),
    /** Show the initial, and stop taking the provider's picture. */
    remove: del("/account/avatar").output(User),
  },
  passkeys: {
    list: get("/account/passkeys").output(t.array(Passkey)),
    registerOptions: post("/account/passkeys/options").output(PasskeyCreation),
    register: post("/account/passkeys")
      .input(
        t.object({
          challengeId: t.uuid(),
          response: RegistrationResponse,
          name: PasskeyName.optional(),
        }),
      )
      .output(Passkey),
    rename: patch("/account/passkeys/{id}")
      .input(t.object({ id: t.uuid(), name: PasskeyName }))
      .output(Passkey),
    remove: del("/account/passkeys/{id}").input(IdInput).output(t.void()),
  },
  oidc: {
    /** The linked account, or null when none is. */
    get: get("/account/oidc").output(OidcAccount.nullable()),
    unlink: del("/account/oidc").output(t.void()),
  },
  /** Where the account is signed in: browsers and apps. */
  sessions: {
    /** The current session first, then the most recently used. */
    list: get("/account/sessions").output(t.array(Session)),
    /** Sign out another session. The current one uses `auth.signOut`. */
    revoke: del("/account/sessions/{id}").input(IdInput).output(t.void()),
    /** Sign out everywhere else. Returns how many sessions ended. */
    revokeOthers: post("/account/sessions/revoke-others").output(
      t.object({ revoked: t.number().int() }),
    ),
  },
  /** The audio and subtitle choices this account syncs. */
  playback: {
    /** Save them. Returns the user with them. */
    setPreferences: put("/account/playback")
      .input(PlaybackPreferences)
      .output(User),
  },
  /** The theme choice this account syncs, and its own color themes. */
  theme: {
    /** Save the synced choice. Returns the user with it. */
    setPreferences: put("/account/theme")
      .input(SyncedThemePreferences)
      .output(User),
    /** The account's custom themes, oldest first. */
    list: get("/account/themes").output(t.array(UserTheme)),
    /**
     * Create or replace a theme by its client-made id. Fails with
     * CONFLICT past `MAX_USER_THEMES`.
     */
    save: put("/account/themes/{id}").input(UserTheme).output(UserTheme),
    /** Deleting a theme that's already gone succeeds. */
    remove: del("/account/themes/{id}")
      .input(t.object({ id: UserThemeId }))
      .output(t.void()),
  },
})
