import 'dart:async';

import 'package:flutter/services.dart'
    show Clipboard, ClipboardData, TextInputType;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/matinee_api.dart';
import '../../../core/field_errors.dart';
import '../../../core/session.dart';
import '../../../core/toasts.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// How people sign in, as the Kotlin app's `AuthenticationSettings` and
/// the web's authentication panel: passkeys, and the OpenID Connect
/// provider for single sign-on. The fields save together from the save
/// bar. An empty field falls back to what the server's environment sets,
/// which shows as its placeholder. The server checks every value and says
/// at the field what's wrong with one.
class AuthenticationPage extends ConsumerWidget {
  const AuthenticationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final data = ref.watch(authSettingsProvider);
    final saved = data.value;
    if (saved == null) {
      return AdminPage(
        title: l.settingsAdminAuthentication,
        child: adminBody(
          context,
          data,
          onRetry: () => ref.invalidate(authSettingsProvider),
          loaded: (_) => const SizedBox(),
        ),
      );
    }
    return _AuthForm(key: ObjectKey(saved), saved: saved);
  }
}

/// The OIDC fields behind Advanced, by the key the server names them with.
const _advanced = {
  'scopes',
  'usernameClaim',
  'nameClaim',
  'roleClaim',
  'groupsClaim',
  'policyClaim',
};

class _AuthForm extends ConsumerStatefulWidget {
  const _AuthForm({super.key, required this.saved});

  final AdminAuthSettings saved;

  @override
  ConsumerState<_AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends ConsumerState<_AuthForm> {
  late PasskeySettings _passkeys = widget.saved.passkeys;

  /// The OIDC settings as JSON, for the fields to edit by name.
  late final JsonMap _original = widget.saved.oidc.toJson();
  late JsonMap _oidc = {..._original};
  String _secret = '';
  bool _dropSecret = false;
  bool _showAdvanced = false;
  Map<String, String> _errors = const {};

  /// A new secret to save, the saved one dropped, or the saved one kept.
  Explicit<String>? get _secretChange => _secret.trim().isNotEmpty
      ? Explicit(_secret.trim())
      : _dropSecret
      ? const Explicit(null)
      : null;

  bool get _dirty =>
      _passkeys.enabled != widget.saved.passkeys.enabled ||
      _passkeys.allowSignUp != widget.saved.passkeys.allowSignUp ||
      _original.keys.any((key) => _original[key] != _oidc[key]) ||
      _secretChange != null;

  String _text(String key) => switch (_oidc[key]) {
    final String text => text,
    _ => '',
  };

  bool _bool(String key) => _oidc[key] == true;

  void _set(String key, Object value) => setState(() {
    _oidc = {..._oidc, key: value};
    _errors = {..._errors}..remove('oidc.$key');
  });

  AuthSettingsInput _input() {
    final oidc = OidcSettings.fromJson(_oidc);
    return AuthSettingsInput(
      passkeys: _passkeys,
      oidc: OidcSettingsInput(
        enabled: oidc.enabled,
        allowSignUp: oidc.allowSignUp,
        signOutRefused: oidc.signOutRefused,
        displayName: oidc.displayName,
        issuerUrl: oidc.issuerUrl,
        clientId: oidc.clientId,
        scopes: oidc.scopes,
        usernameClaim: oidc.usernameClaim,
        nameClaim: oidc.nameClaim,
        roleClaim: oidc.roleClaim,
        groupsClaim: oidc.groupsClaim,
        policyClaim: oidc.policyClaim,
        clientSecret: _secretChange,
      ),
    );
  }

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    if (api == null) return;
    setState(() => _errors = const {});
    try {
      await api.admin.auth.update(_input());
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _errors = fieldErrors(error);
          // A field the server names opens Advanced if it's in there.
          if (_errors.keys.any(
            (key) => _advanced.any((field) => key == 'oidc.$field'),
          )) {
            _showAdvanced = true;
          }
        });
      }
      rethrow;
    }
    if (mounted) ref.invalidate(authSettingsProvider);
  }

  Future<void> _copy(String url) async {
    final l = AppLocalizations.of(context);
    final toasts = ref.read(toastProvider);
    await Clipboard.setData(ClipboardData(text: url));
    unawaited(toasts.show(l.webOidcCopied, kind: ToastKind.success));
  }

  Widget _field(
    String key,
    String label, {
    String? placeholder,
    String? hint,
    TextInputType? keyboardType,
  }) {
    final fallback = switch (widget.saved.defaults.toJson()[key]) {
      final String value when value.isNotEmpty => value,
      _ => placeholder,
    };
    return TextRow(
      label: label,
      value: _text(key),
      placeholder: fallback,
      hint: hint,
      keyboardType: keyboardType,
      error: _errors['oidc.$key'],
      onChanged: (value) => _set(key, value),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final saved = widget.saved;
    final secret = saved.clientSecret;
    final provider = [
      _text('displayName'),
      saved.defaults.displayName,
    ].firstWhere((name) => name.isNotEmpty, orElse: () => l.webOidcTitle);
    // What the server said about a field this page doesn't show.
    final shown = {
      'oidc.displayName',
      'oidc.issuerUrl',
      'oidc.clientId',
      'oidc.clientSecret',
      for (final field in _advanced) 'oidc.$field',
    };
    final others = [
      for (final MapEntry(:key, :value) in _errors.entries)
        if (!shown.contains(key)) value,
    ];
    return SaveBarPage(
      title: l.settingsAdminAuthentication,
      dirty: _dirty,
      onReset: () => setState(() {
        _passkeys = saved.passkeys;
        _oidc = {..._original};
        _secret = '';
        _dropSecret = false;
        _errors = const {};
      }),
      onSave: _save,
      child: AdminSections(
        bottom: !_dirty,
        sections: [
          SettingsSection(
            title: l.webOidcPasskeysTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    SwitchRow(
                      title: l.webOidcPasskeysTitle,
                      icon: Lucide.keyRound,
                      checked: _passkeys.enabled,
                      onChanged: (on) => setState(
                        () => _passkeys = PasskeySettings(
                          enabled: on,
                          allowSignUp: _passkeys.allowSignUp,
                        ),
                      ),
                    ),
                    SwitchRow(
                      title: l.webOidcPasskeysAllowSignUp,
                      checked: _passkeys.allowSignUp,
                      onChanged: (on) => setState(
                        () => _passkeys = PasskeySettings(
                          enabled: _passkeys.enabled,
                          allowSignUp: on,
                        ),
                      ),
                    ),
                  ],
                ),
                Note(l.webOidcPasskeysAllowSignUpHint),
                // Accounts that can only sign in with a passkey, told
                // before they're locked out.
                if (!_passkeys.enabled && saved.unlinkedUsers > 0)
                  Note(
                    l.webOidcPasskeysUnlinked(saved.unlinkedUsers, provider),
                    danger: true,
                  ),
              ],
            ),
          ),
          SettingsSection(
            title: l.webOidcTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    SwitchRow(
                      title: l.webOidcEnabled,
                      icon: Lucide.logIn,
                      checked: _bool('enabled'),
                      onChanged: (on) => _set('enabled', on),
                    ),
                    SwitchRow(
                      title: l.webOidcAllowSignUp,
                      checked: _bool('allowSignUp'),
                      onChanged: (on) => _set('allowSignUp', on),
                    ),
                  ],
                ),
                if (!_bool('enabled') && saved.ssoOnlyUsers > 0)
                  Note(
                    l.webOidcSsoOnly(saved.ssoOnlyUsers, provider),
                    danger: true,
                  ),
                const SizedBox(height: 4),
                Panel(
                  rows: [
                    _field('displayName', l.webOidcFieldDisplayName),
                    _field(
                      'issuerUrl',
                      l.webOidcFieldIssuerUrl,
                      placeholder: 'https://auth.example.com',
                      keyboardType: TextInputType.url,
                      hint: saved.defaults.issuerUrl.isEmpty
                          ? l.webOidcIssuerUrlDescription
                          : l.webOidcIssuerUrlOverride,
                    ),
                    _field('clientId', l.webOidcFieldClientId),
                    TextRow(
                      label: l.webOidcFieldClientSecret,
                      value: _secret,
                      secret: true,
                      error: _errors['oidc.clientSecret'],
                      // What's in use now, while the field is empty.
                      placeholder: _dropSecret && secret.environment
                          ? l.webOidcClientSecretEnvironmentApplies
                          : _dropSecret
                          ? l.webOidcClientSecretRemoved
                          : switch (secret.source) {
                              'saved' => l.webOidcClientSecretSaved,
                              'environment' =>
                                l.webOidcClientSecretFromEnvironment,
                              _ => l.webOidcClientSecretNone,
                            },
                      onChanged: (value) => setState(() {
                        _secret = value;
                        // A new secret replaces the saved one, so a
                        // removal no longer applies.
                        if (value.isNotEmpty) _dropSecret = false;
                        _errors = {..._errors}..remove('oidc.clientSecret');
                      }),
                      // Remove the saved secret, or take the removal back
                      // until the save.
                      trailing: secret.source == 'saved' && _secret.isEmpty
                          ? RoundIconButton(
                              icon: _dropSecret
                                  ? Lucide.rotateCcw
                                  : Lucide.trash,
                              label: _dropSecret
                                  ? l.webOidcClientSecretKeep
                                  : secret.environment
                                  ? l.webOidcClientSecretUseEnvironment
                                  : l.webOidcClientSecretRemove,
                              background: const Color(0x00000000),
                              color: _dropSecret
                                  ? colors.mutedForeground
                                  : colors.danger,
                              onPressed: () =>
                                  setState(() => _dropSecret = !_dropSecret),
                            )
                          : null,
                    ),
                    InfoRow(
                      title: l.webOidcRedirectUri,
                      lines: [saved.callbackUrl],
                      trailing: RoundIconButton(
                        icon: Lucide.link,
                        label: l.webOidcCopy,
                        background: const Color(0x00000000),
                        onPressed: () => unawaited(_copy(saved.callbackUrl)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Panel(
                  rows: [
                    SwitchRow(
                      title: l.webOidcAdvanced,
                      icon: Lucide.settings,
                      checked: _showAdvanced,
                      onChanged: (on) => setState(() => _showAdvanced = on),
                    ),
                    if (_showAdvanced) ...[
                      _field(
                        'scopes',
                        l.webOidcFieldScopes,
                        placeholder: 'openid profile email',
                        hint: l.webOidcScopesDescription,
                      ),
                      _field(
                        'usernameClaim',
                        l.webOidcFieldUsernameClaim,
                        placeholder: 'preferred_username',
                      ),
                      _field(
                        'nameClaim',
                        l.webOidcFieldNameClaim,
                        placeholder: 'name',
                      ),
                      _field(
                        'roleClaim',
                        l.webOidcFieldRoleClaim,
                        placeholder: l.webOidcClaimOff,
                      ),
                      _field(
                        'groupsClaim',
                        l.webOidcFieldGroupsClaim,
                        placeholder: l.webOidcClaimOff,
                        hint: l.webOidcGroupsClaimDescription,
                      ),
                      _field(
                        'policyClaim',
                        l.webOidcFieldPolicyClaim,
                        placeholder: l.webOidcClaimOff,
                        hint: l.webOidcPolicyClaimDescription,
                      ),
                      SwitchRow(
                        title: l.webOidcSignOutRefused,
                        checked: _bool('signOutRefused'),
                        onChanged: (on) => _set('signOutRefused', on),
                      ),
                    ],
                  ],
                ),
                if (_showAdvanced) Note(l.webOidcSignOutRefusedDescription),
                for (final message in others) Note(message, danger: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
