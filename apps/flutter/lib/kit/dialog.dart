import 'package:flutter/widgets.dart';

import 'button.dart';
import 'icon.dart';
import 'modal_backdrop.dart';
import 'theme.dart';
import 'tokens.dart';

class Dialog extends StatelessWidget {
  const Dialog({
    super.key,
    required this.title,
    this.description,
    this.child,
    this.actions = const [],
    this.closeLabel,
    this.onClose,
    this.compact = false,
    this.centerHeader = false,
  }) : assert(onClose == null || closeLabel != null);

  final String title;
  final String? description;
  final Widget? child;
  final List<Widget> actions;
  final String? closeLabel;
  final VoidCallback? onClose;
  final bool compact;
  final bool centerHeader;

  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    String? dismissLabel,
    bool zoom = true,
  }) {
    final navigator = Navigator.of(context);
    final colors = MatineeTheme.of(context);
    final themes = InheritedTheme.capture(from: context, to: navigator.context);
    final reducedMotion = MediaQuery.disableAnimationsOf(context);

    return navigator.push<T>(
      _DialogRoute<T>(
        builder: (context) => themes.wrap(Builder(builder: builder)),
        backdrop: colors.background.withValues(alpha: .6),
        dismissLabel: dismissLabel,
        zoom: zoom,
        reducedMotion: reducedMotion,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final wide = MediaQuery.sizeOf(context).width >= 640;
    final center = centerHeader && (compact || !wide);
    final close = onClose;
    return Semantics(
      namesRoute: true,
      scopesRoute: true,
      explicitChildNodes: true,
      label: title,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: compact || (centerHeader && !wide) ? 320 : 384,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.popover,
            borderRadius: KitRadius.panel,
            boxShadow: const [
              BoxShadow(
                color: Color(0x66000000),
                blurRadius: 50,
                spreadRadius: -12,
                offset: Offset(0, 25),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: KitRadius.panel,
            // The web's `ring-1 ring-foreground/10` takes no room.
            child: DecoratedBox(
              position: DecorationPosition.foreground,
              decoration: BoxDecoration(
                borderRadius: KitRadius.panel,
                border: Border.all(color: colors.hairline),
              ),
              child: Stack(
                children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Flexible(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: DefaultTextStyle(
                            style: KitText.sm.style(color: colors.foreground),
                            child: Column(
                              crossAxisAlignment: center
                                  ? CrossAxisAlignment.center
                                  : CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding: EdgeInsetsDirectional.only(
                                    end: close == null ? 0 : 26,
                                  ),
                                  child: Text(
                                    title,
                                    textAlign: center
                                        ? TextAlign.center
                                        : TextAlign.start,
                                    style: KitText.base.style(
                                      color: colors.foreground,
                                      weight: FontWeight.w500,
                                      leading: centerHeader ? null : 16,
                                    ),
                                  ),
                                ),
                                if (description case final description?) ...[
                                  SizedBox(height: centerHeader ? 6 : 8),
                                  Text(
                                    description,
                                    textAlign: center
                                        ? TextAlign.center
                                        : TextAlign.start,
                                    style: KitText.sm.style(
                                      color: colors.mutedForeground,
                                    ),
                                  ),
                                ],
                                if (child case final content?) ...[
                                  const SizedBox(height: 16),
                                  content,
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (actions.isNotEmpty)
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: colors.muted.withValues(alpha: .5),
                            border: Border(
                              top: BorderSide(color: colors.border),
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: compact
                                ? Row(
                                    spacing: 8,
                                    children: [
                                      for (final action in actions)
                                        Expanded(child: action),
                                    ],
                                  )
                                : wide
                                ? Wrap(
                                    alignment: WrapAlignment.end,
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: actions,
                                  )
                                : Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    spacing: 8,
                                    children: actions.reversed.toList(),
                                  ),
                          ),
                        ),
                    ],
                  ),
                  if (close != null)
                    PositionedDirectional(
                      top: 8,
                      end: 8,
                      child: MatineeButton(
                        look: ButtonLook.ghost,
                        size: ButtonSize.iconSm,
                        leading: Lucide.x,
                        label: closeLabel,
                        onPressed: close,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DialogRoute<T> extends RawDialogRoute<T> {
  _DialogRoute({
    required WidgetBuilder builder,
    required this.backdrop,
    required String? dismissLabel,
    required bool zoom,
    required bool reducedMotion,
  }) : super(
         barrierDismissible: dismissLabel != null,
         barrierLabel: dismissLabel,
         barrierColor: const Color(0x00000000),
         transitionDuration: reducedMotion
             ? Duration.zero
             : const Duration(milliseconds: 200),
         traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
         pageBuilder: (context, animation, secondaryAnimation) => SafeArea(
           child: Center(
             child: Padding(
               padding: const EdgeInsets.all(16),
               child: Builder(builder: builder),
             ),
           ),
         ),
         transitionBuilder: (context, animation, secondaryAnimation, child) {
           final t = animation.drive(CurveTween(curve: Curves.easeOut));
           return FadeTransition(
             opacity: t,
             child: zoom
                 ? ScaleTransition(
                     scale: Tween(begin: .95, end: 1.0).animate(t),
                     child: child,
                   )
                 : child,
           );
         },
       );

  final Color backdrop;

  @override
  Duration get reverseTransitionDuration => transitionDuration == Duration.zero
      ? Duration.zero
      : const Duration(milliseconds: 150);

  @override
  Widget buildModalBarrier() => ModalBackdrop(
    color: backdrop,
    animation: animation!,
    child: super.buildModalBarrier(),
  );
}

class ConfirmDialog extends StatelessWidget {
  const ConfirmDialog({
    super.key,
    required this.title,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.onConfirm,
    required this.onCancel,
    this.description,
    this.destructive = false,
    this.compact = false,
  });

  final String title;
  final String confirmLabel;
  final String cancelLabel;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final String? description;
  final bool destructive;
  final bool compact;

  static Future<bool> show(
    BuildContext context, {
    required String title,
    required String confirmLabel,
    required String cancelLabel,
    String? description,
    bool destructive = false,
    bool compact = false,
  }) async =>
      await Dialog.show<bool>(
        context,
        builder: (context) => ConfirmDialog(
          title: title,
          description: description,
          confirmLabel: confirmLabel,
          cancelLabel: cancelLabel,
          destructive: destructive,
          compact: compact,
          onConfirm: () => Navigator.pop(context, true),
          onCancel: () => Navigator.pop(context, false),
        ),
      ) ??
      false;

  @override
  Widget build(BuildContext context) => Dialog(
    title: title,
    description: description,
    compact: compact,
    centerHeader: true,
    actions: [
      MatineeButton(
        look: ButtonLook.outline,
        autofocus: true,
        onPressed: onCancel,
        child: Text(cancelLabel),
      ),
      MatineeButton(
        look: destructive ? ButtonLook.destructive : ButtonLook.primary,
        onPressed: onConfirm,
        child: Text(confirmLabel),
      ),
    ],
  );
}
