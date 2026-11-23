import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../../api/matinee_api.dart';
import '../../../l10n/app_localizations.dart';
import '../../../query/server_data.dart';
import '../settings_rows.dart';
import 'admin_parts.dart';

/// What the access forms share, a group's and an account's: the choices
/// they offer and how a policy's settings read.

/// The playback qualities' rates, which are the bit rate limits a form
/// offers, largest first, as the server sends them.
final qualitiesProvider = serverQuery((api) => api.playback.options());

/// How many devices the web's form offers to let play at once.
const streamChoices = [1, 2, 3, 4, 5, 10];

/// What "Limited" starts at, as on the web.
const defaultQuota = RequestQuota(titles: 5, days: 7);

/// The levels of a part of running the server there is nothing to look
/// at in alone.
const _switchLevels = [AccessLevel.none, AccessLevel.manage];

/// The parts of running the server an account can be handed, with the
/// levels each offers, least first: the contract's `MANAGED_AREAS` and
/// `areaLevels`.
const managedAreas = {
  'requests': AccessLevel.all,
  'connections': AccessLevel.all,
  'libraries': _switchLevels,
  'metadata': _switchLevels,
  'users': AccessLevel.all,
  'server': AccessLevel.all,
};

/// How far [manages] goes in [area].
String levelIn(ManagedAccess manages, String area) => switch (area) {
  'requests' => manages.requests,
  'connections' => manages.connections,
  'libraries' => manages.libraries,
  'metadata' => manages.metadata,
  'users' => manages.users,
  _ => manages.server,
};

/// How a policy's settings read.
final class AccessWords {
  const AccessWords(this.l, this.libraryList);

  final AppLocalizations l;
  final List<Library> libraryList;

  String libraries(bool all, List<String> ids) {
    if (all) return l.adminAccessLibrariesAll;
    if (ids.isEmpty) return l.adminAccessLibrariesNone;
    if (ids.length == 1) {
      for (final library in libraryList) {
        if (library.id == ids.single) return library.name;
      }
    }
    return l.adminAccessLibrariesCount(ids.length);
  }

  String bitrate(int? rate) {
    if (rate == null) return l.adminAccessBitrateNone;
    final mbps = NumberFormat.decimalPatternDigits(
      locale: l.localeName,
      decimalDigits: rate % 1000000 == 0 ? 0 : 1,
    ).format(rate / 1000000);
    return l.adminAccessBitrateUpTo(mbps);
  }

  String streams(int? count) => count == null
      ? l.adminAccessStreamsNone
      : l.adminAccessStreamsCount(count);

  String allowed(bool on) =>
      on ? l.adminAccessAllowed : l.adminAccessNotAllowed;

  /// A [RequestMode].
  String requestMode(String mode) => switch (mode) {
    RequestMode.off => l.adminAccessRequestsOff,
    RequestMode.add => l.adminAccessRequestsAdd,
    _ => l.adminAccessRequestsAsk,
  };

  String quota(RequestQuota? quota) => quota == null
      ? l.adminAccessRequestLimitNone
      : l.adminAccessRequestLimitRate(
          l.adminAccessRequestLimitTitles(quota.titles),
          l.adminAccessRequestLimitPeriod(quota.days),
        );

  String requests(String mode, RequestQuota? limit) =>
      mode == RequestMode.off || limit == null
      ? requestMode(mode)
      : l.adminAccessRequestsLimited(requestMode(mode), quota(limit));

  /// How a policy's requests read in a line of facts: "No requests",
  /// "Requests need approval", or with its limit.
  String requestsFact(String mode, RequestQuota? limit) {
    final requests = switch (mode) {
      RequestMode.off => l.webAccessRequestsFactOff,
      RequestMode.add => l.webAccessRequestsFactAdd,
      _ => l.webAccessRequestsFactAsk,
    };
    if (mode == RequestMode.off || limit == null) return requests;
    return l.webAccessRequestsFactLimited(requests, quota(limit));
  }

  /// A part of running the server, like "Request queue".
  String area(String area) => switch (area) {
    'requests' => l.webAccessAreaRequests,
    'connections' => l.webAccessAreaConnections,
    'libraries' => l.webAccessAreaLibraries,
    'metadata' => l.webAccessAreaMetadata,
    'users' => l.webAccessAreaUsers,
    _ => l.webAccessAreaServer,
  };

  /// What [area] covers, in a line.
  String areaHint(String area) => switch (area) {
    'requests' => l.webAccessAreaRequestsHint,
    'connections' => l.webAccessAreaConnectionsHint,
    'libraries' => l.webAccessAreaLibrariesHint,
    'metadata' => l.webAccessAreaMetadataHint,
    'users' => l.webAccessAreaUsersHint,
    _ => l.webAccessAreaServerHint,
  };

  /// A level of [area]. An area that is all or nothing says "On" for
  /// `manage`, as a switch would.
  String level(String area, String level) {
    if (managedAreas[area]?.length == 2) {
      return level == AccessLevel.none
          ? l.webAccessLevelOff
          : l.webAccessLevelOn;
    }
    return switch (level) {
      AccessLevel.none => l.webAccessLevelNone,
      AccessLevel.view => l.webAccessLevelView,
      _ => l.webAccessLevelManage,
    };
  }

  /// "Every permission" for an admin, or how many parts of running the
  /// server [manages] hands on, with each one's level. Null for none.
  ({String label, String? names})? manages(
    ManagedAccess manages, {
    required bool admin,
  }) {
    if (admin) return (label: l.adminAccessPermissionsAll, names: null);
    final held = [
      for (final name in managedAreas.keys)
        if (levelIn(manages, name) case final given
            when given != AccessLevel.none)
          l.webAccessManagesArea(area(name), level(name, given)),
    ];
    if (held.isEmpty) return null;
    return (
      label: l.webAccessManagesCount(held.length),
      names: held.join(', '),
    );
  }
}

/// "[5] titles every [7] days", under a request limit that's set. The
/// server checks the numbers.
class QuotaRow extends StatelessWidget {
  const QuotaRow({
    super.key,
    required this.quota,
    required this.onChanged,
    this.error,
  });

  final RequestQuota quota;
  final ValueChanged<RequestQuota> onChanged;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextRow(
                label: l.adminAccessRequestLimitTitlesField,
                value: quota.titles == 0 ? '' : '${quota.titles}',
                keyboardType: TextInputType.number,
                onChanged: (text) => onChanged(
                  RequestQuota(
                    titles: int.tryParse(text.trim()) ?? 0,
                    days: quota.days,
                  ),
                ),
              ),
            ),
            Expanded(
              child: TextRow(
                label: l.adminAccessRequestLimitDaysField,
                value: quota.days == 0 ? '' : '${quota.days}',
                keyboardType: TextInputType.number,
                onChanged: (text) => onChanged(
                  RequestQuota(
                    titles: quota.titles,
                    days: int.tryParse(text.trim()) ?? 0,
                  ),
                ),
              ),
            ),
          ],
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Note(error!, danger: true),
          ),
      ],
    );
  }
}
