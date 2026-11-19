import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'modal_backdrop.dart';
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

  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    required String dismissLabel,
    bool dismissible = true,
    bool draggable = true,
  }) {
    final navigator = Navigator.of(context);
    final colors = MatineeTheme.of(context);
    return navigator.push<T>(
      _SheetRoute<T>(
        builder: builder,
        capturedThemes: InheritedTheme.capture(
          from: context,
          to: navigator.context,
        ),
        barrierLabel: dismissLabel,
        isDismissible: dismissible,
        enableDrag: draggable,
        backdrop: colors.background.withValues(alpha: .6),
        reducedMotion: MediaQuery.disableAnimationsOf(context),
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
  }) : super(
         isScrollControlled: false,
         scrollControlDisabledMaxHeightRatio: .85,
         useSafeArea: true,
         showDragHandle: false,
         backgroundColor: const Color(0x00000000),
         modalBarrierColor: const Color(0x00000000),
         constraints: const BoxConstraints(),
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
