import 'dart:async';

import 'package:flutter/services.dart'
    show Clipboard, ClipboardData, LengthLimitingTextInputFormatter;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/field_errors.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/failure_view.dart';
import '../../query/server_data.dart';
import 'settings_rows.dart';

/// The credentials services and apps call the API with as the account.
final accountApiTokensProvider = serverQuery(
  (api) => api.account.apiTokens.list(),
);

/// The tokens the account calls the API with, and making, changing, and
/// revoking them.
class AccountApiTokensSection extends ConsumerStatefulWidget {
  const AccountApiTokensSection({super.key, required this.user});

  final User user;

  @override
  ConsumerState<AccountApiTokensSection> createState() =>
      AccountApiTokensSectionState();
}

class AccountApiTokensSectionState
    extends ConsumerState<AccountApiTokensSection> {
  Future<void> _create() async {
    final l = AppLocalizations.of(context);
    await Dialog.show<void>(
      context,
      dismissLabel: l.commonCancel,
      builder: (context) => _TokenDialog(
        user: widget.user,
        onChanged: () => ref.invalidate(accountApiTokensProvider),
      ),
    );
  }

  Future<void> _edit(ApiToken token) async {
    final l = AppLocalizations.of(context);
    await Dialog.show<void>(
      context,
      dismissLabel: l.commonCancel,
      builder: (context) => _TokenDialog(
        user: widget.user,
        token: token,
        onChanged: () => ref.invalidate(accountApiTokensProvider),
      ),
    );
  }

  Future<void> _revoke(ApiToken token) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null) return;
    final yes = await ConfirmDialog.show(
      context,
      title: l.accountApiTokensRevokeTitle(token.name),
      description: l.accountApiTokensRevokeDescription,
      confirmLabel: l.accountApiTokensRevoke,
      cancelLabel: l.commonCancel,
      destructive: true,
    );
    if (!yes || !mounted) return;
    try {
      await api.account.apiTokens.revoke(token.id);
      ref.invalidate(accountApiTokensProvider);
      unawaited(
        ref
            .read(toastProvider)
            .show(
              l.accountApiTokensRevoked(token.name),
              kind: ToastKind.success,
            ),
      );
    } on Object catch (error) {
      unawaited(
        ref
            .read(toastProvider)
            .show(
              l.accountApiTokensRevokeFailed,
              description: describeFailure(l, error),
              kind: ToastKind.error,
            ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final tokens = ref.watch(accountApiTokensProvider);
    final list = tokens.value;
    final mayCreate = can(widget.user, Permission.apiTokenCreate);
    final mayEdit = can(widget.user, Permission.apiTokenUpdate);
    final mayRevoke = can(widget.user, Permission.apiTokenDelete);
    return SettingsSection(
      title: l.accountApiTokensTitle,
      action: mayCreate
          ? SectionAction(
              icon: Lucide.plus,
              label: l.accountApiTokensCreate,
              onPressed: _create,
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          if (list != null)
            if (list.isEmpty)
              Note(l.accountApiTokensEmpty)
            else
              for (final token in list)
                _ApiTokenRow(
                  token: token,
                  onEdit: mayEdit ? () => _edit(token) : null,
                  onRevoke: mayRevoke ? () => _revoke(token) : null,
                )
          else if (tokens.hasError)
            FailureState(
              title: l.accountApiTokensLoadFailed,
              error: tokens.error!,
              onRetry: () => ref.invalidate(accountApiTokensProvider),
            )
          else
            Text('…', style: KitText.sm.style(color: colors.mutedForeground)),
        ],
      ),
    );
  }
}

/// One token: what it's called, what it may do, when it was made and last
/// used, and changing or revoking it.
class _ApiTokenRow extends StatelessWidget {
  const _ApiTokenRow({
    required this.token,
    required this.onEdit,
    required this.onRevoke,
  });

  final ApiToken token;
  final VoidCallback? onEdit;
  final VoidCallback? onRevoke;

  String _date(String at, AppLocalizations l) {
    final date = DateTime.tryParse(at)?.toLocal();
    return date == null ? '—' : DateFormat.yMMMd(l.localeName).format(date);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final used = token.lastUsedAt;
    final details = [
      l.accountApiTokensCreated(_date(token.createdAt, l)),
      if (used == null)
        l.accountApiTokensNeverUsed
      else
        l.accountApiTokensUsed(_date(used, l)),
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: KitRadius.panel,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        spacing: 14,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.secondary,
              borderRadius: const BorderRadius.all(Radius.circular(10)),
            ),
            child: KitIcon(Lucide.keySquare, color: colors.mutedForeground),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  token.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.base.style(color: colors.foreground),
                ),
                Text(
                  token.permissions.contains(Permission.allValue)
                      ? l.accountApiTokensAllPermissions
                      : l.accountApiTokensPermissionCount(
                          token.permissions.length,
                        ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.px13.style(color: colors.mutedForeground),
                ),
                Text(
                  details,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.px13.style(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
          if (onEdit case final edit?)
            RoundIconButton(
              icon: Lucide.pencil,
              label: l.accountApiTokensEditNamed(token.name),
              size: 40,
              iconSize: 18,
              background: const Color(0x00000000),
              color: colors.mutedForeground,
              onPressed: edit,
            ),
          if (onRevoke case final revoke?)
            RoundIconButton(
              icon: Lucide.trash,
              label: l.accountApiTokensRevokeNamed(token.name),
              size: 40,
              iconSize: 18,
              background: const Color(0x00000000),
              color: colors.mutedForeground,
              onPressed: revoke,
            ),
        ],
      ),
    );
  }
}

/// Making a token or changing one: its name and what it may do. A new one
/// then shows its secret once, in place of the form.
class _TokenDialog extends ConsumerStatefulWidget {
  const _TokenDialog({required this.user, this.token, required this.onChanged});

  final User user;

  /// The token to change, or null to make one.
  final ApiToken? token;

  /// After the server kept a change, so the list behind reads again.
  final VoidCallback onChanged;

  @override
  ConsumerState<_TokenDialog> createState() => _TokenDialogState();
}

class _TokenDialogState extends ConsumerState<_TokenDialog> {
  late final TextEditingController _name;
  late final Set<String> _picked;
  late bool _pickedAll;
  CreatedApiToken? _created;
  bool _saving = false;
  bool _copied = false;
  Map<String, String> _errors = const {};
  String? _failure;
  String _search = '';

  @override
  void initState() {
    super.initState();
    final token = widget.token;
    _name = TextEditingController(text: token?.name ?? '');
    final permissions = token?.permissions ?? const <String>[];
    _pickedAll = permissions.contains(Permission.allValue);
    _picked = {
      for (final permission in permissions)
        if (permission != Permission.allValue) permission,
    };
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  /// What may be picked: what the account may do, and what a token already
  /// has even if the account no longer holds it.
  List<String> get _offered {
    final existing = widget.token?.permissions ?? const <String>[];
    return [
      for (final permission in Permission.all)
        if (permission != Permission.allValue &&
            (can(widget.user, permission) || existing.contains(permission)))
          permission,
    ];
  }

  Future<void> _submit() async {
    final api = ref.read(apiProvider);
    if (api == null || _saving) return;
    final l = AppLocalizations.of(context);
    final name = _name.text.trim();
    final permissions = _pickedAll
        ? <String>[Permission.allValue]
        : sortPermissions(_picked);
    setState(() {
      _saving = true;
      _errors = const {};
      _failure = null;
    });
    try {
      if (widget.token case final token?) {
        await api.account.apiTokens.update(
          token.id,
          name: name,
          permissions: permissions,
        );
        widget.onChanged();
        if (mounted) Navigator.of(context).pop();
      } else {
        final created = await api.account.apiTokens.create(
          ApiTokenInput(name: name, permissions: permissions),
        );
        widget.onChanged();
        if (mounted) {
          setState(() {
            _created = created;
            _saving = false;
          });
        }
      }
    } on Object catch (error) {
      if (!mounted) return;
      final errors = fieldErrors(l, error);
      setState(() {
        _saving = false;
        _errors = errors;
        _failure =
            errors.containsKey('name') || errors.containsKey('permissions')
            ? null
            : describeFailure(l, error);
      });
    }
  }

  Future<void> _copy(String secret) async {
    await Clipboard.setData(ClipboardData(text: secret));
    if (mounted) setState(() => _copied = true);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final created = _created;
    if (created != null) {
      return PopScope(
        canPop: false,
        child: Dialog(
          title: l.accountApiTokensSecretTitle(created.apiToken.name),
          description: l.accountApiTokensSecretDescription,
          actions: [
            MatineeButton(
              look: ButtonLook.outline,
              leading: _copied ? Lucide.check : Lucide.copy,
              onPressed: () => unawaited(_copy(created.token)),
              child: Text(
                _copied ? l.accountApiTokensCopied : l.accountApiTokensCopy,
              ),
            ),
            MatineeButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l.accountApiTokensDone),
            ),
          ],
          child: Semantics(
            label: l.accountApiTokensSecretLabel,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: MatineeTheme.of(context).field,
                borderRadius: KitRadius.control,
                border: Border.all(color: MatineeTheme.of(context).inputBorder),
              ),
              child: Text(
                created.token,
                style: KitText.px13.style(
                  color: MatineeTheme.of(context).foreground,
                ),
              ),
            ),
          ),
        ),
      );
    }
    final colors = MatineeTheme.of(context);
    final offered = _offered;
    final needle = _search.trim().toLowerCase();
    final shown = [
      for (final permission in offered)
        if (needle.isEmpty || permission.toLowerCase().contains(needle))
          permission,
    ];
    final groups = <String, List<String>>{};
    for (final permission in shown) {
      groups.putIfAbsent(permission.split('.').first, () => []).add(permission);
    }
    final failure = _failure;
    final token = widget.token;
    return PopScope(
      // A dismissal while the server makes it would lose the secret.
      canPop: !_saving,
      child: Dialog(
        title: token == null
            ? l.accountApiTokensCreateTitle
            : l.accountApiTokensEditTitle(token.name),
        description: token == null
            ? l.accountApiTokensCreateDescription
            : l.accountApiTokensEditDescription,
        actions: [
          MatineeButton(
            look: ButtonLook.ghost,
            onPressed: _saving ? null : () => Navigator.of(context).pop(),
            child: Text(l.commonCancel),
          ),
          MatineeButton(
            onPressed: _saving ? null : () => unawaited(_submit()),
            child: Text(
              token == null ? l.accountApiTokensCreate : l.accountApiTokensSave,
            ),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 16,
          children: [
            MatineeTextField(
              controller: _name,
              label: l.accountApiTokensName,
              placeholder: l.accountApiTokensNamePlaceholder,
              error: _errors['name'],
              enabled: !_saving,
              autocorrect: false,
              inputFormatters: [LengthLimitingTextInputFormatter(64)],
            ),
            Text(
              l.accountApiTokensPermissions,
              style: KitText.sm.style(
                color: colors.foreground,
                weight: FontWeight.w500,
              ),
            ),
            SwitchRow(
              title: l.accountApiTokensAllPermissions,
              description: l.accountApiTokensAllPermissionsHint,
              checked: _pickedAll,
              onChanged: _saving
                  ? null
                  : (all) => setState(() => _pickedAll = all),
            ),
            if (!_pickedAll) ...[
              MatineeTextField(
                placeholder: l.accountApiTokensSearch,
                enabled: !_saving,
                autocorrect: false,
                leading: Lucide.search,
                onChanged: (value) => setState(() => _search = value),
              ),
              if (shown.isEmpty)
                Note(l.accountApiTokensNoMatch)
              else
                SizedBox(
                  height: 240,
                  child: ListView(
                    children: [
                      for (final entry in groups.entries) ...[
                        Padding(
                          padding: const EdgeInsetsDirectional.fromSTEB(
                            4,
                            10,
                            4,
                            4,
                          ),
                          child: Text(
                            entry.key,
                            style: KitText.px13.style(
                              color: colors.mutedForeground,
                              weight: FontWeight.w600,
                            ),
                          ),
                        ),
                        for (final permission in entry.value)
                          _PermissionRow(
                            permission: permission,
                            checked: _picked.contains(permission),
                            onChanged: _saving
                                ? null
                                : (on) => setState(() {
                                    if (on) {
                                      _picked.add(permission);
                                    } else {
                                      _picked.remove(permission);
                                    }
                                  }),
                          ),
                      ],
                    ],
                  ),
                ),
            ],
            if (_errors['permissions'] case final message?)
              Note(message, danger: true),
            if (failure != null) Note(failure, danger: true),
          ],
        ),
      ),
    );
  }
}

/// One permission a token may hold, its box and API name on a whole row.
class _PermissionRow extends StatelessWidget {
  const _PermissionRow({
    required this.permission,
    required this.checked,
    required this.onChanged,
  });

  final String permission;
  final bool checked;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final change = onChanged;
    return PressIndication(
      onPressed: change == null ? null : () => change(!checked),
      label: permission,
      button: false,
      checked: checked,
      shape: KitRadius.control,
      builder: (context, state) => Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          borderRadius: KitRadius.control,
          color: colors.foreground.withValues(
            alpha: state == PressState.idle ? 0 : .06,
          ),
        ),
        child: Row(
          spacing: 10,
          children: [
            SizedBox.square(
              dimension: 20,
              child: IgnorePointer(
                child: OverflowBox(
                  maxWidth: 38,
                  maxHeight: 38,
                  child: ExcludeSemantics(
                    child: Checkbox(checked: checked, onChanged: (_) {}),
                  ),
                ),
              ),
            ),
            Expanded(
              child: Text(
                permission,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.px13.style(color: colors.foreground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
