import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/media/artwork.dart';

import '../core/fakes.dart';

final server = Uri.parse('https://media.example.com');

/// Loads Red Hat Text, for tests that measure or picture text.
Future<void> loadFont() async {
  await (FontLoader(
    KitText.family,
  )..addFont(rootBundle.load('assets/fonts/red_hat_text.ttf'))).load();
}

/// Shows [screen] at `/`, signed in to [server] through [client], in a
/// window [size] big. Anywhere it navigates shows its location as text.
Future<GoRouter> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  required http.Client client,
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
  List<Override> overrides = const [],
  bool settle = true,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [GoRoute(path: '/', builder: (context, state) => screen)],
    errorBuilder: (context, state) => Text('${state.uri}'),
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('$server', User.fromJson(userJson('ada'))),
        ),
        apiProvider.overrideWithValue(MatineeApi(base: server, client: client)),
        artworkLoaderProvider.overrideWithValue(
          ArtworkLoader(client, const NoArtworkCache()),
        ),
        ...overrides,
      ],
      child: MaterialApp.router(
        routerConfig: router,
        debugShowCheckedModeBanner: false,
        theme: MatineeTheme.data(colors),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: DefaultTextStyle(
            style: KitText.sm.style(color: colors.foreground),
            child: child!,
          ),
        ),
      ),
    ),
  );
  if (settle) await tester.pumpAndSettle();
  return router;
}
