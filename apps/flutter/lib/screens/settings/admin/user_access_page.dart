import 'dart:async';

import 'package:flutter/foundation.dart' show mapEquals, setEquals;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../../api/matinee_api.dart';
import '../../../core/field_errors.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../query/server_data.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// The playback qualities' rates, which are the bit rate limits a form
/// offers, largest first, as the server sends them.
final _qualitiesProvider = serverQuery((api) => api.playback.options());

/// A choice that leaves a setting to the groups.
const _fromGroups = 'groups';
const _noLimit = 'none';

/// How many devices the web's form offers to let play at once.
const _streamChoices = [1, 2, 3, 4, 5, 10];

/// What "Limited" starts at, as on the web.
const _defaultQuota = RequestQuota(titles: 5, days: 7);

/// The levels of a part of running the server there is nothing to look
/// at in alone.
const _switchLevels = [AccessLevel.none, AccessLevel.manage];

/// The parts of running the server an account can be handed, with the
/// levels each offers, least first: the contract's `MANAGED_AREAS` and
/// `areaLevels`.
const _areas = {
  'requests': AccessLevel.all,
  'connections': AccessLevel.all,
  'libraries': _switchLevels,
  'metadata': _switchLevels,
  'users': AccessLevel.all,
  'server': AccessLevel.all,
};

/// How far [manages] goes in [area].
String _levelIn(ManagedAccess manages, String area) => switch (area) {
  'requests' => manages.requests,
  'connections' => manages.connections,
  'libraries' => manages.libraries,
  'metadata' => manages.metadata,
  'users' => manages.users,
  _ => manages.server,
};

/// One account's access as the form holds it: the groups an admin or an
/// invite put it in, and what's set on it over them, each field null
/// while the groups decide it. A limit's [Explicit] holds null for none.
@immutable
final class _Draft {
  const _Draft({
    required this.groupIds,
    required this.libraries,
    required this.maxBitrate,
    required this.transcode,
    required this.downloads,
    required this.requests,
    required this.requestLimit,
    required this.maxStreams,
    required this.apiTokens,
    required this.manages,
  });

  factory _Draft.of(AdminUserAccess access) {
    final override = access.override;
    final manages = override.manages;
    return _Draft(
      groupIds: {
        for (final group in access.groups)
          if (group.source != AccessSource.provider) group.id,
      },
      libraries: switch (override.libraries) {
        final libraries? => (
          all: libraries.all,
          ids: libraries.all ? const <String>{} : libraries.ids.toSet(),
        ),
        null => null,
      },
      maxBitrate: override.maxBitrate,
      transcode: override.transcode,
      downloads: override.downloads,
      requests: override.requests,
      requestLimit: override.requestLimit,
      maxStreams: override.maxStreams,
      apiTokens: override.apiTokens,
      manages: {
        'requests': ?manages?.requests,
        'connections': ?manages?.connections,
        'libraries': ?manages?.libraries,
        'metadata': ?manages?.metadata,
        'users': ?manages?.users,
        'server': ?manages?.server,
      },
    );
  }

  final Set<String> groupIds;
  final ({bool all, Set<String> ids})? libraries;
  final Explicit<int>? maxBitrate;
  final bool? transcode;
  final bool? downloads;

  /// A [RequestMode].
  final String? requests;
  final Explicit<RequestQuota>? requestLimit;
  final Explicit<int>? maxStreams;
  final bool? apiTokens;

  /// The level set for each area that isn't left to the groups.
  final Map<String, String> manages;

  _Draft copy({
    Set<String>? groupIds,
    ({bool all, Set<String> ids})? Function()? libraries,
    Explicit<int>? Function()? maxBitrate,
    bool? Function()? transcode,
    bool? Function()? downloads,
    String? Function()? requests,
    Explicit<RequestQuota>? Function()? requestLimit,
    Explicit<int>? Function()? maxStreams,
    bool? Function()? apiTokens,
    Map<String, String>? manages,
  }) => _Draft(
    groupIds: groupIds ?? this.groupIds,
    libraries: libraries == null ? this.libraries : libraries(),
    maxBitrate: maxBitrate == null ? this.maxBitrate : maxBitrate(),
    transcode: transcode == null ? this.transcode : transcode(),
    downloads: downloads == null ? this.downloads : downloads(),
    requests: requests == null ? this.requests : requests(),
    requestLimit: requestLimit == null ? this.requestLimit : requestLimit(),
    maxStreams: maxStreams == null ? this.maxStreams : maxStreams(),
    apiTokens: apiTokens == null ? this.apiTokens : apiTokens(),
    manages: manages ?? this.manages,
  );

  /// The override to save: each field the form doesn't leave to the groups.
  AccessOverride own() => AccessOverride(
    libraries: switch (libraries) {
      final libraries? => AccessOverrideLibraries(
        all: libraries.all,
        ids: libraries.all ? const [] : libraries.ids.toList(),
      ),
      null => null,
    },
    maxBitrate: maxBitrate,
    transcode: transcode,
    maxStreams: maxStreams,
    downloads: downloads,
    requests: requests,
    requestLimit: requestLimit,
    apiTokens: apiTokens,
    manages: manages.isEmpty
        ? null
        : AccessOverrideManages(
            requests: manages['requests'],
            connections: manages['connections'],
            libraries: manages['libraries'],
            metadata: manages['metadata'],
            users: manages['users'],
            server: manages['server'],
          ),
  );

  static bool _sameLimit<T extends Object>(Explicit<T>? a, Explicit<T>? b) =>
      (a == null) == (b == null) && a?.value == b?.value;

  static bool _sameQuota(Explicit<RequestQuota>? a, Explicit<RequestQuota>? b) {
    if ((a == null) != (b == null)) return false;
    final (x, y) = (a?.value, b?.value);
    if ((x == null) != (y == null)) return false;
    return x == null || (x.titles == y!.titles && x.days == y.days);
  }

  @override
  bool operator ==(Object other) =>
      other is _Draft &&
      setEquals(groupIds, other.groupIds) &&
      libraries?.all == other.libraries?.all &&
      (libraries == null) == (other.libraries == null) &&
      setEquals(libraries?.ids, other.libraries?.ids) &&
      _sameLimit(maxBitrate, other.maxBitrate) &&
      transcode == other.transcode &&
      downloads == other.downloads &&
      requests == other.requests &&
      _sameQuota(requestLimit, other.requestLimit) &&
      _sameLimit(maxStreams, other.maxStreams) &&
      apiTokens == other.apiTokens &&
      mapEquals(manages, other.manages);

  @override
  int get hashCode => Object.hash(groupIds.length, transcode, requests);
}

/// Who put an account in a group, or set its own settings.
abstract final class AccessSource {
  static const provider = 'provider';
}

/// Whether [user] may set an account's access: the page lists the groups
/// to put it in, so it takes reading them too, as the web's users panel.
bool mayAccess(User user) =>
    can(user, Permission.adminUserUpdate) && can(user, Permission.groupRead);

/// One account's access, as the web's access dialog: what it gets, the
/// groups an admin puts it in, and what's set on the account over them.
/// The fields save together from the save bar, and the server checks
/// them; a save shows what the account gets with it.
class UserAccessPage extends ConsumerWidget {
  const UserAccessPage({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final users = ref.watch(adminUsersProvider);
    AdminUser? user;
    for (final entry in users.value ?? const <AdminUser>[]) {
      if (entry.id == userId) user = entry;
    }
    if (user == null) {
      return AdminGate(
        allows: mayAccess,
        child: AdminPage(
          title: l.adminAccessGoneTitle,
          child: users.hasValue
              ? Center(
                  child: EmptyState(
                    icon: Lucide.users,
                    title: l.adminAccessGoneTitle,
                    message: l.adminAccessGone,
                  ),
                )
              : adminBody(
                  context,
                  users,
                  onRetry: () => ref.invalidate(adminUsersProvider),
                  loaded: (_) => const SizedBox(),
                ),
        ),
      );
    }
    return AdminGate(
      allows: mayAccess,
      child: _AccessForm(key: ValueKey(user.id), user: user),
    );
  }
}

class _AccessForm extends ConsumerStatefulWidget {
  const _AccessForm({super.key, required this.user});

  final AdminUser user;

  @override
  ConsumerState<_AccessForm> createState() => _AccessFormState();
}

class _AccessFormState extends ConsumerState<_AccessForm> {
  late var _saved = _Draft.of(widget.user.access);
  late var _draft = _saved;
  Map<String, String> _errors = const {};

  /// A save brings the account back as the server has it, and the form
  /// starts again from there.
  @override
  void didUpdateWidget(_AccessForm old) {
    super.didUpdateWidget(old);
    final saved = _Draft.of(widget.user.access);
    if (saved == _saved) return;
    _saved = saved;
    _restart();
  }

  /// The fields as the server has them, the edits gone.
  void _restart() {
    _draft = _saved;
    _errors = const {};
  }

  void _edit(_Draft draft) => setState(() => _draft = draft);

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    if (api == null) return;
    setState(() => _errors = const {});
    try {
      await api.admin.users.setAccess(
        widget.user.id,
        groupIds: _draft.groupIds.toList(),
        override: _draft.own(),
      );
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _errors = fieldErrors(AppLocalizations.of(context), error),
        );
      }
      rethrow;
    }
    if (!mounted) return;
    // Groups count their members.
    ref.invalidate(adminGroupsProvider);
    await reread(ref, adminUsersProvider.future);
  }

  String? _error(String field) {
    for (final MapEntry(:key, :value) in _errors.entries) {
      if (key.contains(field)) return value;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final user = widget.user;
    final access = user.access;
    final groups = ref.watch(adminGroupsProvider).value ?? const [];
    final libraries = ref.watch(adminLibrariesProvider).value ?? const [];
    final qualities =
        ref.watch(_qualitiesProvider).value?.qualities ?? const [];
    final provider =
        ref.watch(authConfigProvider).value?.oidc?.displayName ??
        l.adminAccessTheProvider;
    final words = _Words(l, libraries);
    final from = access.fromGroups;
    final draft = _draft;
    final dirty = draft != _saved;
    // What "From groups" gives, as of the last save; with the groups
    // changed and not saved, it's left unsaid.
    final groupsSaved = setEquals(draft.groupIds, _saved.groupIds);
    String inherited(String value) => groupsSaved
        ? l.adminAccessFromGroupsValue(value)
        : l.adminAccessFromGroups;
    final fromProvider = {
      for (final group in access.groups)
        if (group.source == AccessSource.provider) group.id,
    };
    final effective = access.effective;
    final more = words.manages(effective.manages, admin: user.isAdmin);
    final synced = DateTime.tryParse(user.claimsSyncedAt ?? '');

    final bitrates = {
      for (final quality in qualities) quality.bitrate,
      ?draft.maxBitrate?.value,
    }.toList()..sort((a, b) => b.compareTo(a));
    final streams = {..._streamChoices, ?draft.maxStreams?.value}.toList()
      ..sort();
    final quota = draft.requestLimit?.value;

    return SaveBarPage(
      title: l.adminAccessTitle(user.name),
      dirty: dirty,
      onReset: () => setState(_restart),
      onSave: _save,
      child: AdminSections(
        sections: [
          Note(l.adminAccessDescription),
          SettingsSection(
            title: l.adminAccessGets(user.name),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    ValueRow(
                      title: l.adminAccessLibraries,
                      value: words.libraries(
                        effective.libraries.all,
                        effective.libraries.ids,
                      ),
                    ),
                    ValueRow(
                      title: l.adminAccessBitrate,
                      value: words.bitrate(effective.maxBitrate),
                    ),
                    ValueRow(
                      title: l.adminAccessTranscode,
                      value: words.allowed(effective.transcode),
                    ),
                    ValueRow(
                      title: l.adminAccessDownloads,
                      value: words.allowed(effective.downloads),
                    ),
                    ValueRow(
                      title: l.adminAccessStreams,
                      value: words.streams(effective.maxStreams),
                    ),
                    ValueRow(
                      title: l.adminAccessRequests,
                      value: words.requests(
                        effective.requests,
                        effective.requestLimit,
                      ),
                    ),
                    ValueRow(
                      title: l.webAccessApiTokens,
                      value: words.allowed(effective.apiTokens),
                    ),
                    if (more != null)
                      ValueRow(
                        title: l.webAccessSectionServer,
                        value: more.label,
                      ),
                  ],
                ),
                if (more?.names case final names?) Note(names),
                if (dirty) Note(l.adminAccessGetsAfterSave),
                if (user.oidcLinked)
                  Note(
                    synced == null
                        ? l.adminAccessClaimsNever(provider)
                        : l.adminAccessClaimsSynced(
                            provider,
                            relativeTime(l, synced),
                          ),
                  ),
              ],
            ),
          ),
          SettingsSection(
            title: l.adminAccessGroups,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    for (final group in groups)
                      if (group.everyone)
                        _GroupRow(
                          name: l.adminAccessEveryone,
                          note: l.adminAccessEveryoneHint,
                          checked: true,
                        )
                      else if (fromProvider.contains(group.id))
                        _GroupRow(
                          name: group.name,
                          note: l.adminAccessGroupFromProvider(provider),
                          checked: true,
                        )
                      else
                        _GroupRow(
                          name: group.name,
                          note: switch (group.providerGroup) {
                            final name? => l.adminAccessGroupFollows(
                              provider,
                              name,
                            ),
                            null => null,
                          },
                          checked: draft.groupIds.contains(group.id),
                          onChanged: (on) => _edit(
                            draft.copy(
                              groupIds:
                                  on
                                        ? {...draft.groupIds, group.id}
                                        : {...draft.groupIds}
                                    ..remove(group.id),
                            ),
                          ),
                        ),
                  ],
                ),
                if (groups.length == 1) Note(l.adminAccessNoGroups),
                if (_error('groupIds') case final error?)
                  Note(error, danger: true),
              ],
            ),
          ),
          SettingsSection(
            title: l.adminAccessOverride,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                if (access.overrideSource == AccessSource.provider)
                  Note(
                    l.adminAccessOverrideFromProvider(provider, user.name),
                    danger: true,
                  )
                else
                  Note(l.adminAccessOverrideHint),
                Panel(
                  rows: [
                    PickerRow<String>(
                      title: l.adminAccessLibraries,
                      options: [
                        (
                          _fromGroups,
                          inherited(
                            words.libraries(
                              from.libraries.all,
                              from.libraries.ids,
                            ),
                          ),
                        ),
                        ('all', l.adminAccessLibrariesAll),
                        ('some', l.adminAccessLibrariesPicked),
                      ],
                      current: switch (draft.libraries) {
                        null => _fromGroups,
                        (all: true, ids: _) => 'all',
                        _ => 'some',
                      },
                      onPicked: (choice) => _edit(
                        draft.copy(
                          libraries: () => switch (choice) {
                            _fromGroups => null,
                            'all' => (all: true, ids: const <String>{}),
                            _ => (
                              all: false,
                              ids: draft.libraries?.ids ?? const <String>{},
                            ),
                          },
                        ),
                      ),
                    ),
                    if (draft.libraries case (all: false, :final ids))
                      for (final library in libraries)
                        SwitchRow(
                          icon: library.kind == LibraryKind.shows
                              ? Lucide.tv
                              : Lucide.film,
                          title: library.name,
                          checked: ids.contains(library.id),
                          onChanged: (on) => _edit(
                            draft.copy(
                              libraries: () => (
                                all: false,
                                ids: on ? {...ids, library.id} : {...ids}
                                  ..remove(library.id),
                              ),
                            ),
                          ),
                        ),
                    PickerRow<String>(
                      title: l.adminAccessBitrate,
                      options: [
                        (
                          _fromGroups,
                          inherited(words.bitrate(from.maxBitrate)),
                        ),
                        (_noLimit, words.bitrate(null)),
                        for (final rate in bitrates)
                          ('$rate', words.bitrate(rate)),
                      ],
                      current: _limitKey(draft.maxBitrate),
                      onPicked: (choice) =>
                          _edit(draft.copy(maxBitrate: () => _limitOf(choice))),
                    ),
                    PickerRow<String>(
                      title: l.adminAccessTranscode,
                      options: _switchOptions(words, inherited, from.transcode),
                      current: _switchKey(draft.transcode),
                      onPicked: (choice) =>
                          _edit(draft.copy(transcode: () => _switchOf(choice))),
                    ),
                    PickerRow<String>(
                      title: l.adminAccessDownloads,
                      options: _switchOptions(words, inherited, from.downloads),
                      current: _switchKey(draft.downloads),
                      onPicked: (choice) =>
                          _edit(draft.copy(downloads: () => _switchOf(choice))),
                    ),
                    PickerRow<String>(
                      title: l.adminAccessStreams,
                      options: [
                        (
                          _fromGroups,
                          inherited(words.streams(from.maxStreams)),
                        ),
                        (_noLimit, words.streams(null)),
                        for (final count in streams)
                          ('$count', words.streams(count)),
                      ],
                      current: _limitKey(draft.maxStreams),
                      onPicked: (choice) =>
                          _edit(draft.copy(maxStreams: () => _limitOf(choice))),
                    ),
                    PickerRow<String>(
                      title: l.adminAccessRequests,
                      options: [
                        (
                          _fromGroups,
                          inherited(words.requestMode(from.requests)),
                        ),
                        for (final mode in RequestMode.all)
                          (mode, words.requestMode(mode)),
                      ],
                      current: draft.requests ?? _fromGroups,
                      onPicked: (choice) => _edit(
                        draft.copy(
                          requests: () => choice == _fromGroups ? null : choice,
                        ),
                      ),
                    ),
                    if ((draft.requests ?? from.requests) !=
                        RequestMode.off) ...[
                      PickerRow<String>(
                        title: l.adminAccessRequestLimit,
                        options: [
                          (
                            _fromGroups,
                            inherited(words.quota(from.requestLimit)),
                          ),
                          (_noLimit, l.adminAccessRequestLimitNone),
                          ('some', l.adminAccessRequestLimitSome),
                        ],
                        current: switch (draft.requestLimit) {
                          null => _fromGroups,
                          Explicit(value: null) => _noLimit,
                          _ => 'some',
                        },
                        onPicked: (choice) => _edit(
                          draft.copy(
                            requestLimit: () => switch (choice) {
                              _fromGroups => null,
                              _noLimit => const Explicit(null),
                              _ => Explicit(
                                quota ?? from.requestLimit ?? _defaultQuota,
                              ),
                            },
                          ),
                        ),
                      ),
                      if (quota != null)
                        _QuotaRow(
                          quota: quota,
                          error: _error('requestLimit'),
                          onChanged: (next) => _edit(
                            draft.copy(requestLimit: () => Explicit(next)),
                          ),
                        ),
                    ],
                    PickerRow<String>(
                      title: l.webAccessApiTokens,
                      options: _switchOptions(words, inherited, from.apiTokens),
                      current: _switchKey(draft.apiTokens),
                      onPicked: (choice) =>
                          _edit(draft.copy(apiTokens: () => _switchOf(choice))),
                    ),
                  ],
                ),
                if (draft.libraries?.all ?? false)
                  Note(l.adminAccessLibrariesAllHint),
                if (_error('maxBitrate') ?? _error('maxStreams')
                    case final error?)
                  Note(error, danger: true),
              ],
            ),
          ),
          SettingsSection(
            title: l.webAccessSectionServer,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Note(l.webAccessSectionServerHint),
                Panel(
                  rows: [
                    for (final MapEntry(key: area, value: levels)
                        in _areas.entries)
                      PickerRow<String>(
                        title: words.area(area),
                        description: words.areaHint(area),
                        options: [
                          (
                            _fromGroups,
                            inherited(
                              words.level(area, _levelIn(from.manages, area)),
                            ),
                          ),
                          for (final level in levels)
                            (level, words.level(area, level)),
                        ],
                        current: draft.manages[area] ?? _fromGroups,
                        onPicked: (choice) => _edit(
                          draft.copy(
                            manages: choice == _fromGroups
                                ? ({...draft.manages}..remove(area))
                                : {...draft.manages, area: choice},
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _limitKey(Explicit<int>? limit) => switch (limit) {
    null => _fromGroups,
    Explicit(value: null) => _noLimit,
    Explicit(:final value) => '$value',
  };

  static Explicit<int>? _limitOf(String choice) => switch (choice) {
    _fromGroups => null,
    _noLimit => const Explicit(null),
    _ => Explicit(int.parse(choice)),
  };

  static String _switchKey(bool? value) => switch (value) {
    null => _fromGroups,
    true => 'on',
    false => 'off',
  };

  static bool? _switchOf(String choice) => switch (choice) {
    'on' => true,
    'off' => false,
    _ => null,
  };

  static List<(String, String)> _switchOptions(
    _Words words,
    String Function(String) inherited,
    bool given,
  ) => [
    (_fromGroups, inherited(words.allowed(given))),
    ('on', words.allowed(true)),
    ('off', words.allowed(false)),
  ];
}

/// How a policy's settings read.
final class _Words {
  const _Words(this.l, this.libraryList);

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
    if (_areas[area]?.length == 2) {
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
      for (final name in _areas.keys)
        if (_levelIn(manages, name) case final given
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

/// A group the account can be put in, with what's to know about it under
/// its name. Everyone holds every account, and a group the provider put
/// it in stays until the provider takes it out, so neither switches.
class _GroupRow extends StatelessWidget {
  const _GroupRow({
    required this.name,
    required this.checked,
    this.note,
    this.onChanged,
  });

  final String name;
  final String? note;
  final bool checked;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final change = onChanged;
    final note = this.note;
    return PressIndication(
      onPressed: change == null ? null : () => change(!checked),
      label: name,
      checked: checked,
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              spacing: 12,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: KitText.base.style(color: colors.foreground),
                      ),
                      if (note != null)
                        Text(
                          note,
                          style: KitText.sm.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                Switch(checked: checked, onChanged: change),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "[5] titles every [7] days", under a request limit that's set. The
/// server checks the numbers.
class _QuotaRow extends StatelessWidget {
  const _QuotaRow({required this.quota, required this.onChanged, this.error});

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
