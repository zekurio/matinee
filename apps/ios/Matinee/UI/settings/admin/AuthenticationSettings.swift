import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * AuthenticationSettings.kt: passkeys, and the OpenID Connect provider for
 * single sign-on, laid out as Android's: each a heading over its switches,
 * the provider's fields in a block of their own under them, and the
 * claims most providers never need behind a switch. The access claims,
 * which Android lacks, follow in a section of their own. The draft and its
 * checks are MatineeCore's (Admin/AuthForms.swift).
 */

/// How people sign in: passkeys, and the OpenID Connect provider for single
/// sign-on, with the claims it reads. The fields save together, from the
/// save bar; an empty one falls back to what the server's environment sets,
/// which it shows as the field's placeholder.
struct AuthenticationSettings: View {
  @State private var loader = Loader<AdminAuthSettings>()
  @State private var form: AuthDraft?
  @Environment(\.api) private var api

  var body: some View {
    SaveBarPage(
      Str.settingsAdminAuthentication, dirty: form?.dirty == true, canSave: form?.canSave == true,
      onReset: { form?.reset() },
      onSave: {
        guard let api, let input = form?.input() else { return }
        loader.show(try await api.admin.auth.update(authSettingsInput: input))
      }
    ) {
      AdminLoaded(loader) { _ in
        if let binding = Binding($form) { AuthForm(form: binding) }
      }
    }
    .loads(loader) { api in try await api.admin.auth.get() }
    // A new answer, from the server or a save, starts the form again from it.
    .onChange(of: loader.state.value, initial: true) { _, saved in
      form = saved.map(AuthDraft.init)
    }
  }
}

private struct AuthForm: View {
  @Binding var form: AuthDraft
  @State private var advanced = false
  @Environment(\.palette) private var palette

  var body: some View {
    let saved = form.saved
    let defaults = saved.defaults
    let provider = nonBlank(form.oidc.displayName) ?? nonBlank(defaults.displayName) ?? Str.webOidcTitle
    VStack(alignment: .leading, spacing: SETTINGS_SPACING) {
      VStack(alignment: .leading, spacing: Space.s2) {
        ListSection(Str.webOidcPasskeysTitle, footer: Str.webOidcPasskeysAllowSignUpHint) {
          SwitchRow(Str.webOidcPasskeysTitle, icon: .keyRound, isOn: $form.passkeys.enabled)
          SwitchRow(Str.webOidcPasskeysAllowSignUp, isOn: $form.passkeys.allowSignUp)
        }
        // Accounts that can only sign in with a passkey, told before they're locked out.
        if !form.passkeys.enabled && saved.unlinkedUsers > 0 {
          Note(Str.webOidcPasskeysUnlinked(saved.unlinkedUsers, provider), color: palette.destructive)
        }
      }

      SettingsSection(Str.webOidcTitle, spacing: 0) {
        ListBlock {
          SwitchRow(Str.webOidcEnabled, icon: .logIn, isOn: $form.oidc.enabled)
          SwitchRow(Str.webOidcAllowSignUp, isOn: $form.oidc.allowSignUp)
        }
        .padding(.top, Space.s3_5)
        if !form.oidc.enabled && saved.ssoOnlyUsers > 0 {
          Note(Str.webOidcSsoOnly(saved.ssoOnlyUsers, provider), color: palette.destructive)
            .padding(.top, Space.s2)
        }
        ListBlock {
          InputRow(
            Str.webOidcFieldDisplayName, text: $form.oidc.displayName,
            placeholder: nonBlank(defaults.displayName) ?? Str.webOidcTitle)
          InputRow(
            Str.webOidcFieldIssuerUrl, text: $form.oidc.issuerUrl,
            placeholder: nonBlank(defaults.issuerUrl) ?? "https://auth.example.com",
            help: Str.webOidcIssuerUrlDescription,
            error: form.issuerInvalid ? Str.webOidcCheckField(Str.webOidcFieldIssuerUrl) : nil
          )
          .keyboardType(.URL)
          .textContentType(.URL)
          InputRow(Str.webOidcFieldClientId, text: $form.oidc.clientId, placeholder: nonBlank(defaults.clientId) ?? "")
          InputRow(
            Str.webOidcFieldClientSecret, text: Binding(get: { form.secret }, set: { form.typeSecret($0) }),
            placeholder: secretPlaceholder, kind: .secure
          ) {
            // Remove the saved secret, or take the removal back until the save.
            if form.offersSecretToggle {
              RoundIconButton(
                form.dropSecret ? .rotateCcw : .trash,
                label: form.dropSecret
                  ? Str.webOidcClientSecretKeep
                  : saved.clientSecret.environment ? Str.webOidcClientSecretUseEnvironment : Str.webOidcClientSecretRemove,
                look: .ghost, size: 32, iconSize: 18,
                tint: form.dropSecret ? palette.mutedForeground : palette.destructive
              ) { form.dropSecret.toggle() }
            }
          }
          .textContentType(.password)
          RedirectRow(url: saved.callbackUrl)
        }
        .padding(.top, Space.s3)
        ListBlock {
          SwitchRow(
            Str.webOidcAdvanced, icon: .settings,
            isOn: Binding(get: { advanced }, set: { on in withMotion(Motion.enter) { advanced = on } }))
          if advanced {
            InputRow(
              Str.webOidcFieldScopes, text: $form.oidc.scopes,
              placeholder: nonBlank(defaults.scopes) ?? "openid profile email",
              help: Str.webOidcScopesDescription,
              error: form.scopesInvalid ? Str.webOidcScopesDescription : nil)
            InputRow(
              Str.webOidcFieldUsernameClaim, text: $form.oidc.usernameClaim,
              placeholder: nonBlank(defaults.usernameClaim) ?? "preferred_username")
            InputRow(
              Str.webOidcFieldNameClaim, text: $form.oidc.nameClaim, placeholder: nonBlank(defaults.nameClaim) ?? "name")
            InputRow(
              Str.webOidcFieldRoleClaim, text: $form.oidc.roleClaim,
              placeholder: nonBlank(defaults.roleClaim) ?? Str.webOidcClaimOff)
          }
        }
        .padding(.top, Space.s3)
      }

      ListSection(Str.webOidcAccessTitle) {
        InputRow(
          Str.webOidcFieldGroupsClaim, text: $form.oidc.groupsClaim,
          placeholder: nonBlank(defaults.groupsClaim) ?? Str.webOidcClaimOff, help: Str.webOidcGroupsClaimDescription)
        InputRow(
          Str.webOidcFieldPolicyClaim, text: $form.oidc.policyClaim,
          placeholder: nonBlank(defaults.policyClaim) ?? Str.webOidcClaimOff, help: Str.webOidcPolicyClaimDescription)
        SwitchRow(
          Str.webOidcSignOutRefused, subtitle: Str.webOidcSignOutRefusedDescription, isOn: $form.oidc.signOutRefused)
      }
    }
    // Nothing an admin types here is a sentence.
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .submitLabel(.done)
  }

  /// What's in use now, while the secret's field is empty.
  private var secretPlaceholder: String {
    switch form.secretState {
    case .environmentApplies: Str.webOidcClientSecretEnvironmentApplies
    case .removed: Str.webOidcClientSecretRemoved
    case .saved: Str.webOidcClientSecretSaved
    case .fromEnvironment: Str.webOidcClientSecretFromEnvironment
    case .none: Str.webOidcClientSecretNone
    }
  }
}

/// The redirect URI to register with the provider, as Android's row: its
/// name muted over the address, and Copy, a link icon, at the end.
private struct RedirectRow: View {
  let url: String
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s2) {
      VStack(alignment: .leading, spacing: 0) {
        Text(Str.webOidcRedirectUri).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        Text(url).textStyle(.sm).foregroundStyle(palette.foreground).textSelection(.enabled)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      RoundIconButton(.link, label: Str.webOidcCopy, look: .ghost, size: 44, iconSize: 20) {
        UIPasteboard.general.string = url
        snackbar.show(Str.webOidcCopied)
      }
    }
    .padding(.leading, Space.s4)
    .padding(.trailing, Space.s2)
    .padding(.vertical, Space.s3)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
