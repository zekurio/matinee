import 'package:flutter/material.dart' show Material, MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/shell/header.dart';
import 'package:matinee/screens/shell/shell.dart';

/// A signed-in account for the offline state the headers read.
const _user = User(
  id: 'user-1',
  username: 'viewer',
  displayName: null,
  role: 'user',
  permissions: [],
  avatarId: null,
  avatarSource: 'none',
  playback: null,
  library: LibraryPreferences(showSpecials: false),
  sharing: ProfileSharing(favorites: false, stats: false),
);

/// A bare header on a 400-wide page, as the shell lays it out: full width,
/// with no height of its own from the parent.
Future<void> _pump(
  WidgetTester tester,
  int index, {
  AuthState auth = const NoServer(),
}) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [authStateProvider.overrideWithValue(auth)],
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Material(
          child: MatineeTheme.wrap(
            matineeDark,
            Align(
              alignment: Alignment.topLeft,
              child: SizedBox(width: 400, child: ShellTopBar(index: index)),
            ),
          ),
        ),
      ),
    ),
  );
}

/// A header action by the words a screen reader hears.
Finder _button(String label) => find.byWidgetPredicate(
  (widget) => widget is PressIndication && widget.label == label,
);

Finder _offlineMark(String label) => find.byWidgetPredicate(
  (widget) => widget is KitIcon && widget.label == label,
);

void main() {
  testWidgets('Home keeps the logo, settings, and search', (tester) async {
    await _pump(tester, 0);
    expect(find.byType(Logo), findsOneWidget);
    expect(_button('Settings'), findsOneWidget);
    expect(_button('Search'), findsOneWidget);
    expect(find.byType(TabHeader), findsNothing);
  });

  testWidgets('Shows and Movies name the tab and offer search only', (
    tester,
  ) async {
    for (final (index, title) in [(1, 'Shows'), (2, 'Movies')]) {
      await _pump(tester, index);
      expect(find.text(title), findsOneWidget, reason: title);
      expect(find.byType(Logo), findsNothing, reason: title);
      expect(_button('Search'), findsOneWidget, reason: title);
      expect(_button('Settings'), findsNothing, reason: title);
      expect(find.byType(TabHeader), findsOneWidget, reason: title);
    }
  });

  testWidgets('Downloads has no action, and says offline when it is', (
    tester,
  ) async {
    await _pump(tester, 3);
    expect(find.text('Downloads'), findsOneWidget);
    expect(find.byType(PressIndication), findsNothing);
    expect(_offlineMark('Offline'), findsNothing);

    await _pump(tester, 3, auth: const Offline('https://media.test', _user));
    expect(find.text('Downloads'), findsOneWidget);
    expect(find.byType(PressIndication), findsNothing);
    expect(_offlineMark('Offline'), findsOneWidget);
  });

  testWidgets('Profile offers settings only', (tester) async {
    await _pump(tester, 4);
    expect(find.text('Profile'), findsOneWidget);
    expect(_button('Settings'), findsOneWidget);
    expect(_button('Search'), findsNothing);
    expect(find.byType(Logo), findsNothing);
  });

  testWidgets('every header is the same height', (tester) async {
    for (var index = 0; index < 5; index++) {
      await _pump(tester, index);
      expect(
        tester.getSize(find.byType(ShellTopBar)).height,
        ShellHeader.height,
        reason: 'tab $index',
      );
    }
  });
}
