import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/extensions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import '../../router.dart';

/// The band at the top of Home: the logo at the start, search as a bare icon,
/// and the account's picture at the end. It stays put while the page scrolls.
/// Search opens Search, which offline looks through the downloads. Settings
/// is reached from the profile, not here.
class ShellHeader extends StatelessWidget {
  const ShellHeader({super.key});

  /// Under the status bar: the band's 56 for its row, and 8 above it so
  /// the row sits a little lower, within a thumb's reach.
  static const height = 64.0;

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    return _HeaderBand(
      child: Row(
        children: [
          Semantics(
            header: true,
            child: Logo(height: 18, label: words.appName),
          ),
          const Spacer(),
          HeaderButton(
            icon: Lucide.search,
            label: words.searchTitle,
            onPressed: () => context.push(Routes.search),
          ),
          const HeaderAvatar(),
        ],
      ),
    );
  }
}

/// A tab's band, as tall as [ShellHeader]'s and under the status bar in the
/// same way: the tab's name at the start, and only the actions that belong to
/// it at the end, before the account's picture.
class TabHeader extends StatelessWidget {
  const TabHeader({super.key, required this.title, this.actions = const []});

  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
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
                // inside, and the actions at the end.
                textScaler: MediaQuery.textScalerOf(context)
                    .clamp(maxScaleFactor: 1.6),
                style: KitText.px26
                    .style(color: colors.foreground, weight: FontWeight.w700)
                    .copyWith(letterSpacing: KitText.px26.size * -.025),
              ),
            ),
          ),
          ...actions,
          const HeaderAvatar(),
        ],
      ),
    );
  }
}

/// The account's picture at a header's end, the way in to the profile: 30
/// across in the header's 44 tap target, the initials while the picture can't
/// load or the account has none, and always there offline, where the profile's
/// account rows still work.
class HeaderAvatar extends ConsumerWidget {
  const HeaderAvatar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    final user = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    if (user == null) return const SizedBox.shrink();
    return PressIndication(
      onPressed: () => context.push(Routes.profile),
      label: words.tabProfile,
      shape: KitRadius.pill,
      builder: (context, state) => SizedBox.square(
        dimension: 44,
        child: Center(
          child: ExcludeSemantics(
            child: Avatar(avatarId: user.avatarId, name: user.name, size: 30),
          ),
        ),
      ),
    );
  }
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
            // 16 from the edge, where the logo starts on the other side. The
            // row sits 8 under the status bar, as the web's phone headers do,
            // so its actions are easier to reach.
            padding: const EdgeInsets.only(left: 16, top: 8, right: 5),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// An icon with nothing around it, 44 square to tap. Pressing dims it; with
/// [count] above zero, a filled accent badge at the icon's top-end corner
/// says how many things, as the filter button does.
class HeaderButton extends StatelessWidget {
  const HeaderButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.count = 0,
    this.focusNode,
  });

  final String icon;
  final String label;
  final VoidCallback onPressed;

  /// The badge's number, and no badge at zero.
  final int count;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      focusNode: focusNode,
      shape: KitRadius.pill,
      builder: (context, state) => SizedBox.square(
        dimension: 44,
        child: Center(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              KitIcon(
                icon,
                size: 22,
                color: state == PressState.pressed
                    ? colors.mutedForeground
                    : colors.foreground,
              ),
              if (count > 0)
                PositionedDirectional(
                  top: -6,
                  end: -8,
                  child: CountBadge(count),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// How many filters are on, at an icon's corner, on a header's buttons and
/// a list heading's: a filled accent circle
/// with the number in its foreground, grown with the text so it stays
/// legible at the largest size.
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final size = math.max(
      16.0,
      MediaQuery.textScalerOf(context)
          .clamp(maxScaleFactor: 1.6)
          .scale(KitText.px11.lineHeight),
    );
    return ExcludeSemantics(
      child: Container(
        height: size,
        constraints: BoxConstraints(minWidth: size),
        padding: const EdgeInsets.symmetric(horizontal: 3),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: colors.accent,
          borderRadius: KitRadius.pill,
        ),
        child: Text(
          '$count',
          maxLines: 1,
          style: KitText.px11.style(
            color: colors.accentForeground,
            weight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
