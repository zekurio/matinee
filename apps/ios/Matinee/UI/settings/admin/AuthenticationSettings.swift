import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * AuthenticationSettings.kt: passkeys, and the OpenID Connect provider for
 * single sign-on, laid out as the web's authentication panel. The draft
 * and its checks are MatineeCore's (Admin/AuthForms.swift).
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
      if adminDemo("invalid") { form?.oidc.issuerUrl = "auth.example.com" }
    }
  }
}

private struct AuthForm: View {
  @Binding var form: AuthDraft
  @State private var advanced = false
  @Environment(\.adminPalette) private var palette

  var body: some View {
    let saved = form.saved
    let defaults = saved.defaults
    let provider = nonBlank(form.oidc.displayName) ?? nonBlank(defaults.displayName) ?? Str.webOidcTitle
    VStack(alignment: .leading, spacing: Space.section) {
      VStack(alignment: .leading, spacing: Space.s3) {
        ListSection(Str.webOidcPasskeysTitle) {
          MatineeKit.SwitchRow(Str.webOidcEnabled, icon: .keyRound, isOn: $form.passkeys.enabled)
          MatineeKit.SwitchRow(
            Str.webOidcPasskeysAllowSignUp, subtitle: Str.webOidcPasskeysAllowSignUpHint,
            isOn: $form.passkeys.allowSignUp)
        }
        // Accounts that can only sign in with a passkey, told before they're locked out.
        if !form.passkeys.enabled && saved.unlinkedUsers > 0 {
          Note(Str.webOidcPasskeysUnlinked(saved.unlinkedUsers, provider), color: palette.destructive)
        }
      }

      VStack(alignment: .leading, spacing: Space.s3) {
        ListSection(Str.webOidcTitle) {
          MatineeKit.SwitchRow(Str.webOidcEnabled, icon: .logIn, isOn: $form.oidc.enabled)
          MatineeKit.SwitchRow(Str.webOidcAllowSignUp, isOn: $form.oidc.allowSignUp)
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
              MatineeKit.RoundIconButton(
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
        if !form.oidc.enabled && saved.ssoOnlyUsers > 0 {
          Note(Str.webOidcSsoOnly(saved.ssoOnlyUsers, provider), color: palette.destructive)
        }
      }

      ListSection(Str.webOidcAccessTitle) {
        InputRow(
          Str.webOidcFieldGroupsClaim, text: $form.oidc.groupsClaim,
          placeholder: nonBlank(defaults.groupsClaim) ?? Str.webOidcClaimOff, help: Str.webOidcGroupsClaimDescription)
        InputRow(
          Str.webOidcFieldPolicyClaim, text: $form.oidc.policyClaim,
          placeholder: nonBlank(defaults.policyClaim) ?? Str.webOidcClaimOff, help: Str.webOidcPolicyClaimDescription)
        MatineeKit.SwitchRow(
          Str.webOidcSignOutRefused, subtitle: Str.webOidcSignOutRefusedDescription, isOn: $form.oidc.signOutRefused)
      }

      VStack(alignment: .leading, spacing: Space.s3) {
        Text(Str.webOidcAdvanced).textStyle(.base, weight: .semibold, tracking: .tight)
          .accessibilityAddTraits(.isHeader)
        // What most providers never need, behind a button as on the web.
        MatineeKit.MatineeButton(look: .outline, fullWidth: true) {
          MatineeKit.withMotion(MatineeKit.Motion.enter) { advanced.toggle() }
        } label: {
          HStack(spacing: Space.s1_5) {
            Text(advanced ? Str.webOidcAdvancedHide : Str.webOidcAdvancedShow).textStyle(.sm, weight: .medium)
            MatineeKit.LucideIcon(.chevronDown, size: 16, scales: false)
              .rotationEffect(.degrees(advanced ? 180 : 0))
          }
        }
        .accessibilityValue(advanced ? Str.webOidcAdvancedHide : Str.webOidcAdvancedShow)
        MatineeKit.Reveal(advanced) {
          ListBlock {
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
          .padding(.top, Space.s1)
        }
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

/// The redirect URI to register with the provider, in a field of its own
/// that can't be typed in, with Copy beside it, as the web has it.
private struct RedirectRow: View {
  let url: String
  @Environment(\.snackbar) private var snackbar
  @Environment(\.adminPalette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s2_5) {
      Text(Str.webOidcRedirectUri).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
      // Side by side, the address cut in its middle; at the accessibility sizes, Copy under it.
      if dynamicType.isAccessibilitySize {
        VStack(alignment: .leading, spacing: Space.s2) {
          field
          copy
        }
      } else {
        HStack(spacing: Space.s2) {
          field
          copy
        }
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s2_5)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var field: some View {
    Text(url)
      .textStyle(.sm)
      .foregroundStyle(palette.foreground)
      .lineLimit(dynamicType.isAccessibilitySize ? 3 : 1)
      .truncationMode(.middle)
      .textSelection(.enabled)
      .padding(.horizontal, Space.s3)
      .padding(.vertical, Space.s2)
      .frame(maxWidth: .infinity, minHeight: TouchTarget, alignment: .leading)
      .background(palette.field, in: RoundedRectangle.kit(Radius.lg))
      .overlay { RoundedRectangle.kit(Radius.lg).strokeBorder(palette.input) }
      .accessibilityLabel(Str.webOidcRedirectUri)
      .accessibilityValue(url)
  }

  private var copy: some View {
    MatineeKit.MatineeButton(Str.webOidcCopy, icon: .link, look: .outline) {
      UIPasteboard.general.string = url
      snackbar.show(Str.webOidcCopied)
    }
    .fixedSize()
  }
}
