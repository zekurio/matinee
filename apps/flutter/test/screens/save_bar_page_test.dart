import 'dart:async';

import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/settings/admin/admin_parts.dart';

/// What the bar reads out without showing it.
Finder _said(String label) => find.byWidgetPredicate(
  (widget) => widget is Semantics && widget.properties.label == label,
);

void main() {
  final l = AppLocalizationsEn();

  Future<void> pump(
    WidgetTester tester, {
    Future<void> Function()? onSave,
    bool startDirty = true,
  }) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: _Harness(
          key: ValueKey(startDirty),
          startDirty: startDirty,
          onSave: onSave ?? () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the bar is absent until there are edits, then shows them', (
    tester,
  ) async {
    await pump(tester, startDirty: false);
    expect(find.byType(SaveBar), findsNothing);

    await pump(tester);
    expect(find.byType(SaveBar), findsOneWidget);
    expect(_said(l.webCommonSaveBarUnsaved), findsOneWidget);
  });

  testWidgets('a save spins, then reports Saved and goes', (tester) async {
    final save = Completer<void>();
    await pump(tester, onSave: () => save.future);
    await tester.tap(find.text(l.saveBarSave));
    await tester.pump();
    expect(_said(l.webCommonSaveBarSaving), findsOneWidget);
    expect(find.byType(Spinner), findsOneWidget);

    save.complete();
    await tester.pump();
    await tester.pump();
    expect(_said(l.webCommonSaveBarSaved), findsOneWidget);
    expect(find.text(l.webCommonSaveBarDone), findsOneWidget);

    await tester.pump(savedFor);
    await tester.pumpAndSettle();
    expect(find.byType(SaveBar), findsNothing);
  });

  testWidgets('a failed save keeps its reason and offers Try again', (
    tester,
  ) async {
    await pump(tester, onSave: () async => throw Exception('refused'));
    await tester.tap(find.text(l.saveBarSave));
    await tester.pump();
    await tester.pump();

    expect(
      find.text('${l.webCommonSaveBarFailed}. ${l.errorConnectionLost}'),
      findsOneWidget,
    );
    expect(find.text(l.webCommonSaveBarRetry), findsOneWidget);
    expect(find.byType(SaveBar), findsOneWidget);
  });
}

/// A page whose edit clears [dirty] once its save goes through, as the real
/// pages do when the server answers.
class _Harness extends StatefulWidget {
  const _Harness({super.key, required this.startDirty, required this.onSave});

  final bool startDirty;
  final Future<void> Function() onSave;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  late var _dirty = widget.startDirty;

  @override
  Widget build(BuildContext context) => SaveBarPage(
    title: 'Branding',
    dirty: _dirty,
    onReset: () => setState(() => _dirty = false),
    onSave: () async {
      await widget.onSave();
      if (mounted) setState(() => _dirty = false);
    },
    child: const SizedBox.expand(),
  );
}
