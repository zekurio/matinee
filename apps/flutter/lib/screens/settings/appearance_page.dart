import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// Settings, Appearance, as the web's: the color scheme as three miniatures of
/// the app, then the theme preset, each a miniature in its light and dark
/// colors. Both are this device's, kept by `themeStoreProvider`.
class AppearancePage extends ConsumerWidget {
  const AppearancePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final saved =
        ref.watch(themeStoreProvider).value ?? defaultThemePreferences;
    final store = ref.read(themeStoreProvider.notifier);
    final preset = saved.preset;
    return SettingsScaffold(
      title: l.settingsPageAppearance,
      sections: [
        SettingsSection(
          title: l.webAppearanceColorScheme,
          child: Row(
            spacing: 10,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final appearance in ThemeAppearance.values)
                Expanded(
                  child: _Choice(
                    label: switch (appearance) {
                      ThemeAppearance.system =>
                        l.webAppearanceColorSchemeSystem,
                      ThemeAppearance.light => l.webAppearanceColorSchemeLight,
                      ThemeAppearance.dark => l.webAppearanceColorSchemeDark,
                    },
                    selected: saved.appearance == appearance,
                    onPressed: () => store.setAppearance(appearance),
                    picture: switch (appearance) {
                      ThemeAppearance.system => _Split(
                        light: preset.light,
                        dark: preset.dark,
                      ),
                      ThemeAppearance.light => _Miniature(preset.light),
                      ThemeAppearance.dark => _Miniature(preset.dark),
                    },
                  ),
                ),
            ],
          ),
        ),
        SettingsSection(
          title: l.appearancePreset,
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final option in ThemePreset.values)
                SizedBox(
                  width: 140,
                  child: _Choice(
                    label: switch (option) {
                      ThemePreset.matinee => l.appearancePresetMatinee,
                    },
                    selected: option == preset,
                    onPressed: () => store.setPreset(option),
                    picture: _Split(light: option.light, dark: option.dark),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A choice as a picture over its name, ringed in the accent when it's the
/// one picked.
class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.selected,
    required this.onPressed,
    required this.picture,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;
  final Widget picture;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      checked: selected,
      inMutuallyExclusiveGroup: true,
      shape: KitRadius.panel,
      builder: (context, state) => DecoratedBox(
        decoration: BoxDecoration(
          color: selected
              ? colors.accentSoft
              : colors.foreground.withValues(
                  alpha: state == PressState.idle ? .02 : .06,
                ),
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          border: Border.all(color: selected ? colors.accent : colors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: ExcludeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                picture,
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.xs.style(
                      color: selected
                          ? colors.foreground
                          : colors.mutedForeground,
                      weight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The light miniature with the dark one over its right half.
class _Split extends StatelessWidget {
  const _Split({required this.light, required this.dark});

  final KitColors light;
  final KitColors dark;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      _Miniature(light),
      ClipRect(clipper: const _RightHalf(), child: _Miniature(dark)),
    ],
  );
}

class _RightHalf extends CustomClipper<Rect> {
  const _RightHalf();

  @override
  Rect getClip(Size size) =>
      Rect.fromLTRB(size.width / 2, 0, size.width, size.height);

  @override
  bool shouldReclip(_RightHalf oldClipper) => false;
}

/// Home in [colors]: the banner fading into the page, its title and
/// button, and a row of posters.
class _Miniature extends StatelessWidget {
  const _Miniature(this.colors);

  final KitColors colors;

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 16 / 10,
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: const BorderRadius.all(Radius.circular(KitRadius.md)),
        border: Border.all(color: colors.border),
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.all(Radius.circular(KitRadius.md)),
        child: Stack(
          children: [
            Positioned.fill(
              child: FractionallySizedBox(
                alignment: Alignment.topCenter,
                heightFactor: .6,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [colors.borderStrong, colors.background],
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 6,
              top: 0,
              bottom: 0,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 3,
                children: [
                  _Bar(width: 22, height: 3, color: colors.text),
                  _Bar(width: 14, height: 5, color: colors.accent),
                ],
              ),
            ),
            Positioned(
              left: 5,
              bottom: 5,
              child: Row(
                spacing: 3,
                children: [
                  for (var i = 0; i < 5; i++)
                    Container(
                      width: 9,
                      height: 13,
                      decoration: BoxDecoration(
                        color: colors.surfaceRaised,
                        borderRadius: const BorderRadius.all(
                          Radius.circular(2),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _Bar extends StatelessWidget {
  const _Bar({required this.width, required this.height, required this.color});

  final double width;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(color: color, borderRadius: KitRadius.pill),
  );
}
