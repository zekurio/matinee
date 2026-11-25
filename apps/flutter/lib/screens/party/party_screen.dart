import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../media/format.dart';
import '../../party/party_controller.dart';
import '../../party/party_state.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../settings/settings_rows.dart';

/// The watch party: starting one, joining one by its link, and, once in,
/// who's there, what plays, what comes after, and what members suggested.
///
/// The panel is the web's, in the app's page: the owner picks what plays and
/// keeps the queue, and the others propose. [inviteId] is what an invite
/// link leads to, asked about before joining.
class PartyScreen extends ConsumerStatefulWidget {
  const PartyScreen({super.key, this.inviteId});

  final String? inviteId;

  @override
  ConsumerState<PartyScreen> createState() => _PartyScreenState();
}

class _PartyScreenState extends ConsumerState<PartyScreen> {
  final _name = TextEditingController();
  final _join = TextEditingController();
  String? _joinError;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _join.dispose();
    super.dispose();
  }

  void _back() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.home);
    }
  }

  Future<void> _copyInvite(Party party) async {
    final l = AppLocalizations.of(context);
    final toasts = ref.read(toastProvider);
    final api = ref.read(apiProvider);
    if (api == null) return;
    try {
      await Clipboard.setData(
        ClipboardData(text: partyInviteUrl(api.base, party.id)),
      );
      unawaited(
        toasts.show(
          l.webPartyInviteCopied,
          description: l.webPartyInviteHint,
          kind: ToastKind.success,
        ),
      );
    } on Object catch (error) {
      unawaited(
        toasts.show(
          l.webPartyInviteFailed,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
    }
  }

  Future<void> _start() async {
    final l = AppLocalizations.of(context);
    final toasts = ref.read(toastProvider);
    final name = _name.text.trim();
    setState(() => _busy = true);
    try {
      await ref.read(partyProvider.notifier).create(name.isEmpty ? null : name);
    } on Object catch (error) {
      if (!mounted) return;
      unawaited(
        toasts.show(
          l.webPartyStartFailed,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _joinTyped() async {
    final l = AppLocalizations.of(context);
    final id = partyIdFromInput(_join.text);
    if (id == null) {
      setState(() => _joinError = l.partyJoinInvalid);
      return;
    }
    setState(() => _joinError = null);
    await _askToJoin(id);
  }

  Future<void> _askToJoin(String partyId) async {
    final l = AppLocalizations.of(context);
    final toasts = ref.read(toastProvider);
    setState(() => _busy = true);
    try {
      final invite = await ref.read(partyInviteProvider(partyId).future);
      if (!mounted) return;
      final owner = invite.owner.name;
      final joined = await ConfirmDialog.show(
        context,
        title: invite.name ?? l.webPartyJoinTitle(owner),
        description: l.webPartyJoinDescription(
          l.webPartyJoinPeople(invite.members),
        ),
        confirmLabel: l.webPartyJoinButton,
        cancelLabel: l.webPartyCancel,
      );
      if (!joined || !mounted) return;
      await ref.read(partyProvider.notifier).join(partyId);
    } on Object catch (error) {
      if (!mounted) return;
      unawaited(
        toasts.show(
          l.webPartyJoinFailed,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rename(Party party) async {
    final l = AppLocalizations.of(context);
    final result = await Dialog.show<String>(
      context,
      builder: (context) => _RenameDialog(name: party.name ?? ''),
    );
    if (result == null || !mounted) return;
    await _run(l.webPartyFailed, (party) => party.rename(result));
  }

  Future<bool> _run(
    String failure,
    Future<void> Function(PartyNotifier notifier) action,
  ) async {
    final l = AppLocalizations.of(context);
    final toasts = ref.read(toastProvider);
    try {
      await action(ref.read(partyProvider.notifier));
      return true;
    } on Object catch (error) {
      if (!mounted) return false;
      unawaited(
        toasts.show(
          failure,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final snapshot = ref.watch(partyProvider);
    final current = snapshot.value;
    final party = current?.party;
    final offline = ref.watch(authStateProvider) is Offline;
    final title = widget.inviteId == null
        ? (party?.name ?? l.webPartyTitle)
        : l.webPartyTitle;
    final Widget body;
    if (offline) {
      body = Center(
        child: EmptyState(icon: Lucide.cloudOff, title: l.partyOffline),
      );
    } else if (party != null && current != null) {
      body = _PartyDetails(
        party: party,
        snapshot: current,
        busy: _busy,
        onCopyInvite: () => _copyInvite(party),
        onLeave: () async {
          final left = await _run(l.webPartyFailed, (party) => party.leave());
          if (left && mounted) _back();
        },
        onPlay: (item) => _openItem(item, current),
        onPlayNow: (item) => _openItem(item, null),
        onAction: _run,
      );
    } else if (snapshot.isLoading) {
      body = LoadingState(label: l.loadingInProgress);
    } else if (snapshot.hasError) {
      body = FailureState(
        title: l.partyLoadFailed,
        error: snapshot.error!,
        onRetry: () => ref.invalidate(partyProvider),
      );
    } else if (widget.inviteId case final inviteId?) {
      body = _InviteLanding(
        partyId: inviteId,
        onJoin: (id) => _run(l.webPartyJoinFailed, (party) => party.join(id)),
      );
    } else {
      body = _StartParty(
        name: _name,
        join: _join,
        joinError: _joinError,
        busy: _busy,
        onStart: _start,
        onJoin: _joinTyped,
      );
    }
    return PageFrame(
      title: title,
      onBack: _back,
      backLabel: l.commonBack,
      actions: [
        if (party != null) ...[
          PageBarButton(
            icon: Lucide.link,
            label: l.webPartyInvite,
            onPressed: () => _copyInvite(party),
          ),
          if (party.owner)
            PageBarButton(
              icon: Lucide.pencil,
              label: l.webPartyRename,
              onPressed: () => _rename(party),
            ),
        ],
      ],
      child: body,
    );
  }

  /// Opens [item] at where the party is in it, or from its start when
  /// [snapshot] is null: the owner picking it now.
  void _openItem(MediaItem item, PartySnapshot? snapshot) {
    final playback = snapshot?.party?.playback;
    final start = playback == null
        ? 0.0
        : partyPosition(playback, snapshot!.offsetMs);
    // The owner's player is where the party's file comes from, so opening
    // one is playing it.
    unawaited(context.push(Routes.play(item.id), extra: start));
  }
}

/// Starting a party, or joining one with the link someone sent.
class _StartParty extends StatelessWidget {
  const _StartParty({
    required this.name,
    required this.join,
    required this.joinError,
    required this.busy,
    required this.onStart,
    required this.onJoin,
  });

  final TextEditingController name;
  final TextEditingController join;
  final String? joinError;
  final bool busy;
  final VoidCallback onStart;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.max(0.0, (constraints.maxWidth - 480) / 2);
        return ListView(
          padding: EdgeInsets.fromLTRB(
            side + CardMetrics.gutter,
            8,
            side + CardMetrics.gutter,
            32,
          ),
          children: [
            Text(
              l.webPartyStart,
              style: KitText.xl.style(
                color: colors.foreground,
                weight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            MatineeTextField(
              controller: name,
              label: l.webPartyNameOptional,
              placeholder: l.webPartyNamePlaceholder,
              onSubmitted: (_) => onStart(),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: MatineeButton(
                look: ButtonLook.primary,
                leading: Lucide.users,
                onPressed: busy ? null : onStart,
                child: Text(l.webPartyStart),
              ),
            ),
            const SizedBox(height: 40),
            Text(
              l.partyJoinSection,
              style: KitText.xl.style(
                color: colors.foreground,
                weight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l.partyJoinHint,
              style: KitText.sm.style(color: colors.mutedForeground),
            ),
            const SizedBox(height: 16),
            MatineeTextField(
              controller: join,
              label: l.partyJoinField,
              error: joinError,
              autocorrect: false,
              onSubmitted: (_) => onJoin(),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: MatineeButton(
                look: ButtonLook.outline,
                leading: Lucide.link,
                onPressed: busy ? null : onJoin,
                child: Text(l.webPartyJoinButton),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// The party's name, in a field that saves it on Enter or Save.
class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.name});

  final String name;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final _name = TextEditingController(text: widget.name);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    void save() => Navigator.pop(context, _name.text.trim());
    return Dialog(
      title: l.webPartyRename,
      actions: [
        MatineeButton(
          look: ButtonLook.outline,
          onPressed: () => Navigator.pop(context),
          child: Text(l.webPartyCancel),
        ),
        MatineeButton(
          look: ButtonLook.primary,
          onPressed: save,
          child: Text(l.webPartyRenameSave),
        ),
      ],
      child: MatineeTextField(
        controller: _name,
        label: l.webPartyName,
        placeholder: l.webPartyNamePlaceholder,
        onSubmitted: (_) => save(),
      ),
    );
  }
}

/// What an invite link leads to, asked before joining.
class _InviteLanding extends ConsumerWidget {
  const _InviteLanding({required this.partyId, required this.onJoin});

  final String partyId;
  final ValueChanged<String> onJoin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final invite = ref.watch(partyInviteProvider(partyId));
    final current = invite.value;
    if (current == null) {
      if (invite.hasError && !invite.isLoading) {
        return Center(
          child: FailureState(
            title: l.webPartyJoinOver,
            error: invite.error!,
            onRetry: () => ref.invalidate(partyInviteProvider(partyId)),
          ),
        );
      }
      return LoadingState(label: l.loadingInProgress);
    }
    final colors = MatineeTheme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.max(0.0, (constraints.maxWidth - 480) / 2);
        return ListView(
          padding: EdgeInsets.fromLTRB(
            side + CardMetrics.gutter,
            8,
            side + CardMetrics.gutter,
            32,
          ),
          children: [
            Text(
              current.name == null
                  ? l.webPartyJoinTitle(current.owner.name)
                  : l.webPartyJoinTitleNamed(current.name!),
              style: KitText.xl.style(
                color: colors.foreground,
                weight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              current.name == null
                  ? l.webPartyJoinDescription(
                      l.webPartyJoinPeople(current.members),
                    )
                  : l.webPartyJoinNamedBy(
                      current.owner.name,
                      l.webPartyJoinDescription(
                        l.webPartyJoinPeople(current.members),
                      ),
                    ),
              style: KitText.sm.style(color: colors.mutedForeground),
            ),
            const SizedBox(height: 16),
            MatineeButton(
              look: ButtonLook.primary,
              onPressed: () => onJoin(partyId),
              child: Text(l.webPartyJoinButton),
            ),
            const SizedBox(height: 8),
            MatineeButton(
              look: ButtonLook.ghost,
              onPressed: () => context.go(Routes.home),
              child: Text(l.webPartyJoinHome),
            ),
          ],
        );
      },
    );
  }
}

/// The party itself, in the order someone reads it: who's here, what plays,
/// what comes after, and what members suggested.
class _PartyDetails extends ConsumerWidget {
  const _PartyDetails({
    required this.party,
    required this.snapshot,
    required this.busy,
    required this.onCopyInvite,
    required this.onLeave,
    required this.onPlay,
    required this.onPlayNow,
    required this.onAction,
  });

  final Party party;
  final PartySnapshot snapshot;
  final bool busy;
  final VoidCallback onCopyInvite;
  final VoidCallback onLeave;
  final ValueChanged<MediaItem> onPlay;
  final ValueChanged<MediaItem> onPlayNow;
  final Future<void> Function(
    String failure,
    Future<void> Function(PartyNotifier notifier) action,
  )
  onAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final health = ref.watch(partyHealthProvider);
    final byId = {
      for (final member in health.value?.members ?? const <PartyMemberHealth>[])
        member.userId: member,
    };
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.max(0.0, (constraints.maxWidth - 720) / 2);
        return ListView(
          padding: EdgeInsets.fromLTRB(
            side + CardMetrics.gutter,
            8,
            side + CardMetrics.gutter,
            MediaQuery.paddingOf(context).bottom + 24,
          ),
          children: [
            for (final member in party.members)
              _MemberRow(
                party: party,
                member: member,
                self: member.user.id == snapshot.selfId,
                health: byId[member.user.id],
                onAction: onAction,
              ),
            _InviteRow(onPressed: onCopyInvite),
            const SizedBox(height: 8),
            Text(
              l.webPartyHealthHint,
              style: KitText.sm.style(color: colors.mutedForeground),
            ),
            const SizedBox(height: 16),
            _NowPlaying(
              party: party,
              onPlay: () {
                final item = party.item;
                if (item != null) onPlay(item);
              },
            ),
            const SizedBox(height: 24),
            _ListTitle(l.webPartyQueue),
            if (party.queue.isEmpty)
              _Muted(party.owner ? l.webPartyQueueOwner : l.webPartyQueueMember)
            else
              for (final (index, entry) in party.queue.indexed)
                _QueueRow(
                  party: party,
                  entry: entry,
                  index: index,
                  last: index == party.queue.length - 1,
                  onPlay: () => onPlayNow(entry.item),
                  onAction: onAction,
                ),
            if (party.proposals.isNotEmpty) ...[
              const SizedBox(height: 24),
              _ListTitle(l.webPartyProposals),
              for (final entry in party.proposals)
                _ProposalRow(party: party, entry: entry, onAction: onAction),
            ],
            const SizedBox(height: 32),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: MatineeButton(
                look: ButtonLook.destructive,
                leading: Lucide.logOut,
                onPressed: busy ? null : onLeave,
                child: Text(l.webPartyLeave),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// A heading for one of the panel's lists, as quiet as its rows' details.
class _ListTitle extends StatelessWidget {
  const _ListTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(bottom: 4),
    child: Text(
      text,
      style: KitText.sm.style(
        color: MatineeTheme.of(context).mutedForeground,
        weight: FontWeight.w600,
      ),
    ),
  );
}

class _Muted extends StatelessWidget {
  const _Muted(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(
      text,
      style: KitText.sm.style(color: MatineeTheme.of(context).mutedForeground),
    ),
  );
}

/// A row of the panel: a round picture, a name or two, and what the viewer
/// may do with it at the end.
class _Row extends StatelessWidget {
  const _Row({
    required this.leading,
    required this.title,
    this.detail,
    this.trailing,
  });

  final Widget leading;
  final String title;
  final String? detail;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final detail = this.detail;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.base.style(color: colors.foreground),
                ),
                if (detail != null)
                  Text(
                    detail,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
              ],
            ),
          ),
          if (trailing case final trailing?) ...[
            const SizedBox(width: 8),
            trailing,
          ],
        ],
      ),
    );
  }
}

/// A row's quiet "⋯", which opens what the viewer may do with it.
class _RowMenu extends StatelessWidget {
  const _RowMenu({required this.label, required this.children});

  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Menu(
      side: MenuSide.end,
      trigger: (context, toggle, open, focus) => PressIndication(
        onPressed: toggle,
        focusNode: focus,
        label: label,
        shape: KitRadius.pill,
        builder: (context, state) => SizedBox.square(
          dimension: 40,
          child: Center(
            child: KitIcon(
              Lucide.ellipsis,
              size: 20,
              color: colors.mutedForeground,
            ),
          ),
        ),
      ),
      children: children,
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.party,
    required this.member,
    required this.self,
    required this.health,
    required this.onAction,
  });

  final Party party;
  final PartyMember member;
  final bool self;
  final PartyMemberHealth? health;
  final Future<void> Function(
    String failure,
    Future<void> Function(PartyNotifier notifier) action,
  )
  onAction;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final name = self
        ? l.webPartyHealthYou(member.user.name)
        : member.user.name;
    final verdict = _verdict(l, health, party.playback?.playing == true);
    final Widget? menu = party.owner && !member.owner
        ? _MemberMenu(member: member, onAction: onAction)
        : null;
    return _Row(
      leading: Avatar(
        url: member.user.avatarUrl,
        name: member.user.name,
        size: 32,
      ),
      title: name,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 8,
        children: [
          if (member.owner)
            Text(
              l.webPartyOwner,
              style: KitText.sm.style(color: colors.mutedForeground),
            ),
          if (verdict case final text?)
            Text(text, style: KitText.sm.style(color: colors.mutedForeground)),
          ?menu,
        ],
      ),
    );
  }

  static String? _verdict(
    AppLocalizations l,
    PartyMemberHealth? health,
    bool playing,
  ) {
    if (health == null) return l.webPartyHealthChecking;
    if (health.state == 'away') return l.webPartyHealthAway;
    if (health.state == 'buffering') return l.webPartyHealthBuffering;
    if (playing && health.state == 'paused') {
      return l.webPartyHealthPaused;
    }
    final drift = health.driftSeconds ?? 0;
    final off = drift.abs();
    if (off < 0.5) return l.webPartyHealthInSync;
    final amount = NumberFormat('0.0', l.localeName).format(off);
    return drift < 0
        ? l.webPartyHealthBehind(amount)
        : l.webPartyHealthAhead(amount);
  }
}

class _MemberMenu extends StatelessWidget {
  const _MemberMenu({required this.member, required this.onAction});

  final PartyMember member;
  final Future<void> Function(
    String failure,
    Future<void> Function(PartyNotifier notifier) action,
  )
  onAction;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final name = member.user.name;
    return _RowMenu(
      label: l.webPartyMemberActions(name),
      children: [
        MenuItem(
          icon: Lucide.star,
          label: l.webPartyMakeOwner,
          onPressed: () => _confirm(
            context,
            title: l.webPartyMakeOwnerTitle(name),
            description: l.webPartyMakeOwnerDescription(name),
            confirm: l.webPartyMakeOwnerConfirm,
            run: (notifier) => notifier.transfer(member.user.id),
          ),
        ),
        MenuItem(
          icon: Lucide.x,
          label: l.webPartyKick,
          destructive: true,
          onPressed: () => _confirm(
            context,
            title: l.webPartyKickTitle(name),
            description: l.webPartyKickDescription(name),
            confirm: l.webPartyKickConfirm,
            destructive: true,
            run: (notifier) => notifier.kick(member.user.id),
          ),
        ),
      ],
    );
  }

  Future<void> _confirm(
    BuildContext context, {
    required String title,
    required String description,
    required String confirm,
    required Future<void> Function(PartyNotifier notifier) run,
    bool destructive = false,
  }) async {
    final l = AppLocalizations.of(context);
    final yes = await ConfirmDialog.show(
      context,
      title: title,
      description: description,
      confirmLabel: confirm,
      cancelLabel: l.webPartyCancel,
      destructive: destructive,
    );
    if (yes) await onAction(l.webPartyFailed, run);
  }
}

class _InviteRow extends StatelessWidget {
  const _InviteRow({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: l.webPartyInvite,
      shape: KitRadius.control,
      builder: (context, state) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          spacing: 12,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: colors.hairline),
              ),
              child: Center(
                child: KitIcon(
                  Lucide.link,
                  size: 16,
                  color: colors.mutedForeground,
                ),
              ),
            ),
            Expanded(
              child: Text(
                l.webPartyInvite,
                style: KitText.base.style(color: colors.mutedForeground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NowPlaying extends StatelessWidget {
  const _NowPlaying({required this.party, required this.onPlay});

  final Party party;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final item = party.item;
    final playback = party.playback;
    if (item == null || playback == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(
          party.restricted
              ? l.webPartyRestricted
              : party.owner
              ? l.webPartyNothingOwner
              : l.webPartyNothingMember,
          style: KitText.sm.style(color: colors.mutedForeground),
        ),
      );
    }
    final names = itemNames(item, l);
    final code = episodeCode(item, l);
    return PressIndication(
      onPressed: onPlay,
      label: l.webPartyWatchAlong,
      shape: KitRadius.control,
      builder: (context, state) => DecoratedBox(
        decoration: BoxDecoration(
          color: colors.foreground.withValues(
            alpha: state == PressState.idle ? .04 : .08,
          ),
          borderRadius: KitRadius.control,
        ),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            spacing: 12,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  width: 112,
                  height: 63,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Picture(landscapeSources(item)),
                      const ColoredBox(color: Color(0x4D000000)),
                      const Center(
                        child: KitIcon(
                          Lucide.play,
                          size: 22,
                          color: Color(0xFFFFFFFF),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      names.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.base.style(
                        color: colors.foreground,
                        weight: FontWeight.w500,
                      ),
                    ),
                    if (code != null)
                      Text(
                        '${names.showName} · $code',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.sm.style(color: colors.mutedForeground),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      l.webPartyWatchAlong,
                      style: KitText.sm.style(
                        color: colors.accent,
                        weight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QueueRow extends StatelessWidget {
  const _QueueRow({
    required this.party,
    required this.entry,
    required this.index,
    required this.last,
    required this.onPlay,
    required this.onAction,
  });

  final Party party;
  final PartyEntry entry;
  final int index;
  final bool last;
  final VoidCallback onPlay;
  final Future<void> Function(
    String failure,
    Future<void> Function(PartyNotifier notifier) action,
  )
  onAction;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return _Row(
      leading: SizedBox(
        width: 32,
        child: Text(
          '${index + 1}',
          textAlign: TextAlign.center,
          style: KitText.sm.style(color: colors.mutedForeground),
        ),
      ),
      title: itemNames(entry.item, l).title,
      detail: _detail(context),
      trailing: party.owner
          ? _RowMenu(
              label: l.webPartyEntryActions(_entryName(context)),
              children: [
                MenuItem(
                  icon: Lucide.play,
                  label: l.webPartyPlayNow,
                  onPressed: onPlay,
                ),
                MenuItem(
                  label: l.webPartyMoveUp,
                  onPressed: index == 0
                      ? null
                      : () => onAction(
                          l.webPartyFailed,
                          (notifier) => notifier.queueMove(entry.id, index - 1),
                        ),
                ),
                MenuItem(
                  label: l.webPartyMoveDown,
                  onPressed: last
                      ? null
                      : () => onAction(
                          l.webPartyFailed,
                          (notifier) => notifier.queueMove(entry.id, index + 1),
                        ),
                ),
                const MenuSeparator(),
                MenuItem(
                  icon: Lucide.x,
                  label: l.webPartyRemove,
                  destructive: true,
                  onPressed: () => onAction(
                    l.webPartyFailed,
                    (notifier) => notifier.queueRemove(entry.id),
                  ),
                ),
              ],
            )
          : null,
    );
  }

  String _detail(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(entry.item, l);
    final code = episodeCode(entry.item, l);
    return code == null ? names.showName : '${names.showName} · $code';
  }

  String _entryName(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(entry.item, l);
    final code = episodeCode(entry.item, l);
    return code == null
        ? names.title
        : '${names.showName} · $code · ${names.title}';
  }
}

class _ProposalRow extends StatelessWidget {
  const _ProposalRow({
    required this.party,
    required this.entry,
    required this.onAction,
  });

  final Party party;
  final PartyEntry entry;
  final Future<void> Function(
    String failure,
    Future<void> Function(PartyNotifier notifier) action,
  )
  onAction;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final by = entry.by;
    return _Row(
      leading: by == null
          ? const SizedBox.square(dimension: 32)
          : Avatar(url: by.avatarUrl, name: by.name, size: 32),
      title: itemNames(entry.item, l).title,
      detail: by == null ? null : l.webPartyProposedBy(by.name),
      trailing: party.owner || entry.removable
          ? _RowMenu(
              label: l.webPartyEntryActions(itemNames(entry.item, l).title),
              children: [
                if (party.owner)
                  MenuItem(
                    icon: Lucide.listChecks,
                    label: l.webPartyAccept,
                    onPressed: () => onAction(
                      l.webPartyFailed,
                      (notifier) => notifier.queueAccept(entry.id),
                    ),
                  ),
                if (entry.removable)
                  MenuItem(
                    icon: Lucide.x,
                    label: party.owner ? l.webPartyDismiss : l.webPartyWithdraw,
                    onPressed: () => onAction(
                      l.webPartyFailed,
                      (notifier) => notifier.queueRemove(entry.id),
                    ),
                  ),
              ],
            )
          : null,
    );
  }
}

/// The party's own entry, from the profile and the account menu.
class PartyEntryRow extends ConsumerWidget {
  const PartyEntryRow({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final party = ref.watch(partyProvider).value?.party;
    return LinkRow(
      icon: Lucide.users,
      title: l.webPartyTitle,
      description: party == null ? null : l.webPartyInParty,
      onPressed: onPressed,
    );
  }
}
