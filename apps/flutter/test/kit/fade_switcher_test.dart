import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/motion.dart';

/// Takes a hold on the switcher it's in, if it may, and keeps the release.
class _Holder extends StatefulWidget {
  const _Holder(this.name, this.releases);

  final String name;
  final List<VoidCallback?> releases;

  @override
  State<_Holder> createState() => _HolderState();
}

class _HolderState extends State<_Holder> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    widget.releases.add(FadeSwitcher.hold(context));
  }

  @override
  Widget build(BuildContext context) => Text(widget.name);
}

Widget _switcher(Object value, Widget child) => Directionality(
  textDirection: TextDirection.ltr,
  child: FadeSwitcher(value: value, child: child),
);

/// How opaque [text] is drawn: its nearest fade's opacity.
double _opacity(WidgetTester tester, String text) => tester
    .widget<FadeTransition>(
      find.ancestor(of: find.text(text), matching: find.byType(FadeTransition)),
    )
    .opacity
    .value;

void main() {
  testWidgets('the first state shows at once and nothing may hold it', (
    tester,
  ) async {
    final releases = <VoidCallback?>[];
    await tester.pumpWidget(_switcher(1, _Holder('a', releases)));
    expect(releases, [null]);
    expect(_opacity(tester, 'a'), 1);
  });

  testWidgets('a new state fades in over the last', (tester) async {
    await tester.pumpWidget(_switcher(1, const Text('a')));
    await tester.pumpWidget(_switcher(2, const Text('b')));
    await tester.pump();
    await tester.pump(KitMotion.exit ~/ 2);
    expect(_opacity(tester, 'a'), lessThan(1));
    expect(_opacity(tester, 'b'), greaterThan(0));
    await tester.pumpAndSettle();
    expect(find.text('a'), findsNothing);
    expect(_opacity(tester, 'b'), 1);
  });

  // A page that builds over several frames keeps the spinner up meanwhile
  // rather than fade in half built.
  testWidgets('a held state waits, laid out but unseen, until let go', (
    tester,
  ) async {
    final releases = <VoidCallback?>[];
    await tester.pumpWidget(_switcher(1, const Text('a')));
    await tester.pumpWidget(_switcher(2, _Holder('b', releases)));
    expect(releases.single, isNotNull);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(_opacity(tester, 'a'), 1);
    expect(_opacity(tester, 'b'), 0);
    expect(tester.getSize(find.text('b')), isNot(Size.zero));
    releases.single!();
    await tester.pump();
    await tester.pump(KitMotion.exit ~/ 2);
    expect(_opacity(tester, 'a'), lessThan(1));
    expect(_opacity(tester, 'b'), greaterThan(0));
    await tester.pumpAndSettle();
    expect(find.text('a'), findsNothing);
    expect(_opacity(tester, 'b'), 1);
  });

  testWidgets('a held state replaced before it shows goes unseen', (
    tester,
  ) async {
    final releases = <VoidCallback?>[];
    await tester.pumpWidget(_switcher(1, const Text('a')));
    await tester.pumpWidget(_switcher(2, _Holder('b', releases)));
    await tester.pump();
    await tester.pumpWidget(_switcher(3, const Text('c')));
    expect(find.text('b'), findsNothing);
    // Letting go of a state that's gone does nothing.
    releases.single!();
    await tester.pumpAndSettle();
    expect(find.text('a'), findsNothing);
    expect(_opacity(tester, 'c'), 1);
  });
}
