import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/settings/admin/jobs_page.dart';

/// A note long enough to fill the row, as the server's own are.
const _note =
    'The server asks the metadata provider for one title at a time, so a '
    'large library does not trip the provider rate limit.';

JobQueueStatus _queue() => const JobQueueStatus(
  id: JobQueueId.metadata,
  name: 'Metadata',
  description: 'Refresh titles',
  concurrency: 2,
  defaultConcurrency: 2,
  maxConcurrency: 8,
  concurrencyNote: _note,
  active: 1,
  waiting: 3,
  completed: 10,
  failed: 0,
  paused: false,
  running: [],
  failures: [],
  retryAfterSeconds: null,
);

void main() {
  // The bug it pins: the name, both notes, and the stepper shared one Row,
  // so a phone squeezed the notes into a few words a line beside the
  // stepper. They sit under it, across the row.
  testWidgets('the notes take the row’s width, not the stepper’s leavings', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: SizedBox(
          width: double.infinity,
          child: ConcurrencyRow(queue: _queue(), value: 2, onChanged: (_) {}),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final note = tester.getRect(find.text(_note));
    final stepper = tester.getRect(find.byType(RoundIconButton).last);
    expect(note.top, greaterThanOrEqualTo(stepper.bottom));
    expect(note.width, greaterThan(300));
    expect(tester.takeException(), isNull);
  });
}
