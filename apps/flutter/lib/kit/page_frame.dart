import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

/// A page opened over the tabs, as the Kotlin app's `TopBar` over its
/// content: under the status bar a 64 band with Back, the title, and
/// [actions] at the end, then [child] filling the rest. Without [onBack]
/// there's no Back, as on a page that's the first of its stack.
class PageFrame extends StatelessWidget {
  const PageFrame({
    super.key,
    required this.child,
    this.title,
    this.onBack,
    this.backLabel,
    this.actions = const [],
  }) : assert(onBack == null || backLabel != null);

  final Widget child;
  final String? title;
  final VoidCallback? onBack;
  final String? backLabel;
  final List<Widget> actions;

  static const barHeight = 64.0;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final back = onBack;
    final title = this.title;
    return ColoredBox(
      color: colors.background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SafeArea(
            bottom: false,
            child: SizedBox(
              height: barHeight,
              child: Padding(
                padding: EdgeInsetsDirectional.only(
                  start: back == null ? 16 : 4,
                  end: 4,
                ),
                child: Row(
                  children: [
                    if (back != null)
                      PageBarButton(
                        icon: Lucide.arrowLeft,
                        label: backLabel!,
                        onPressed: back,
                      ),
                    Expanded(
                      child: title == null
                          ? const SizedBox.shrink()
                          : Padding(
                              padding: EdgeInsetsDirectional.only(
                                start: back == null ? 0 : 4,
                              ),
                              child: Semantics(
                                header: true,
                                child: Text(
                                  title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: KitText.xl
                                      .style(
                                        color: colors.foreground,
                                        weight: FontWeight.w600,
                                      )
                                      .copyWith(
                                        letterSpacing: KitText.xl.size * -.025,
                                      ),
                                ),
                              ),
                            ),
                    ),
                    ...actions,
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

/// An icon in a page's bar, 48 square, with nothing around it.
class PageBarButton extends StatelessWidget {
  const PageBarButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: KitRadius.pill,
      builder: (context, state) => SizedBox.square(
        dimension: 48,
        child: Center(
          child: KitIcon(
            icon,
            size: 24,
            color: state == PressState.pressed
                ? colors.mutedForeground
                : colors.foreground,
          ),
        ),
      ),
    );
  }
}
