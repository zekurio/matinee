import 'dart:async';

import 'package:flutter/services.dart'
    show LengthLimitingTextInputFormatter, TextInputAction;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/field_errors.dart';
import '../../core/image_picker.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import 'settings_rows.dart';

/// The picture, the display name, and saving the name to the server.
class AccountProfileSection extends ConsumerStatefulWidget {
  const AccountProfileSection({super.key, required this.user});

  final User user;

  @override
  ConsumerState<AccountProfileSection> createState() =>
      AccountProfileSectionState();
}

class AccountProfileSectionState extends ConsumerState<AccountProfileSection> {
  late final TextEditingController _name;
  late User _user;

  /// What the server keeps, which the field starts from and returns to.
  late String _saved;
  bool _saving = false;
  bool _changingPicture = false;
  String? _nameError;

  @override
  void initState() {
    super.initState();
    _user = widget.user;
    _saved = widget.user.displayName ?? '';
    _name = TextEditingController(text: _saved)..addListener(_typed);
  }

  @override
  void didUpdateWidget(AccountProfileSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldName = oldWidget.user.displayName ?? '';
    final name = widget.user.displayName ?? '';
    if (oldName != name && _name.text == oldName) _name.text = name;
    _saved = name;
    _user = widget.user;
  }

  @override
  void dispose() {
    _name
      ..removeListener(_typed)
      ..dispose();
    super.dispose();
  }

  void _typed() => setState(() {});

  void _toast(String message, Object error) {
    unawaited(
      ref
          .read(toastProvider)
          .show(
            message,
            description: describeFailure(AppLocalizations.of(context), error),
            kind: ToastKind.error,
          ),
    );
  }

  Future<void> _saveName() async {
    final api = ref.read(apiProvider);
    final name = _name.text.trim();
    if (api == null || _saving || name == _saved) return;
    final l = AppLocalizations.of(context);
    setState(() {
      _saving = true;
      _nameError = null;
    });
    try {
      final updated = await api.account.profile.update(displayName: name);
      ref.read(sessionProvider.notifier).updateUser(updated);
      if (!mounted) return;
      final saved = updated.displayName ?? '';
      setState(() {
        _user = updated;
        _saved = saved;
        _name.text = saved;
        _saving = false;
      });
    } on Object catch (error) {
      if (!mounted) return;
      final errors = fieldErrors(l, error);
      setState(() {
        _saving = false;
        _nameError = errors['displayName'];
      });
      if (_nameError == null) _toast(l.accountDisplayNameSaveFailed, error);
    }
  }

  Future<void> _changePicture() async {
    final l = AppLocalizations.of(context);
    final picked = await Sheet.show<_PictureAction>(
      context,
      dismissLabel: l.commonCancel,
      builder: (context) => Sheet(
        title: l.accountPictureChange,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetItem(
              icon: Lucide.imageUp,
              label: l.accountPictureUpload,
              onPressed: () => Navigator.pop(context, _PictureAction.upload),
            ),
            if (_user.avatarUrl != null)
              SheetItem(
                icon: Lucide.trash,
                label: l.accountPictureRemove,
                destructive: true,
                onPressed: () => Navigator.pop(context, _PictureAction.remove),
              ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (picked) {
      case _PictureAction.upload:
        await _uploadPicture();
      case _PictureAction.remove:
        await _removePicture();
      case null:
        break;
    }
  }

  Future<void> _uploadPicture() async {
    final l = AppLocalizations.of(context);
    final picked = await ref.read(imagePickerProvider)(maxAvatarBytes);
    if (picked == null || !mounted) return;
    final type = picked.type;
    final bytes = picked.bytes;
    if (type == null || !imageTypes.contains(type)) {
      unawaited(
        ref
            .read(toastProvider)
            .show(l.accountPictureWrongType, kind: ToastKind.error),
      );
      return;
    }
    if (bytes == null || bytes.isEmpty) {
      unawaited(
        ref
            .read(toastProvider)
            .show(l.accountPictureUnreadable, kind: ToastKind.error),
      );
      return;
    }
    if (bytes.length > maxAvatarBytes) {
      unawaited(
        ref
            .read(toastProvider)
            .show(l.accountPictureTooBig, kind: ToastKind.error),
      );
      return;
    }
    final api = ref.read(apiProvider);
    if (api == null) return;
    setState(() => _changingPicture = true);
    try {
      final updated = await api.account.avatar.upload(
        file: FilePart(
          bytes: bytes,
          type: type,
          name: 'avatar.${type.substring(type.indexOf('/') + 1)}',
        ),
      );
      _savedUser(updated);
    } on Object catch (error) {
      if (mounted) _toast(l.accountPictureChangeFailed, error);
    } finally {
      if (mounted) setState(() => _changingPicture = false);
    }
  }

  Future<void> _removePicture() async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null) return;
    setState(() => _changingPicture = true);
    try {
      final updated = await api.account.avatar.remove();
      _savedUser(updated);
    } on Object catch (error) {
      if (mounted) _toast(l.accountPictureChangeFailed, error);
    } finally {
      if (mounted) setState(() => _changingPicture = false);
    }
  }

  /// The server's new user, wherever the app shows it.
  void _savedUser(User updated) {
    ref.read(sessionProvider.notifier).updateUser(updated);
    if (!mounted) return;
    setState(() {
      _user = updated;
      final name = updated.displayName ?? '';
      if (_name.text.trim() == _saved) {
        _saved = name;
        _name.text = name;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final changed = _name.text.trim() != _saved;
    return SettingsSection(
      title: l.accountProfileTitle,
      child: Panel(
        rows: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 16,
              children: [
                Row(
                  spacing: 16,
                  children: [
                    Avatar(url: _user.avatarUrl, name: _user.name, size: 64),
                    Expanded(
                      child: MatineeButton(
                        look: ButtonLook.outline,
                        size: ButtonSize.sm,
                        leading: Lucide.imageUp,
                        onPressed: _changingPicture ? null : _changePicture,
                        child: Text(l.accountPictureChange),
                      ),
                    ),
                  ],
                ),
                MatineeTextField(
                  controller: _name,
                  label: l.accountDisplayNameLabel,
                  placeholder: _user.username,
                  error: _nameError,
                  enabled: !_saving,
                  inputFormatters: [LengthLimitingTextInputFormatter(64)],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => unawaited(_saveName()),
                ),
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: MatineeButton(
                    look: ButtonLook.primary,
                    size: ButtonSize.sm,
                    onPressed: changed && !_saving
                        ? () => unawaited(_saveName())
                        : null,
                    child: Text(l.accountDisplayNameSave),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum _PictureAction { upload, remove }

/// The switches that say what the profile shows to others.
class AccountSharingSection extends ConsumerStatefulWidget {
  const AccountSharingSection({super.key, required this.user});

  final User user;

  @override
  ConsumerState<AccountSharingSection> createState() =>
      AccountSharingSectionState();
}

class AccountSharingSectionState extends ConsumerState<AccountSharingSection> {
  /// What the switch shows while the server saves it; null at rest.
  ProfileSharing? _pending;
  bool _saving = false;

  Future<void> _change(ProfileSharing next) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null || _saving) return;
    setState(() {
      _pending = next;
      _saving = true;
    });
    try {
      final updated = await api.account.profile.update(
        sharing: AccountProfileUpdateInputSharing(
          favorites: next.favorites,
          stats: next.stats,
        ),
      );
      ref.read(sessionProvider.notifier).updateUser(updated);
      if (mounted) {
        setState(() {
          _pending = null;
          _saving = false;
        });
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _pending = null;
        _saving = false;
      });
      unawaited(
        ref
            .read(toastProvider)
            .show(
              l.accountSharingFailed,
              description: describeFailure(l, error),
              kind: ToastKind.error,
            ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final sharing = _pending ?? widget.user.sharing;
    return SettingsSection(
      title: l.accountSharingTitle,
      child: Panel(
        rows: [
          SwitchRow(
            title: l.accountSharingFavorites,
            checked: sharing.favorites,
            onChanged: _saving
                ? null
                : (favorites) => unawaited(
                    _change(
                      ProfileSharing(
                        favorites: favorites,
                        stats: sharing.stats,
                      ),
                    ),
                  ),
          ),
          SwitchRow(
            title: l.accountSharingStats,
            checked: sharing.stats,
            onChanged: _saving
                ? null
                : (stats) => unawaited(
                    _change(
                      ProfileSharing(
                        favorites: sharing.favorites,
                        stats: stats,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
