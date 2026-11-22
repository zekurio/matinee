import 'package:flutter/widgets.dart';

import '../api/matinee_api.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';

/// When someone watched what they're marking watched, as the web's tick asks,
/// after Trakt: just now, on the release date, on a day they pick, or some time
/// they don't remember. [at] is the contract's `watchedAt`: null for now,
/// [WatchedAt.released], [WatchedAt.unknown], or an ISO time.
typedef WatchedWhen = ({String? at});

/// Asks when [name] was watched; null when the person closed the sheet or
/// the calendar without answering.
Future<WatchedWhen?> askWatchedAt(BuildContext context, String name) async {
  final l = AppLocalizations.of(context);
  final answer = await Sheet.show<_When>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) {
      void pick(_When when) => Navigator.of(sheet).pop(when);
      return Sheet(
        title: l.mediaMarkWatched,
        description: name,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetItem(
              icon: Lucide.clock,
              label: l.mediaWatchedAtNow,
              onPressed: () => pick(_When.now),
            ),
            SheetItem(
              icon: Lucide.calendar,
              label: l.mediaWatchedAtReleased,
              onPressed: () => pick(_When.released),
            ),
            SheetItem(
              icon: Lucide.calendarClock,
              label: l.mediaWatchedAtOther,
              onPressed: () => pick(_When.other),
            ),
            SheetItem(
              icon: Lucide.calendarOff,
              label: l.mediaWatchedAtUnknown,
              onPressed: () => pick(_When.unknown),
            ),
          ],
        ),
      );
    },
  );
  switch (answer) {
    case null:
      return null;
    case _When.now:
      return (at: null);
    case _When.released:
      return (at: WatchedAt.released);
    case _When.unknown:
      return (at: WatchedAt.unknown);
    case _When.other:
      if (!context.mounted) return null;
      final day = await _pickDay(context);
      return day == null ? null : (at: watchedAtOn(day));
  }
}

enum _When { now, released, other, unknown }

/// A calendar up to today, starting on today, as the web's watched-date
/// form.
Future<DateTime?> _pickDay(BuildContext context) {
  final l = AppLocalizations.of(context);
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  var day = today;
  return Dialog.show<DateTime>(
    context,
    dismissLabel: l.commonCancel,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setState) => Dialog(
        title: l.mediaWatchedDateTitle,
        actions: [
          MatineeButton(
            look: ButtonLook.outline,
            onPressed: () => Navigator.of(dialog).pop(),
            child: Text(l.commonCancel),
          ),
          MatineeButton(
            onPressed: () => Navigator.of(dialog).pop(day),
            child: Text(l.mediaMarkWatched),
          ),
        ],
        child: Center(
          child: Calendar(
            selected: day,
            today: today,
            latest: today,
            onSelected: (picked) => setState(() => day = picked),
          ),
        ),
      ),
    ),
  );
}

/// When on [day] to say it was watched: noon there, as the server does for
/// a release date, so the play lands on that day in nearly every zone.
/// Today is now, since noon may not have come yet.
String watchedAtOn(DateTime day, {DateTime? now}) {
  final noon = DateTime(day.year, day.month, day.day, 12);
  final current = now ?? DateTime.now();
  final at = noon.isAfter(current) ? current : noon;
  return at.toUtc().toIso8601String();
}
