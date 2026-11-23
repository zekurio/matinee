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
          PageBarButton(
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

/// The account's picture at a header's end, the way in to the profile: 32
/// across in the header's 48 tap target, the initials while the picture can't
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
        dimension: 48,
        child: Center(
          child: ExcludeSemantics(
            child: Avatar(url: user.avatarUrl, name: user.name, size: 32),
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
            // A button's 48 holds its 24 icon 12 in, so the last icon ends
            // 16 from the edge, where the logo starts on the other side. The
            // row sits 8 under the status bar, as the web's phone headers do,
            // so its actions are easier to reach.
            padding: const EdgeInsets.only(left: 16, top: 8, right: 4),
            child: child,
          ),
        ),
      ),
    );
  }
}
