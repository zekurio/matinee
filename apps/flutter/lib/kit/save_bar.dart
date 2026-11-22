import 'package:flutter/widgets.dart';

import 'button.dart';
import 'icon.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

/// How a save bar's last save went.
enum SaveBarStatus { unsaved, saving, saved, failed }

/// The bar under a page whose fields save together, as the web's save bar: a
/// floating card above the system's bar, holding what the edits are waiting
/// for with Reset and Save. [status] turns Save into a spinner, then "Saved"
/// with a tick, or Try again with the server's [message] beside it. Each time
/// [attention] goes up the bar shakes, as when someone tries to leave with
/// unsaved edits. The card slides up as it first shows.
///
/// On a phone the status sits over the buttons, so a long German label never
/// wraps beside them; a wide page keeps it on one row.
class SaveBar extends StatefulWidget {
  const SaveBar({
    super.key,
    required this.status,
    required this.statusLabel,
    required this.resetLabel,
    required this.saveLabel,
    required this.onReset,
    required this.onSave,
    this.message,
    this.attention = 0,
  });

  final SaveBarStatus status;

  /// "Unsaved changes", "Changes saved", or "Couldn't save your changes".
  final String statusLabel;
  final String resetLabel;

  /// "Save", "Saving…", "Done", or "Try again", as [status] has it.
  final String saveLabel;
  final VoidCallback? onReset;
  final VoidCallback? onSave;
  final String? message;
  final int attention;

  @override
  State<SaveBar> createState() => _SaveBarState();
}

class _SaveBarState extends State<SaveBar> with SingleTickerProviderStateMixin {
  late final _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 360),
  );

  @override
  void didUpdateWidget(SaveBar old) {
    super.didUpdateWidget(old);
    if (widget.attention > old.attention &&
        !MediaQuery.disableAnimationsOf(context)) {
      _shake.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  /// Six to either side four times, back at the middle when it ends.
  static double _offset(double t) {
    if (t == 0 || t == 1) return 0;
    final step = t * 5;
    final phase = step - step.floorToDouble();
    final sign = step.floor().isEven ? -1 : 1;
    return sign * 6 * (1 - (2 * phase - 1).abs());
  }

  /// The live status, with its failure reason under it.
  Widget _status(KitColors colors, bool failed, String? message) => Semantics(
    liveRegion: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      spacing: 2,
      children: [
        Row(
          spacing: 8,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: failed ? colors.danger : colors.accent,
              ),
            ),
            Flexible(
              child: Text(
                widget.statusLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.sm.style(
                  color: failed ? colors.danger : colors.foreground,
                  weight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        if (failed && message != null)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 15),
            child: Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs.style(color: colors.mutedForeground),
            ),
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final failed = widget.status == SaveBarStatus.failed;
    final message = widget.message;
    final status = _status(colors, failed, message);
    final reset = MatineeButton(
      look: ButtonLook.ghost,
      onPressed: widget.onReset,
      child: Text(widget.resetLabel),
    );
    final save = MatineeButton(
      onPressed: widget.onSave,
      dimmed: widget.onSave == null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          if (widget.status == SaveBarStatus.saving)
            Spinner(color: colors.accentForeground),
          if (widget.status == SaveBarStatus.saved)
            const KitIcon(Lucide.check, size: 16),
          Flexible(child: Text(widget.saveLabel, maxLines: 1)),
        ],
      ),
    );
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 220);
    return Padding(
      padding: EdgeInsetsDirectional.only(
        start: 12,
        end: 12,
        bottom: MediaQuery.paddingOf(context).bottom + 10,
      ),
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: motion,
        curve: Curves.easeOutCubic,
        builder: (context, shown, child) => Opacity(
          opacity: shown,
          child: Transform.translate(
            offset: Offset(0, (1 - shown) * 10),
            child: child,
          ),
        ),
        child: AnimatedBuilder(
          animation: _shake,
          builder: (context, child) => Transform.translate(
            offset: Offset(_offset(_shake.value), 0),
            child: child,
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: KitRadius.panel,
              border: Border.all(color: colors.border),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF000000)
                      .withValues(alpha: colors.isDark ? .45 : .1),
                  blurRadius: 24,
                  spreadRadius: -4,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(14, 12, 12, 12),
              child: LayoutBuilder(
                builder: (context, constraints) => constraints.maxWidth >= 460
                    ? Row(
                        spacing: 8,
                        children: [
                          Expanded(child: status),
                          reset,
                          save,
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisSize: MainAxisSize.min,
                        spacing: 10,
                        children: [
                          status,
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            spacing: 8,
                            children: [
                              Flexible(child: reset),
                              Flexible(child: save),
                            ],
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
