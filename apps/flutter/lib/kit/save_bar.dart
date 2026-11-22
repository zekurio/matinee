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
/// with a tick, or Try again with the failure and the server's [message]
/// over the buttons. Each time [attention] goes up the bar shakes, as when
/// someone tries to leave with unsaved edits. The card slides up as it first
/// shows.
///
/// On a phone Reset and Save share the row, half each, and the status is
/// only read out: the bar shows only while there are edits, so it says
/// that already. A wide page has the status beside them, when it fits.
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

  /// The words' width at [style], as the bar would lay them out.
  static double _width(BuildContext context, String text, TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: 1,
    )..layout();
    final width = painter.width;
    painter.dispose();
    return width;
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final failed = widget.status == SaveBarStatus.failed;
    final message = widget.message;
    final busy =
        widget.status == SaveBarStatus.saving ||
        widget.status == SaveBarStatus.saved;
    final labelStyle = KitText.sm.style(
      color: failed ? colors.danger : colors.foreground,
      weight: FontWeight.w500,
    );
    final buttonText = ButtonSize.standard.text.style(weight: FontWeight.w500);
    final pad = ButtonSize.standard.padding * 2;

    Widget reset({required bool wide}) => MatineeButton(
      look: wide ? ButtonLook.outline : ButtonLook.ghost,
      onPressed: widget.onReset,
      child: Text(widget.resetLabel, maxLines: 1),
    );
    final save = MatineeButton(
      onPressed: widget.onSave,
      dimmed: widget.onSave == null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          // Saving is the spinner alone, read out as "Saving…": the words
          // wouldn't fit half a phone's bar in German.
          if (widget.status == SaveBarStatus.saving)
            Semantics(
              label: widget.saveLabel,
              child: Spinner(color: colors.accentForeground),
            )
          else ...[
            if (widget.status == SaveBarStatus.saved)
              const KitIcon(Lucide.check, size: 16),
            Flexible(
              child: Text(
                widget.saveLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
    final label = Text(
      widget.statusLabel,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: labelStyle,
    );

    final bar = LayoutBuilder(
      builder: (context, constraints) {
        // A wide bar has the status, Reset and Save on one row, when the
        // words fit beside the buttons. A phone's, or one they don't fit,
        // is the two buttons sharing the row, and the status is only read
        // out.
        final needed =
            _width(context, widget.statusLabel, labelStyle) +
            16 +
            _width(context, widget.resetLabel, buttonText) +
            pad +
            8 +
            _width(context, widget.saveLabel, buttonText) +
            pad +
            (busy ? 22 : 0);
        final row =
            constraints.maxWidth >= 440 && needed <= constraints.maxWidth
            ? Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(start: 6),
                      child: label,
                    ),
                  ),
                  reset(wide: false),
                  save,
                ],
              )
            : Row(
                spacing: 8,
                children: [
                  Expanded(child: reset(wide: true)),
                  Expanded(child: save),
                ],
              );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          spacing: 8,
          children: [
            if (failed)
              Padding(
                padding: const EdgeInsetsDirectional.only(start: 2),
                child: Text(
                  [widget.statusLabel, ?message].join('. '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.xs.style(color: colors.danger),
                ),
              ),
            row,
          ],
        );
      },
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
                      .withValues(alpha: colors.isDark ? .4 : .08),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Semantics(
              liveRegion: true,
              label: widget.statusLabel,
              child: Padding(padding: const EdgeInsets.all(10), child: bar),
            ),
          ),
        ),
      ),
    );
  }
}
