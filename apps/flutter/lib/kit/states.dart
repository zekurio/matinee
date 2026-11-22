import 'package:flutter/widgets.dart';

import 'button.dart';
import 'icon.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

/// A blank bar or block where something loads, in the secondary fill
/// unless [color] says otherwise. Without a size it fills what it's given.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height,
    this.radius = KitRadius.md,
    this.color,
  });

  final double? width;
  final double? height;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: color ?? MatineeTheme.of(context).secondary,
      borderRadius: BorderRadius.all(Radius.circular(radius)),
    ),
  );
}

/// A page's spinner while it has nothing to show yet, in the middle of
/// what it's given.
class LoadingState extends StatelessWidget {
  const LoadingState({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Center(
    child: Spinner(
      size: 32,
      color: MatineeTheme.of(context).accent,
      label: label,
    ),
  );
}

/// There's nothing to show, and that's not a failure: an icon, a heading,
/// and a line or two on why or what to do, centered, with an optional
/// [action] under them.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  final String icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) =>
      _Message(icon: icon, title: title, message: message, actions: [?action]);
}

/// How a page or a section says something didn't load, as the Kotlin app's
/// `ErrorState`: a plain icon, a heading that starts "Couldn't", the reason
/// in a line or two, and Try again; Back to Home beside it where a page
/// has nothing else to show. While the server can't be reached
/// ([disconnected]) it's only the cloud and the buttons, no words, so being
/// offline reads the same everywhere. Words come in as parameters.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.title,
    this.message,
    required this.retryLabel,
    this.onRetry,
    this.homeLabel,
    this.onHome,
    this.disconnected = false,
    this.disconnectedLabel,
    this.icon = Lucide.circleAlert,
  }) : assert(onHome == null || homeLabel != null),
       assert(!disconnected || disconnectedLabel != null);

  final String title;
  final String? message;
  final String retryLabel;
  final VoidCallback? onRetry;
  final String? homeLabel;
  final VoidCallback? onHome;
  final bool disconnected;
  final String? disconnectedLabel;
  final String icon;

  @override
  Widget build(BuildContext context) {
    final retry = onRetry;
    final home = onHome;
    final actions = [
      if (retry != null)
        MatineeButton(
          look: ButtonLook.outline,
          onPressed: retry,
          child: Text(retryLabel),
        ),
      if (home != null)
        MatineeButton(
          look: ButtonLook.ghost,
          onPressed: home,
          child: Text(homeLabel!),
        ),
    ];
    final colors = MatineeTheme.of(context);
    if (disconnected) {
      return Semantics(
        liveRegion: true,
        container: true,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KitIcon(
              Lucide.cloudOff,
              size: 32,
              color: colors.mutedForeground,
              label: disconnectedLabel,
            ),
            if (actions.isNotEmpty) ...[
              const SizedBox(height: 20),
              Wrap(spacing: 8, runSpacing: 8, children: actions),
            ],
          ],
        ),
      );
    }
    return Semantics(
      liveRegion: true,
      container: true,
      child: _Message(
        icon: icon,
        title: title,
        message: message == title ? null : message,
        actions: actions,
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    required this.message,
    required this.actions,
  });

  final String icon;
  final String title;
  final String? message;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final message = this.message;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KitIcon(icon, size: 32, color: colors.mutedForeground),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: KitText.base.style(
                color: colors.foreground,
                weight: FontWeight.w600,
              ),
            ),
            if (message != null && message.trim().isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                message,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
            ],
            if (actions.isNotEmpty) ...[
              const SizedBox(height: 20),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: actions,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
