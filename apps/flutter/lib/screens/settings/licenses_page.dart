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

/// The licenses: the project's own, then every package and library the
/// app is built from, each opening its text.
class LicensesPage extends ConsumerWidget {
  const LicensesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final licenses = ref.watch(licensesProvider);
    final packages = licenses.value;
    if (packages == null) {
      return PageFrame(
        title: l.aboutLicenses,
        backLabel: l.commonBack,
        onBack: () => context.pop(),
        child: licenses.hasError
            ? Center(
                child: FailureState(
                  title: l.aboutLicensesFailed,
                  error: licenses.error!,
                  onRetry: () => ref.invalidate(licensesProvider),
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
          child: Panel(
            rows: [
              LinkRow(
                icon: Lucide.scale,
                title: l.aboutLicensesGpl,
                onPressed: () => open(projectPackage),
              ),
            ],
          ),
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
