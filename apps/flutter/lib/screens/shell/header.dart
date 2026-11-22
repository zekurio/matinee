import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../router.dart';

/// The band at the top of every tab, laid out as YouTube's: the logo at the
/// start, then settings and search as bare icons. It stays put while the page
/// scrolls. Search opens Explore, which an admin's waiting requests head.
/// Offline, where search can't work, the header says so in its place.
class ShellHeader extends ConsumerWidget {
  const ShellHeader({super.key});

  /// Under the status bar.
  static const height = 56.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final offline = ref.watch(authStateProvider) is Offline;
    return _HeaderBand(
      child: Row(
        children: [
          Semantics(
            header: true,
            child: Logo(height: 18, label: words.appName),
          ),
          const Spacer(),
          HeaderButton(
            icon: Lucide.settings,
            label: words.shellSettings,
            onPressed: () => context.push(Routes.settings),
          ),
          if (offline)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: KitIcon(
                Lucide.cloudOff,
                color: colors.mutedForeground,
                label: words.downloadsOffline,
              ),
            )
          else
            HeaderButton(
              icon: Lucide.search,
              label: words.searchTitle,
              onPressed: () => context.push(Routes.search),
            ),
        ],
      ),
    );
  }
}

/// A tab's band, as tall as [ShellHeader]'s and under the status bar in the
/// same way: the tab's name at the start, and only the actions that belong to
/// it at the end. Offline, [offline] puts the cloud icon in an action's place.
class TabHeader extends StatelessWidget {
  const TabHeader({
    super.key,
    required this.title,
    this.action,
    this.offline = false,
  });

  final String title;
  final HeaderAction? action;
  final bool offline;

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final action = this.action;
    return _HeaderBand(
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                // The wordmark's lowercase letters are about 12.5 logical
                // pixels tall; at px26 the title's are the same. The band is
                // fixed, so even the largest text setting keeps its one line
                // inside, and the action at the end.
                textScaler: MediaQuery.textScalerOf(context)
                    .clamp(maxScaleFactor: 1.6),
                style: KitText.px26
                    .style(color: colors.foreground, weight: FontWeight.w700)
                    .copyWith(letterSpacing: KitText.px26.size * -.025),
              ),
            ),
          ),
          if (offline)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: KitIcon(
                Lucide.cloudOff,
                color: colors.mutedForeground,
                label: words.downloadsOffline,
              ),
            )
          else if (action case final action?)
            HeaderButton(
              icon: action.icon,
              label: action.label(words),
              onPressed: () => context.push(action.route),
            ),
        ],
      ),
    );
  }
}

/// What a tab header offers at its end, and where it goes.
enum HeaderAction {
  search(Lucide.search, Routes.search),
  settings(Lucide.settings, Routes.settings);

  const HeaderAction(this.icon, this.route);

  final String icon;
  final String route;

  String label(AppLocalizations words) => switch (this) {
    search => words.searchTitle,
    settings => words.shellSettings,
  };
}

/// The background, status bar inset, height, and edge insets both headers
/// share, so a tab's first row doesn't move when another tab's header shows.
class _HeaderBand extends StatelessWidget {
  const _HeaderBand({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: ShellHeader.height,
          child: Padding(
            // A button's 44 holds its 22 icon 11 in, so the last icon ends
            // 16 from the edge, where the logo starts on the other side.
            padding: const EdgeInsets.only(left: 16, right: 5),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// An icon with nothing around it, 44 square to tap. Pressing dims it.
class HeaderButton extends StatelessWidget {
  const HeaderButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: KitRadius.pill,
      builder: (context, state) => SizedBox.square(
        dimension: 44,
        child: Center(
          child: KitIcon(
            icon,
            size: 22,
            color: state == PressState.pressed
                ? colors.mutedForeground
                : colors.foreground,
          ),
        ),
      ),
    );
  }
}
