import 'package:flutter/widgets.dart';

import 'button.dart';
import 'icon.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

/// How a save bar's last save went.
enum SaveBarStatus { unsaved, saving, saved, failed }

/// The bar under a page whose fields save together, as the web's save bar
/// and the Kotlin app's: what the edits are waiting for, with Reset and
/// Save. [status] turns Save into a spinner, then "Saved" with a tick, or
/// Try again with the server's [message] beside it. Each time [attention]
/// goes up the bar shakes, as when someone tries to leave with unsaved
/// edits. It keeps clear of the system's bar at the bottom.
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

  /// "Unsaved changes", "Saved", or "Couldn't save".
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

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final failed = widget.status == SaveBarStatus.failed;
    final message = widget.message;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: AnimatedBuilder(
          animation: _shake,
          builder: (context, child) => Transform.translate(
            offset: Offset(_offset(_shake.value), 0),
            child: child,
          ),
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 10, 12, 10),
            child: Row(
              spacing: 8,
              children: [
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.statusLabel,
                          style: KitText.sm.style(
                            color: failed ? colors.danger : colors.foreground,
                          ),
                        ),
                        if (failed && message != null)
                          Text(
                            message,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: KitText.xs.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                MatineeButton(
                  look: ButtonLook.ghost,
                  onPressed: widget.onReset,
                  child: Text(widget.resetLabel),
                ),
                MatineeButton(
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
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
