import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'modal_backdrop.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class Sheet extends StatelessWidget {
  const Sheet({
    super.key,
    required this.child,
    this.title,
    this.description,
    this.footer,
  });

  final Widget child;
  final String? title;
  final String? description;
  final Widget? footer;

  /// As wide as a sheet gets on a tablet, as Material 3's sheets in the
  /// Kotlin app are; narrower screens get it edge to edge.
  static const widest = 640.0;

  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    required String dismissLabel,
  }) {
    // Over the whole app, the tab bar too, wherever it's opened from.
    final navigator = Navigator.of(context, rootNavigator: true);
    final colors = MatineeTheme.of(context);
    return navigator.push<T>(
      _SheetRoute<T>(
        builder: builder,
        capturedThemes: InheritedTheme.capture(
          from: context,
          to: navigator.context,
        ),
        barrierLabel: dismissLabel,
        isDismissible: true,
        enableDrag: true,
        backdrop: colors.background.withValues(alpha: .6),
        reducedMotion: MediaQuery.disableAnimationsOf(context),
        maxWidth: widest,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Glass(
      shape: const BorderRadius.vertical(top: Radius.circular(KitRadius.xl)),
      border: Border(top: BorderSide(color: colors.hairline)),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 8, bottom: 4),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.foreground.withValues(alpha: .2),
                  borderRadius: KitRadius.pill,
                ),
              ),
            ),
            if (title != null || description != null)
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(20, 8, 20, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 4,
                  children: [
                    if (title case final heading?)
                      Semantics(
                        header: true,
                        child: Text(
                          heading,
                          style: KitText.base.style(
                            color: colors.foreground,
                            weight: FontWeight.w500,
                          ),
                        ),
                      ),
                    if (description case final text?)
                      Text(
                        text,
                        style: KitText.sm.style(color: colors.mutedForeground),
                      ),
                  ],
                ),
              ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: DefaultTextStyle(
                  style: KitText.sm.style(color: colors.foreground),
                  child: child,
                ),
              ),
            ),
            if (footer case final footer?)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: footer,
              ),
          ],
        ),
      ),
    );
  }
}

class _SheetRoute<T> extends material.ModalBottomSheetRoute<T> {
  _SheetRoute({
    required super.builder,
    required super.capturedThemes,
    required super.barrierLabel,
    required super.isDismissible,
    required super.enableDrag,
    required this.backdrop,
    required bool reducedMotion,
    required double maxWidth,
  }) : super(
         isScrollControlled: false,
         scrollControlDisabledMaxHeightRatio: .85,
         useSafeArea: true,
         showDragHandle: false,
         backgroundColor: const Color(0x00000000),
         modalBarrierColor: const Color(0x00000000),
         constraints: BoxConstraints(maxWidth: maxWidth),
         elevation: 0,
         clipBehavior: Clip.none,
         sheetAnimationStyle: reducedMotion
             ? AnimationStyle.noAnimation
             : const AnimationStyle(
                 duration: Duration(milliseconds: 280),
                 reverseDuration: Duration(milliseconds: 200),
               ),
       );

  final Color backdrop;

  @override
  Widget buildModalBarrier() => ModalBackdrop(
    color: backdrop,
    animation: animation!,
    child: super.buildModalBarrier(),
  );
}

/// A row in a sheet's menu: an icon and what it does, the whole row a
/// button. [destructive] is red, as taking a download back.
class SheetItem extends StatelessWidget {
  const SheetItem({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.destructive = false,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final color = destructive ? colors.danger : colors.foreground;
    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: KitRadius.control,
      builder: (context, state) => DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: KitRadius.control,
          color: colors.foreground.withValues(
            alpha: switch (state) {
              PressState.pressed => .1,
              PressState.idle => 0,
              _ => .06,
            },
          ),
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            child: Row(
              spacing: 16,
              children: [
                KitIcon(
                  icon,
                  color: destructive ? color : colors.mutedForeground,
                ),
                Expanded(
                  child: Text(label, style: KitText.base.style(color: color)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A line between a sheet's groups of items.
class SheetSeparator extends StatelessWidget {
  const SheetSeparator({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: SizedBox(
      height: 1,
      child: ColoredBox(color: MatineeTheme.of(context).hairline),
    ),
  );
}
