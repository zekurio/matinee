import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/gallery.dart';
import 'package:matinee/kit/kit.dart';

const _frame = ValueKey('kit-frame');

class _GoldenBinding extends AutomatedTestWidgetsFlutterBinding {
  @override
  bool get disableShadows => false;
}

void main() {
  _GoldenBinding();
  setUpAll(() async {
    await (FontLoader(
      KitText.family,
    )..addFont(rootBundle.load('assets/fonts/red_hat_text.ttf'))).load();
  });

  for (final (appearance, colors) in [
    ('dark', matineeDark),
    ('light', matineeLight),
  ]) {
    for (final group in [null, ...GalleryGroup.values]) {
      final name = group?.name ?? 'gallery';
      testWidgets('$name in $appearance', (tester) async {
        await _showGallery(tester, colors, group: group);
        await expectLater(
          find.byKey(_frame),
          matchesGoldenFile('goldens/${name}_$appearance.png'),
        );
      });
    }
    for (final (button, name) in [
      ('Dialog', 'dialog'),
      ('Confirm dialog', 'confirm_dialog'),
      ('Sheet', 'sheet'),
      ('Menu', 'menu'),
    ]) {
      testWidgets('$button open in $appearance', (tester) async {
        await _showGallery(tester, colors, group: GalleryGroup.overlays);
        await tester.tap(find.text(button));
        await _render(tester);
        await expectLater(
          find.byKey(_frame),
          matchesGoldenFile('goldens/${name}_$appearance.png'),
        );
      });
    }
  }

  testWidgets('a labelled button is read by its label alone', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      _frameFor(
        matineeDark,
        Center(
          child: MatineeButton(
            onPressed: () {},
            leading: Lucide.plus,
            label: 'Request. Ask an admin',
            child: const Text('Request'),
          ),
        ),
      ),
    );
    expect(
      tester.getSemantics(find.byType(MatineeButton)),
      matchesSemantics(
        label: 'Request. Ask an admin',
        isButton: true,
        hasTapAction: true,
        hasFocusAction: true,
        isFocusable: true,
        hasEnabledState: true,
        isEnabled: true,
      ),
    );
    semantics.dispose();
  });

  testWidgets('keyboard focus activates a button and skips disabled buttons', (
    tester,
  ) async {
    final first = FocusNode();
    final disabled = FocusNode();
    final last = FocusNode();
    addTearDown(first.dispose);
    addTearDown(disabled.dispose);
    addTearDown(last.dispose);
    var presses = 0;
    await tester.pumpWidget(
      _frameFor(
        matineeDark,
        Align(
          alignment: Alignment.topLeft,
          child: Row(
            children: [
              MatineeButton(
                autofocus: true,
                focusNode: first,
                onPressed: () => presses++,
                child: const Text('First'),
              ),
              MatineeButton(
                focusNode: disabled,
                onPressed: null,
                child: const Text('Disabled'),
              ),
              MatineeButton(
                focusNode: last,
                onPressed: () => presses++,
                dimmed: true,
                child: const Text('Last'),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
    expect(first.hasPrimaryFocus, isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    expect(last.hasPrimaryFocus, isTrue);
    expect(disabled.hasFocus, isFalse);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(presses, 1);
  });

  testWidgets('search can clear its query and collapse', (tester) async {
    final semantics = tester.ensureSemantics();

    await _showGallery(tester, matineeDark, group: GalleryGroup.fields);
    await tester.tap(find.bySemanticsLabel('Clear search'));
    await tester.pump();
    expect(find.text('Late show'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Back from search'));
    await tester.pump();
    expect(find.byType(EditableText), findsNWidgets(3));
    semantics.dispose();
  });

  testWidgets('the bottom sheet dismisses when dragged down', (tester) async {
    await _showGallery(
      tester,
      matineeDark,
      group: GalleryGroup.overlays,
      reduceMotion: false,
    );
    await tester.tap(find.text('Sheet'));
    await _render(tester);
    expect(find.text('Playback options'), findsOneWidget);
    final sheet = tester.getRect(find.byType(Sheet));
    await tester.flingFrom(
      sheet.topCenter + const Offset(0, 10),
      const Offset(0, 150),
      800,
    );
    await _render(tester);
    expect(find.text('Playback options'), findsNothing);
  });

  testWidgets('toast reports action and times the next entry when visible', (
    tester,
  ) async {
    final state = ToastState();
    addTearDown(state.dispose);
    final acted = state.show(
      'Removed',
      actionLabel: 'Undo',
      duration: ToastDuration.indefinite,
    );
    final timed = state.show('Restored');
    await tester.pumpWidget(
      _frameFor(matineeDark, Center(child: ToastHost(state: state))),
    );
    await tester.pump(const Duration(seconds: 5));
    expect(find.text('Removed'), findsOneWidget);
    expect(find.text('Restored'), findsNothing);
    await tester.tap(find.text('Undo'));
    await tester.pump();
    expect(await acted, ToastResult.action);
    expect(find.text('Restored'), findsOneWidget);
    await tester.pump(ToastDuration.short.timeout!);
    expect(await timed, ToastResult.timedOut);
    expect(find.text('Restored'), findsNothing);
  });
}

Future<void> _showGallery(
  WidgetTester tester,
  KitColors colors, {
  GalleryGroup? group,
  bool reduceMotion = true,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(412, 915);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    _frameFor(colors, KitGallery(group: group), reduceMotion: reduceMotion),
  );
  await _render(tester);
}

Widget _frameFor(KitColors colors, Widget page, {bool reduceMotion = true}) =>
    RepaintBoundary(
      key: _frame,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: MatineeTheme.data(colors),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(disableAnimations: reduceMotion),
          child: child!,
        ),
        home: page,
      ),
    );

Future<void> _render(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump();
}
