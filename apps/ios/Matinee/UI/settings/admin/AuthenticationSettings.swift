import MatineeCore
import SwiftUI
import UIKit

/*
 * AuthenticationSettings.kt: passkeys, and the OpenID Connect provider for
 * single sign-on. The draft and its checks are MatineeCore's
 * (Admin/AuthForms.swift).
 */

/// How people sign in, as the web's authentication panel: passkeys, and the
/// OpenID Connect provider for single sign-on. The fields save together,
/// from the save bar; an empty one falls back to what the server's
/// environment sets, which it shows as the field's placeholder.
struct AuthenticationSettings: View {
  @State private var loader = Loader<AdminAuthSettings>()
  @State private var form: AuthDraft?
  @Environment(\.api) private var api

  var body: some View {
    SaveBarScaffold(
      Str.settingsAdminAuthentication, dirty: form?.dirty == true, canSave: form?.canSave == true,
      onReset: { form?.reset() },
      onSave: {
        guard let api, let input = form?.input() else { return }
        loader.show(try await api.admin.auth.update(authSettingsInput: input))
      }
    ) {
      AdminLoaded(loader, failed: Str.webOidcLoadFailed) { _ in
        if let binding = Binding($form) { AuthForm(form: binding) }
      }
    }
    .loads(loader) { api in try await api.admin.auth.get() }
    // A new answer, from the server or a save, starts the form again from it.
    .onChange(of: loader.state.value, initial: true) { _, saved in form = saved.map(AuthDraft.init) }
  }
}

private struct AuthForm: View {
  @Binding var form: AuthDraft
  @State private var advanced = false
  @Environment(\.palette) private var palette

  var body: some View {
    let saved = form.saved
    let defaults = saved.defaults
    let provider = [form.oidc.displayName, defaults.displayName].first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
      ?? Str.webOidcTitle
    VStack(alignment: .leading, spacing: 28) {
      SettingsSection(Str.webOidcPasskeysTitle) {
        VStack(alignment: .leading, spacing: 8) {
          Panel {
            SwitchRow(Str.webOidcPasskeysTitle, isOn: $form.passkeys.enabled, icon: .keyRound)
            RowDivider()
            SwitchRow(Str.webOidcPasskeysAllowSignUp, isOn: $form.passkeys.allowSignUp)
          }
          Note(Str.webOidcPasskeysAllowSignUpHint)
          // Accounts that can only sign in with a passkey, told before they're locked out.
          if !form.passkeys.enabled && saved.unlinkedUsers > 0 {
            Note(Str.webOidcPasskeysUnlinked(saved.unlinkedUsers, provider), color: palette.danger)
          }
        }
      }
      SettingsSection(Str.webOidcTitle) {
        VStack(alignment: .leading, spacing: 12) {
          VStack(alignment: .leading, spacing: 8) {
            Panel {
              SwitchRow(Str.webOidcEnabled, isOn: $form.oidc.enabled, icon: .logIn)
              RowDivider()
              SwitchRow(Str.webOidcAllowSignUp, isOn: $form.oidc.allowSignUp)
            }
            if !form.oidc.enabled && saved.ssoOnlyUsers > 0 {
              Note(Str.webOidcSsoOnly(saved.ssoOnlyUsers, provider), color: palette.danger)
            }
          }
          Panel {
            TextRow(
              Str.webOidcFieldDisplayName, text: $form.oidc.displayName, placeholder: blankToNil(defaults.displayName))
            RowDivider()
            TextRow(
              Str.webOidcFieldIssuerUrl, text: $form.oidc.issuerUrl,
              placeholder: blankToNil(defaults.issuerUrl) ?? "https://auth.example.com", keyboard: .URL,
              error: form.issuerInvalid ? Str.webOidcCheckField(Str.webOidcFieldIssuerUrl) : nil)
            RowDivider()
            TextRow(Str.webOidcFieldClientId, text: $form.oidc.clientId, placeholder: blankToNil(defaults.clientId))
            RowDivider()
            TextRow(
              Str.webOidcFieldClientSecret, text: Binding(get: { form.secret }, set: { form.typeSecret($0) }),
              placeholder: secretPlaceholder, secret: true
            ) {
              // Remove the saved secret, or take the removal back until the save.
              if form.offersSecretToggle {
                RoundIconButton(
                  form.dropSecret ? .rotateCcw : .trash,
                  label: form.dropSecret
                    ? Str.webOidcClientSecretKeep
                    : saved.clientSecret.environment ? Str.webOidcClientSecretUseEnvironment : Str.webOidcClientSecretRemove,
                  size: 36, iconSize: 18, tint: form.dropSecret ? palette.muted : palette.danger, background: .clear
                ) { form.dropSecret.toggle() }
                .padding(.trailing, -10)
              }
            }
            RowDivider()
            RedirectRow(url: saved.callbackUrl)
          }
          Panel {
            SwitchRow(Str.webOidcAdvanced, isOn: $advanced, icon: .settings)
            Reveal(advanced) {
              RowDivider()
              TextRow(
                Str.webOidcFieldScopes, text: $form.oidc.scopes,
                placeholder: blankToNil(defaults.scopes) ?? "openid profile email",
                error: form.scopesInvalid ? Str.webOidcScopesDescription : nil)
              RowDivider()
              TextRow(
                Str.webOidcFieldUsernameClaim, text: $form.oidc.usernameClaim,
                placeholder: blankToNil(defaults.usernameClaim) ?? "preferred_username")
              RowDivider()
              TextRow(Str.webOidcFieldRoleClaim, text: $form.oidc.roleClaim, placeholder: blankToNil(defaults.roleClaim))
            }
          }
        }
      }
    }
  }

  /// What's in use now, while the field is empty.
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

private func blankToNil(_ text: String) -> String? {
  text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
}

/// The redirect URI to register with the provider, with a way to copy it.
private struct RedirectRow: View {
  let url: String
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 4) {
      VStack(alignment: .leading, spacing: 0) {
        Text(Str.webOidcRedirectUri).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        Text(url).textStyle(.bodyMedium).foregroundStyle(palette.foreground).textSelection(.enabled)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      RoundIconButton(.link, label: Str.webOidcCopy, background: .clear) {
        UIPasteboard.general.string = url
        snackbar.show(Str.webOidcCopied)
      }
    }
    .padding(.leading, 16)
    .padding(.trailing, 8)
    .padding(.vertical, 12)
  }
}
