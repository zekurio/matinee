import 'dart:async';

import 'package:flutter/widgets.dart';

import '../kit/kit.dart';
import 'player_motion.dart';

const _white = Color(0xFFFFFFFF);

/// Skip intro, and the like for the other segments the server found.
class SkipSegmentButton extends StatelessWidget {
  const SkipSegmentButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => MatineeButton(
    onPressed: onPressed,
    look: ButtonLook.frosted,
    size: ButtonSize.xl,
    label: label,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 8,
      children: [
        Flexible(child: Text(label)),
        const KitIcon(Lucide.fastForward, size: 14),
      ],
    ),
  );
}

/// The next episode while the credits roll or once the file ended: Play with
/// its countdown, and Hide or Cancel beside it.
class UpNextCard extends StatelessWidget {
  const UpNextCard({
    super.key,
    required this.heading,
    required this.title,
    required this.playLabel,
    required this.playWords,
    required this.onPlay,
    this.dismissLabel,
    this.onDismiss,
  });

  /// "Up next".
  final String heading;
  final String title;

  /// What a screen reader hears for the play button.
  final String playLabel;

  /// What the play button says: Play, or the countdown.
  final String playWords;
  final VoidCallback? onPlay;
  final String? dismissLabel;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 360),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceRaised.withValues(alpha: .95),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                heading,
                style: KitText.sm.style(
                  color: colors.mutedForeground,
                  weight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: KitText.base.style(
                  color: colors.foreground,
                  weight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  MatineeButton(
                    onPressed: onPlay,
                    size: ButtonSize.lg,
                    label: playLabel,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 8,
                      children: [
                        const KitIcon(Lucide.play, size: 14),
                        Flexible(
                          child: ExcludeSemantics(child: Text(playWords)),
                        ),
                      ],
                    ),
                  ),
                  if ((dismissLabel, onDismiss) case (
                    final words?,
                    final dismiss?,
                  ))
                    MatineeButton(
                      onPressed: dismiss,
                      look: ButtonLook.frosted,
                      size: ButtonSize.lg,
                      child: Text(words),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The skip button and the up-next card at the bottom end, lifted clear of
/// the controls while they show.
class PlayerPrompts extends StatelessWidget {
  const PlayerPrompts({
    super.key,
    required this.lifted,
    required this.children,
  });

  final bool lifted;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Align(
    alignment: AlignmentDirectional.bottomEnd,
    child: SafeArea(
      child: AnimatedPadding(
        duration: KitMotion.move,
        curve: KitMotion.easing,
        padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + (lifted ? 120 : 0)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          spacing: 12,
          children: children,
        ),
      ),
    ),
  );
}

/// A note in a dark box over the video, centered at the top, like the one
/// that says what the server did instead of what was asked for. [margin]
/// keeps it off the screen's edges; a TV's is its overscan.
class PlayerNote extends StatelessWidget {
  const PlayerNote({
    super.key,
    required this.title,
    this.detail,
    this.margin = phoneMargin,
  });

  /// A phone's [margin], clear of the screen's top.
  static const phoneMargin = EdgeInsets.fromLTRB(24, 16, 24, 0);

  final String title;
  final String? detail;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: SafeArea(
      child: Padding(
        padding: margin,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: detail == null
                  ? const Color(0x99000000)
                  : const Color(0xBF000000),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              child: MergeSemantics(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: KitText.base.style(
                        color: _white,
                        weight: FontWeight.w600,
                      ),
                    ),
                    if (detail case final text? when text.isNotEmpty)
                      Text(
                        text,
                        textAlign: TextAlign.center,
                        style: KitText.sm.style(
                          color: _white.withValues(alpha: .8),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// Shows [child] for [duration] each time [token] changes, then fades it
/// and calls [onHidden]. A null token shows nothing.
class TimedNote extends StatefulWidget {
  const TimedNote({
    super.key,
    required this.token,
    required this.duration,
    required this.child,
    this.onHidden,
  });

  final Object? token;
  final Duration duration;
  final Widget child;
  final VoidCallback? onHidden;

  @override
  State<TimedNote> createState() => _TimedNoteState();
}

class _TimedNoteState extends State<TimedNote> {
  Timer? _timer;
  bool _shown = false;
  late Widget _last = widget.child;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(TimedNote old) {
    super.didUpdateWidget(old);
    if (widget.token != old.token) _start();
  }

  void _start() {
    _timer?.cancel();
    _shown = widget.token != null;
    if (!_shown) return;
    _timer = Timer(widget.duration, () {
      setState(() => _shown = false);
      widget.onHidden?.call();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // The last note stays drawn while it fades.
    if (_shown) _last = widget.child;
    return PlayerFade(visible: _shown, child: _last);
  }
}

/// What shows when nothing plays: the back button where the controls have
/// it, and the error in the middle, with Try again unless asking again
/// would get the same answer.
class PlayerFailure extends StatelessWidget {
  const PlayerFailure({
    super.key,
    required this.title,
    required this.message,
    required this.backLabel,
    required this.onBack,
    required this.retryLabel,
    this.onRetry,
  });

  final String title;
  final String message;
  final String backLabel;
  final VoidCallback onBack;
  final String retryLabel;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: RoundIconButton(
            icon: Lucide.arrowLeft,
            label: backLabel,
            onPressed: onBack,
            background: const Color(0x00000000),
          ),
        ),
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              child: ErrorState(
                title: title,
                message: message,
                retryLabel: retryLabel,
                onRetry: onRetry,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

/// The screen while the controls are locked: the unlock button shows in the
/// corner where the lock button was, for a few seconds, and tapping it unlocks.
/// Once it's gone, a touch anywhere brings it back, and so does each change of
/// [reveals]. With a screen reader on, it stays.
class PlayerLocked extends StatefulWidget {
  const PlayerLocked({
    super.key,
    required this.reveals,
    required this.unlockLabel,
    required this.onUnlock,
  });

  final int reveals;
  final String unlockLabel;
  final VoidCallback onUnlock;

  static const hideAfter = Duration(milliseconds: 3500);

  @override
  State<PlayerLocked> createState() => _PlayerLockedState();
}

class _PlayerLockedState extends State<PlayerLocked> {
  bool _shown = true;
  Timer? _hide;

  /// The touch under way began with the button hidden, so it shows the
  /// button and doesn't also press it.
  bool _revealing = false;

  @override
  void initState() {
    super.initState();
    _show();
  }

  @override
  void didUpdateWidget(PlayerLocked old) {
    super.didUpdateWidget(old);
    if (old.reveals != widget.reveals) _show();
  }

  @override
  void dispose() {
    _hide?.cancel();
    super.dispose();
  }

  void _show() {
    _hide?.cancel();
    if (!_shown) setState(() => _shown = true);
    final keep = WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .accessibleNavigation;
    if (keep) return;
    _hide = Timer(PlayerLocked.hideAfter, () {
      if (mounted) setState(() => _shown = false);
    });
  }

  @override
  Widget build(BuildContext context) => Listener(
    behavior: HitTestBehavior.opaque,
    onPointerDown: (_) {
      _revealing = !_shown;
      _show();
    },
    onPointerUp: (_) => Timer.run(() => _revealing = false),
    child: Stack(
      children: [
        // The same size and place as the lock button in the controls' top row.
        Align(
          alignment: AlignmentDirectional.topEnd,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: AnimatedOpacity(
                opacity: _shown ? 1 : 0,
                duration: KitMotion.enter,
                curve: KitMotion.easing,
                child: RoundIconButton(
                  icon: Lucide.lockOpen,
                  label: widget.unlockLabel,
                  size: 52,
                  iconSize: 26,
                  background: const Color(0x00000000),
                  onPressed: () {
                    // Without a touch, as from a switch or a keyboard, a press
                    // on the hidden button shows it.
                    if (_revealing) return;
                    if (_shown) {
                      widget.onUnlock();
                    } else {
                      _show();
                    }
                  },
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
