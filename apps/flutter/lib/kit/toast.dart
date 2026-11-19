import 'dart:async';
import 'dart:collection';

import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

enum ToastKind { message, success, info, warning, error, loading }

enum ToastDuration {
  short(Duration(seconds: 4)),
  long(Duration(seconds: 8)),
  indefinite(null);

  const ToastDuration(this.timeout);

  final Duration? timeout;
}

enum ToastResult { action, dismissed, timedOut }

class Toast extends StatelessWidget {
  const Toast({
    super.key,
    required this.message,
    this.description,
    this.kind = ToastKind.message,
    this.actionLabel,
    this.onAction,
    this.closeLabel,
    this.onClose,
  }) : assert((actionLabel == null) == (onAction == null)),
       assert((closeLabel == null) == (onClose == null));

  final String message;
  final String? description;
  final ToastKind kind;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? closeLabel;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final (icon, tint) = switch (kind) {
      ToastKind.message || ToastKind.loading => (null, colors.mutedForeground),
      ToastKind.success => (Lucide.circleCheck, colors.success),
      ToastKind.info => (Lucide.info, colors.mutedForeground),
      ToastKind.warning => (Lucide.triangleAlert, colors.warning),
      ToastKind.error => (Lucide.octagonX, colors.danger),
    };

    return Semantics(
      liveRegion: true,
      container: true,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380),
        child: Stack(
          children: [
            Padding(
              padding: EdgeInsetsDirectional.only(
                end: onClose == null ? 0 : 7,
                top: onClose == null ? 0 : 7,
              ),
              child: Glass(
                shape: KitRadius.panel,
                border: Border.all(color: colors.border),
                shadow: const [
                  BoxShadow(
                    color: Color(0x99000000),
                    blurRadius: 32,
                    spreadRadius: -8,
                    offset: Offset(0, 12),
                  ),
                ],
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  child: Row(
                    spacing: 10,
                    children: [
                      Expanded(
                        child: Row(
                          spacing: 10,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (icon != null)
                              SizedBox(
                                height: 20,
                                child: Center(
                                  child: KitIcon(icon, color: tint, size: 16),
                                ),
                              )
                            else if (kind == ToastKind.loading)
                              Spinner(size: 20, color: tint),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                spacing: 2,
                                children: [
                                  Text(
                                    message,
                                    style: KitText.sm.style(
                                      color: colors.foreground,
                                      weight: FontWeight.w600,
                                    ),
                                  ),
                                  if (description case final description?)
                                    Text(
                                      description,
                                      style: KitText.px13.style(
                                        color: colors.mutedForeground,
                                        leading: 18,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (actionLabel case final label?)
                        _ToastAction(label: label, onPressed: onAction!),
                    ],
                  ),
                ),
              ),
            ),
            if (onClose != null)
              PositionedDirectional(
                top: 0,
                end: 0,
                child: PressIndication(
                  onPressed: onClose,
                  label: closeLabel,
                  shape: KitRadius.pill,
                  builder: (context, state) => Container(
                    width: 20,
                    height: 20,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: state == PressState.idle
                          ? colors.popover
                          : colors.secondary,
                      border: Border.all(color: colors.inputBorder),
                      borderRadius: KitRadius.pill,
                    ),
                    child: KitIcon(
                      Lucide.x,
                      size: 12,
                      strokeWidth: 2.25,
                      color: state == PressState.idle
                          ? colors.mutedForeground
                          : colors.foreground,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ToastAction extends StatelessWidget {
  const _ToastAction({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    const shape = BorderRadius.all(Radius.circular(KitRadius.md));
    return PressIndication(
      onPressed: onPressed,
      shape: shape,
      builder: (context, state) => Container(
        constraints: const BoxConstraints(minHeight: 28),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          borderRadius: shape,
          color: state == PressState.idle
              ? colors.accent
              : colors.accent.withValues(alpha: .88),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: KitText.px13.style(
            color: colors.accentForeground,
            weight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _ToastEntry {
  _ToastEntry(
    this.message,
    this.description,
    this.kind,
    this.actionLabel,
    this.closeLabel,
    this.duration,
  );

  final String message;
  final String? description;
  final ToastKind kind;
  final String? actionLabel;
  final String? closeLabel;
  final ToastDuration duration;
  final result = Completer<ToastResult>();
}

/// Queues notifications in the order they are shown. Durations start when a
/// toast reaches the front, and [show] reports how it closed.
class ToastState extends ChangeNotifier {
  final _queue = Queue<_ToastEntry>();
  Timer? _timer;

  Future<ToastResult> show(
    String message, {
    String? description,
    ToastKind kind = ToastKind.message,
    String? actionLabel,
    String? closeLabel,
    ToastDuration? duration,
  }) {
    final entry = _ToastEntry(
      message,
      description,
      kind,
      actionLabel,
      closeLabel,
      duration ??
          (kind == ToastKind.loading
              ? ToastDuration.indefinite
              : ToastDuration.short),
    );
    _queue.addLast(entry);
    if (_queue.length == 1) _start();
    return entry.result.future;
  }

  void dismiss() {
    if (_queue.isNotEmpty) _finish(_queue.first, ToastResult.dismissed);
  }

  void _start() {
    final entry = _queue.firstOrNull;
    if (entry?.duration.timeout case final timeout?) {
      _timer = Timer(timeout, () => _finish(entry!, ToastResult.timedOut));
    }
    notifyListeners();
  }

  void _finish(_ToastEntry entry, ToastResult result) {
    if (_queue.firstOrNull != entry) return;
    _timer?.cancel();
    _queue.removeFirst().result.complete(result);
    _start();
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final entry in _queue) {
      entry.result.complete(ToastResult.dismissed);
    }
    _queue.clear();
    super.dispose();
  }
}

class ToastHost extends StatelessWidget {
  const ToastHost({super.key, required this.state});

  final ToastState state;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: state,
    builder: (context, child) {
      final entry = state._queue.firstOrNull;
      if (entry == null) return const SizedBox.shrink();
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Toast(
            key: ObjectKey(entry),
            message: entry.message,
            description: entry.description,
            kind: entry.kind,
            actionLabel: entry.actionLabel,
            closeLabel: entry.closeLabel,
            onAction: entry.actionLabel == null
                ? null
                : () => state._finish(entry, ToastResult.action),
            onClose: entry.closeLabel == null
                ? null
                : () => state._finish(entry, ToastResult.dismissed),
          ),
        ),
      );
    },
  );
}
