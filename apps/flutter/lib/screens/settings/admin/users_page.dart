import 'dart:async';

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/failure_text.dart';
import '../../../core/field_errors.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../core/toasts.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../media/avatar.dart';
import '../../../media/format.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// What an admin is about to do to an account, waiting for a yes.
enum _UserAction { role, signOut, revokeTokens, delete }

/// What the account in use may do to others, as the web's users panel
/// reads it from its permissions. The server also keeps anyone from
/// changing an account that may do more than they may.
typedef _May = ({
  bool access,
  bool role,
  bool signOut,
  bool revokeTokens,
  bool delete,
});

_May _mayOf(WidgetRef ref) => (
  access:
      ref.watch(canProvider(Permission.adminUserUpdate)) &&
      ref.watch(canProvider(Permission.groupRead)),
  // Making an admin hands over every permission, so it takes them all.
  role: ref.watch(canProvider(Permission.allValue)),
  signOut: ref.watch(canProvider(Permission.adminSessionDelete)),
  revokeTokens: ref.watch(canProvider(Permission.adminApiTokenDelete)),
  delete: ref.watch(canProvider(Permission.adminUserDelete)),
);

/// How the server lets people sign in now, for whether an account can.
typedef _SignIn = ({bool passkeys, String? oidc});

_SignIn _signInOf(AuthConfig? config) =>
    (passkeys: config?.passkeys ?? true, oidc: config?.oidc?.displayName);

/// Everyone's accounts, as the web's users panel: who they are, how they sign
/// in, when they were last here, the API tokens they made, and the groups
/// they're in. A tap offers their access, the admin role, signing out
/// everywhere, revoking their API tokens, and deleting the account, each but
/// the first asked first, and each only as the account in use's permissions
/// allow; the server keeps one admin who can sign in, so the page says so
/// rather than ask. Under them, for an account that may read them, the invite
/// links: making one, and revoking one that still works.
class UsersPage extends ConsumerWidget {
  const UsersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final users = ref.watch(adminUsersProvider);
    final signIn = _signInOf(ref.watch(authConfigProvider).value);
    final me = selfId(ref.watch(authStateProvider));
    final may = _mayOf(ref);
    final invites = ref.watch(canProvider(Permission.inviteRead));
    return AdminPage(
      title: l.settingsAdminUsers,
      child: adminBody(
        context,
        users,
        onRetry: () => ref.invalidate(adminUsersProvider),
        loaded: (list) {
          // An admin who can sign in now, by a method that's on.
          bool canSignIn(AdminUser user) =>
              (signIn.passkeys && user.passkeys > 0) ||
              (signIn.oidc != null && user.oidcLinked);
          final signInAdmins = list.where(
            (user) => user.isAdmin && canSignIn(user),
          );
          bool lastAdmin(AdminUser user) =>
              user.isAdmin &&
              signInAdmins.every((other) => other.id == user.id);
          return AdminSections(
            sections: [
              Panel(
                rows: [
                  for (final user in list)
                    _UserRow(
                      user: user,
                      self: user.id == me,
                      signIn: signIn,
                      onPressed:
                          _items(
                            context,
                            ref,
                            user,
                            may,
                            self: user.id == me,
                            lastAdmin: lastAdmin(user),
                          ).isEmpty
                          ? null
                          : () => unawaited(
                              _act(
                                context,
                                ref,
                                user,
                                may,
                                self: user.id == me,
                                lastAdmin: lastAdmin(user),
                              ),
                            ),
                    ),
                ],
              ),
              if (invites) _Invites(passkeys: signIn.passkeys),
            ],
          );
        },
      ),
    );
  }

  /// What [may] lets the account in use do to [user], as its sheet's
  /// items.
  List<(String, String, VoidCallback, bool)> _items(
    BuildContext context,
    WidgetRef ref,
    AdminUser user,
    _May may, {
    required bool self,
    required bool lastAdmin,
  }) {
    // Only an admin changes an admin's account, their own aside: the
    // server's peer check is the role, not a permission.
    if (user.isAdmin && !may.role && !self) return const [];
    final l = AppLocalizations.of(context);
    void blocked() =>
        unawaited(ref.read(toastProvider).show(l.webUsersLastAdmin));
    void ask(_UserAction action) =>
        unawaited(_confirm(context, ref, user, action, self: self));
    return [
      // An admin's access is everything, so there's nothing to set.
      if (may.access && !user.isAdmin)
        (
          Lucide.listFilter,
          l.webUsersMenuAccess,
          () => unawaited(context.push(Routes.userAccess(user.id))),
          false,
        ),
      if (may.role)
        (
          Lucide.shield,
          !user.isAdmin
              ? l.webUsersMenuMakeAdmin
              : self
              ? l.webUsersMenuStepDown
              : l.webUsersMenuRemoveAdmin,
          () => lastAdmin ? blocked() : ask(_UserAction.role),
          false,
        ),
      if (may.signOut && user.sessions > (self ? 1 : 0))
        (
          Lucide.logOut,
          self ? l.webUsersMenuSignOutOthers : l.webUsersMenuSignOut,
          () => ask(_UserAction.signOut),
          false,
        ),
      if (may.revokeTokens && user.apiTokens > 0)
        (
          Lucide.keySquare,
          l.webUsersMenuRevokeTokens,
          () => ask(_UserAction.revokeTokens),
          false,
        ),
      if (may.delete)
        (
          Lucide.trash,
          self ? l.webUsersMenuDeleteOwn : l.webUsersMenuDelete,
          () => lastAdmin ? blocked() : ask(_UserAction.delete),
          true,
        ),
    ];
  }

  Future<void> _act(
    BuildContext context,
    WidgetRef ref,
    AdminUser user,
    _May may, {
    required bool self,
    required bool lastAdmin,
  }) => pickFrom(
    context,
    title: user.name,
    description: '@${user.username}',
    items: _items(context, ref, user, may, self: self, lastAdmin: lastAdmin),
  );

  Future<void> _confirm(
    BuildContext context,
    WidgetRef ref,
    AdminUser user,
    _UserAction action, {
    required bool self,
  }) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    final toasts = ref.read(toastProvider);
    final session = ref.read(sessionProvider.notifier);
    final makeAdmin = !user.isAdmin;
    final stepDown = self && user.isAdmin;
    final (title, description, confirm) = switch (action) {
      _UserAction.role when makeAdmin => (
        l.webUsersRoleMakeTitle(user.name),
        l.webUsersRoleMakeDescription,
        l.webUsersRoleMakeConfirm,
      ),
      _UserAction.role when stepDown => (
        l.webUsersRoleStepDownTitle,
        l.webUsersRoleStepDownDescription,
        l.webUsersRoleStepDownConfirm,
      ),
      _UserAction.role => (
        l.webUsersRoleRemoveTitle(user.name),
        l.webUsersRoleRemoveDescription,
        l.webUsersRoleRemoveConfirm,
      ),
      _UserAction.signOut when self => (
        l.webUsersSignOutOwnTitle,
        l.webUsersSignOutOwnDescription,
        l.webUsersSignOutOwnConfirm,
      ),
      _UserAction.signOut => (
        l.webUsersSignOutTitle(user.name),
        l.webUsersSignOutDescription,
        l.webUsersSignOutConfirm,
      ),
      _UserAction.revokeTokens => (
        self
            ? l.webUsersRevokeTokensOwnTitle
            : l.webUsersRevokeTokensTitle(user.name),
        l.webUsersRevokeTokensDescription,
        l.webUsersRevokeTokensConfirm,
      ),
      _UserAction.delete when self => (
        l.webUsersDeleteOwnTitle,
        l.webUsersDeleteOwnDescription,
        l.webUsersDeleteOwnConfirm,
      ),
      _UserAction.delete => (
        l.webUsersDeleteTitle(user.name),
        l.webUsersDeleteDescription,
        l.webUsersDeleteConfirm,
      ),
    };
    final yes = await ConfirmDialog.show(
      context,
      title: title,
      description: description,
      confirmLabel: confirm,
      cancelLabel: l.webUsersDialogCancel,
      // Making an admin takes nothing away; the web asks in its plain look.
      destructive: !(action == _UserAction.role && makeAdmin),
    );
    if (!yes || api == null) return;
    await runAction(ref, l, () async {
      switch (action) {
        case _UserAction.role:
          final updated = await api.admin.users.setRole(
            user.id,
            role: makeAdmin ? UserRole.admin : UserRole.user,
          );
          unawaited(
            toasts.show(
              makeAdmin
                  ? l.webUsersMadeAdmin(user.name)
                  : stepDown
                  ? l.webUsersSteppedDown
                  : l.webUsersRemovedAdmin(user.name),
              kind: ToastKind.success,
            ),
          );
          // Without the role the admin pages go; the session shows the
          // account as the server has it now, and Settings follows.
          if (stepDown) {
            session.updateUser(userOf(updated));
            if (context.mounted) context.pop();
            return;
          }
        case _UserAction.signOut:
          final ended = (await api.admin.users.signOut(user.id)).ended;
          unawaited(
            toasts.show(
              self
                  ? l.webUsersEndedOwnSessions(ended)
                  : l.webUsersEndedSessions(ended, user.name),
              kind: ToastKind.success,
            ),
          );
        case _UserAction.revokeTokens:
          final revoked = (await api.admin.users.revokeApiTokens(user.id))
              .revoked;
          unawaited(
            toasts.show(
              l.webUsersRevokedTokens(revoked, user.name),
              kind: ToastKind.success,
            ),
          );
        case _UserAction.delete:
          await api.admin.users.remove(user.id);
          // The account gone, its session goes with it.
          if (self) {
            await session.signOut();
            return;
          }
          unawaited(
            toasts.show(l.webUsersDeleted(user.name), kind: ToastKind.success),
          );
      }
    });
    if (context.mounted) ref.invalidate(adminUsersProvider);
  }
}

/// An account: its picture, name, role, how and when it signs in, and its
/// groups.
class _UserRow extends StatelessWidget {
  const _UserRow({
    required this.user,
    required this.self,
    required this.signIn,
    required this.onPressed,
  });

  final AdminUser user;
  final bool self;
  final _SignIn signIn;

  /// Null when the account in use may do nothing to this one.
  final VoidCallback? onPressed;

  /// Where the account stands, then how it signs in, then its API tokens:
  /// a service can still call the API with a token of an account nobody
  /// signs in to.
  List<String> _facts(AppLocalizations l) => [
    ..._signInFacts(l),
    if (user.apiTokens > 0) l.webUsersApiTokens(user.apiTokens),
  ];

  List<String> _signInFacts(AppLocalizations l) {
    if (user.passkeys == 0 && !user.oidcLinked) return [l.webUsersNoSignIn];
    final seen = DateTime.tryParse(user.lastSeenAt ?? '');
    return [
      if (self)
        l.webUsersActiveNow
      else if (seen == null) ...[
        l.webUsersSignedOut,
        // When it came, which the web shows on hover, for an account that was
        // never seen.
        ?_joined(l),
      ]
      // The server moves a session's last-seen time at most hourly.
      else if (DateTime.now().difference(seen) < const Duration(hours: 1))
        l.webUsersActiveRecently
      else
        l.webUsersLastSeen(relativeTime(l, seen)),
      if (user.passkeys > 0)
        signIn.passkeys
            ? l.webUsersPasskeys(user.passkeys)
            : l.webUsersPasskeysOff(user.passkeys),
      if (user.oidcLinked) signIn.oidc ?? l.webUsersOidcOff,
    ];
  }

  String? _joined(AppLocalizations l) {
    final created = DateTime.tryParse(user.createdAt)?.toLocal();
    if (created == null) return null;
    return l.webUsersJoined(formatDate(created, l));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final groups = user.access.groups;
    final own = user.access.override.toJson().isNotEmpty;
    final noSignIn = user.passkeys == 0 && !user.oidcLinked;
    return PressIndication(
      onPressed: onPressed,
      label: l.webUsersActions(user.name),
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 14,
              children: [
                Avatar(url: user.avatarUrl, name: user.name),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Row(
                        spacing: 8,
                        children: [
                          Flexible(
                            child: Text(
                              self ? l.statsNameYou(user.name) : user.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: KitText.base.style(
                                color: colors.foreground,
                              ),
                            ),
                          ),
                          if (user.isAdmin)
                            Badge(l.webUsersAdmin, outlined: true),
                        ],
                      ),
                      Text(
                        _facts(l).join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.sm.style(
                          color: noSignIn
                              ? colors.warning
                              : colors.mutedForeground,
                        ),
                      ),
                      if (groups.isNotEmpty || own)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Wrap(
                            spacing: 4,
                            runSpacing: 4,
                            children: [
                              for (final group in groups) Badge(group.name),
                              if (own)
                                Badge(l.webUsersOwnAccess, outlined: true),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The invite links: one makes an account with a passkey while sign-up
/// is closed, so without passkeys none can be made.
///
/// Making one takes `invite.create`, and revoking one `invite.delete`.
class _Invites extends ConsumerWidget {
  const _Invites({required this.passkeys});

  final bool passkeys;

  Future<void> _revoke(
    BuildContext context,
    WidgetRef ref,
    Invite invite,
  ) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    final label = invite.label;
    final yes = await ConfirmDialog.show(
      context,
      title: label == null
          ? l.webUsersInvitesRevoke
          : l.webUsersInvitesRevokeNamed(label),
      description: l.adminInviteRevokeDescription,
      confirmLabel: l.adminInviteRevokeConfirm,
      cancelLabel: l.webUsersDialogCancel,
      destructive: true,
    );
    if (!yes || api == null) return;
    final done = await runAction(
      ref,
      l,
      () => api.admin.invites.revoke(invite.id),
      failure: l.webUsersInvitesRevokeFailed,
    );
    if (!context.mounted) return;
    if (done) {
      unawaited(
        ref
            .read(toastProvider)
            .show(l.webUsersInvitesRevoked, kind: ToastKind.success),
      );
    }
    ref.invalidate(adminInvitesProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final invites = ref.watch(adminInvitesProvider);
    final list = invites.value;
    final error = invites.error;
    final create = passkeys && ref.watch(canProvider(Permission.inviteCreate));
    final revoke = ref.watch(canProvider(Permission.inviteDelete));
    return SettingsSection(
      title: l.webUsersInvitesTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          if (!passkeys) Note(l.webUsersInvitesPasskeysOff),
          if (list == null && error != null)
            Note(l.webUsersInvitesLoadFailed(describeFailure(l, error)))
          else if (list == null)
            const SkeletonBox(height: 64, radius: KitRadius.xl)
          else if (list.isEmpty)
            if (create) Note(l.webUsersInvitesEmpty) else const SizedBox()
          else
            Panel(
              rows: [
                for (final invite in list)
                  _InviteRow(
                    invite: invite,
                    onRevoke: revoke
                        ? () => unawaited(_revoke(context, ref, invite))
                        : null,
                  ),
              ],
            ),
          if (create)
            MatineeButton(
              look: ButtonLook.outline,
              leading: Lucide.plus,
              onPressed: () => unawaited(
                Dialog.show<void>(
                  context,
                  dismissLabel: l.commonCancel,
                  builder: (context) => const _InviteDialog(),
                ),
              ),
              child: Text(l.webUsersInvitesCreate),
            ),
        ],
      ),
    );
  }
}

class _InviteRow extends StatelessWidget {
  const _InviteRow({required this.invite, required this.onRevoke});

  final Invite invite;

  /// Null for an account that may not revoke links.
  final VoidCallback? onRevoke;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final label = invite.label;
    final details = [
      l.webUsersInvitesMade(relativeText(l, invite.createdAt)),
      l.webUsersInvitesExpires(relativeText(l, invite.expiresAt)),
      if (invite.groups.isNotEmpty)
        l.webUsersInvitesJoins(invite.groups.map((it) => it.name).join(', ')),
    ];
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 4, 8),
      child: Row(
        spacing: 14,
        children: [
          KitIcon(Lucide.link, size: 20, color: colors.mutedForeground),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label ?? l.webUsersInvitesNoNote,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.base.style(
                    color: label == null
                        ? colors.mutedForeground
                        : colors.foreground,
                  ),
                ),
                Text(
                  details.join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
          if (onRevoke case final revoke?)
            RoundIconButton(
              icon: Lucide.trash,
              label: label == null
                  ? l.webUsersInvitesRevoke
                  : l.webUsersInvitesRevokeNamed(label),
              background: const Color(0x00000000),
              color: colors.mutedForeground,
              onPressed: revoke,
            ),
        ],
      ),
    );
  }
}

/// Making an invite link: a note, how long it works, and the groups the
/// new account starts in; then the link, which can't be shown again.
class _InviteDialog extends ConsumerStatefulWidget {
  const _InviteDialog();

  @override
  ConsumerState<_InviteDialog> createState() => _InviteDialogState();
}

class _InviteDialogState extends ConsumerState<_InviteDialog> {
  String _label = '';

  /// The days picked, null until one is; until then the server's default.
  int? _days;
  final _groups = <String>{};
  bool _creating = false;
  Map<String, String> _errors = const {};
  String? _failure;
  CreatedInvite? _created;
  bool _copied = false;

  Future<void> _create() async {
    final api = ref.read(apiProvider);
    if (api == null || _creating) return;
    final l = AppLocalizations.of(context);
    final days =
        _days ?? ref.read(inviteOptionsProvider).value?.defaultExpiryDays;
    if (days == null) return;
    setState(() {
      _creating = true;
      _errors = const {};
      _failure = null;
    });
    try {
      final created = await api.admin.invites.create(
        label: _label.trim().isEmpty ? null : _label,
        expiresInDays: days,
        groupIds: _groups.toList(),
      );
      ref.invalidate(adminInvitesProvider);
      if (mounted) setState(() => _created = created);
    } on Object catch (error) {
      if (!mounted) return;
      final errors = fieldErrors(l, error);
      setState(() {
        _creating = false;
        _errors = errors;
        _failure =
            errors.containsKey('label') || errors.containsKey('expiresInDays')
            ? null
            : describeFailure(l, error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final created = _created;
    if (created != null) {
      final expires = DateTime.tryParse(created.expiresAt);
      return Dialog(
        title: l.webUsersInvitesLinkTitle,
        description: l.webUsersInvitesLinkDescription(
          expires == null ? created.expiresAt : relativeTime(l, expires),
        ),
        actions: [
          MatineeButton(
            look: ButtonLook.outline,
            leading: _copied ? Lucide.check : Lucide.link,
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: created.url));
              if (mounted) setState(() => _copied = true);
            },
            child: Text(
              _copied ? l.webUsersInvitesLinkCopied : l.webUsersInvitesLinkCopy,
            ),
          ),
          MatineeButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l.webUsersInvitesLinkDone),
          ),
        ],
        child: Semantics(
          label: l.webUsersInvitesLinkLabel,
          child: Text(
            created.url,
            style: KitText.px13.style(
              color: MatineeTheme.of(context).foreground,
            ),
          ),
        ),
      );
    }
    // The groups to start in need `group.read`; without it there are none
    // to offer.
    final groups =
        (ref.watch(canProvider(Permission.groupRead))
                ? ref.watch(adminGroupsProvider).value ?? const []
                : const <AdminGroupsListOutput>[])
            // Everyone holds every account already, so it isn't offered.
            .where((group) => !group.everyone)
            .toList();
    final options = ref.watch(inviteOptionsProvider);
    final expiry = options.value;
    final failure = _failure;
    return Dialog(
      title: l.webUsersInvitesCreate,
      description: l.webUsersInvitesDialogDescription,
      actions: [
        MatineeButton(
          look: ButtonLook.outline,
          onPressed: () => Navigator.pop(context),
          child: Text(l.webUsersDialogCancel),
        ),
        MatineeButton(
          onPressed: _creating || expiry == null
              ? null
              : () => unawaited(_create()),
          child: Text(l.webUsersInvitesDialogSubmit),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 16,
        children: [
          MatineeTextField(
            label: l.webUsersInvitesDialogNote,
            placeholder: l.webUsersInvitesDialogNoteHint,
            error: _errors['label'],
            onChanged: (value) => _label = value,
          ),
          if (expiry != null)
            InviteExpiryPicker(
              options: expiry,
              current: _days ?? expiry.defaultExpiryDays,
              error: _errors['expiresInDays'],
              onPicked: (days) => setState(() => _days = days),
            )
          else if (options.error case final error?)
            Note(
              l.webUsersInvitesLoadFailed(describeFailure(l, error)),
              danger: true,
            )
          else
            const SkeletonBox(height: 56, radius: KitRadius.lg),
          if (groups.isNotEmpty) ...[
            Text(
              l.webUsersInvitesDialogGroups,
              style: KitText.sm.style(
                color: MatineeTheme.of(context).foreground,
                weight: FontWeight.w500,
              ),
            ),
            for (final group in groups)
              Row(
                spacing: 12,
                children: [
                  Switch(
                    checked: _groups.contains(group.id),
                    label: group.name,
                    onChanged: (on) => setState(
                      () =>
                          on ? _groups.add(group.id) : _groups.remove(group.id),
                    ),
                  ),
                  Expanded(child: Text(group.name)),
                ],
              ),
            Note(l.webUsersInvitesDialogGroupsHint),
          ],
          if (failure != null) Note(failure, danger: true),
        ],
      ),
    );
  }
}

/// How many days a link works, from the lengths the server offers.
class InviteExpiryPicker extends StatelessWidget {
  const InviteExpiryPicker({
    super.key,
    required this.options,
    required this.current,
    required this.onPicked,
    this.error,
  });

  final InviteOptions options;
  final int current;
  final ValueChanged<int> onPicked;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final error = this.error;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 8,
      children: [
        Text(
          l.webUsersInvitesDialogExpiry,
          style: KitText.sm.style(
            color: colors.foreground,
            weight: FontWeight.w500,
          ),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final days in options.expiryDays)
              ChoiceChip(
                label: l.adminInviteExpiryDays(days),
                selected: days == current,
                onPressed: () => onPicked(days),
              ),
          ],
        ),
        if (error != null)
          Text(error, style: KitText.sm.style(color: colors.danger)),
      ],
    );
  }
}
