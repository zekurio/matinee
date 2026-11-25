import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/app_colors.dart';
import 'core/apple_tv.dart';
import 'core/back_claim.dart';
import 'core/device.dart';
import 'core/toasts.dart';
import 'kit/theme.dart';
import 'kit/theme_store.dart';
import 'kit/toast.dart';
import 'kit/tokens.dart';
import 'kit/tv/tv_metrics.dart';

import 'l10n/app_localizations.dart';
import 'launcher/watch_next.dart';
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
    final (:light, :dark) = ref.watch(appColorsProvider);
    final remote = ref.watch(appleTvRemoteProvider);
    return MaterialApp.router(
      routerConfig: ref.watch(routerProvider),
      // Menu on the Siri Remote arrives as Escape, and is Back.
      shortcuts: remote == null
          ? null
          : {
              ...WidgetsApp.defaultShortcuts,
              const SingleActivator(
                LogicalKeyboardKey.escape,
                includeRepeats: false,
              ): const AppleTvBackIntent(),
            },
      actions: remote == null
          ? null
          : {
              ...WidgetsApp.defaultActions,
              AppleTvBackIntent: CallbackAction<AppleTvBackIntent>(
                onInvoke: (_) => remote.back(),
              ),
            },
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
            // An Android TV's launcher shows what to watch next.
            if (ref.watch(hasWatchNextProvider))
              WatchNextLifecycle(child: child!)
            else
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
    );
  }
}
