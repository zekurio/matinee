import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Refreshable;
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/failure_text.dart';
import '../../../core/session.dart';
import '../../../core/toasts.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../query/failure_view.dart';
import '../settings_rows.dart';
import '../settings_screen.dart';

/* What the admin pages share: who may
 * see them, a page of the server's settings that loads first, the page
 * whose fields save together from a save bar, text rows, and running an
 * action with a toast when it fails. */

/// Whether the account in use may open an admin page that [allows] it:
/// the server's permissions say so, and the app is on the server, not
/// offline.
bool mayAdminister(AuthState auth, bool Function(User user) allows) =>
    auth is SignedIn && allows(auth.user);

/// [child] for an account [allows] lets in, else Settings' first page, as
/// a page key the device doesn't have opens it: an account without the
/// permissions, or one that just lost them, never sees the page.
class AdminGate extends ConsumerWidget {
  const AdminGate({super.key, required this.allows, required this.child});

  /// Whether the account holds what the page calls the server with.
  final bool Function(User user) allows;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      mayAdminister(ref.watch(authStateProvider), allows)
      ? child
      : const SettingsScreen();
}

/// A Settings page's sections down a list, as `SettingsScaffold` lays them
/// out, without the frame. The list keeps clear of the system's bar, which
/// a [SaveBarPage] takes off its hands while its bar shows.
class AdminSections extends StatelessWidget {
  const AdminSections({super.key, required this.sections});

  final List<Widget> sections;

  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: EdgeInsets.fromLTRB(
      CardMetrics.gutter,
      8,
      CardMetrics.gutter,
      MediaQuery.paddingOf(context).bottom + 20,
    ),
    itemCount: sections.length,
    separatorBuilder: (context, index) => const SizedBox(height: 28),
    itemBuilder: (context, index) => Align(
      alignment: AlignmentDirectional.topStart,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: settingsWidth),
        child: sections[index],
      ),
    ),
  );
}

/// What an admin page shows of [value]: a spinner while it loads, the
/// failure with Try again when nothing came, else [loaded]'s sections.
Widget adminBody<T>(
  BuildContext context,
  AsyncValue<T> value, {
  required VoidCallback onRetry,
  required Widget Function(T value) loaded,
}) {
  final l = AppLocalizations.of(context);
  if (value.value case final T data) return loaded(data);
  if (value.error case final Object error) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: FailureState(
          title: l.adminLoadFailed,
          error: error,
          onRetry: onRetry,
        ),
      ),
    );
  }
  return LoadingState(label: l.adminLoading);
}

/// A page of the server's settings that acts as it goes, with nothing to
/// save: Back, the title, and its body.
class AdminPage extends StatelessWidget {
  const AdminPage({
    super.key,
    required this.title,
    required this.child,
    this.actions = const [],
  });

  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => PageFrame(
    title: title,
    backLabel: AppLocalizations.of(context).commonBack,
    onBack: () => context.pop(),
    actions: actions,
    child: child,
  );
}

/// Asks the server again for what a save changed and waits for the answer,
/// so the page is on what the server kept by the time its save bar says
/// "Saved". The save went through either way: an answer that doesn't come
/// shows on the page, as any read that failed.
Future<void> reread(WidgetRef ref, Refreshable<Future<Object?>> read) async {
  try {
    final _ = await ref.refresh(read);
  } on Object {
    return;
  }
}

/// How long "Saved" shows before the bar goes, as the web's.
const savedFor = Duration(milliseconds: 1400);

/// A page whose fields wait to be saved together, as the web's panels with
/// their save bar. The bar sits under the list, never over its last rows, and
/// shows while the page has unsaved edits ([dirty]), with Reset and Save.
/// Both move up over the keyboard, so Save and the field being typed in stay
/// in reach.
///
/// Until the edits are saved or reset it holds the page open: Back, from
/// the system or the page's bar, shakes the bar instead of leaving. The
/// bar reports the save itself: Save turns into "Saved" for a moment
/// before the bar goes, and a failure stays in it with the server's reason
/// until the next try or a reset. [onSave] ends once the page is on what
/// the server kept ([reread]), and throws when the save fails; the page
/// puts the server's word on each field it names ([fieldErrors]).
/// [canSave] is false while a field holds what can't be sent at all.
///
/// The page keeps its form through the save: the server's answer starts
/// the fields again, but a form built anew would take the bar with it
/// before it said "Saved", and the list back to its top.
class SaveBarPage extends StatefulWidget {
  const SaveBarPage({
    super.key,
    required this.title,
    required this.dirty,
    required this.onReset,
    required this.onSave,
    required this.child,
    this.canSave = true,
  });

  final String title;
  final bool dirty;
  final bool canSave;
  final VoidCallback onReset;
  final Future<void> Function() onSave;

  /// The page's body, usually an [AdminSections].
  final Widget child;

  @override
  State<SaveBarPage> createState() => _SaveBarPageState();
}

class _SaveBarPageState extends State<SaveBarPage> {
  SaveBarStatus? _status;
  String? _message;
  int _attention = 0;
  Timer? _done;

  /// What the bar stopped showing is over: a failure whose edits were
  /// undone by hand doesn't come back with the next edit.
  @override
  void didUpdateWidget(SaveBarPage old) {
    super.didUpdateWidget(old);
    if (_shown == null) _status = null;
  }

  @override
  void dispose() {
    _done?.cancel();
    super.dispose();
  }

  /// What the bar shows: an edit after a save starts a new round, so
  /// "Saved" doesn't linger, and a failure goes with the edits it failed
  /// to save.
  SaveBarStatus? get _shown => switch (_status) {
    SaveBarStatus.saved when widget.dirty => null,
    SaveBarStatus.failed when !widget.dirty => null,
    final status => status,
  };

  void _attempt() => setState(() => _attention++);

  Future<void> _save() async {
    if (_shown == SaveBarStatus.saving || !widget.dirty || !widget.canSave) {
      return;
    }
    final l = AppLocalizations.of(context);
    // The last save's "Saved" mustn't run out on this one.
    _done?.cancel();
    setState(() => _status = SaveBarStatus.saving);
    try {
      await widget.onSave();
      if (!mounted) return;
      setState(() => _status = SaveBarStatus.saved);
      _done = Timer(savedFor, () {
        if (mounted) setState(() => _status = null);
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _status = SaveBarStatus.failed;
        _message = describeFailure(l, error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final shown = _shown;
    final status = shown ?? SaveBarStatus.unsaved;
    final visible = widget.dirty || shown != null;
    final saving = status == SaveBarStatus.saving;
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 220);
    return PopScope(
      canPop: !widget.dirty,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _attempt();
      },
      child: PageFrame(
        title: widget.title,
        backLabel: l.commonBack,
        onBack: widget.dirty ? _attempt : () => context.pop(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              // Below the frame's padding and keyboard room: built from
              // this page's context, they would come back.
              child: Builder(
                builder: (context) => MediaQuery.removePadding(
                  context: context,
                  removeBottom: visible,
                  child: widget.child,
                ),
              ),
            ),
            AnimatedSize(
              duration: motion,
              curve: Curves.easeOutCubic,
              alignment: Alignment.bottomCenter,
              child: visible
                  ? SaveBar(
                      status: status,
                      attention: _attention,
                      message: _message,
                      statusLabel: switch (status) {
                        SaveBarStatus.saved => l.webCommonSaveBarSaved,
                        SaveBarStatus.failed => l.webCommonSaveBarFailed,
                        _ => l.webCommonSaveBarUnsaved,
                      },
                      resetLabel: l.webCommonSaveBarReset,
                      saveLabel: switch (status) {
                        SaveBarStatus.saving => l.webCommonSaveBarSaving,
                        SaveBarStatus.saved => l.webCommonSaveBarDone,
                        SaveBarStatus.failed => l.webCommonSaveBarRetry,
                        SaveBarStatus.unsaved => l.saveBarSave,
                      },
                      onReset: widget.dirty && !saving
                          ? () {
                              setState(() => _status = null);
                              widget.onReset();
                            }
                          : null,
                      onSave: widget.dirty && widget.canSave && !saving
                          ? () => unawaited(_save())
                          : null,
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ],
        ),
      ),
    );
  }
}

/// A text field in a panel, its name above it and the server's word on it
/// under it. The row keeps the text being typed; a new [value] from
/// outside, as a reset, replaces it.
class TextRow extends StatefulWidget {
  const TextRow({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.placeholder,
    this.error,
    this.keyboardType,
    this.maxLines = 1,
    this.secret = false,
    this.trailing,
    this.hint,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final String? placeholder;
  final String? error;

  /// What the field is for, under it while the server has nothing to say.
  final String? hint;
  final TextInputType? keyboardType;
  final int maxLines;
  final bool secret;
  final Widget? trailing;

  @override
  State<TextRow> createState() => _TextRowState();
}

class _TextRowState extends State<TextRow> {
  late final _controller = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(TextRow old) {
    super.didUpdateWidget(old);
    if (widget.value != _controller.text) _controller.text = widget.value;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hint = widget.hint;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 6,
        children: [
          MatineeTextField(
            controller: _controller,
            label: widget.label,
            placeholder: widget.placeholder,
            error: widget.error,
            keyboardType: widget.keyboardType,
            maxLines: widget.maxLines,
            obscureText: widget.secret,
            autocorrect: false,
            trailing: widget.trailing,
            onChanged: widget.onChanged,
          ),
          if (hint != null && widget.error == null) Note(hint),
        ],
      ),
    );
  }
}

/// A row of a panel that only tells: an icon, a title, and lines under it.
class InfoRow extends StatelessWidget {
  const InfoRow({
    super.key,
    required this.title,
    this.icon,
    this.lines = const [],
    this.trailing,
  });

  final String title;
  final String? icon;
  final List<String> lines;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 8, 12),
      child: Row(
        spacing: 14,
        children: [
          if (icon case final icon?)
            KitIcon(icon, size: 20, color: colors.mutedForeground),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: KitText.base.style(color: colors.foreground),
                ),
                for (final line in lines)
                  Text(
                    line,
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Runs an admin's action, one at a time per [busy], and says what went wrong
/// in a toast: the sheet or dialog it started from has gone by then. True when
/// it went through.
Future<bool> runAction(
  WidgetRef ref,
  AppLocalizations l,
  Future<void> Function() action, {
  String? failure,
}) async {
  // Read first: the page may be gone by the time the action fails.
  final toasts = ref.read(toastProvider);
  try {
    await action();
    return true;
  } on Object catch (error) {
    unawaited(
      toasts.show(
        failure ?? l.webCommonSaveBarFailed,
        description: describeFailure(l, error),
        kind: ToastKind.error,
      ),
    );
    return false;
  }
}

/// Shows a sheet of actions over the page and, once it has slid away,
/// runs the one picked, so what that opens doesn't cut the sheet off.
Future<void> pickFrom(
  BuildContext context, {
  required String title,
  String? description,
  required List<(String icon, String label, VoidCallback action, bool danger)>
  items,
}) async {
  final l = AppLocalizations.of(context);
  final picked = await Sheet.show<VoidCallback>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => Sheet(
      title: title,
      description: description,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (icon, label, action, danger) in items)
            SheetItem(
              icon: icon,
              label: label,
              destructive: danger,
              onPressed: () => Navigator.pop(context, action),
            ),
        ],
      ),
    ),
  );
  picked?.call();
}

/// "just now", "5 minutes ago", "in 2 hours", "3 days ago": how far [at]
/// is from [now], in the app's language, lowercase, as it stands inside a
/// sentence.
String relativeTime(AppLocalizations l, DateTime at, {DateTime? now}) {
  final seconds = at.difference(now ?? DateTime.now()).inSeconds;
  final ahead = seconds > 0;
  final span = seconds.abs();
  if (span < 60) return l.adminTimeNow;
  if (span < 3600) {
    final minutes = span ~/ 60;
    return ahead
        ? l.adminTimeInMinutes(minutes)
        : l.adminTimeMinutesAgo(minutes);
  }
  if (span < 86400) {
    final hours = span ~/ 3600;
    return ahead ? l.adminTimeInHours(hours) : l.adminTimeHoursAgo(hours);
  }
  final days = span ~/ 86400;
  return ahead ? l.adminTimeInDays(days) : l.adminTimeDaysAgo(days);
}

/// The same, for a time the server sent as text, or the text itself when
/// it doesn't read as one.
String relativeText(AppLocalizations l, String at) =>
    switch (DateTime.tryParse(at)) {
      final DateTime time => relativeTime(l, time),
      null => at,
    };

/// The same for something due, like a task's next run: under a minute
/// either way is "soon", as the web's `formatUpcoming` has it, since a run
/// a few seconds overdue is about to start, not one that just happened.
String upcomingText(AppLocalizations l, String at, {DateTime? now}) =>
    switch (DateTime.tryParse(at)) {
      final DateTime time
          when time.difference(now ?? DateTime.now()).inSeconds.abs() < 60 =>
        l.adminTimeSoon,
      final DateTime time => relativeTime(l, time, now: now),
      null => at,
    };

/// "45s", "12m", "3h 20m", for how long something took.
String shortDuration(AppLocalizations l, int seconds) {
  if (seconds < 60) return l.formatSecondsShort(seconds);
  if (seconds < 3600) return l.formatMinutesShort(seconds ~/ 60);
  return l.formatHoursMinutesShort(seconds ~/ 3600, (seconds % 3600) ~/ 60);
}

/// The account in use, as the user list names it, to tell "you" apart.
String? selfId(AuthState auth) => switch (auth) {
  SignedIn(:final user) => user.id,
  _ => null,
};

/// The account as a [User], for the session to show it changed.
User userOf(AdminUser user) => User(
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  permissions: user.permissions,
  avatarUrl: user.avatarUrl,
  avatarSource: user.avatarSource,
  playback: user.playback,
  library: user.library,
  sharing: user.sharing,
);
