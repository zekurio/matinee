import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/back_claim.dart';
import 'core/device.dart';
import 'core/server_accents.dart';
import 'core/toasts.dart';
import 'kit/accent.dart';
import 'kit/material_you.dart';
import 'kit/theme.dart';
import 'kit/theme_store.dart';
import 'kit/toast.dart';
import 'kit/tokens.dart';
import 'kit/tv/tv_metrics.dart';

import 'l10n/app_localizations.dart';
import 'router.dart';

/// The app: one widget tree for phones, tablets, and TVs. Which screens a
/// device gets is decided once, from its form factor.
class MatineeApp extends ConsumerWidget {
  const MatineeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferences =
        ref.watch(themeStoreProvider).value ?? defaultThemePreferences;
    final device = ref.watch(deviceProvider);
    // The wallpaper's colors instead of Matinee's, where Material You is on:
    // the server's accents and the preset stay out of the way then.
    final wallpaper = preferences.materialYou && !device.isTv
        ? ref.watch(materialYouProvider).value
        : null;
    // The server's accents, or the Branding page's before they're saved,
    // over the preset's own, as the web paints them.
    final accents = wallpaper == null
        ? ref.watch(accentPreviewProvider) ?? ref.watch(serverAccentsProvider)
        : null;
    final light =
        wallpaper?.light ?? accented(preferences.preset.light, accents?.light);
    final dark =
        wallpaper?.dark ?? accented(preferences.preset.dark, accents?.dark);
    return MaterialYouWatcher(
      child: MaterialApp.router(
        routerConfig: ref.watch(routerProvider),
        onNavigationNotification: ref.watch(backClaimProvider).onNotification,
        theme: MatineeTheme.data(light, dark: dark),
        darkTheme: MatineeTheme.data(dark),
        themeMode: switch (preferences.appearance) {
          ThemeAppearance.system => ThemeMode.system,
          ThemeAppearance.light => ThemeMode.light,
          ThemeAppearance.dark => ThemeMode.dark,
        },
        onGenerateTitle: (context) => AppLocalizations.of(context).appName,
        debugShowCheckedModeBanner: false,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => DefaultTextStyle(
          style: KitText.sm.style(color: MatineeTheme.of(context).foreground),
          // Toasts sit above the tab bar, over whatever page is open.
          child: Stack(
            children: [
              child!,
              if (device.isTv)
                // Clear of the drawer's rail and the overscan.
                Positioned(
                  left: TvPage.start,
                  right: TvPage.end,
                  bottom: Overscan.vertical + 16,
                  child: Center(
                    child: ToastHost(state: ref.watch(toastProvider), tv: true),
                  ),
                )
              else
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 64,
                  child: Center(
                    child: ToastHost(state: ref.watch(toastProvider)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
