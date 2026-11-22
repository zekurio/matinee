import 'dart:async';

import 'package:flutter/foundation.dart' show LicenseParagraph;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/licenses.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// `NOTICE.md`, bundled with the app: whose code the app adapts and the
/// libraries it bundles, under which license.
final noticeProvider = FutureProvider.autoDispose<String>(
  (ref) => loadAssetText('NOTICE.md'),
  retry: (count, error) => null,
);

/// The licenses, as the GPL asks: the project's own, the notices from
/// `NOTICE.md` laid out from its Markdown (headings, paragraphs, and the table
/// of files as a line each), and the license of every package and library the
/// app is built from, each opening its text.
class LicensesPage extends ConsumerWidget {
  const LicensesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final notice = ref.watch(noticeProvider);
    final licenses = ref.watch(licensesProvider);
    final text = notice.value;
    final packages = licenses.value;
    if (text == null || packages == null) {
      final error = notice.error ?? licenses.error;
      return PageFrame(
        title: l.aboutLicenses,
        backLabel: l.commonBack,
        onBack: () => context.pop(),
        child: error != null
            ? Center(
                child: FailureState(
                  title: l.aboutLicensesFailed,
                  error: error,
                  onRetry: () => ref
                    ..invalidate(noticeProvider)
                    ..invalidate(licensesProvider),
                ),
              )
            : LoadingState(label: l.loadingInProgress),
      );
    }
    void open(String package) =>
        unawaited(context.push(Routes.license(package)));
    return SettingsScaffold(
      title: l.aboutLicenses,
      sections: [
        SettingsSection(
          title: l.aboutLicensesProject,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 14,
            children: [
              Text(
                l.aboutLicensesProjectBody,
                style: KitText.sm.style(color: colors.foreground),
              ),
              Panel(
                rows: [
                  LinkRow(
                    icon: Lucide.scale,
                    title: l.aboutLicensesGpl,
                    onPressed: () => open(projectPackage),
                  ),
                ],
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            for (final block in noticeBlocks(text)) _Block(block: block),
          ],
        ),
        SettingsSection(
          title: l.aboutLicensesPackages,
          child: Panel(
            rows: [
              for (final package in packages)
                if (package.package != projectPackage)
                  LinkRow(
                    title: package.package,
                    value: package.licenses.length > 1
                        ? l.aboutLicensesCount(package.licenses.length)
                        : null,
                    onPressed: () => open(package.package),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

/// One package's license texts, paragraph by paragraph as the license
/// lays them out, the way Flutter's license page shows them.
class LicenseTextScreen extends ConsumerWidget {
  const LicenseTextScreen({super.key, required this.package});

  final String package;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final licenses = ref.watch(licensesProvider);
    final found = licenses.value
        ?.where((each) => each.package == package)
        .firstOrNull;
    final Widget body;
    if (licenses.value == null) {
      body = licenses.hasError
          ? Center(
              child: FailureState(
                title: l.aboutLicensesFailed,
                error: licenses.error!,
                onRetry: () => ref.invalidate(licensesProvider),
              ),
            )
          : LoadingState(label: l.loadingInProgress);
    } else if (found == null) {
      body = Center(
        child: EmptyState(icon: Lucide.scale, title: l.aboutLicensesFailed),
      );
    } else {
      final paragraphs = [
        for (final (index, license) in found.licenses.indexed) ...[
          if (index > 0) null,
          ...license,
        ],
      ];
      body = ListView.builder(
        padding: EdgeInsets.fromLTRB(
          CardMetrics.gutter,
          8,
          CardMetrics.gutter,
          MediaQuery.paddingOf(context).bottom + 24,
        ),
        itemCount: paragraphs.length,
        itemBuilder: (context, index) {
          final paragraph = paragraphs[index];
          // Between two licenses, a line.
          if (paragraph == null) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: SizedBox(
                height: 1,
                child: ColoredBox(color: colors.border),
              ),
            );
          }
          final centered = paragraph.indent == LicenseParagraph.centeredIndent;
          return Padding(
            padding: EdgeInsetsDirectional.only(
              top: 8,
              start: centered ? 0 : 16.0 * paragraph.indent,
            ),
            child: Text(
              paragraph.text,
              textAlign: centered ? TextAlign.center : TextAlign.start,
              style: KitText.sm.style(
                color: centered ? colors.foreground : colors.mutedForeground,
                weight: centered ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          );
        },
      );
    }
    return PageFrame(
      title: package == projectPackage ? l.aboutLicensesGpl : package,
      backLabel: l.commonBack,
      onBack: () => context.pop(),
      child: body,
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
