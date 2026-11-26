import 'package:flutter/widgets.dart';

import 'button.dart';
import 'keyboard_room.dart';
import 'modal_backdrop.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';

class Dialog extends StatelessWidget {
  const Dialog({
    super.key,
    required this.title,
    this.description,
    this.child,
    this.actions = const [],
    this.centerHeader = false,
  });

  final String title;
  final String? description;
  final Widget? child;
  final List<Widget> actions;
  final bool centerHeader;

  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    String? dismissLabel,
  }) {
    // Over the whole app, the tab bar too, wherever it's opened from.
    final navigator = Navigator.of(context, rootNavigator: true);
    final colors = MatineeTheme.of(context);
    final themes = InheritedTheme.capture(from: context, to: navigator.context);
    final reducedMotion = MediaQuery.disableAnimationsOf(context);

    return navigator.push<T>(
      _DialogRoute<T>(
        builder: (context) => themes.wrap(Builder(builder: builder)),
        backdrop: colors.background.withValues(alpha: .6),
        dismissLabel: dismissLabel,
        reducedMotion: reducedMotion,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final wide = MediaQuery.sizeOf(context).width >= 640;
    final center = centerHeader && !wide;
    return Semantics(
      namesRoute: true,
      scopesRoute: true,
      explicitChildNodes: true,
      label: title,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: center ? 320 : 384),
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
              child: Column(
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
                            Text(
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
                        border: Border(top: BorderSide(color: colors.border)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: wide
                            ? Wrap(
                                alignment: WrapAlignment.end,
                                spacing: 8,
                                runSpacing: 8,
                                children: actions,
                              )
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                spacing: 8,
                                children: actions.reversed.toList(),
                              ),
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
    required bool reducedMotion,
  }) : super(
         barrierDismissible: dismissLabel != null,
         barrierLabel: dismissLabel,
         barrierColor: const Color(0x00000000),
         transitionDuration: reducedMotion ? Duration.zero : KitMotion.enter,
         traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
         // Centered in what the keyboard leaves, where its text scrolls and
         // its buttons stay in reach.
         pageBuilder: (context, animation, secondaryAnimation) => KeyboardRoom(
           child: SafeArea(
             child: Center(
               child: Padding(
                 padding: const EdgeInsets.all(16),
                 child: Builder(builder: builder),
               ),
             ),
           ),
         ),
         transitionBuilder: (context, animation, secondaryAnimation, child) {
           final t = animation.drive(CurveTween(curve: KitMotion.easing));
           return FadeTransition(
             opacity: t,
             child: ScaleTransition(
               scale: Tween(begin: .95, end: 1.0).animate(t),
               child: child,
             ),
           );
         },
       );

  final Color backdrop;

  @override
  Duration get reverseTransitionDuration =>
      transitionDuration == Duration.zero ? Duration.zero : KitMotion.exit;

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
  });

  final String title;
  final String confirmLabel;
  final String cancelLabel;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final String? description;
  final bool destructive;

  static Future<bool> show(
    BuildContext context, {
    required String title,
    required String confirmLabel,
    required String cancelLabel,
    String? description,
    bool destructive = false,
  }) async =>
      await Dialog.show<bool>(
        context,
        builder: (context) => ConfirmDialog(
          title: title,
          description: description,
          confirmLabel: confirmLabel,
          cancelLabel: cancelLabel,
          destructive: destructive,
          onConfirm: () => Navigator.pop(context, true),
          onCancel: () => Navigator.pop(context, false),
        ),
      ) ??
      false;

  @override
  Widget build(BuildContext context) => Dialog(
    title: title,
    description: description,
    centerHeader: true,
    actions: [
      MatineeButton(
        look: ButtonLook.ghost,
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
