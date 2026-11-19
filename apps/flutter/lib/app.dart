import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'kit/theme.dart';
import 'kit/theme_store.dart';
import 'kit/tokens.dart';

import 'l10n/app_localizations.dart';

/// The app: one widget tree for phones, tablets, and TVs. Which screens a
/// device gets is decided once, from its form factor.
class MatineeApp extends ConsumerWidget {
  const MatineeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferences =
        ref.watch(themeStoreProvider).value ?? defaultThemePreferences;
    return MaterialApp(
      theme: MatineeTheme.data(preferences.preset.light),
      darkTheme: MatineeTheme.data(preferences.preset.dark),
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
        child: child!,
      ),
      home: const _Placeholder(),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: MatineeTheme.of(context).background,
      child: Center(
        child: Text(
          AppLocalizations.of(context).appName,
          style: KitText.xxl.style(color: MatineeTheme.of(context).foreground),
        ),
      ),
    );
  }
}
