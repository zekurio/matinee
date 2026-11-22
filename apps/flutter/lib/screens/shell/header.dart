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
///
/// [floating] puts it over Home's hero: no band of its own, its words and
/// icons white from the dark half of the theme, with a soft shadow so they
/// read over the hero's top shade. Other tabs keep the band.
class ShellHeader extends ConsumerWidget {
  const ShellHeader({super.key, this.floating = false});

  final bool floating;

  /// Under the status bar.
  static const height = 56.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    final offline = ref.watch(authStateProvider) is Offline;
    if (floating) {
      // The hero stays dark in either scheme, so its words come from the
      // dark half too.
      return MatineeTheme.alwaysDark(
        context,
        _floating(context, words, offline),
      );
    }
    return ColoredBox(
      color: MatineeTheme.of(context).background,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: height,
          child: _row(context, words, offline, floating: false),
        ),
      ),
    );
  }

  /// Over the hero: the status bar's room left to the page, then the row.
  /// The hero's own top scrim shades the art under both, so the header adds
  /// no band of its own.
  Widget _floating(BuildContext context, AppLocalizations words, bool offline) {
    final top = MediaQuery.paddingOf(context).top;
    return Padding(
      padding: EdgeInsets.only(top: top),
      child: SizedBox(
        height: height,
        child: _row(context, words, offline, floating: true),
      ),
    );
  }

  Widget _row(
    BuildContext context,
    AppLocalizations words,
    bool offline, {
    required bool floating,
  }) {
    final colors = MatineeTheme.of(context);
    return Padding(
      // A button's 44 holds its 22 icon 11 in, so the last icon ends
      // 16 from the edge, where the logo starts on the other side.
      padding: const EdgeInsets.only(left: 16, right: 5),
      child: Row(
        children: [
          Semantics(
            header: true,
            child: Logo(height: 18, label: words.appName),
          ),
          const Spacer(),
          _HeaderButton(
            icon: Lucide.settings,
            label: words.shellSettings,
            onPressed: () => context.push(Routes.settings),
            floating: floating,
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
            _HeaderButton(
              icon: Lucide.search,
              label: words.searchTitle,
              onPressed: () => context.push(Routes.search),
              floating: floating,
            ),
        ],
      ),
    );
  }
}

/// An icon with nothing around it, 44 square to tap. Pressing dims it. Over
/// the hero it takes a soft shadow, as the words beside it.
class _HeaderButton extends StatelessWidget {
  const _HeaderButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    required this.floating,
  });

  final String icon;
  final String label;
  final VoidCallback onPressed;
  final bool floating;

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
            shadows: floating
                ? const [
                    Shadow(
                      color: Color(0x99000000),
                      offset: Offset(0, 1),
                      blurRadius: 8,
                    ),
                  ]
                : null,
          ),
        ),
      ),
    );
  }
}
