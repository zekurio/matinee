import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/title/title_parts.dart';

Widget testApp(Widget home) => ProviderScope(
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: MatineeTheme.data(matineeDark),
    home: home,
  ),
);

List<Widget> _sections(int count) => [
  for (var i = 0; i < count; i++)
    SizedBox(height: 150, child: Text('section $i')),
];

void main() {
  // Built in one frame, a title page took two frames' time at 120 Hz while
  // it faded in.
  testWidgets('over a spinner, it builds a section a frame, then shows', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    Widget page(bool loaded) => testApp(
      FadeSwitcher(
        value: loaded,
        child: loaded
            ? TitleScaffold(sections: _sections(20))
            : const Text('loading'),
      ),
    );
    await tester.pumpWidget(page(false));
    await tester.pumpWidget(page(true));
    final built = <int>[];
    for (var frame = 0; frame < 12; frame++) {
      built.add(
        List.generate(20, (i) => i)
            .where(
              (i) => find
                  .text('section $i', skipOffstage: false)
                  .evaluate()
                  .isNotEmpty,
            )
            .length,
      );
      await tester.pump(const Duration(milliseconds: 8));
    }
    // 150 tall and 24 apart, five sections fill the 800 and the next two
    // its cache; the eighth starts past it, so it isn't built and the
    // page shows.
    expect(built.take(8), [1, 2, 3, 4, 5, 6, 7, 7], reason: '$built');
    await tester.pumpAndSettle();
    expect(find.text('loading'), findsNothing);
    expect(find.text('section 0'), findsOneWidget);
  });

  // The poster's column beside it on a tablet is one of the list's
  // sections; built at once it would undo the turns.
  testWidgets("a group's sections count one a frame, and keep their state", (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final group = SectionGroup(
      sections: [
        for (var i = 0; i < 3; i++)
          SizedBox(height: 50, child: Text('grouped $i')),
      ],
      builder: (context, shown) => _Counted(children: shown),
    );
    Widget page(bool loaded) => testApp(
      FadeSwitcher(
        value: loaded,
        child: loaded
            ? TitleScaffold(sections: [group, ..._sections(2)])
            : const Text('loading'),
      ),
    );
    await tester.pumpWidget(page(false));
    await tester.pumpWidget(page(true));
    final built = <String>[];
    for (var frame = 0; frame < 6; frame++) {
      built.add(
        [
          for (var i = 0; i < 3; i++)
            if (find
                .text('grouped $i', skipOffstage: false)
                .evaluate()
                .isNotEmpty)
              'g$i',
          for (var i = 0; i < 2; i++)
            if (find
                .text('section $i', skipOffstage: false)
                .evaluate()
                .isNotEmpty)
              's$i',
        ].join(' '),
      );
      await tester.pump(const Duration(milliseconds: 8));
    }
    expect(built.take(5), [
      'g0',
      'g0 g1',
      'g0 g1 g2',
      'g0 g1 g2 s0',
      'g0 g1 g2 s0 s1',
    ], reason: '$built');
    await tester.pumpAndSettle();
    expect(find.text('loading'), findsNothing);
    // The group's state lived through its sections coming in and the
    // turns ending.
    expect(_CountedState.created, 1);
  });

  testWidgets('opening with its data, it builds at once', (tester) async {
    await tester.pumpWidget(
      testApp(
        FadeSwitcher(value: 1, child: TitleScaffold(sections: _sections(3))),
      ),
    );
    expect(find.text('section 2'), findsOneWidget);
  });
}

/// A column that counts how many times its state was made.
class _Counted extends StatefulWidget {
  const _Counted({required this.children});

  final List<Widget> children;

  @override
  State<_Counted> createState() => _CountedState();
}

class _CountedState extends State<_Counted> {
  static var created = 0;

  @override
  void initState() {
    super.initState();
    created++;
  }

  @override
  Widget build(BuildContext context) => Column(children: widget.children);
}
