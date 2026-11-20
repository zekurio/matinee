import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/device.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import 'app_log_section.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// Settings, About: what this app and device are, the licenses, and the
/// app's log. The Kotlin app's playback report isn't here yet.
class AboutPage extends ConsumerWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final device = ref.watch(deviceProvider);
    return SettingsScaffold(
      title: l.aboutTitle,
      sections: [
        Panel(
          rows: [
            ValueRow(
              title: l.aboutVersion,
              value: kDebugMode
                  ? '${device.appVersion}, debug'
                  : device.appVersion,
            ),
            ValueRow(title: l.aboutAndroid, value: device.osVersion),
            ValueRow(title: l.aboutDevice, value: device.model),
          ],
        ),
        Panel(
          rows: [
            LinkRow(
              icon: SettingsPage.licenses.icon,
              title: l.aboutLicenses,
              onPressed: () =>
                  context.push(Routes.settingsPage(SettingsPage.licenses.key)),
            ),
          ],
        ),
        const AppLogSection(),
      ],
    );
  }
}

/// `NOTICE.md`, bundled with the app: whose code the app adapts and the
/// libraries it bundles, under which license.
final noticeProvider = FutureProvider.autoDispose<String>(
  (ref) => rootBundle.loadString('NOTICE.md'),
  retry: (count, error) => null,
);

/// The notices, read from `NOTICE.md` and laid out from its Markdown:
/// headings, paragraphs, and the table of files as a line each.
class LicensesPage extends ConsumerWidget {
  const LicensesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final notice = ref.watch(noticeProvider);
    final text = notice.value;
    if (text == null) {
      return PageFrame(
        title: l.aboutLicenses,
        backLabel: l.commonBack,
        onBack: () => context.pop(),
        child: notice.hasError
            ? Center(
                child: FailureState(
                  title: l.aboutLicensesFailed,
                  error: notice.error!,
                  onRetry: () => ref.invalidate(noticeProvider),
                ),
              )
            : LoadingState(label: l.loadingInProgress),
      );
    }
    return SettingsScaffold(
      title: l.aboutLicenses,
      sections: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            for (final block in noticeBlocks(text)) _Block(block: block),
          ],
        ),
      ],
    );
  }
}

/// A piece of the notice as it shows.
sealed class NoticeBlock {
  const NoticeBlock();
}

final class NoticeHeading extends NoticeBlock {
  const NoticeHeading(this.text);
  final String text;
}

final class NoticeParagraph extends NoticeBlock {
  const NoticeParagraph(this.text);
  final String text;
}

/// A table row, its cells in order.
final class NoticeRow extends NoticeBlock {
  const NoticeRow(this.cells);
  final List<String> cells;
}

/// The notice's Markdown as blocks: `#` headings, table rows past their
/// header and rule, and paragraphs of the lines between blank ones, with
/// code without its backticks. A link to the web keeps its address after
/// its text, since the page can't open it and a line like "Plezy revision"
/// says nothing alone; one into the repository reads as its text.
List<NoticeBlock> noticeBlocks(String markdown) {
  String plain(String text) => text
      .replaceAllMapped(
        RegExp(r'\[([^\]]+)\]\(([^)]+)\)'),
        (m) => m[2]!.startsWith('https://') ? '${m[1]} (${m[2]})' : m[1]!,
      )
      .replaceAll('`', '')
      .trim();
  final blocks = <NoticeBlock>[];
  final paragraph = <String>[];
  var tableHeader = true;
  void flush() {
    if (paragraph.isEmpty) return;
    blocks.add(NoticeParagraph(plain(paragraph.join(' '))));
    paragraph.clear();
  }

  for (final line in markdown.split('\n')) {
    final trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      flush();
      final cells = [
        for (final cell in trimmed.substring(1).split('|'))
          if (cell.trim().isNotEmpty) plain(cell),
      ];
      final rule = cells.every((cell) => RegExp(r'^:?-+:?$').hasMatch(cell));
      if (!tableHeader && !rule) blocks.add(NoticeRow(cells));
      tableHeader = false;
      continue;
    }
    tableHeader = true;
    if (trimmed.isEmpty) {
      flush();
    } else if (trimmed.startsWith('#')) {
      flush();
      blocks.add(NoticeHeading(plain(trimmed.replaceFirst(RegExp('^#+'), ''))));
    } else {
      paragraph.add(trimmed);
    }
  }
  flush();
  return blocks;
}

class _Block extends StatelessWidget {
  const _Block({required this.block});

  final NoticeBlock block;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return switch (block) {
      NoticeHeading(:final text) => SectionTitle(title: text),
      NoticeParagraph(:final text) => Text(
        text,
        style: KitText.sm.style(color: colors.foreground),
      ),
      NoticeRow(:final cells) => Padding(
        padding: const EdgeInsetsDirectional.only(start: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              cells.first,
              style: KitText.sm.style(
                color: colors.foreground,
                weight: FontWeight.w600,
              ),
            ),
            for (final cell in cells.skip(1))
              Text(
                cell,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
          ],
        ),
      ),
    };
  }
}
